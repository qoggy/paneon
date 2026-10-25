import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDiffModel } from '../skills/paneon/assets/shared/diff-model.ts';
import {
  diffAnnotationTargets,
  diffTargetLocation,
  normalizeDiffTarget,
} from '../skills/paneon/assets/shared/diff-schema.ts';

void test('Git references stay page-defined and preserve their existing full-side shape', () => {
  const model = createDiffModel('old\r\nlast', 'new\r\nlast\r\n');
  assert.deepEqual(diffAnnotationTargets(model, 'snapshot-a'), {
    old: { sourceId: 'snapshot-a', kind: 'lines', side: 'old', startLine: 1, endLine: 2 },
    new: { sourceId: 'snapshot-a', kind: 'lines', side: 'new', startLine: 1, endLine: 2 },
  });
  assert.deepEqual(diffAnnotationTargets(createDiffModel('', undefined), 'empty'), {});
  assert.deepEqual(Object.keys(diffAnnotationTargets(createDiffModel(undefined, 'new'), 'added')), [
    'new',
  ]);
});

void test('normalized line references reveal the same full-source UTF-16 range on each side', () => {
  const model = createDiffModel('first\r\n重复 é🙂 重复\r\nlast', 'first\r\nchanged\r\nlast');
  const refs = diffAnnotationTargets(model, 'snapshot-a');
  for (const side of ['old', 'new'] as const) {
    const source = side === 'old' ? model.oldText : model.newText;
    assert.ok(source);
    const quote = side === 'old' ? '🙂 重复' : 'changed';
    const start = source.indexOf(quote);
    const ref = refs[side];
    assert.ok(ref);
    const target = { ref, text: { start, end: start + quote.length, quote } };
    const normalized = normalizeDiffTarget(model, target);
    assert.ok(normalized.text);
    assert.notEqual(normalized.text.start, target.text.start);
    const expected = { kind: 'text', side, start, end: start + quote.length, quote };
    assert.deepEqual(diffTargetLocation(model, target), expected);
    assert.deepEqual(diffTargetLocation(model, normalized), expected);
  }
});

void test('file and hunk targets become component-local coordinates without source IDs', () => {
  const model = createDiffModel('old\n', 'new\n');
  assert.deepEqual(diffTargetLocation(model, { ref: { sourceId: 'a', kind: 'file' } }), {
    kind: 'file',
  });
  const hunk = model.hunks[0];
  assert.deepEqual(
    diffTargetLocation(model, {
      ref: {
        sourceId: 'a',
        kind: 'hunk',
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        newStart: hunk.newStart,
        newLines: hunk.newLines,
        patch: hunk.patch,
      },
    }),
    { kind: 'hunk', index: 0 },
  );
});

void test('converting saved references rejects changed source and broken grapheme boundaries', () => {
  const model = createDiffModel('old', 'new 🙂');
  const ref = diffAnnotationTargets(model, 'a').new;
  assert.ok(ref);
  assert.throws(
    () => diffTargetLocation(model, { ref, text: { start: 0, end: 3, quote: 'old' } }),
    /does not match/,
  );
  assert.throws(
    () => diffTargetLocation(model, { ref, text: { start: 4, end: 5, quote: '\ud83d' } }),
    /splits a grapheme/,
  );
});
