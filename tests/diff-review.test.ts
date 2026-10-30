import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  diffReviewParamsSchema,
  diffFeedbackResultSchema,
  diffReviewSubmittedSchema,
  validateRanges,
  validateSources,
} from '../skills/paneon/assets/panels/diff-review/schema.ts';
import { reviewTree, visibleFileCount } from '../skills/paneon/assets/panels/diff-review/model.ts';
import type { DiffFeedbackResult } from '../skills/paneon/assets/panels/diff-review/schema.ts';
import { publicDiffFeedback } from '../skills/paneon/assets/panels/diff-review/feedback.ts';

void test('path-only manifest rejects ambiguous absence and unsolicited identity fields', () => {
  assert.equal(
    diffReviewParamsSchema.safeParse({ files: [{ oldPath: null, newPath: '/proposal' }] }).success,
    true,
  );
  assert.equal(
    diffReviewParamsSchema.safeParse({ files: [{ oldPath: null, newPath: null }] }).success,
    false,
  );
  assert.equal(diffReviewParamsSchema.safeParse({ files: [], version: 1 }).success, false);
  assert.equal(
    diffReviewParamsSchema.safeParse({
      files: [{ oldPath: '/old', newPath: '/new', id: 'required-by-mistake' }],
    }).success,
    false,
  );
});

void test('compressed paths keep original leaf identity and filtered counts', () => {
  const files = [
    { displayPath: 'lib/prompts/b.ts', oldPath: '/old/b', newPath: '/new/b' },
    { displayPath: 'root.ts', oldPath: null, newPath: '/new/root' },
    { displayPath: 'lib/prompts/a.ts', oldPath: '/old/a', newPath: '/new/a' },
  ];
  const roots = reviewTree(files);
  assert.equal(roots[0].name, 'lib/prompts');
  assert.equal(roots[0].key, 'directory:lib/prompts');
  assert.deepEqual(
    roots[0].nodes?.map((node) => node.key),
    ['file:2', 'file:0'],
  );
  assert.equal(roots[0].nodes?.[1].comparison, files[0]);
  assert.equal(visibleFileCount(roots[0], ''), 2);
  assert.equal(visibleFileCount(roots[0], '/NEW/B'), 1);
});

void test('annotation validation uses preserved text and rejects wrong source, side and split graphemes', () => {
  const id = `sha256:${'a'.repeat(64)}`;
  const file = { oldPath: null, newPath: '/proposed' };
  const snapshot = { id, oldText: '', newText: 'first é🙂 last' };
  const snapshots = { [`0:${id}`]: snapshot };
  const feedback: DiffFeedbackResult = {
    annotations: [
      {
        id: 'annotation-1',
        comment: 'review',
        targets: [
          {
            ref: { fileIndex: 0, snapshotId: id, side: 'new' },
            text: { start: 6, end: 10, quote: 'é🙂' },
          },
        ],
      },
    ],
    sources: [{ ...file, fileIndex: 0, snapshotId: id }],
  };
  assert.equal(validateRanges({ files: [file] }, feedback, snapshots), feedback);
  const change = () => structuredClone(feedback);
  const stale = change();
  stale.annotations[0].targets[0].text = { start: 6, end: 10, quote: 'wrong' };
  assert.throws(() => validateRanges({ files: [file] }, stale, snapshots), /Text range/);
  const split = change();
  split.annotations[0].targets[0].text = { start: 6, end: 7, quote: 'e' };
  assert.throws(() => validateRanges({ files: [file] }, split, snapshots), /Text range/);
  const absent = change();
  assert.ok('side' in absent.annotations[0].targets[0].ref);
  absent.annotations[0].targets[0].ref.side = 'old';
  assert.throws(() => validateRanges({ files: [file] }, absent, snapshots), /Missing original/);
  assert.throws(() => validateRanges({ files: [file] }, feedback, {}), /inconsistent/);
});

void test('comparison feedback preserves page-defined file targets without adding comparison sources', () => {
  const snapshotId = `sha256:${'a'.repeat(64)}`;
  const source = { fileIndex: 0, snapshotId, oldPath: null, newPath: '/proposed' };
  const common = {
    ref: { fileIndex: 0, snapshotId, side: 'new' as const },
    sourceRef: { path: '/local.txt', snapshotId: 'local' },
    text: { start: 0, end: 5, quote: 'local' },
  };
  const feedback = diffFeedbackResultSchema.parse({
    annotations: [
      {
        id: 'mixed',
        comment: '',
        targets: [
          {
            ref: { fileIndex: 0, snapshotId, side: 'new' },
            text: { start: 0, end: 4, quote: 'diff' },
          },
          common,
        ],
      },
    ],
    sources: [source],
  });
  const sources = structuredClone(feedback.sources);
  validateRanges({ files: [{ oldPath: null, newPath: '/proposed' }] }, feedback, {
    [`0:${snapshotId}`]: { id: snapshotId, oldText: '', newText: 'diff' },
  });
  assert.deepEqual(feedback.annotations[0].targets[1], common);
  assert.deepEqual(feedback.sources, sources);
  assert.deepEqual(
    publicDiffFeedback({ files: [{ oldPath: null, newPath: '/proposed' }] }, feedback).files[0]
      .annotations[0].targets[1].sourceRef,
    common.sourceRef,
  );
});

void test('published feedback groups annotations by original file snapshot without internal IDs', () => {
  const params = {
    files: [
      { displayPath: 'request.ts', oldPath: '/old/request.ts', newPath: '/new/request.ts' },
      { oldPath: null, newPath: '/new/worker.ts' },
    ],
  };
  const a = `sha256:${'a'.repeat(64)}`;
  const b = `sha256:${'b'.repeat(64)}`;
  const text = { start: 6, end: 10, quote: 'é🙂' };
  const target = (fileIndex: number, snapshotId: string, side: 'old' | 'new' = 'new') => ({
    ref: { fileIndex, snapshotId, side },
    text,
  });
  const feedback: DiffFeedbackResult = {
    annotations: [
      { id: 'first', targets: [target(0, a, 'old'), target(0, a)], comment: '两侧一起调整' },
      { id: 'second', targets: [target(0, a)], comment: '同一快照的另一条意见' },
      { id: 'added', targets: [target(1, a)], comment: '新增文件' },
      { id: 'new-version', targets: [target(0, b)], comment: '同一文件的另一个版本' },
    ],
    sources: [
      { ...params.files[0], fileIndex: 0, snapshotId: a },
      { ...params.files[1], fileIndex: 1, snapshotId: a },
      { ...params.files[0], fileIndex: 0, snapshotId: b },
    ],
    replacesEventId: 42,
  };
  const original = structuredClone(feedback);
  const result = publicDiffFeedback(params, feedback);
  assert.deepEqual(result, {
    files: [
      {
        ...params.files[0],
        snapshotId: a,
        annotations: [
          {
            targets: [
              { side: 'old', text },
              { side: 'new', text },
            ],
            comment: '两侧一起调整',
          },
          { targets: [{ side: 'new', text }], comment: '同一快照的另一条意见' },
        ],
      },
      {
        ...params.files[1],
        snapshotId: a,
        annotations: [{ targets: [{ side: 'new', text }], comment: '新增文件' }],
      },
      {
        ...params.files[0],
        snapshotId: b,
        annotations: [{ targets: [{ side: 'new', text }], comment: '同一文件的另一个版本' }],
      },
    ],
    replacesEventId: 42,
  });
  assert.deepEqual(diffReviewSubmittedSchema.parse(result), result);
  assert.deepEqual(feedback, original, 'Publishing must not mutate editable draft identities.');
});

void test('published empty correction withdraws all annotations', () => {
  assert.deepEqual(
    publicDiffFeedback(
      { files: [{ oldPath: '/old', newPath: '/new' }] },
      {
        annotations: [],
        sources: [],
        replacesEventId: 42,
      },
    ),
    { files: [], replacesEventId: 42 },
  );
});

void test('source validation accepts feedback without full files and rejects inconsistent paths or targets', () => {
  const snapshotId = `sha256:${'a'.repeat(64)}`;
  const file = { oldPath: null, newPath: '/proposed' };
  const feedback: DiffFeedbackResult = {
    annotations: [
      {
        id: 'annotation',
        comment: 'Check this',
        targets: [
          {
            ref: { fileIndex: 0, snapshotId, side: 'new' },
            text: { start: 0, end: 3, quote: 'new' },
          },
        ],
      },
    ],
    sources: [{ ...file, fileIndex: 0, snapshotId }],
  };
  assert.equal(validateSources({ files: [file] }, feedback), feedback);
  const wrongPath = structuredClone(feedback);
  wrongPath.sources[0].newPath = '/another-file';
  assert.throws(() => validateSources({ files: [file] }, wrongPath), /inconsistent/);
  const unknown = structuredClone(feedback);
  unknown.annotations[0].targets[0].ref.snapshotId = `sha256:${'b'.repeat(64)}`;
  assert.throws(() => validateSources({ files: [file] }, unknown), /Missing original/);
  const absent = structuredClone(feedback);
  absent.annotations[0].targets[0].ref.side = 'old';
  assert.throws(() => validateSources({ files: [file] }, absent), /Missing original/);
  const withoutText = structuredClone(feedback);
  delete withoutText.annotations[0].targets[0].text;
  assert.throws(() => validateSources({ files: [file] }, withoutText), /Text range/);
  assert.throws(
    () => validateSources({ files: [file] }, { annotations: [], sources: [] }),
    /at least one/,
  );
  assert.deepEqual(
    validateSources({ files: [file] }, { annotations: [], sources: [], replacesEventId: 1 }),
    {
      annotations: [],
      sources: [],
      replacesEventId: 1,
    },
  );
});
