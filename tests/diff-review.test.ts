import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  diffReviewParamsSchema,
  diffReviewSubmittedSchema,
  validateRanges,
} from '../skills/paneon/assets/panels/diff-review/schema.ts';
import { reviewTree, visibleFileCount } from '../skills/paneon/assets/panels/diff-review/model.ts';
import type { DiffReviewSubmitted } from '../skills/paneon/assets/panels/diff-review/schema.ts';

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
  const feedback: DiffReviewSubmitted = {
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
  const feedback = diffReviewSubmittedSchema.parse({
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
});
