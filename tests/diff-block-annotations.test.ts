import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createDiffModel } from '../src/shared/diff-model.ts';
import type { DiffModel } from '../src/shared/diff-model.ts';
import type { AnnotationTarget, AnnotationValue } from '../src/sdk/annotation.ts';
import {
  diffAnnotationTargets,
  normalizeDiffTarget,
  diffTargetLocation,
} from '../skills/paneon/assets/shared/diff-schema.ts';
import {
  diffReviewParamsSchema,
  diffReviewSubmittedSchema,
  validateRanges,
} from '../skills/paneon/assets/panels/diff-review/schema.ts';

const compiled = await build({
  stdin: {
    contents: `export {diffAnnotationBlocks,diffBlockSummary,diffBlockKey} from './src/ui/diff-block-annotations';
      export {AnnotationStore} from './src/ui/annotation-store';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { diffAnnotationBlocks, diffBlockSummary, diffBlockKey, AnnotationStore } = (await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64')
)) as {
  diffAnnotationBlocks<T>(
    this: void,
    model: DiffModel,
    refs: { old?: T; new?: T },
  ): { targets: AnnotationTarget<T>[] }[];
  diffBlockSummary(
    this: void,
    block: { targets: AnnotationTarget<unknown>[] },
    oldPath?: string,
    newPath?: string,
  ): string;
  diffBlockKey(this: void, targets: readonly AnnotationTarget<unknown>[]): string;
  AnnotationStore: new <T>(options: {
    adapter: {
      resolve(target: AnnotationTarget<T>): { status: 'ready'; text?: string };
      locate(target: AnnotationTarget<T>): void;
    };
    onSubmit(value: AnnotationValue<T>): Promise<void>;
  }) => {
    getSnapshot(): {
      value: AnnotationValue<T>;
      editor: { id?: string; comment: string; anchor?: unknown } | null;
      beginAnnotation(targets: AnnotationTarget<T>[]): void;
    };
    registerText(value: {
      ref: T;
      source: string;
      segments: { node: unknown; sourceOffsets: (number | null)[] }[];
      presentation?(targets: readonly AnnotationTarget<T>[]): { summary: string } | undefined;
    }): () => void;
    presentation(targets: readonly AnnotationTarget<T>[]): { summary?: string } | undefined;
    openAnnotation(id?: string, selected?: AnnotationTarget<T>[], anchor?: unknown): void;
    selectText(selection: unknown): void;
    mountSurface(): () => void;
    retainedSource(ref: T): string | undefined;
    changeEditor(comment: string): void;
    saveEditor(): void;
    cancelEditor(): void;
    submit(): Promise<void>;
    removeAnnotation(id: string): void;
  };
};

void test('one replacement is one annotation with exact old/new targets, while unchanged rows split blocks', () => {
  const model = createDiffModel(
    'head\r\nold é🙂\r\nkeep\r\nremove\r\n',
    'head\r\nnew é🙂\r\nkeep\r\n',
  );
  assert.equal(model.hunks.length, 1, 'merged context is not the annotation block boundary');
  const refs = { old: { file: 0, side: 'old' }, new: { file: 0, side: 'new' } };
  const blocks = diffAnnotationBlocks(model, refs);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0].targets, [
    { ref: refs.old, text: { start: 6, end: 16, quote: 'old é🙂\r\n' } },
    { ref: refs.new, text: { start: 6, end: 16, quote: 'new é🙂\r\n' } },
  ]);
  assert.equal(blocks[1].targets.length, 1);
  assert.equal(blocks[1].targets[0].text?.quote, 'remove\r\n');
  assert.equal(diffBlockKey(blocks[0].targets), diffBlockKey([...blocks[0].targets].reverse()));
  assert.equal(
    diffBlockSummary(blocks[0], 'src/config.ts', 'src/config.ts'),
    'src/config.ts\n-old é🙂\n+new é🙂',
  );
});

void test('whole-file additions/deletions, missing final newline and omitted side references', () => {
  for (const [oldText, newText, side] of [
    ['', '🙂\nend', 'new'],
    ['🙂\nend', '', 'old'],
  ] as const) {
    const blocks = diffAnnotationBlocks(createDiffModel(oldText, newText), {
      old: 'before',
      new: 'after',
    });
    assert.equal(blocks.length, 1);
    assert.deepEqual(blocks[0].targets, [
      {
        ref: side === 'old' ? 'before' : 'after',
        text: { start: 0, end: 6, quote: '🙂\nend' },
      },
    ]);
  }
  const model = createDiffModel('before\n', 'after\n');
  assert.equal(diffAnnotationBlocks(model, {}).length, 0);
  assert.equal(diffAnnotationBlocks(model, { new: 'after' })[0].targets.length, 1);
  assert.equal(
    diffAnnotationBlocks(createDiffModel('same', 'same'), { old: 'before', new: 'after' }).length,
    0,
  );
});

void test('Git review uses the same side references and normalizes both targets without a new ref kind', () => {
  const model = createDiffModel('head\nold\nend\n', 'head\nnew\nend\n');
  const targets = diffAnnotationBlocks(model, diffAnnotationTargets(model, 'version-1'))[0].targets;
  const normalized = targets.map((target) => normalizeDiffTarget(model, target));
  assert.deepEqual(
    normalized.map((target) => target.ref),
    [
      { sourceId: 'version-1', kind: 'lines', side: 'old', startLine: 2, endLine: 2 },
      { sourceId: 'version-1', kind: 'lines', side: 'new', startLine: 2, endLine: 2 },
    ],
  );
  assert.deepEqual(
    normalized.map((target) => target.text),
    [
      { start: 0, end: 4, quote: 'old\n' },
      { start: 0, end: 4, quote: 'new\n' },
    ],
  );
  assert.deepEqual(
    normalized.map((target) => diffTargetLocation(model, target)),
    [
      { kind: 'text', side: 'old', start: 5, end: 9, quote: 'old\n' },
      { kind: 'text', side: 'new', start: 5, end: 9, quote: 'new\n' },
    ],
  );
});

void test('block creation and editing share one temporary editor; cancel saves nothing and only submit delivers', async () => {
  const oldText = 'const a = 1;\n';
  const newText = 'const a = 2;\n';
  const model = createDiffModel(oldText, newText);
  const targets = diffAnnotationBlocks(model, { old: 'before', new: 'after' })[0].targets;
  const delivered: unknown[] = [];
  const store = new AnnotationStore<string>({
    adapter: {
      resolve: (target) => ({
        status: 'ready',
        text: target.ref === 'before' ? oldText : newText,
      }),
      locate: () => {},
    },
    onSubmit: (value) => {
      delivered.push(value);
      return Promise.resolve();
    },
  });
  const unregister = store.registerText({
    ref: 'before',
    source: oldText,
    segments: [],
    presentation: (selected) =>
      diffBlockKey(selected) === diffBlockKey(targets)
        ? { summary: 'config.ts\n-const a = 1;\n+const a = 2;' }
        : undefined,
  });
  store.getSnapshot().beginAnnotation(targets);
  store.changeEditor('cancel me');
  assert.equal(store.getSnapshot().value.annotations.length, 0);
  store.cancelEditor();
  assert.equal(store.getSnapshot().editor, null);
  assert.equal(store.getSnapshot().value.annotations.length, 0);
  store.getSnapshot().beginAnnotation(targets);
  store.changeEditor('check retry');
  store.saveEditor();
  const saved = store.getSnapshot().value.annotations[0];
  assert.equal(delivered.length, 0, 'Save must not emit');
  assert.deepEqual(saved.targets, targets);
  store.getSnapshot().beginAnnotation([...targets].reverse());
  assert.equal(store.getSnapshot().editor?.id, saved.id, 'the same block reopens its annotation');
  assert.equal(store.getSnapshot().editor?.comment, 'check retry');
  store.changeEditor('reuse the block');
  store.saveEditor();
  assert.equal(store.getSnapshot().value.annotations.length, 1, 'reopening must not duplicate');
  assert.equal(store.getSnapshot().value.annotations[0].id, saved.id);
  unregister();
  assert.match(store.presentation(saved.targets)?.summary ?? '', /^config.ts/);
  const clickedAnchor = { x: 540, y: 470, width: 24, height: 24 };
  store.openAnnotation(saved.id, undefined, clickedAnchor);
  assert.equal(store.getSnapshot().editor?.anchor, clickedAnchor, 'retain the clicked edit origin');
  store.changeEditor('edited');
  store.cancelEditor();
  assert.equal(store.getSnapshot().value.annotations[0].comment, 'reuse the block');
  store.openAnnotation(saved.id);
  assert.equal(store.getSnapshot().editor?.anchor, undefined, 'an old origin must not leak');
  store.changeEditor('edited');
  store.saveEditor();
  assert.equal(store.getSnapshot().value.annotations[0].id, saved.id);
  await store.submit();
  assert.deepEqual(delivered, [{ annotations: [{ id: saved.id, targets, comment: 'edited' }] }]);
  store.removeAnnotation(saved.id);
  assert.equal(
    store.presentation(targets),
    undefined,
    'remove the retained display summary with its annotation',
  );
});

void test('opening a text annotation preserves the source captured at selection time', (t) => {
  const filter = Object.getOwnPropertyDescriptor(globalThis, 'NodeFilter');
  Object.defineProperty(globalThis, 'NodeFilter', { value: { SHOW_TEXT: 4 }, configurable: true });
  t.after(() => {
    if (filter) Object.defineProperty(globalThis, 'NodeFilter', filter);
    else Reflect.deleteProperty(globalThis, 'NodeFilter');
  });
  const store = new AnnotationStore<string>({
    adapter: { resolve: () => ({ status: 'ready' }), locate: () => {} },
    onSubmit: async () => {},
  });
  t.after(store.mountSurface());
  const node = {
    nodeType: 3,
    data: 'old',
    length: 3,
    isConnected: true,
    parentElement: null,
    ownerDocument: {},
  };
  node.ownerDocument = {
    body: {},
    createTreeWalker: () => {
      let visited = false;
      return {
        nextNode: () => {
          if (visited) return null;
          visited = true;
          return node;
        },
      };
    },
  };
  const segments = [{ node, sourceOffsets: [0, 1, 2, 3] }];
  const unregister = store.registerText({ ref: 'text', source: 'old context', segments });
  store.selectText({
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => ({
      startContainer: node,
      endContainer: node,
      startOffset: 0,
      endOffset: 3,
      intersectsNode: (item: unknown) => item === node,
    }),
  });
  assert.equal(store.retainedSource('text'), 'old context');
  unregister();
  store.registerText({ ref: 'text', source: 'old changed', segments });
  store.openAnnotation();
  assert.equal(store.retainedSource('text'), 'old context');
});

void test('unchanged diff-review-submitted schema and original-snapshot validation accept both block sides', () => {
  const params = diffReviewParamsSchema.parse({
    files: [{ oldPath: '/before/config.ts', newPath: '/after/config.ts' }],
  });
  const id = `sha256:${'a'.repeat(64)}`;
  const oldText = 'const a = 1;\n';
  const newText = 'const a = 2;\n';
  const model = createDiffModel(oldText, newText);
  const targets = diffAnnotationBlocks(model, {
    old: { fileIndex: 0, snapshotId: id, side: 'old' as const },
    new: { fileIndex: 0, snapshotId: id, side: 'new' as const },
  })[0].targets;
  const payload = diffReviewSubmittedSchema.parse({
    annotations: [{ id: 'block-1', targets, comment: 'review this block' }],
    sources: [
      { fileIndex: 0, snapshotId: id, oldPath: '/before/config.ts', newPath: '/after/config.ts' },
    ],
  });
  assert.deepEqual(
    validateRanges(params, payload, {
      [`0:${id}`]: { id, oldText, newText },
    }),
    payload,
  );
});
