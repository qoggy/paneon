import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { watchState } from './watch-state-fixture.ts';

void test('watch waits subscribe before saving and select completed states for the requested panel', async (t) => {
  const runtime = new EventEmitter();
  const completed = { building: false, revision: 'new' };
  const result = await watchState(
    runtime,
    'one',
    () => {
      runtime.emit('state', 'other', completed);
      runtime.emit('state', 'one', { building: true, revision: 'new' });
      runtime.emit('state', 'one', completed);
      // A later duplicate notification does not erase the completed publication.
      runtime.emit('state', 'one', { building: true, revision: 'new' });
    },
    (state) => state.revision === 'new',
    t.signal,
  );
  assert.equal(result, completed);
  assert.equal(runtime.listenerCount('state'), 0);
  assert.equal(runtime.listenerCount('error'), 0);
});

void test('an aborted watch wait preserves the last diagnostic and releases its listeners', async () => {
  const runtime = new EventEmitter();
  const controller = new AbortController();
  const pending = watchState(
    runtime,
    'one',
    () => {
      runtime.emit('state', 'one', {
        building: false,
        revision: 'old',
        diagnostic: { code: 'BUILD_FAILED', message: 'Fixture compilation failed.' },
      });
    },
    (state) => !state.diagnostic,
    controller.signal,
  );
  // Let the buffered failure state reach the waiter before cancellation.
  await new Promise<void>((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, /last state: .*BUILD_FAILED.*Fixture compilation failed/);
  assert.equal(runtime.listenerCount('state'), 0);
  assert.equal(runtime.listenerCount('error'), 0);
});

void test('a failing save propagates its original error and releases watch listeners', async (t) => {
  const runtime = new EventEmitter();
  const error = new Error('Fixture save failed.');
  await assert.rejects(
    watchState(
      runtime,
      'one',
      () => {
        throw error;
      },
      () => true,
      t.signal,
    ),
    (failure) => failure === error,
  );
  assert.equal(runtime.listenerCount('state'), 0);
  assert.equal(runtime.listenerCount('error'), 0);
});
