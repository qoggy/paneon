import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import type { AnnotationValue } from '../src/sdk/annotation.ts';

// Exercise the same UI store in Node without mocking React or relying on stale dist.
const compiled = await build({
  entryPoints: [new URL('../src/ui/annotation-store.ts', import.meta.url).pathname],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { AnnotationStore } = (await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64')
)) as {
  AnnotationStore: new (options: {
    onSubmit(value: AnnotationValue): Promise<unknown>;
    disabled?: boolean;
    adapter?: {
      locate(target: unknown): Promise<void>;
    };
  }) => {
    getSnapshot(): {
      value: AnnotationValue;
      activeAnnotationId: string | null;
      submitting: boolean;
      error: string | null;
      createAnnotation(targets: { ref: string }[], comment?: string): string;
      updateAnnotation(id: string, entry: { targets: { ref: string }[]; comment: string }): void;
      removeAnnotation(id: string): void;
      editAnnotation(id: string | null): void;
      registerText(registration: {
        ref: string;
        source: string;
        segments: { node: unknown; sourceOffsets: (number | null)[] }[];
      }): () => void;
      submit(): Promise<void>;
    };
    setOptions(options: {
      onSubmit(value: AnnotationValue): Promise<unknown>;
      disabled?: boolean;
    }): void;
    numberFor(id: string): number;
  };
};

void test('annotation numbers follow the current list while ids and submitted snapshots stay stable', async () => {
  const delivered: AnnotationValue[] = [];
  const store = new AnnotationStore({
    adapter: { locate: async () => {} },
    onSubmit: (value) => {
      delivered.push(value);
      return Promise.resolve();
    },
  });
  const api = store.getSnapshot();
  const ids = ['one', 'two', 'three'].map((ref) => api.createAnnotation([{ ref }], ref));
  assert.deepEqual(
    ids.map((id) => store.numberFor(id)),
    [1, 2, 3],
  );
  await api.submit();
  api.removeAnnotation(ids[1]);
  assert.deepEqual(
    ids.map((id) => store.numberFor(id)),
    [1, 0, 2],
  );
  assert.deepEqual(
    store.getSnapshot().value.annotations.map((entry) => entry.id),
    [ids[0], ids[2]],
  );
  await api.submit();
  assert.deepEqual(
    delivered[0].annotations.map((entry) => entry.id),
    ids,
  );
  assert.deepEqual(
    delivered[1].annotations.map((entry) => entry.id),
    [ids[0], ids[2]],
  );
  assert.deepEqual(
    delivered[1].annotations.map((entry) => entry.comment),
    ['one', 'three'],
  );
  assert.equal(
    delivered[1].annotations.some((entry) => 'number' in entry),
    false,
  );
  const fourth = api.createAnnotation([{ ref: 'four' }]);
  assert.equal(store.numberFor(fourth), 3);
  for (const id of [ids[0], ids[2], fourth]) api.removeAnnotation(id);
  const fresh = api.createAnnotation([{ ref: 'fresh' }]);
  assert.equal(store.numberFor(fresh), 1);
});

void test('controller does not expose the removed object-selection mode', () => {
  const api = new AnnotationStore({ onSubmit: async () => {} }).getSnapshot();
  for (const key of ['mode', 'setMode', 'toggleTarget', 'setOverallAnnotationText'])
    assert.equal(key in api, false);
});

void test('controller keeps stable identities, validates changes atomically and explicitly deletes annotations', () => {
  const store = new AnnotationStore({ onSubmit: async () => {} });
  const api = store.getSnapshot();
  const id = api.createAnnotation([{ ref: 'one' }]);
  assert.ok(id);
  api.updateAnnotation(id, { targets: [{ ref: 'one' }, { ref: 'two' }], comment: '' });
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
  const second = api.createAnnotation([{ ref: 'one' }]);
  assert.equal(store.getSnapshot().value.annotations.length, 2);
  api.removeAnnotation(second);
  assert.equal(store.getSnapshot().activeAnnotationId, null);
  assert.equal(store.getSnapshot().value.annotations.length, 1);
  api.removeAnnotation(id);
  assert.deepEqual(store.getSnapshot().value.annotations, []);
});

void test('submission locks during delivery, deep-freezes one snapshot and retains failed drafts', async () => {
  let finishSubmit: (() => void) | undefined;
  const delivery = new Promise<void>((resolve) => {
    finishSubmit = resolve;
  });
  let count = 0;
  let received: AnnotationValue | undefined;
  const store = new AnnotationStore({
    onSubmit: async (value) => {
      count++;
      received = value;
      await delivery;
      throw new Error('failure');
    },
  });
  const api = store.getSnapshot();
  const id = api.createAnnotation([{ ref: 'one' }]);
  const before = store.getSnapshot().value;
  const submitting = api.submit();
  assert.equal(store.getSnapshot().submitting, true);
  assert.throws(() => api.createAnnotation([{ ref: 'two' }], 'changed'));
  assert.throws(() => api.updateAnnotation(id, { targets: [{ ref: 'one' }], comment: 'changed' }));
  assert.throws(() => api.removeAnnotation(id));
  assert.throws(() => api.editAnnotation(null));
  await api.submit();
  assert.equal(count, 1, 'Duplicate submission does not invoke the callback again');
  assert.ok(finishSubmit);
  finishSubmit();
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
  api.updateAnnotation(id, { targets: [{ ref: 'one' }], comment: 'corrected' });
  await api.submit();
  assert.equal(count, 2, 'Corrected feedback submits without a registered source');
});

void test('disabled providers prohibit mutations and duplicate callbacks without imposing revision fields', async () => {
  let count = 0;
  const onSubmit = () => {
    count++;
    return Promise.resolve();
  };
  const store = new AnnotationStore({ onSubmit, disabled: true });
  const api = store.getSnapshot();
  assert.throws(() => api.createAnnotation([{ ref: 'one' }]));
  await api.submit();
  assert.equal(count, 0);
  store.setOptions({ onSubmit, disabled: false });
  await api.submit();
  assert.equal(count, 1);
  assert.deepEqual(store.getSnapshot().value, { annotations: [] });
  await api.submit();
  assert.equal(count, 2);
});

void test('text registration checks every UTF-16 boundary and supports explicit cleanup', () => {
  const store = new AnnotationStore({ onSubmit: async () => {} });
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

void test('annotations on content that later unmounts still submit, but cannot be located without an adapter', async () => {
  const submitted: AnnotationValue[] = [];
  const store = new AnnotationStore({
    onSubmit: (value) => {
      submitted.push(value);
      return Promise.resolve();
    },
  });
  const api = store.getSnapshot() as unknown as {
    registerText(registration: unknown): () => void;
    createAnnotation(targets: unknown[], comment?: string): string;
    locate(target: unknown): Promise<void>;
    submit(): Promise<void>;
  };
  const node = { nodeType: 3, data: 'Use Redis.', isConnected: true };
  const unregister = api.registerText({
    ref: 'tab:plan',
    source: 'Use Redis.',
    segments: [{ node, sourceOffsets: Array.from({ length: 11 }, (_, index) => index) }],
  });
  const text = { ref: 'tab:plan', text: { start: 4, end: 9, quote: 'Redis' } };
  api.createAnnotation([text], 'Why Redis?');
  api.createAnnotation([{ ref: 'tab:plan' }], 'Whole plan');
  // Switching tabs unmounts the registered text.
  node.isConnected = false;
  unregister();
  await assert.rejects(api.locate(text), /not displayed/);
  await store.getSnapshot().submit();
  assert.equal(submitted.length, 1);
  assert.deepEqual(
    submitted[0].annotations.map((entry) => entry.targets),
    [[text], [{ ref: 'tab:plan' }]],
  );
});

void test('a changed source rejects location before and after unmounting without blocking submission', async () => {
  const submitted: AnnotationValue[] = [];
  const store = new AnnotationStore({
    onSubmit: (value) => {
      submitted.push(value);
      return Promise.resolve();
    },
  });
  const api = store.getSnapshot() as unknown as {
    registerText(registration: unknown): () => void;
    createAnnotation(targets: unknown[], comment?: string): string;
    locate(target: unknown): Promise<void>;
  };
  const register = (source: string) => {
    const node = { nodeType: 3, data: source, isConnected: true };
    const unregister = api.registerText({
      ref: 'tab:plan',
      source,
      segments: [
        { node, sourceOffsets: Array.from({ length: source.length + 1 }, (_, index) => index) },
      ],
    });
    return () => {
      node.isConnected = false;
      unregister();
    };
  };
  const unmountOld = register('Use Redis.');
  const target = { ref: 'tab:plan', text: { start: 4, end: 9, quote: 'Redis' } };
  api.createAnnotation([target], 'Why?');
  const before = store.getSnapshot().value;
  unmountOld();
  const unmountNew = register('Use MySQL.');
  await assert.rejects(api.locate(target), /stale/);
  await store.getSnapshot().submit();
  unmountNew();
  await assert.rejects(api.locate(target), /stale/);
  await store.getSnapshot().submit();
  assert.deepEqual(submitted, [before, before]);
  assert.deepEqual(store.getSnapshot().value, before);
});
