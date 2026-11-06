import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { z } from 'zod';
import { annotationValueSchema, isElementAnnotationRef } from '../src/sdk/annotation.ts';
import { publicFileFeedback } from '#test-skill/assets/panels/file-review/feedback.ts';
import { validateSources as validateFile } from '#test-skill/assets/panels/file-review/schema.ts';
import { publicDiffFeedback } from '#test-skill/assets/panels/diff-review/feedback.ts';
import { validateSources as validateDiff } from '#test-skill/assets/panels/diff-review/schema.ts';
import {
  buildGitFeedback,
  publicGitFeedback,
} from '#test-skill/assets/panels/git-review/feedback.ts';
import { publicPRFeedback } from '#test-skill/assets/examples/github-pr/feedback.ts';

const textBundle = await build({
  entryPoints: ['src/ui/element-annotation.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { ELEMENT_ANNOTATION_EXCERPT_LENGTH, elementExcerpt } = (await import(
  `data:text/javascript;base64,${Buffer.from(textBundle.outputFiles[0].text).toString('base64')}`
)) as {
  ELEMENT_ANNOTATION_EXCERPT_LENGTH: number;
  elementExcerpt: (text: string) => string;
};

const ref = { element: { path: 'div:nth-of-type(1)', tag: 'div', excerpt: 'Plan' } };
const draft = {
  annotations: [{ id: 'element', targets: [{ ref }], comment: 'Clarify this card' }],
};
const published = draft.annotations.map(({ targets, comment }) => ({ targets, comment }));

void test('element excerpts follow the configured grapheme limit and add an ellipsis only when needed', () => {
  const limit = ELEMENT_ANNOTATION_EXCERPT_LENGTH;
  assert.equal(elementExcerpt('  a\n b  '), 'a b');
  assert.equal(elementExcerpt(''), '');
  assert.equal(elementExcerpt('字'.repeat(limit)), '字'.repeat(limit));
  for (const glyph of ['字', '😀', '👨‍👩‍👧‍👦', 'e\u0301']) {
    assert.equal(elementExcerpt(glyph.repeat(limit + 1)), glyph.repeat(limit) + '…');
  }
});

void test('common schemas accept generated refs and preserve existing author references', () => {
  assert.deepEqual(annotationValueSchema(z.literal('source')).parse(draft), draft);
  assert.ok(isElementAnnotationRef(ref));
  const businessRef = { ...ref, business: 'author-owned' };
  const business = { annotations: [{ ...draft.annotations[0], targets: [{ ref: businessRef }] }] };
  assert.deepEqual(annotationValueSchema(z.unknown()).parse(business), business);
  assert.equal(isElementAnnotationRef(businessRef), false);
});

void test('file, diff, Git and PR submissions keep element opinions without demanding source evidence', () => {
  validateFile(draft, { files: [] });
  assert.deepEqual(publicFileFeedback(draft, { files: [] }), { files: [], annotations: published });
  const params = { files: [{ oldPath: '/tmp/a', newPath: '/tmp/b' }] };
  const diff = { ...draft, sources: [] };
  validateDiff(params, diff);
  assert.deepEqual(publicDiffFeedback(params, diff), { files: [], annotations: published });
  const git = buildGitFeedback(draft, new Map());
  assert.deepEqual(publicGitFeedback(git), { files: [], annotations: published });
  assert.deepEqual(publicPRFeedback({ ...draft, repository: 'owner/repo', sources: {} }), {
    repository: 'owner/repo',
    sources: [],
    annotations: published,
  });
});

void test('framework element submission bypasses author-only adapters and retains its draft', async () => {
  const bundle = await build({
    entryPoints: ['src/ui/annotation-store.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  const { AnnotationStore } = (await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
  )) as {
    AnnotationStore: new (options: {
      adapter: { resolve(): never; locate(): void };
      onSubmit(value: unknown): Promise<void>;
    }) => {
      registerObject(registration: {
        target: { ref: typeof ref };
        source: string;
        summary: string;
        element: object;
      }): () => void;
      createAnnotation(targets: { ref: typeof ref }[], comment: string): string;
      submit(): Promise<void>;
      getSnapshot(): { value: typeof draft };
    };
  };
  let submitted: unknown;
  const store = new AnnotationStore({
    adapter: {
      resolve: () => {
        throw new Error('Business adapter must not receive element refs');
      },
      locate: () => {},
    },
    onSubmit: (value: unknown) => {
      submitted = value;
      return Promise.resolve();
    },
  });
  store.registerObject({
    target: { ref },
    source: '',
    summary: 'Plan',
    element: { isConnected: true, checkVisibility: () => true, getBoundingClientRect: () => ({}) },
  });
  store.createAnnotation([{ ref }], 'Clarify this card');
  await store.submit();
  assert.deepEqual(submitted, store.getSnapshot().value);
  assert.deepEqual(submitted.annotations[0].targets, [{ ref }]);
});
