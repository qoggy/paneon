import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import type { Feedback } from '../src/sdk/feedback.ts';

// Exercise the same UI store in Node without mocking React or relying on stale dist.
const compiled = await build({
  entryPoints: [new URL('../src/ui/feedback-store.ts', import.meta.url).pathname],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { FeedbackStore } = (await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64')
)) as {
  FeedbackStore: new (options: {
    onSubmit(value: Feedback): Promise<unknown>;
    disabled?: boolean;
    adapter?: {
      resolve(target: unknown): Promise<{ status: 'ready' }>;
      locate(target: unknown): Promise<void>;
    };
  }) => {
    getSnapshot(): {
      value: Feedback;
      activeAnnotationId: string | null;
      submitting: boolean;
      error: string | null;
      createAnnotation(targets: { ref: string }[], comment?: string): string;
      updateAnnotation(id: string, entry: { targets: { ref: string }[]; comment: string }): void;
      removeAnnotation(id: string): void;
      toggleTarget(target: { ref: string }): void;
      setComment(comment: string): void;
      editAnnotation(id: string | null): void;
      setMode(mode: 'browse' | 'select'): void;
      registerText(registration: {
        ref: string;
        source: string;
        segments: { node: unknown; sourceOffsets: (number | null)[] }[];
      }): () => void;
      submit(): Promise<void>;
    };
    setOptions(options: { onSubmit(value: Feedback): Promise<unknown>; disabled?: boolean }): void;
  };
};

void test('controller keeps stable identities, validates changes atomically and deletes the final target', () => {
  const store = new FeedbackStore({ onSubmit: async () => {} });
  const api = store.getSnapshot();
  api.toggleTarget({ ref: 'one', text: undefined } as { ref: string });
  const id = store.getSnapshot().activeAnnotationId;
  assert.ok(id);
  api.toggleTarget({ ref: 'two' });
  assert.equal(store.getSnapshot().value.annotations[0].targets.length, 2);
  api.updateAnnotation(id, { targets: [{ ref: 'one' }, { ref: 'two' }], comment: '意见' });
  api.updateAnnotation(id, { targets: [{ ref: 'one' }, { ref: 'two' }], comment: '' });
  assert.equal(store.getSnapshot().value.annotations[0].id, id);
  const before = store.getSnapshot().value;
  assert.throws(() => api.updateAnnotation(id, { targets: [], comment: 'invalid' }));
  assert.equal(store.getSnapshot().value, before);
  assert.throws(() => {
    before.annotations[0].comment = 'external mutation';
  });
  api.editAnnotation(null);
  api.toggleTarget({ ref: 'one' });
  assert.equal(store.getSnapshot().value.annotations.length, 2);
  api.toggleTarget({ ref: 'one' });
  assert.equal(store.getSnapshot().activeAnnotationId, null);
  assert.equal(store.getSnapshot().value.annotations.length, 1);
  api.editAnnotation(id);
  api.toggleTarget({ ref: 'one' });
  api.toggleTarget({ ref: 'two' });
  assert.deepEqual(store.getSnapshot().value.annotations, []);
});

void test('submission locks before async resolution, deep-freezes one snapshot and retains failed drafts', async () => {
  let finishResolve: (() => void) | undefined;
  const resolution = new Promise<void>((resolve) => {
    finishResolve = resolve;
  });
  let count = 0;
  let received: Feedback | undefined;
  const store = new FeedbackStore({
    adapter: {
      resolve: async () => {
        await resolution;
        return { status: 'ready' };
      },
      locate: async () => {},
    },
    onSubmit: async (value) => {
      count++;
      received = value;
      await Promise.resolve();
      throw new Error('failure');
    },
  });
  const api = store.getSnapshot();
  const id = api.createAnnotation([{ ref: 'one' }]);
  api.setComment('overall');
  const before = store.getSnapshot().value;
  const submitting = api.submit();
  assert.equal(store.getSnapshot().submitting, true);
  assert.throws(() => api.setComment('changed'));
  assert.throws(() => api.setMode('select'));
  assert.throws(() => api.updateAnnotation(id, { targets: [{ ref: 'one' }], comment: 'changed' }));
  assert.throws(() => api.removeAnnotation(id));
  assert.throws(() => api.editAnnotation(null));
  await api.submit();
  assert.equal(count, 0);
  assert.ok(finishResolve);
  finishResolve();
  await assert.rejects(submitting, /failure/);
  assert.equal(count, 1);
  assert.deepEqual(received, before);
  assert.notEqual(received, before);
  assert.equal(Object.isFrozen(received?.annotations[0].targets[0]), true);
  assert.equal(store.getSnapshot().value, before);
  assert.equal(store.getSnapshot().submitting, false);
  assert.equal(store.getSnapshot().error, 'failure');
  store.setOptions({
    onSubmit: () => {
      count++;
      return Promise.resolve();
    },
  });
  api.setComment('corrected');
  await assert.rejects(api.submit(), /not mounted/);
  assert.equal(count, 1);
});

void test('disabled providers prohibit mutations and duplicate callbacks without imposing revision fields', async () => {
  let count = 0;
  const onSubmit = () => {
    count++;
    return Promise.resolve();
  };
  const store = new FeedbackStore({ onSubmit, disabled: true });
  const api = store.getSnapshot();
  assert.throws(() => api.createAnnotation([{ ref: 'one' }]));
  assert.throws(() => api.setComment('opinion'));
  await api.submit();
  assert.equal(count, 0);
  store.setOptions({ onSubmit, disabled: false });
  api.setComment('overall only');
  await api.submit();
  assert.equal(count, 1);
  assert.deepEqual(store.getSnapshot().value, { annotations: [], comment: 'overall only' });
  await api.submit();
  assert.equal(count, 2);
});

void test('text registration checks every UTF-16 boundary and supports explicit cleanup', () => {
  const store = new FeedbackStore({ onSubmit: async () => {} });
  const api = store.getSnapshot();
  const node = { nodeType: 3, data: 'abc' };
  for (const sourceOffsets of [
    [0, 1],
    [0, 2, 1, 3],
    [0, 1, 2, 4],
    [0, 1, 2, 2.5],
    [-1, 0, 1, 2],
  ])
    assert.throws(() =>
      api.registerText({ ref: 'text', source: 'abc', segments: [{ node, sourceOffsets }] }),
    );
  const unregister = api.registerText({
    ref: 'text',
    source: 'abc',
    segments: [{ node, sourceOffsets: [0, 1, null, 3] }],
  });
  assert.doesNotThrow(unregister);
  assert.doesNotThrow(unregister);
});
