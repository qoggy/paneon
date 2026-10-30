import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { annotationValueSchema, annotationKey } from '../src/sdk/annotation.ts';

const schema = annotationValueSchema(z.string());
const target = { ref: 'card:a' };
const selected = { annotations: [{ id: 'stable', targets: [target], comment: '' }] };

void test('feedback schema preserves empty opinions, independent entries and page composition', () => {
  assert.deepEqual(schema.parse(selected), selected);
  assert.equal(
    schema.safeParse({
      annotations: [{ id: 'optional', targets: [{ ...target, text: undefined }], comment: '' }],
    }).success,
    true,
  );
  assert.equal(
    schema.safeParse({ ...selected, comment: 'removed page-level field' }).success,
    false,
  );
  assert.equal(schema.safeParse({ annotations: [] }).success, true);
  assert.equal(
    schema.safeParse({
      annotations: [selected.annotations[0], { ...selected.annotations[0], id: 'other' }],
    }).success,
    true,
  );
  const pageSchema = schema.safeExtend({ replacesEventId: z.number().int().positive().optional() });
  assert.equal(pageSchema.parse({ ...selected, replacesEventId: 1 }).replacesEventId, 1);
  assert.doesNotThrow(() => z.toJSONSchema(schema));
});

void test('feedback schema rejects invalid structures, duplicates and UTF-16 range shapes', () => {
  const invalid: unknown[] = [
    { annotations: selected.annotations, selected: [target] },
    { annotations: [selected.annotations[0], selected.annotations[0]] },
    { annotations: [{ ...selected.annotations[0], targets: [] }] },
    { annotations: [{ ...selected.annotations[0], comment: undefined }] },
    { annotations: [{ ...selected.annotations[0], id: '' }] },
    {
      annotations: [{ ...selected.annotations[0], targets: [target, { ref: 'card:a' }] }],
    },
    {
      annotations: [{ ...selected.annotations[0], targets: [{ ref: 42 }] }],
    },
  ];
  for (const text of [
    { start: -1, end: 1, quote: 'a' },
    { start: 1, end: 1, quote: '' },
    { start: 0.5, end: 1.5, quote: 'a' },
    { start: 0, end: 2, quote: 'a' },
    { start: 0, end: Infinity, quote: 'a' },
  ])
    invalid.push({ annotations: [{ ...selected.annotations[0], targets: [{ ...target, text }] }] });
  invalid.forEach((value) => assert.equal(schema.safeParse(value).success, false));
  assert.equal(
    schema.safeParse({
      annotations: [
        {
          ...selected.annotations[0],
          targets: [{ ...target, text: { start: 2, end: 4, quote: '😀' } }],
        },
      ],
    }).success,
    true,
  );
});

void test('JSON references reject lossy values before business-schema stripping or transforms', () => {
  const anySchema = annotationValueSchema(z.unknown());
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const sparse = Array(2) as unknown[];
  const symbol = { [Symbol('hidden')]: 1 };
  const accessor = Object.defineProperty({}, 'value', {
    enumerable: true,
    get() {
      throw new Error('Getter must not run');
    },
  });
  const invalid: unknown[] = [
    undefined,
    () => {},
    NaN,
    Infinity,
    1n,
    new Date(),
    cyclic,
    sparse,
    symbol,
    accessor,
    { value: undefined },
  ];
  for (const ref of invalid) {
    assert.equal(
      anySchema.safeParse({ annotations: [{ id: 'one', targets: [{ ref }], comment: '' }] })
        .success,
      false,
    );
    assert.throws(() => annotationKey(ref));
  }
  assert.equal(
    annotationValueSchema(z.object({ source: z.string() })).safeParse({
      annotations: [
        { id: 'one', targets: [{ ref: { source: 'card:a', extra: undefined } }], comment: '' },
      ],
    }).success,
    false,
  );
  const invalidTransform = annotationValueSchema(z.string().transform(() => new Date()));
  assert.equal(
    invalidTransform.safeParse({
      annotations: [{ id: 'one', targets: [{ ref: 'a' }], comment: '' }],
    }).success,
    false,
  );
  const shared = { value: 1 };
  assert.doesNotThrow(() => annotationKey([shared, shared]));
  assert.equal(annotationKey({ b: 2, a: [1, 2] }), annotationKey({ a: [1, 2], b: 2 }));
  assert.notEqual(annotationKey([1, 2]), annotationKey([2, 1]));
});

void test('default and browser SDK expose the same feedback helper without browser Node dependencies', async () => {
  const server = (await import('../dist/sdk/' + 'index.js')) as {
    annotationValueSchema: typeof annotationValueSchema;
  };
  const browser = (await import('../dist/sdk/' + 'client.js')) as {
    annotationValueSchema: typeof annotationValueSchema;
  };
  assert.equal(typeof server.annotationValueSchema, 'function');
  assert.equal(typeof browser.annotationValueSchema, 'function');
  assert.deepEqual(
    server.annotationValueSchema(z.unknown()).parse(selected),
    browser.annotationValueSchema(z.unknown()).parse(selected),
  );
});

void test('contextual editor buffers isolate Save, Cancel and saved multi-target annotations', async () => {
  const { build } = await import('esbuild');
  const bundled = await build({
    entryPoints: ['src/ui/annotation-store.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  type CardTarget = typeof target;
  const module = (await import(
    `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
  )) as {
    AnnotationStore: new (options: {
      onSubmit(value: unknown): Promise<void>;
      adapter: { resolve(): { status: 'ready' }; locate(): void | Promise<void> };
    }) => {
      mountSurface(): () => void;
      createAnnotation(targets: CardTarget[], comment?: string): string;
      changeEditor(comment: string): void;
      submit(): Promise<void>;
      locate(target: CardTarget): Promise<void>;
      locateAndEdit(id: string, target: CardTarget): Promise<void>;
      cancelEditor(): void;
      saveEditor(): void;
      openAnnotation(id?: string): void;
      deleteEditor(): void;
      removeAnnotation(id: string): void;
      numberFor(id: string): number;
      getSnapshot(): {
        value: {
          annotations: { id: string; targets: CardTarget[]; comment: string }[];
        };
        selectionTargets: readonly CardTarget[];
        editorAttention: number;
        editor: { id?: string; comment: string } | null;
        uiError: string | null;
      };
    };
  };
  const delivered: unknown[] = [];
  let resolutions = 0;
  let locations = 0;
  const store = new module.AnnotationStore({
    onSubmit: (value) => {
      delivered.push(value);
      return Promise.resolve();
    },
    adapter: {
      resolve: () => {
        resolutions++;
        return { status: 'ready' };
      },
      locate: () => {
        locations++;
      },
    },
  });
  const unmount = store.mountSurface();
  const id = store.createAnnotation([target, { ref: 'card:b' }]);
  store.openAnnotation(id);
  store.changeEditor('临时输入');
  assert.equal(store.getSnapshot().value.annotations[0].comment, '');
  assert.equal(store.getSnapshot().selectionTargets.length, 2);
  await store.submit();
  assert.equal(store.getSnapshot().editorAttention, 1);
  assert.equal(store.getSnapshot().uiError, null);
  assert.equal(delivered.length, 0);
  await assert.rejects(
    store.locate({ ref: 'card:c' }),
    /Cannot navigate while an annotation editor is open/,
  );
  assert.equal(store.getSnapshot().editorAttention, 2);
  assert.equal(store.getSnapshot().uiError, null);
  store.openAnnotation(id);
  assert.equal(store.getSnapshot().editorAttention, 3);
  assert.equal(store.getSnapshot().uiError, null);
  assert.equal(resolutions, 0, 'An open editor blocks navigation before resolving another target.');
  assert.equal(locations, 0, 'An open editor must not navigate away from its source.');
  store.cancelEditor();
  assert.equal(store.getSnapshot().value.annotations[0].comment, '');
  await store.locate({ ref: 'card:c' });
  assert.equal(locations, 1, 'Cancelling the editor allows navigation again.');
  const saved = store.getSnapshot().value.annotations[0];
  assert.equal(saved.targets.length, 2);
  assert.equal(saved.comment, '');
  assert.equal(store.numberFor(saved.id), 1);
  store.openAnnotation(saved.id);
  store.changeEditor('取消这个改动');
  store.cancelEditor();
  assert.equal(store.getSnapshot().value.annotations[0].comment, '');
  store.openAnnotation(saved.id);
  store.changeEditor('保存修改');
  store.saveEditor();
  assert.equal(store.getSnapshot().value.annotations[0].id, saved.id);
  assert.equal(store.getSnapshot().value.annotations[0].comment, '保存修改');
  store.createAnnotation([{ ref: 'card:c' }]);
  const secondId = store.getSnapshot().value.annotations[1].id;
  store.openAnnotation(saved.id);
  store.changeEditor('删除操作不能丢失这段输入');
  const beforeDeletion = store.getSnapshot();
  for (const annotationId of [saved.id, secondId]) {
    const attention = store.getSnapshot().editorAttention;
    store.removeAnnotation(annotationId);
    assert.deepEqual(store.getSnapshot().value, beforeDeletion.value);
    assert.deepEqual(store.getSnapshot().editor, beforeDeletion.editor);
    assert.equal(store.getSnapshot().selectionTargets.length, 2);
    assert.equal(store.getSnapshot().editorAttention, attention + 1);
    assert.equal(store.getSnapshot().uiError, null);
  }
  store.deleteEditor();
  assert.equal(
    store.numberFor(secondId),
    1,
    'Deletion keeps visible annotation numbers contiguous.',
  );
  assert.equal(store.getSnapshot().value.annotations.length, 1);
  await store.submit();
  assert.equal(delivered.length, 1);
  assert.equal(Object.isFrozen(delivered[0]), true);
  unmount();

  // Waiting for location must retain the existing latest-request-wins behavior.
  const pendingLocations: (() => void)[] = [];
  const racing = new module.AnnotationStore({
    onSubmit: () => Promise.resolve(),
    adapter: {
      resolve: () => ({ status: 'ready' }),
      locate: () => new Promise<void>((resolve) => pendingLocations.push(resolve)),
    },
  });
  const firstId = racing.createAnnotation([target], 'first');
  const latestId = racing.createAnnotation([{ ref: 'card:c' }], 'latest');
  const firstEdit = racing.locateAndEdit(firstId, target);
  await new Promise(setImmediate);
  const latestEdit = racing.locateAndEdit(latestId, { ref: 'card:c' });
  await new Promise(setImmediate);
  pendingLocations[1]();
  await latestEdit;
  assert.equal(racing.getSnapshot().editor?.id, latestId);
  pendingLocations[0]();
  await firstEdit;
  assert.equal(racing.getSnapshot().editor?.id, latestId);
  assert.equal(racing.getSnapshot().editorAttention, 0, 'An obsolete edit cannot open an editor');
});
