import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { z } from 'zod';
import { markdownLink } from '../src/shared/file-references.ts';
import { annotationValueSchema } from '../src/sdk/annotation.ts';
import type { AnnotationValue, AnnotationTarget, JsonValue } from '../src/sdk/annotation.ts';

const compiled = await build({
  stdin: {
    contents:
      "export {AnnotationStore} from './src/ui/annotation-store.ts'; export {fileSourceOffsets} from './src/ui/file-annotation-source.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { AnnotationStore, fileSourceOffsets } = (await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64')
)) as {
  fileSourceOffsets: (source: string) => number[];
  AnnotationStore: new <TRef = string>(options: {
    onSubmit(value: AnnotationValue<TRef>): Promise<void>;
    adapter?: { resolve(): { status: 'ready' }; locate(): void };
  }) => {
    openFile(reference: { href: string }, ref: TRef): void;
    createFileSnapshot(
      file: { path: string; text: string },
      ref: TRef,
    ): Promise<{ ref: TRef; sourceRef: JsonValue; file: { path: string; text: string } }>;
    retainFile(snapshot: {
      ref: TRef;
      sourceRef: JsonValue;
      file: { path: string; text: string };
    }): void;
    retainedSource(ref: TRef): string | undefined;
    registerText(registration: {
      ref: TRef;
      sourceRef?: JsonValue;
      source: string;
      segments: { node: unknown; sourceOffsets: number[] }[];
    }): () => void;
    closeFile(): void;
    openAnnotation(id?: string): void;
    changeEditor(comment: string): void;
    cancelEditor(): void;
    getFileView(): {
      id: number;
      reference: { href: string };
      open: boolean;
      snapshot?: { file: { text: string } };
    } | null;
    fileMounted(id: number): void;
    getSnapshot(): {
      value: AnnotationValue<TRef>;
      editor: { comment: string } | null;
      removeAnnotation(id: string): void;
      createAnnotation(targets: AnnotationTarget<TRef>[], comment?: string): string;
      locate(target: AnnotationTarget<TRef>): Promise<void>;
      submit(): Promise<void>;
    };
  };
};
const ref = 'page';
const sourceRef = { path: '/source.ts', snapshotId: 'sha256:original' };
const file = { path: '/source.ts', text: 'const old = 1;\r\nconst next = 2;' };
const target = { ref, sourceRef, text: { start: 0, end: 5, quote: 'const' } };

void test('annotation schemas accept exactly the page-defined references', () => {
  const schema = annotationValueSchema(z.literal('page'));
  const page = { annotations: [{ id: 'one', comment: '', targets: [{ ref: 'page' }] }] };
  assert.deepEqual(schema.parse(page), page);
  for (const ref of [
    { kind: 'paneon-file', path: '/source.ts', snapshotId: 'original' },
    'source:/source.ts@original',
    { commit: 'abc123' },
  ])
    assert.equal(
      schema.safeParse({ annotations: [{ id: 'other', comment: '', targets: [{ ref }] }] }).success,
      false,
    );
  const custom = annotationValueSchema(
    z.union([z.literal('page'), z.string().startsWith('source:')]),
  );
  assert.equal(
    custom.safeParse({ annotations: [{ id: 'file', comment: '', targets: [target] }] }).success,
    true,
  );
});

void test('file snapshots automatically inherit arbitrary page references without a mapper', async () => {
  const digest =
    'sha256:' + (await import('node:crypto')).createHash('sha256').update(file.text).digest('hex');
  for (const ref of [
    'page',
    { repository: 'demo', resource: ['nested'] },
    { kind: 'paneon-file', custom: 'business' },
  ]) {
    const received: AnnotationValue<unknown>[] = [];
    const store = new AnnotationStore<unknown>({
      onSubmit: (value) => {
        received.push(value);
        return Promise.resolve();
      },
    });
    const snapshot = await store.createFileSnapshot(file, ref);
    assert.deepEqual(snapshot.ref, ref);
    assert.deepEqual(snapshot.sourceRef, { path: file.path, snapshotId: digest });
    store.openFile({ href: file.path }, ref);
    store.retainFile(snapshot);
    store
      .getSnapshot()
      .createAnnotation([{ ref: snapshot.ref, sourceRef: snapshot.sourceRef, text: target.text }]);
    assert.equal(
      store.retainedSource(ref),
      undefined,
      'File draft must not become the Markdown source with the same ref',
    );
    store.closeFile();
    await store.getSnapshot().submit();
    assert.deepEqual(received[0].annotations[0].targets[0].ref, ref);
    assert.deepEqual(received[0].annotations[0].targets[0].sourceRef, snapshot.sourceRef);
  }
});

void test('one page reference keeps its document and two file versions separate', async () => {
  const delivered: AnnotationValue<string>[] = [];
  const store = new AnnotationStore({
    onSubmit: (value) => {
      delivered.push(value);
      return Promise.resolve();
    },
  });
  const doc = 'Markdown';
  store.registerText({
    ref,
    source: doc,
    segments: [
      {
        node: { nodeType: 3, data: doc, isConnected: true },
        sourceOffsets: Array.from({ length: doc.length + 1 }, (_, i) => i),
      },
    ],
  });
  const first = await store.createFileSnapshot(file, ref);
  store.openFile({ href: file.path }, ref);
  store.retainFile(first);
  store.getSnapshot().createAnnotation([{ ref, sourceRef: first.sourceRef, text: target.text }]);
  const second = await store.createFileSnapshot({ ...file, text: 'const changed = 2;' }, ref);
  store.retainFile(second);
  store.getSnapshot().createAnnotation([{ ref, sourceRef: second.sourceRef, text: target.text }]);
  store.getSnapshot().createAnnotation([{ ref, text: { start: 0, end: doc.length, quote: doc } }]);
  assert.equal(store.retainedSource(ref), doc);
  store.closeFile();
  await store.getSnapshot().submit();
  assert.equal(delivered[0].annotations.length, 3);
  for (const snapshot of [first, second]) {
    const locating = store
      .getSnapshot()
      .locate({ ref, sourceRef: snapshot.sourceRef, text: target.text });
    await new Promise((resolve) => setImmediate(resolve));
    const view = store.getFileView();
    assert.ok(view);
    assert.equal(view.snapshot?.file.text, snapshot.file.text);
    store.fileMounted(view.id);
    await locating;
  }
});

void test('source identity is optional JSON and does not reserve a file structure', () => {
  const schema = annotationValueSchema(z.literal('page'));
  const targets = [
    { ref },
    ...['a', 42, null, ['commit', 'abc'], { arbitrary: 'version' }].map((sourceRef) => ({
      ref,
      sourceRef,
    })),
  ];
  assert.deepEqual(
    schema.parse({ annotations: [{ id: 'sources', comment: '', targets }] }).annotations[0].targets,
    targets,
  );
  assert.equal(
    schema.safeParse({
      annotations: [{ id: 'wrong', comment: '', targets: [{ ref: 'not-page', sourceRef }] }],
    }).success,
    false,
  );
});

void test('a familiar kind has no special meaning without a registered file snapshot', async () => {
  const ref = { kind: 'paneon-file', custom: 'business' };
  let resolved = 0;
  const store = new AnnotationStore<typeof ref>({
    onSubmit: async () => {},
    adapter: {
      resolve() {
        resolved++;
        return { status: 'ready' };
      },
      locate() {},
    },
  });
  store.getSnapshot().createAnnotation([{ ref }]);
  await store.getSnapshot().submit();
  assert.equal(resolved, 1);
});

void test('normalized code boundaries preserve raw UTF-16 offsets and CRLF quotes', () => {
  const source = '甲😀\r\n乙\r丙\n';
  const normalized = source.replace(/\r\n?/g, '\n');
  const offsets = fileSourceOffsets(source);
  assert.equal(offsets.length, normalized.length + 1);
  assert.deepEqual(offsets, [0, 1, 2, 3, 5, 6, 7, 8, 9]);
  assert.equal(source.slice(offsets[1], offsets[5]), '😀\r\n乙');
});

void test('file drafts share explicit submission, retain original source and bypass page adapter', async () => {
  const delivered: AnnotationValue<string>[] = [];
  let pageResolutions = 0;
  const store = new AnnotationStore<string>({
    onSubmit: (value) => {
      delivered.push(value);
      return Promise.resolve();
    },
    adapter: {
      resolve: () => {
        pageResolutions++;
        return { status: 'ready' };
      },
      locate: () => {
        throw new Error('File must not reach page adapter');
      },
    },
  });
  store.openFile({ href: './source.ts' }, ref);
  store.retainFile({ ref, sourceRef, file });
  store.getSnapshot().createAnnotation([target], '改这里');
  store.closeFile();
  assert.equal(delivered.length, 0);
  const locating = store.getSnapshot().locate(target);
  await new Promise((resolve) => setImmediate(resolve));
  const view = store.getFileView();
  assert.ok(view);
  assert.equal(view.open, true);
  assert.equal(view.snapshot?.file.text, file.text);
  store.fileMounted(view.id);
  await locating;
  store.closeFile();
  await store.getSnapshot().submit();
  assert.equal(pageResolutions, 0);
  assert.equal(delivered.length, 1);
  assert.deepEqual(delivered[0].annotations[0].targets[0], target);
  assert.equal(JSON.stringify(delivered[0]).includes(file.text), false);
});

void test('existing quote checks apply to the retained file source without rereading', async () => {
  const store = new AnnotationStore({
    onSubmit: () => Promise.reject(new Error('Invalid quote must not submit')),
  });
  store.openFile({ href: file.path }, ref);
  store.retainFile({ ref, sourceRef, file });
  store
    .getSnapshot()
    .createAnnotation([{ ref, sourceRef, text: { start: 0, end: 5, quote: 'wrong' } }]);
  store.closeFile();
  await assert.rejects(store.getSnapshot().submit(), /range no longer matches/);
  assert.equal(store.getSnapshot().value.annotations.length, 1);
});

void test('locating a page target closes the file preview and delegates to its page adapter', async () => {
  let located = false;
  const store = new AnnotationStore<string>({
    onSubmit: () => Promise.resolve(),
    adapter: {
      resolve: () => ({ status: 'ready' }),
      locate: () => {
        located = true;
      },
    },
  });
  store.openFile({ href: file.path }, ref);
  await store.getSnapshot().locate({ ref: 'page' });
  assert.equal(store.getFileView()?.open, false);
  assert.equal(located, true);
});

void test('snapshot locate encodes literal URI characters in the real filename', async () => {
  const path = '/tmp/100% note#L4?local';
  const snapshot = { ref, sourceRef: { ...sourceRef, path }, file: { ...file, path } };
  const selected = { ...target, sourceRef: snapshot.sourceRef };
  const store = new AnnotationStore({ onSubmit: () => Promise.resolve() });
  store.openFile({ href: './source.ts' }, ref);
  store.retainFile(snapshot);
  store.getSnapshot().createAnnotation([selected]);
  store.closeFile();
  const locating = store.getSnapshot().locate(selected);
  await new Promise((resolve) => setImmediate(resolve));
  const view = store.getFileView();
  assert.ok(view);
  assert.deepEqual(markdownLink(view.reference.href), { kind: 'file', path });
  store.fileMounted(view.id);
  await locating;
});
void test('file navigation preserves an open editor and deletion after cancel releases the snapshot', async () => {
  const store = new AnnotationStore({ onSubmit: () => Promise.resolve() });
  store.openFile({ href: file.path }, ref);
  store.retainFile({ ref, sourceRef, file });
  const id = store.getSnapshot().createAnnotation([target], 'before');
  store.openAnnotation(id);
  store.changeEditor('preserved input');
  const view = store.getFileView();
  store.closeFile();
  assert.deepEqual(store.getFileView(), view);
  assert.equal(store.getSnapshot().editor?.comment, 'preserved input');
  assert.equal(store.getSnapshot().value.annotations[0].comment, 'before');
  store.openFile({ href: '/other.ts' }, ref);
  assert.deepEqual(store.getFileView(), view);
  assert.equal(store.getSnapshot().editor?.comment, 'preserved input');
  store.cancelEditor();
  store.closeFile();
  assert.equal(store.getFileView()?.open, false);
  store.getSnapshot().removeAnnotation(id);
  await assert.rejects(store.getSnapshot().locate(target), /not registered/);
});
void test('a later page locate releases an unfinished file locate', async () => {
  let pageLocated = 0;
  const store = new AnnotationStore<string>({
    onSubmit: () => Promise.resolve(),
    adapter: {
      resolve: () => ({ status: 'ready' }),
      locate: () => {
        pageLocated++;
      },
    },
  });
  store.openFile({ href: file.path }, ref);
  store.retainFile({ ref, sourceRef, file });
  store.getSnapshot().createAnnotation([target]);
  store.closeFile();
  const first = store.getSnapshot().locate(target);
  await new Promise((resolve) => setImmediate(resolve));
  const second = store.getSnapshot().locate({ ref: 'page' });
  await Promise.all([first, second]);
  assert.equal(pageLocated, 1);
  assert.equal(store.getFileView()?.open, false);
});
