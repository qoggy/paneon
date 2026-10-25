import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import {
  readFileSync,
  existsSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
  chmodSync,
  renameSync,
} from 'node:fs';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PACKAGE_ROOT, PACKAGE_VERSION, PANEON_HOME } from '../shared/paths.js';
import { PROTOCOL_VERSION, PaneonError, diagnostic, jsonValue } from '../shared/types.js';
import type { RuntimeDescriptor } from '../shared/types.js';
import { Runtime } from './lifecycle.js';
import { HTTP_BODY_LIMIT_BYTES, bodyTooLargeDiagnostic } from '../shared/limits.js';
import { Preferences } from './preferences.js';
import { createRuntimeLogging } from './logging.js';
import type { RuntimeLogging } from './logging.js';
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
type RunningServer = {
  app: FastifyInstance;
  runtime: Runtime;
  descriptor: RuntimeDescriptor;
  stop: () => Promise<void>;
};
export async function startServer(
  home = PANEON_HOME,
  logging = createRuntimeLogging(home),
): Promise<RunningServer> {
  logging.logger.info('Runtime starting');
  let runtime: Runtime | undefined;
  let app: FastifyInstance | undefined;
  try {
    const preferences = new Preferences(home);
    runtime = new Runtime(home, logging.logger.child({ component: 'runtime' }));
    const options: import('fastify').FastifyServerOptions = {
      loggerInstance: logging.logger,
      logController: new Fastify.LogController({ disableRequestLogging: true }),
      bodyLimit: HTTP_BODY_LIMIT_BYTES,
      // Incomplete HTTP requests must not delay explicit shutdown.
      forceCloseConnections: true,
    };
    app = Fastify(options);
    return await bootServer(home, logging, preferences, runtime, app);
  } catch (err) {
    logging.logger.fatal({ err }, 'Runtime startup failed');
    try {
      await runtime?.stop();
      await app?.close();
    } catch (cleanupError) {
      logging.logger.error({ err: cleanupError }, 'Startup cleanup failed');
    }
    await logging.close();
    throw err;
  }
}
async function bootServer(
  home: string,
  logging: RuntimeLogging,
  preferences: Preferences,
  runtime: Runtime,
  app: FastifyInstance,
) {
  await runtime.restore();
  await app.register(websocket, { options: { maxPayload: 1024 } });
  let origin = '';
  const descriptor: RuntimeDescriptor = {
    runtimeId: logging.runtimeId,
    logging: logging.status(),
    pid: process.pid,
    port: 0,
    controlToken: randomUUID() + randomUUID(),
    paneonVersion: PACKAGE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    startedAt: new Date().toISOString(),
  };
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Content-Type-Options', 'nosniff');
    if (request.headers.host !== `127.0.0.1:${descriptor.port}`)
      throw new PaneonError('INVALID_HOST', 'The request Host is not allowed.');
    const url = request.url.split('?')[0];
    const isApi = url.startsWith('/api/') || url === '/health';
    if (!isApi) return;
    const suppliedOrigin = request.headers.origin;
    if (suppliedOrigin !== undefined && suppliedOrigin !== origin)
      throw new PaneonError('INVALID_ORIGIN', 'The request Origin is not allowed.');
    if (request.ws) {
      if (suppliedOrigin !== origin)
        throw new PaneonError('INVALID_ORIGIN', 'A same-origin Origin header is required.');
      return;
    }
    if (request.headers.authorization === `Bearer ${descriptor.controlToken}`) return;
    if (request.method === 'GET') {
      let source = suppliedOrigin;
      try {
        if (source === undefined && request.headers.referer)
          source = new URL(request.headers.referer).origin;
      } catch (err) {
        throw Object.assign(
          new PaneonError('INVALID_ORIGIN', 'A verified same-origin request is required.'),
          {
            cause: err,
          },
        );
      }
      if (source !== origin)
        throw new PaneonError('INVALID_ORIGIN', 'A verified same-origin request is required.');
    } else if (suppliedOrigin !== origin)
      throw new PaneonError('INVALID_ORIGIN', 'A same-origin Origin header is required.');
  });
  app.setErrorHandler((error, request, reply) => {
    logging.logger.error(
      { err: error, requestId: request.id, method: request.method },
      'Request failed',
    );
    if ((error as { code?: string }).code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      reply.status(413).send({ ok: false, error: bodyTooLargeDiagnostic() });
      return;
    }
    const detail = diagnostic(error);
    reply.status(error instanceof PaneonError ? 400 : 500).send({ ok: false, error: detail });
  });
  const route = (
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    handler: (request: import('fastify').FastifyRequest) => unknown,
  ) =>
    app.route({
      method,
      url,
      handler: async (request) => ({ ok: true, data: await handler(request) }),
    });
  const params = (r: import('fastify').FastifyRequest) =>
    r.params as {
      instanceId: string;
      actionId: string;
      ref: string;
      revision: string;
      '*': string;
    };
  const body = (r: import('fastify').FastifyRequest) => r.body as Record<string, unknown>;
  const integer = (value: unknown, min: number, max: number, fallback?: number) => {
    if (value === undefined && fallback !== undefined) return fallback;
    const n = Number(value);
    if (value === '' || !Number.isInteger(n) || n < min || n > max)
      throw new PaneonError(
        'INVALID_ARGUMENT',
        'An integer parameter is outside its allowed range.',
      );
    return n;
  };
  const consumer = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim() || value.length > 128)
      throw new PaneonError('INVALID_ARGUMENT', 'A nonempty consumer name is required.');
    return value;
  };
  const access = (id: string) => ({ ...runtime.inspect(id), url: `${origin}/panels/${id}` });
  route('GET', '/api/preferences', () => ({ ui: preferences.ui }));
  route('POST', '/api/preferences', (request) => {
    const result = preferences.save(body(request).ui);
    notify('', { type: 'preferences', ...result });
    return result;
  });
  route('GET', '/health', () => ({
    ...descriptor,
    controlToken: undefined,
    logging: logging.status(),
  }));
  route('POST', '/api/panels', async (request) => {
    const b = body(request);
    if (
      typeof b.entryPath !== 'string' ||
      typeof b.cwd !== 'string' ||
      typeof b.watch !== 'boolean'
    )
      throw new PaneonError(
        'INVALID_ARGUMENT',
        'Panel creation requires entryPath, cwd, params, and watch.',
      );
    const p = await runtime.run(b.entryPath, b.cwd, jsonValue(b.params), b.watch);
    return {
      instanceId: p.instanceId,
      definitionId: p.definitionId,
      status: p.status,
      revision: p.revision,
      watch: p.watch,
      paneonVersion: p.paneonVersion,
      url: `${origin}/panels/${p.instanceId}`,
    };
  });
  route('GET', '/api/panels', (request) => {
    const query = request.query as Record<string, unknown>;
    const status = query.status;
    if (
      status !== undefined &&
      status !== 'running' &&
      status !== 'closed' &&
      status !== 'unavailable'
    )
      throw new PaneonError(
        'INVALID_ARGUMENT',
        'Panel status must be running, closed, or unavailable.',
      );
    return runtime.store.listPage(
      integer(query.page, 1, 2147483647, 1),
      integer(query.pageSize, 1, 1000, 20),
      status,
    );
  });
  route('GET', '/api/panels/:instanceId', (request) => access(params(request).instanceId));
  route('POST', '/api/panels/:instanceId/reload', (request) =>
    runtime.reload(params(request).instanceId),
  );
  route('POST', '/api/panels/:instanceId/close', (request) =>
    runtime.closePanel(params(request).instanceId),
  );
  route('POST', '/api/panels/:instanceId/actions/:actionId', (request) => {
    const b = body(request);
    return runtime.invoke(
      params(request).instanceId,
      String(b.revision),
      params(request).actionId,
      b.input,
    );
  });
  route('POST', '/api/panels/:instanceId/events', (request) => {
    const b = body(request);
    return runtime.append(
      params(request).instanceId,
      String(b.revision),
      String(b.type),
      b.payload,
    );
  });
  route('GET', '/api/panels/:instanceId/events', (request) => {
    const q = request.query as Record<string, string>;
    return runtime.events(
      params(request).instanceId,
      consumer(q.consumer),
      integer(q.limit, 1, 1000, 100),
      integer(q.waitMs, 0, 60000, 0),
    );
  });
  route('POST', '/api/panels/:instanceId/acks', (request) => {
    const b = body(request);
    return runtime.store.ack(
      params(request).instanceId,
      consumer(b.consumer),
      integer(b.through, 1, Number.MAX_SAFE_INTEGER),
    );
  });
  const subscriptions = new Map<WebSocket, { instanceId: string; alive: boolean }>();
  const notify = (instanceId: string, data: unknown) => {
    const message = JSON.stringify(data);
    for (const [socket, subscription] of subscriptions)
      if (subscription.instanceId === instanceId && socket.readyState === socket.OPEN)
        socket.send(message);
  };
  runtime.on('state', notify);
  const heartbeat = setInterval(() => {
    for (const [socket, subscription] of subscriptions) {
      if (!subscription.alive) {
        socket.terminate();
        continue;
      }
      if (socket.readyState === socket.OPEN) {
        subscription.alive = false;
        socket.ping();
      }
    }
  }, 15000);
  heartbeat.unref();
  runtime.once('stop', () => {
    clearInterval(heartbeat);
    runtime.off('state', notify);
    for (const socket of subscriptions.keys()) socket.close(1001, 'Runtime stopping');
  });
  app.get('/api/preferences/stream', { websocket: true }, (socket) => {
    const subscription = { instanceId: '', alive: true };
    subscriptions.set(socket, subscription);
    socket.on('pong', () => {
      subscription.alive = true;
    });
    socket.on('close', () => subscriptions.delete(socket));
    socket.on('message', () => socket.close(1008, 'Preferences notifications are read-only'));
    socket.send(JSON.stringify({ type: 'preferences', ui: preferences.ui }));
  });
  app.get(
    '/api/panels/:instanceId/stream',
    {
      websocket: true,
      preValidation: (request, _reply, done) => {
        runtime.store.get(params(request).instanceId);
        done();
      },
    },
    (socket, request) => {
      const instanceId = params(request).instanceId;
      const subscription = { instanceId, alive: true };
      subscriptions.set(socket, subscription);
      socket.on('pong', () => {
        subscription.alive = true;
      });
      socket.on('close', () => subscriptions.delete(socket));
      // This channel only sends framework state. Actions still use the HTTP API.
      socket.on('message', () => socket.close(1008, 'State notifications are read-only'));
      const panel = runtime.store.get(instanceId);
      socket.send(
        JSON.stringify({
          type: 'state',
          revision: panel.revision,
          status: panel.status,
          ...(panel.diagnostic ? { diagnostic: panel.diagnostic } : {}),
        }),
      );
    },
  );
  let shuttingDown = false;
  async function stop() {
    if (shuttingDown) return;
    shuttingDown = true;
    await runtime.stop();
    // A peer that does not acknowledge the close handshake cannot delay shutdown.
    for (const socket of subscriptions.keys()) socket.terminate();
    await app.close();
    if (existsSync(join(home, 'runtime.json'))) {
      const recorded = JSON.parse(
        readFileSync(join(home, 'runtime.json'), 'utf8'),
      ) as RuntimeDescriptor;
      if (recorded.runtimeId === descriptor.runtimeId) unlinkSync(join(home, 'runtime.json'));
    }
    logging.logger.info('Runtime stopped');
    await logging.close();
  }
  function shutdown() {
    void stop().then(
      () => process.exit(0),
      async (err: unknown) => {
        logging.logger.fatal({ err }, 'Runtime shutdown failed');
        await logging.close();
        process.exit(1);
      },
    );
  }
  route('POST', '/api/stop', () => {
    setTimeout(shutdown, 25);
    return { stopped: true, alreadyStopped: false, runtimeId: descriptor.runtimeId };
  });
  const web = join(PACKAGE_ROOT, 'dist/web');
  app.get('/panels/:instanceId/:revision/*', async (request, reply) => {
    const p = params(request);
    runtime.store.get(p.instanceId);
    const live = runtime.live.get(p.instanceId);
    const asset = p['*'];
    if (
      !live ||
      live.compiled.manifest.revision !== p.revision ||
      !live.compiled.manifest.assets.includes(asset)
    )
      return reply.code(404).send({
        ok: false,
        error: { code: 'ASSET_NOT_FOUND', message: 'The browser asset does not exist.' },
      });
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; frame-ancestors 'self'",
    );
    return reply
      .type(mime[extname(asset)] ?? 'application/octet-stream')
      .send(readFileSync(join(live.compiled.directory, 'client', asset)));
  });
  app.get('/assets/*', async (request, reply) => {
    const asset = (request.params as { '*': string })['*'];
    if (asset.includes('..') || !existsSync(join(web, 'assets', asset)))
      return reply.code(404).send();
    return reply
      .type(mime[extname(asset)] ?? 'application/octet-stream')
      .send(readFileSync(join(web, 'assets', asset)));
  });
  async function host(_request: unknown, reply: import('fastify').FastifyReply) {
    reply.header(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self'; connect-src 'self' ws://127.0.0.1:${descriptor.port}; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'`,
    );
    if (!existsSync(join(web, 'index.html')))
      throw new PaneonError(
        'WEB_ASSETS_MISSING',
        'Build the Paneon web interface before running the service.',
      );
    return reply
      .type('text/html')
      .send(
        readFileSync(join(web, 'index.html'), 'utf8').replace(
          /<html[^>]*>/,
          `<html lang="${preferences.ui.language}" class="${preferences.ui.theme === 'dark' ? 'dark' : ''}" data-theme="${preferences.ui.theme}" data-language="${preferences.ui.language}" style="color-scheme:${preferences.ui.theme}">`,
        ),
      );
  }
  app.get('/', host);
  app.get('/server', host);
  app.get('/settings', host);
  app.get('/panels/:instanceId', host);
  try {
    await app.listen({ host: '127.0.0.1', port: preferences.port });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE')
      throw new PaneonError(
        'SERVER_PORT_IN_USE',
        `Port ${preferences.port} is already in use. Free the port or change server.port in ${join(home, 'config.json')}.`,
        { port: preferences.port },
      );
    throw error;
  }
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('Invalid listen address');
  descriptor.port = address.port;
  origin = `http://127.0.0.1:${descriptor.port}`;
  mkdirSync(home, { recursive: true, mode: 0o700 });
  chmodSync(home, 0o700);
  const descriptorFile = join(home, `runtime-${descriptor.runtimeId}.tmp`);
  writeFileSync(descriptorFile, JSON.stringify(descriptor), { mode: 0o600 });
  renameSync(descriptorFile, join(home, 'runtime.json'));
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  logging.logger.info({ port: descriptor.port }, 'Runtime ready');
  return { app, runtime, descriptor, stop };
}
