import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { z } from 'zod';
import { annotationTargetKey, annotationValueSchema } from '../src/sdk/annotation.ts';
import type { AnnotationTarget, AnnotationValue } from '../src/sdk/annotation.ts';
import { publicFileFeedback } from '../skills/paneon/assets/panels/file-review/feedback.ts';
import {
  fileReviewSubmittedSchema,
  validateRanges,
} from '../skills/paneon/assets/panels/file-review/schema.ts';

const source =
  '# 😀\r\n\r\n![界面](./screen.svg)\r\n\r\n~~~mermaid\r\nflowchart LR\r\n  A --> B\r\n~~~';
const start = source.indexOf('~~~mermaid');
const end = source.length;
const mermaid = { ref: 'document', type: 'mermaid' as const, text: { start, end } };

void test('standalone Image targets preserve refs and original src through schema and target identity', () => {
  const schema = annotationValueSchema(z.unknown());
  for (const ref of ['image', { screen: 'checkout', version: 1 }]) {
    for (const src of ['./screen.svg', '/workspace/screen.svg', 'https://example.com/screen.png']) {
      const target: AnnotationTarget<unknown> = { ref, src };
      const value = { annotations: [{ id: 'image', targets: [target], comment: 'Move button' }] };
      assert.deepEqual(schema.parse(value), value);
      assert.deepEqual(JSON.parse(annotationTargetKey(target)), target);
      assert.notEqual(annotationTargetKey(target), annotationTargetKey({ ref }));
      assert.notEqual(annotationTargetKey(target), annotationTargetKey({ ref, src: src + '?v=2' }));
    }
  }
});

void test('Mermaid targets preserve author identity and omit source while ordinary quotes remain required', () => {
  const schema = annotationValueSchema(z.unknown());
  const ref = { diagram: 'payment', revision: 1 };
  const value = {
    annotations: [
      { id: 'one', targets: [{ ref, type: 'mermaid' }, mermaid], comment: 'Add failure handling' },
    ],
  };
  assert.deepEqual(schema.parse(value), value);
  assert.equal(JSON.stringify(value).includes('flowchart'), false);
  assert.equal(JSON.stringify(value).includes('quote'), false);
  assert.notEqual(
    annotationTargetKey(mermaid),
    annotationTargetKey({
      ref: mermaid.ref,
      text: { start, end, quote: source.slice(start, end) },
    }),
  );
  assert.equal(
    schema.safeParse({
      annotations: [{ id: 'one', targets: [{ ref, text: { start: 0, end: 1 } }], comment: '' }],
    }).success,
    false,
  );
  assert.doesNotThrow(() => z.toJSONSchema(schema));
});

void test('file-review submits Mermaid type and range under its file without changing image/text targets', () => {
  const ref = { fileIndex: 0, snapshotId: 'sha256:' + 'a'.repeat(64) };
  const image = '![界面](./screen.svg)';
  const imageStart = source.indexOf(image);
  const annotations = [
    { id: 'diagram', targets: [{ ...mermaid, ref }], comment: 'Add failure handling' },
    {
      id: 'image',
      targets: [{ ref, text: { start: imageStart, end: imageStart + image.length, quote: image } }],
      comment: 'Move the button',
    },
  ];
  const evidence = { files: [{ ...ref, path: '/workspace/plan.md', text: source }] };
  const feedback = validateRanges({ annotations }, evidence, ['/workspace/plan.md']);
  const event = fileReviewSubmittedSchema.parse(publicFileFeedback(feedback, evidence));
  assert.equal(event.files.length, 1);
  assert.deepEqual(event.files[0].annotations[0].targets, [
    { type: 'mermaid', text: { start, end } },
  ]);
  assert.deepEqual(event.files[0].annotations[1].targets, [
    { text: { start: imageStart, end: imageStart + image.length, quote: image } },
  ]);
  assert.equal(JSON.stringify(event).includes('flowchart'), false);
  assert.equal(JSON.stringify(event).includes('fileIndex'), false);
});

async function loadAnnotationStore() {
  const bundled = await build({
    entryPoints: ['src/ui/annotation-store.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  const { AnnotationStore } = (await import(
    `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
  )) as {
    // The Node-only test program must not import the UI module's DOM types.
    AnnotationStore: new (options: {
      onSubmit(value: AnnotationValue<string>): Promise<void>;
      adapter?: { resolve(): { status: 'ready' }; locate(): void };
    }) => {
      registerObject(registration: {
        target: AnnotationTarget<string>;
        source: string;
        element?: object;
        error?: string;
        summary: string;
      }): () => void;
      createAnnotation(targets: AnnotationTarget<string>[], comment: string): string;
      locateAndEdit(id: string, target: AnnotationTarget<string>): Promise<void>;
      beginAnnotation(targets: AnnotationTarget<string>[]): void;
      changeEditor(comment: string): void;
      saveEditor(): void;
      getSnapshot(): {
        value: AnnotationValue<string>;
        editor: object | null;
        error: string | null;
      };
      numberFor(id: string): number;
      submit(): Promise<void>;
    };
  };
  return AnnotationStore;
}

void test('object registrations support pure-media drafts and submission without public quotes', async () => {
  const AnnotationStore = await loadAnnotationStore();
  let delivered: AnnotationValue<string> | undefined;
  const store = new AnnotationStore({
    onSubmit: (value) => {
      delivered = value;
      return Promise.resolve();
    },
  });
  const element = {
    isConnected: true,
    getBoundingClientRect: () => ({}),
  };
  const target: AnnotationTarget<string> = {
    ref: 'pure-media',
    type: 'mermaid',
    text: { start, end },
  };
  const unregister = store.registerObject({ target, source, element, summary: 'Mermaid' });
  store.beginAnnotation([target]);
  store.changeEditor('Add failure handling');
  store.saveEditor();
  const first = store.getSnapshot().value.annotations[0];
  assert.equal(store.numberFor(first.id), 1);
  store.beginAnnotation([target]);
  store.changeEditor('Corrected');
  store.saveEditor();
  assert.equal(store.getSnapshot().value.annotations.length, 1);
  assert.equal(store.getSnapshot().value.annotations[0].id, first.id);
  unregister();
  await store.submit();
  assert.deepEqual(delivered?.annotations[0].targets, [target]);
  assert.equal(delivered?.annotations[0].comment, 'Corrected');
  assert.equal(JSON.stringify(delivered).includes('quote'), false);
});

void test(
  'media load failure ends location without opening an editor or losing its draft',
  { timeout: 3000 },
  async () => {
    const AnnotationStore = await loadAnnotationStore();
    let unregister: (() => void) | undefined;
    const target: AnnotationTarget<string> = { ref: 'image', src: './screen.svg' };
    const registration = { target, source: './screen.svg', summary: 'Screen' };
    const store = new AnnotationStore({
      onSubmit: async () => {},
      adapter: {
        resolve: () => ({ status: 'ready' }),
        locate: () => {
          unregister = store.registerObject(registration);
        },
      },
    });
    const id = store.createAnnotation([target], 'Keep this opinion');
    const locating = store.locateAndEdit(id, target);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(store.getSnapshot().editor, null, 'Loading media must not open its editor');
    unregister?.();
    const removeFailure = store.registerObject({ ...registration, error: 'Unable to load image.' });
    await assert.rejects(locating, /Unable to load image\./);
    assert.equal(store.getSnapshot().error, 'Unable to load image.');
    assert.equal(store.getSnapshot().editor, null);
    assert.equal(store.getSnapshot().value.annotations[0].comment, 'Keep this opinion');
    removeFailure();
  },
);

void test(
  'unmounting loading media cancels its pending edit without an error or draft loss',
  { timeout: 3000 },
  async () => {
    const AnnotationStore = await loadAnnotationStore();
    const target: AnnotationTarget<string> = { ref: 'image', src: './screen.svg' };
    const store = new AnnotationStore({
      onSubmit: async () => {},
      adapter: {
        resolve: () => ({ status: 'ready' }),
        locate() {},
      },
    });
    const unregister = store.registerObject({ target, source: './screen.svg', summary: 'Screen' });
    const id = store.createAnnotation([target], 'Keep this opinion');
    const before = store.getSnapshot().value;
    const locating = store.locateAndEdit(id, target);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(store.getSnapshot().editor, null, 'The image is still loading');
    unregister();
    await locating;
    assert.equal(store.getSnapshot().editor, null, 'Navigation must cancel the pending edit');
    assert.equal(store.getSnapshot().error, null);
    assert.deepEqual(store.getSnapshot().value, before);
  },
);
