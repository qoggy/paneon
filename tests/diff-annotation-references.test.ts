import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDiffModel } from '#test-skill/assets/shared/diff-model.ts';
import {
  diffAnnotationTargets,
  diffTargetCoordinates,
  diffTargetLocation,
  normalizeDiffTarget,
} from '#test-skill/assets/shared/diff-schema.ts';

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

void test('delivery normalization preserves saved quotes without location checks', () => {
  const model = createDiffModel(undefined, 'first\na🙂b\n');
  const ref = diffAnnotationTargets(model, 'snapshot').new!;
  for (const text of [
    { start: 6, end: 7, quote: 'Earlier text' },
    { start: 7, end: 8, quote: '\ud83d' },
    { start: 100, end: 110, quote: 'Outside current source' },
  ]) {
    const target = { ref, text };
    const before = structuredClone(target);
    const normalized = normalizeDiffTarget(model, target);
    assert.equal(normalized.text?.quote, text.quote);
    assert.deepEqual(target, before);
    assert.throws(() => diffTargetLocation(model, target));
    assert.ok(diffTargetCoordinates(model, target));
    assert.equal(diffTargetCoordinates(createDiffModel(), target), undefined);
    assert.deepEqual(normalizeDiffTarget(createDiffModel(), target), target);
  }
  const hunk = {
    ref: {
      sourceId: 'snapshot',
      kind: 'hunk' as const,
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
      patch: 'Earlier patch',
    },
  };
  assert.deepEqual(normalizeDiffTarget(model, hunk), hunk);
  assert.throws(() => diffTargetLocation(model, hunk));
  assert.equal(diffTargetCoordinates(model, hunk), undefined);
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
