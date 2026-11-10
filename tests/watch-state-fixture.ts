import { on } from 'node:events';
import type { EventEmitter } from 'node:events';
import type { Diagnostic } from '../src/shared/types.js';

export type WatchState = { building: boolean; revision: string; diagnostic?: Diagnostic };

// Subscribe before the save so even a synchronous publication cannot be missed.
// The test's signal supplies its hang guard; build duration is not a correctness assertion.
export async function watchState(
  runtime: EventEmitter,
  instanceId: string,
  change: () => void,
  expected: (state: WatchState) => boolean,
  signal: AbortSignal,
): Promise<WatchState> {
  const changes = on(runtime, 'state', { signal }) as AsyncIterableIterator<[string, WatchState]>;
  let latest: WatchState | undefined;
  try {
    change();
    for await (const [id, state] of changes) {
      if (id !== instanceId) continue;
      latest = state;
      if (!state.building && expected(state)) return state;
    }
  } catch (error) {
    if (signal.aborted)
      throw new Error(`Watch update aborted; last state: ${JSON.stringify(latest)}`, {
        cause: error,
      });
    throw error;
  } finally {
    await changes.return?.();
  }
  throw new Error('The watch state stream ended without the expected update.');
}
