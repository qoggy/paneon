import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { feedbackSchema, feedbackKey } from '../src/sdk/feedback.ts';

const schema = feedbackSchema(z.object({ kind: z.literal('card'), id: z.string() }));
const target = { ref: { kind: 'card' as const, id: 'a' } };
const selected = { annotations: [{ id: 'stable', targets: [target], comment: '' }] };

void test('feedback schema preserves empty opinions, independent entries and page composition', () => {
  assert.deepEqual(schema.parse(selected), selected);
  assert.equal(
    schema.safeParse({
      annotations: [{ id: 'optional', targets: [{ ...target, text: undefined }], comment: '' }],
    }).success,
    true,
  );
  assert.deepEqual(schema.parse({ ...selected, comment: '整体意见' }).comment, '整体意见');
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
      annotations: [
        { ...selected.annotations[0], targets: [target, { ref: { id: 'a', kind: 'card' } }] },
      ],
    },
    {
      annotations: [{ ...selected.annotations[0], targets: [{ ref: { kind: 'other', id: 'a' } }] }],
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
  const anySchema = feedbackSchema(z.unknown());
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
    assert.throws(() => feedbackKey(ref));
  }
  assert.equal(
    schema.safeParse({
      annotations: [
        { id: 'one', targets: [{ ref: { ...target.ref, extra: undefined } }], comment: '' },
      ],
    }).success,
    false,
  );
  const invalidTransform = feedbackSchema(z.string().transform(() => new Date()));
  assert.equal(
    invalidTransform.safeParse({
      annotations: [{ id: 'one', targets: [{ ref: 'a' }], comment: '' }],
    }).success,
    false,
  );
  const shared = { value: 1 };
  assert.doesNotThrow(() => feedbackKey([shared, shared]));
  assert.equal(feedbackKey({ b: 2, a: [1, 2] }), feedbackKey({ a: [1, 2], b: 2 }));
  assert.notEqual(feedbackKey([1, 2]), feedbackKey([2, 1]));
});

void test('default and browser SDK expose the same feedback helper without browser Node dependencies', async () => {
  const server = (await import('../dist/sdk/' + 'index.js')) as {
    feedbackSchema: typeof feedbackSchema;
  };
  const browser = (await import('../dist/sdk/' + 'client.js')) as {
    feedbackSchema: typeof feedbackSchema;
  };
  assert.equal(typeof server.feedbackSchema, 'function');
  assert.equal(typeof browser.feedbackSchema, 'function');
  assert.deepEqual(
    server.feedbackSchema(z.unknown()).parse(selected),
    browser.feedbackSchema(z.unknown()).parse(selected),
  );
});

void test('contextual editor buffers isolate Save, Cancel and multi-object targets', async () => {
  const { build } = await import('esbuild');
  const bundled = await build({
    entryPoints: ['src/ui/feedback-store.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  type CardTarget = typeof target;
  const module = (await import(
    `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
  )) as {
    FeedbackStore: new (options: {
      onSubmit(value: unknown): Promise<void>;
      adapter: { resolve(): { status: 'ready' }; locate(): void };
    }) => {
      mountSurface(): () => void;
      toggleTarget(target: CardTarget): void;
      chooseObject(target: CardTarget): void;
      changeEditor(comment: string): void;
      submit(): Promise<void>;
      cancelEditor(): void;
      saveEditor(): void;
      openAnnotation(id?: string): void;
      deleteEditor(): void;
      openOverall(): void;
      numberFor(id: string): number;
      getSnapshot(): {
        value: {
          annotations: { id: string; targets: CardTarget[]; comment: string }[];
          comment?: string;
        };
        selectionTargets: readonly CardTarget[];
        uiError: string | null;
      };
    };
  };
  const delivered: unknown[] = [];
  const store = new module.FeedbackStore({
    onSubmit: (value) => {
      delivered.push(value);
      return Promise.resolve();
    },
    adapter: { resolve: () => ({ status: 'ready' }), locate: () => {} },
  });
  const unmount = store.mountSurface();
  store.toggleTarget(target);
  store.toggleTarget({ ref: { kind: 'card', id: 'b' } });
  await store.submit();
  assert.equal(
    delivered.length,
    0,
    'Pending object selections must not silently disappear on submit.',
  );
  store.openAnnotation();
  store.changeEditor('临时输入');
  assert.equal(store.getSnapshot().value.annotations.length, 0);
  assert.equal(store.getSnapshot().selectionTargets.length, 2);
  await store.submit();
  assert.match(store.getSnapshot().uiError ?? '', /请先保存或取消/);
  assert.equal(delivered.length, 0);
  store.cancelEditor();
  assert.equal(store.getSnapshot().value.annotations.length, 0);
  store.chooseObject(target);
  store.chooseObject({ ref: { kind: 'card', id: 'b' } });
  store.openAnnotation();
  store.saveEditor();
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
  store.chooseObject({ ref: { kind: 'card', id: 'c' } });
  store.openAnnotation();
  store.saveEditor();
  const secondId = store.getSnapshot().value.annotations[1].id;
  store.openAnnotation(saved.id);
  store.deleteEditor();
  assert.equal(store.numberFor(secondId), 2, 'Deletion must not renumber another annotation.');
  assert.equal(store.getSnapshot().value.annotations.length, 1);
  store.openOverall();
  store.changeEditor('整体草稿');
  store.cancelEditor();
  assert.equal(store.getSnapshot().value.comment, undefined);
  store.openOverall();
  store.changeEditor('整体保存');
  store.saveEditor();
  assert.equal(store.getSnapshot().value.comment, '整体保存');
  await store.submit();
  assert.equal(delivered.length, 1);
  assert.equal(Object.isFrozen(delivered[0]), true);
  unmount();
});
