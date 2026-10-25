import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { Action, PanelDefinition, ActionContext } from '../sdk/server.js';
import { diagnostic, jsonValue, PaneonError } from '../shared/types.js';
import type { JsonValue } from '../shared/types.js';
let definition: PanelDefinition;
let actions: Record<string, Action> = {};
const controller = new AbortController();
function send(message: unknown) {
  if (process.connected) process.send?.(message);
}
function stop() {
  controller.abort();
  setTimeout(() => process.exit(0), 30).unref();
}
process.once('disconnect', stop);
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
  };
  if (m.kind === 'init') {
    // The compiler already bundled this revision. Source watching and worker
    // replacement belong to the parent runtime, so no dev server is needed here.
    const mod = (await import(pathToFileURL(m.serverFile).href)) as {
      default: PanelDefinition;
      __paneonActions?: Record<string, Action>;
    } & Record<string, unknown>;

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
      return {
        id,
        kind: a.kind,
        inputSchema: z.toJSONSchema(a.input),
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
    stop();
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
    try {
      const action = actions[m.actionId];
      if (!action) throw new PaneonError('ACTION_NOT_FOUND', 'The action is not declared.');
      const parsed = action.input.safeParse(m.input);
      if (!parsed.success)
        throw new PaneonError('INPUT_VALIDATION_FAILED', 'Action input does not match its schema.');
      const ctx: ActionContext = {
        signal: controller.signal,
      };
      let data: JsonValue;
      try {
        data = jsonValue(await action.handler(ctx, parsed.data));
      } catch (error) {
        if (error instanceof PaneonError) throw error;
        throw new PaneonError('ACTION_FAILED', 'The action failed.');
      }
      send({ kind: 'result', requestId: m.requestId, data });
    } catch (error) {
      send({ kind: 'result', requestId: m.requestId, error: diagnostic(error) });
    }
  }
}
