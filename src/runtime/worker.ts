import { createServer, createServerModuleRunner } from 'vite';
import { z } from 'zod';
import type { Action, PanelDefinition, ActionContext } from '../sdk/server.js';
import { diagnostic, jsonValue, PaneonError } from '../shared/types.js';
import { assertNoSecrets } from './secret-boundary.js';
import type { JsonValue } from '../shared/types.js';
let definition: PanelDefinition;
let actions: Record<string, Action> = {};
const controller = new AbortController();
const secretWaits = new Map<
  string,
  { resolve: (value: string) => void; reject: (e: Error) => void }
>();
function send(message: unknown) {
  process.send?.(message);
}
process.on('message', (raw: unknown) => {
  void handle(raw).catch(() =>
    send({
      kind: 'error',
      error: { code: 'BUILD_FAILED', message: 'Panel module evaluation failed.' },
    }),
  );
});
async function handle(raw: unknown) {
  const m = raw as {
    kind: string;
    serverFile: string;
    actions: { id: string; name: string }[];
    inspect: boolean;
    params: unknown;
    requestId: string;
    actionId: string;
    input: unknown;
    type: string;
    payload: unknown;
    ref: string;
    value: string;
    error?: { code: string; message: string };
  };
  if (m.kind === 'init') {
    const server = await createServer({
      configFile: false,
      root: process.cwd(),
      logLevel: 'silent',
      server: { middlewareMode: true },
      appType: 'custom',
      ssr: { external: ['node:fs', 'node:path'] },
    });
    const runner = createServerModuleRunner(server.environments.ssr);
    const mod = await runner.import<
      { default: PanelDefinition; __paneonActions?: Record<string, Action> } & Record<
        string,
        unknown
      >
    >(m.serverFile);

    definition = mod.default;
    if (
      !definition ||
      typeof definition.id !== 'string' ||
      !definition.id.trim() ||
      !definition.input?.safeParse
    )
      throw new Error('Invalid definition');
    actions =
      mod.__paneonActions ??
      Object.fromEntries(m.actions.map((a) => [a.id, mod[a.name] as Action]));
    const actionManifests = Object.entries(actions).map(([id, a]) => {
      if (!a?.input?.safeParse || typeof a.handler !== 'function')
        throw new Error('Invalid action');
      if (
        a.credential &&
        (typeof a.credential.label !== 'string' ||
          (a.credential.ttlSeconds !== undefined &&
            (!Number.isInteger(a.credential.ttlSeconds) ||
              a.credential.ttlSeconds < 1 ||
              a.credential.ttlSeconds > 3600)))
      )
        throw new Error('Invalid credential declaration');
      return {
        id,
        kind: a.kind,
        inputSchema: z.toJSONSchema(a.input),
        ...(a.credential ? { credential: a.credential } : {}),
      };
    });
    if (!m.inspect && !definition.input.safeParse(m.params).success) {
      send({
        kind: 'error',
        error: {
          code: 'INPUT_VALIDATION_FAILED',
          message: 'Panel input does not match its schema.',
        },
      });
      return;
    }
    send({
      kind: 'ready',
      data: {
        definitionId: definition.id,
        inputSchema: z.toJSONSchema(definition.input),
        actions: actionManifests,
        events: Object.fromEntries(
          Object.entries(definition.events ?? {}).map(([type, schema]) => [
            type,
            z.toJSONSchema(schema),
          ]),
        ),
      },
    });
    return;
  }
  if (m.kind === 'stop') {
    controller.abort();
    setTimeout(() => process.exit(0), 30).unref();
    return;
  }
  if (m.kind === 'secret-result') {
    const pending = secretWaits.get(m.requestId);
    if (pending) {
      secretWaits.delete(m.requestId);
      if (m.error) pending.reject(new PaneonError(m.error.code, m.error.message));
      else pending.resolve(m.value);
    }
    return;
  }
  if (m.kind === 'validate-event') {
    try {
      const schema = definition.events?.[m.type];
      if (!schema) throw new PaneonError('INVALID_EVENT', 'The event type is not declared.');
      const result = schema.safeParse(m.payload);
      if (!result.success)
        throw new PaneonError('INVALID_EVENT', 'Event input does not match its schema.');
      const payload = jsonValue(result.data);
      send({ kind: 'result', requestId: m.requestId, data: payload });
    } catch (e) {
      send({ kind: 'result', requestId: m.requestId, error: diagnostic(e) });
    }
    return;
  }
  if (m.kind === 'invoke') {
    const known = new Set<string>();
    try {
      const action = actions[m.actionId];
      if (!action) throw new PaneonError('ACTION_NOT_FOUND', 'The action is not declared.');
      const parsed = action.input.safeParse(m.input);
      if (!parsed.success)
        throw new PaneonError('INPUT_VALIDATION_FAILED', 'Action input does not match its schema.');
      const ctx: ActionContext = {
        signal: controller.signal,
        secrets: {
          use: async <T>(ref: string, callback: (value: string) => T | Promise<T>): Promise<T> => {
            const requestId = crypto.randomUUID();
            const value = await new Promise<string>((resolve, reject) => {
              secretWaits.set(requestId, { resolve, reject });
              send({ kind: 'secret', requestId, callId: m.requestId, ref, actionId: m.actionId });
            });
            known.add(value);
            return callback(value);
          },
        },
      };
      let data: JsonValue;
      try {
        data = jsonValue(await action.handler(ctx, parsed.data));
      } catch (error) {
        if (error instanceof PaneonError) throw error;
        throw new PaneonError('ACTION_FAILED', 'The action failed.');
      }
      assertNoSecrets(data, known);
      send({ kind: 'result', requestId: m.requestId, data });
    } catch (error) {
      send({ kind: 'result', requestId: m.requestId, error: diagnostic(error) });
    } finally {
      known.clear();
    }
  }
}
