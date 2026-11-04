import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import type { AnnotationTarget, AnnotationValue, JsonValue } from '../src/sdk/annotation.ts';

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
  AnnotationStore: new <TRef>(options: { onSubmit(): Promise<unknown>; disabled?: boolean }) => {
    createAnnotation(targets: AnnotationTarget<TRef>[], comment?: string): string;
    updateAnnotation(
      id: string,
      update: { targets: AnnotationTarget<TRef>[]; comment: string },
    ): void;
    removeAnnotationWithUndo(id: string): void;
    openAnnotation(id?: string, targets?: AnnotationTarget<TRef>[]): void;
    changeEditor(comment: string): void;
    cancelEditor(): void;
    deleteEditor(): void;
    numberFor(id: string): number;
    submit(): Promise<void>;
    setOptions(options: { onSubmit(): Promise<unknown>; disabled?: boolean }): void;
    registerText(registration: {
      ref: TRef;
      source: string;
      segments: { node: unknown; sourceOffsets: number[] }[];
    }): () => void;
    openFile(reference: { href: string }, ref: TRef): void;
    retainFile(snapshot: {
      ref: TRef;
      sourceRef: JsonValue;
      file: { path: string; text: string };
    }): void;
    closeFile(): void;
    locate(target: AnnotationTarget<TRef>): Promise<void>;
    fileMounted(id: number): void;
    getFileView(): { id: number; open: boolean; snapshot?: { file: { text: string } } } | null;
    getSnapshot(): {
      value: AnnotationValue<TRef>;
      editor: { comment: string } | null;
      deletions: { id: string; description: string; undo(): boolean; discard(): void }[];
    };
  };
};

function recovery(store: { getSnapshot(): { deletions: { undo(): boolean; discard(): void }[] } }) {
  const deletion = store.getSnapshot().deletions.at(-1);
  assert.ok(deletion);
  return deletion;
}

void test('undo restores the same annotation, targets and position without reverting later edits', () => {
  const store = new AnnotationStore<string>({ onSubmit: async () => {} });
  const first = store.createAnnotation([{ ref: 'first' }], 'first');
  const middle = store.createAnnotation([{ ref: 'middle' }], 'middle');
  const last = store.createAnnotation([{ ref: 'last' }], 'last');
  const original = store.getSnapshot().value.annotations[1];
  store.removeAnnotationWithUndo(middle);
  const deletion = recovery(store);
  assert.deepEqual(
    store.getSnapshot().value.annotations.map((entry) => entry.id),
    [first, last],
  );
  store.updateAnnotation(last, { targets: [{ ref: 'last' }], comment: 'later edit' });
  const added = store.createAnnotation([{ ref: 'added' }]);
  assert.equal(deletion.undo(), true);
  assert.deepEqual(
    store.getSnapshot().value.annotations.map((entry) => entry.id),
    [first, middle, last, added],
  );
  assert.deepEqual(store.getSnapshot().value.annotations[1], original);
  assert.equal(store.getSnapshot().value.annotations[2].comment, 'later edit');
  assert.equal(store.numberFor(middle), 2);
  assert.equal(deletion.undo(), false);
});

void test('editor deletion restores the saved comment, not its unsaved buffer', () => {
  const store = new AnnotationStore<string>({ onSubmit: async () => {} });
  const id = store.createAnnotation([{ ref: 'first' }], 'saved');
  store.openAnnotation(id);
  store.changeEditor('unsaved buffer');
  store.deleteEditor();
  assert.equal(store.getSnapshot().editor, null);
  assert.equal(store.getSnapshot().value.annotations.length, 0);
  assert.equal(recovery(store).undo(), true);
  assert.equal(store.getSnapshot().value.annotations[0].comment, 'saved');
  store.openAnnotation(undefined, [{ ref: 'new' }]);
  store.deleteEditor();
  assert.deepEqual(store.getSnapshot().deletions, []);
});

void test('closing one recovery leaves other deletions undoable', () => {
  const store = new AnnotationStore<string>({ onSubmit: async () => {} });
  const first = store.createAnnotation([{ ref: 'first' }]);
  const second = store.createAnnotation([{ ref: 'second' }]);
  store.removeAnnotationWithUndo(first);
  const old = recovery(store);
  store.removeAnnotationWithUndo(second);
  const latest = recovery(store);
  old.discard();
  assert.deepEqual(store.getSnapshot().deletions, [latest]);
  assert.equal(old.undo(), false);
  latest.discard();
  assert.equal(latest.undo(), false);
  assert.deepEqual(store.getSnapshot().value.annotations, []);
});

void test('independent deletions restore their original order in every undo order', () => {
  for (const order of [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ]) {
    const store = new AnnotationStore<string>({ onSubmit: async () => {} });
    const ids = ['A', 'B', 'C'].map((ref) => store.createAnnotation([{ ref }], ref));
    const original = store.getSnapshot().value.annotations;
    // Delete the middle first: its surviving neighbours may both be deleted later.
    const recoveries = [ids[1], ids[0], ids[2]].map((id) => {
      store.removeAnnotationWithUndo(id);
      return recovery(store);
    });
    const added = store.createAnnotation([{ ref: 'D' }], 'later');
    for (const index of order) assert.equal(recoveries[index].undo(), true);
    assert.deepEqual(store.getSnapshot().value.annotations.slice(0, 3), original);
    assert.equal(store.getSnapshot().value.annotations[3].id, added);
    assert.deepEqual(store.getSnapshot().deletions, []);
    for (const entry of recoveries) assert.equal(entry.undo(), false);
  }
});

void test('only the latest three deletion records survive and summaries identify each action', () => {
  const store = new AnnotationStore<string>({ onSubmit: async () => {} });
  const ids = ['A', 'B', 'C', 'D'].map((ref) =>
    store.createAnnotation([{ ref }], `${ref}\ncomment`),
  );
  const recoveries = ids.map((id) => {
    store.removeAnnotationWithUndo(id);
    return recovery(store);
  });
  assert.equal(store.getSnapshot().deletions.length, 3);
  assert.deepEqual(
    store.getSnapshot().deletions.map((entry) => entry.description),
    ['B comment', 'C comment', 'D comment'],
  );
  assert.equal(recoveries[0].undo(), false);
  recoveries[0].discard();
  assert.equal(store.getSnapshot().deletions.length, 3);
  assert.equal(recoveries[2].undo(), true);
  recoveries[1].discard();
  assert.equal(recoveries[1].undo(), false);
  assert.equal(recoveries[3].undo(), true);
  assert.deepEqual(
    store.getSnapshot().value.annotations.map((entry) => entry.id),
    [ids[2], ids[3]],
  );
  store.removeAnnotationWithUndo(ids[2]);
  assert.equal(
    recovery(store).undo(),
    true,
    'A fresh batch rebuilds its order after all records are released',
  );
});

void test('undo respects open editors, submission locks and page read-only policies', async () => {
  let finish: () => void = () => {};
  let delivered = 0;
  const onSubmit = async () => {
    delivered++;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  };
  const store = new AnnotationStore<string>({ onSubmit });
  const id = store.createAnnotation([{ ref: 'deleted' }]);
  store.removeAnnotationWithUndo(id);
  const deletion = recovery(store);
  store.openAnnotation(undefined, [{ ref: 'editing' }]);
  store.changeEditor('keep this');
  assert.equal(deletion.undo(), false);
  assert.equal(store.getSnapshot().editor?.comment, 'keep this');
  store.cancelEditor();
  const submission = store.submit();
  assert.equal(deletion.undo(), false);
  finish();
  await submission;
  store.setOptions({ onSubmit, disabled: true });
  assert.equal(deletion.undo(), false);
  store.setOptions({ onSubmit });
  assert.equal(deletion.undo(), true);
  assert.equal(delivered, 1, 'Undo never submits feedback');
});

void test('undo preserves the original text snapshot so a changed source still rejects submission', async () => {
  const store = new AnnotationStore<string>({
    onSubmit: () => Promise.reject(new Error('Unexpected submission')),
  });
  const register = (source: string) =>
    store.registerText({
      ref: 'text',
      source,
      segments: [
        {
          node: { nodeType: 3, data: source },
          sourceOffsets: Array.from({ length: source.length + 1 }, (_, i) => i),
        },
      ],
    });
  const unregister = register('same original');
  const id = store.createAnnotation([{ ref: 'text', text: { start: 0, end: 4, quote: 'same' } }]);
  store.removeAnnotationWithUndo(id);
  unregister();
  register('same changed');
  assert.equal(recovery(store).undo(), true);
  await assert.rejects(store.submit(), /stale/);
});

void test('undo restores a closed original file snapshot and its location', async () => {
  const store = new AnnotationStore<string>({ onSubmit: async () => {} });
  const file = { path: '/original.ts', text: 'const before = 1;' };
  const sourceRef = { path: file.path, snapshotId: 'original' };
  const target = { ref: 'file', sourceRef, text: { start: 0, end: 5, quote: 'const' } };
  store.openFile({ href: file.path }, 'file');
  store.retainFile({ ref: 'file', sourceRef, file });
  const id = store.createAnnotation([target], 'original file');
  store.closeFile();
  store.removeAnnotationWithUndo(id);
  assert.equal(recovery(store).undo(), true);
  const locating = store.locate(target);
  await new Promise((resolve) => setImmediate(resolve));
  const view = store.getFileView();
  assert.ok(view);
  assert.equal(view.open, true);
  assert.equal(view.snapshot?.file.text, file.text);
  store.fileMounted(view.id);
  await locating;
  await store.submit();
});
