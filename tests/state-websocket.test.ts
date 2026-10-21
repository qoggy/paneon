import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { WebSocket } from 'ws';

const { startServer } = (await import(
  '../dist/runtime/' + 'server.js'
)) as typeof import('../src/runtime/server.js');
const { Store } = (await import(
  '../dist/runtime/' + 'store.js'
)) as typeof import('../src/runtime/store.js');
type State = { type: string; revision: string; status: string };
const state = (data: unknown) => JSON.parse(String(data)) as State;

void test(
  'state WebSockets validate their source, isolate subscriptions and release connections',
  { timeout: 20000 },
  async (t) => {
    const home = mkdtempSync(join(tmpdir(), 'paneon-state-websocket-'));
    const store = new Store(home);
    for (const instanceId of ['first', 'second'])
      store.save({
        instanceId,
        definitionId: 'state-test',
        status: 'closed',
        entryPath: '/not-loaded.tsx',
        cwd: home,
        params: {},
        revision: 'saved',
        watch: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        requires: { paneon: '0.0.0' },
        paneonVersion: '0.0.0',
      });
    store.close();
    const service = await startServer(home);
    const origin = `http://127.0.0.1:${service.descriptor.port}`;
    const url = (id: string) => `${origin.replace('http:', 'ws:')}/api/panels/${id}/stream`;
    const sockets = new Set<WebSocket>();
    async function connect(id = 'first') {
      const socket = new WebSocket(url(id), { origin });
      sockets.add(socket);
      const initial = once(socket, 'message');
      await once(socket, 'open');
      assert.deepEqual(JSON.parse(String((await initial)[0])), {
        type: 'state',
        revision: 'saved',
        status: 'closed',
      });
      return socket;
    }
    async function rejected(headers: Record<string, string>, code: string, id = 'first') {
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(url(id), { headers });
        sockets.add(socket);
        socket.on('error', () => {});
        socket.on('open', () => reject(new Error('The upgrade must be rejected.')));
        socket.on('unexpected-response', (_request, response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => {
            body += chunk;
          });
          response.on('end', () => {
            socket.terminate();
            try {
              assert.equal(response.statusCode, 400);
              const failure = JSON.parse(body) as { error: { code: string } };
              assert.equal(failure.error.code, code);
              resolve();
            } catch (error) {
              reject(
                error instanceof Error
                  ? error
                  : new Error('Invalid upgrade response.', { cause: error }),
              );
            }
          });
          response.on('error', reject);
        });
      });
    }
    try {
      await t.test(
        'rejects foreign, null, empty and missing origins, forged Host and unknown instances',
        async () => {
          for (const Origin of ['https://evil.example', 'null', ''])
            await rejected({ Origin }, 'INVALID_ORIGIN');
          // A forged Referer or CLI token cannot replace a browser upgrade Origin.
          await rejected(
            { Referer: `${origin}/`, Authorization: `Bearer ${service.descriptor.controlToken}` },
            'INVALID_ORIGIN',
          );
          await rejected({ Origin: origin, Host: 'localhost:1' }, 'INVALID_HOST');
          await rejected({ Origin: origin }, 'PANEL_NOT_FOUND', 'missing');
          assert.equal(service.app.websocketServer.clients.size, 0);
        },
      );
      await t.test(
        'more than ten subscriptions share runtime listeners and deliver only their own state',
        async () => {
          const listeners = service.runtime.listenerCount('state');
          const stopListeners = service.runtime.listenerCount('stop');
          const first = await Promise.all(Array.from({ length: 12 }, () => connect()));
          const second = await connect('second');
          assert.equal(service.runtime.listenerCount('state'), listeners);
          assert.equal(service.runtime.listenerCount('stop'), stopListeners);
          const messages = first.map((socket) => once(socket, 'message'));
          const otherMessages: unknown[] = [];
          second.on('message', (message) => otherMessages.push(message));
          service.runtime.emit('state', 'first', {
            type: 'state',
            revision: 'next',
            status: 'closed',
          });
          for (const message of await Promise.all(messages))
            assert.equal(state(message[0]).revision, 'next');
          // Ping/pong gives an ordering boundary without relying on a timing delay.
          const pong = once(second, 'pong');
          second.ping();
          await pong;
          assert.deepEqual(otherMessages, []);
          const response = await fetch(`${origin}/api/panels`, {
            headers: { Referer: `${origin}/` },
          });
          assert.equal(response.status, 200);
          const closing = first.map((socket) => once(socket, 'close'));
          first.forEach((socket) => socket.close());
          await Promise.all(closing);
          const replacement = await connect();
          const next = once(replacement, 'message');
          service.runtime.emit('state', 'first', {
            type: 'state',
            revision: 'reconnected',
            status: 'closed',
          });
          assert.equal(state((await next)[0]).revision, 'reconnected');
          // Application messages are not an alternate action execution endpoint.
          const readOnlyClosed = once(replacement, 'close');
          replacement.send('{"method":"action"}');
          assert.equal((await readOnlyClosed)[0], 1008);
          const stopped = once(second, 'close');
          await service.stop();
          await stopped;
          assert.equal(service.app.websocketServer.clients.size, 0);
          assert.equal(service.runtime.listenerCount('state'), 0);
          assert.equal(service.runtime.listenerCount('stop'), 0);
        },
      );
    } finally {
      for (const socket of sockets) socket.terminate();
      await service.stop();
      rmSync(home, { recursive: true, force: true });
    }
  },
);
