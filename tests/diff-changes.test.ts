import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDiffModel, diffChanges } from '../skills/paneon/assets/shared/diff-model.ts';

void test('navigation retains separate edits inside a single contextual hunk', () => {
  const old = Array.from({ length: 60 }, (_, i) => `source ${i + 1}\r\n`).join('');
  const lines = old.split(/(?<=\n)/);
  lines.splice(28, 0, ...Array.from({ length: 82 }, (_, i) => `insert ${i + 1}\r\n`));
  const next = lines.join('').replace('source 33\r\nsource 34', 'updated 33\r\nupdated 34');
  const model = createDiffModel(old, next);
  assert.equal(
    model.hunks.length,
    1,
    'context windows deliberately merge across the unchanged gap',
  );
  const changes = diffChanges(model.rows);
  assert.equal(changes.length, 2);
  assert.equal(changes[0].old, undefined);
  assert.equal(changes[0].new?.number, 29);
  assert.equal(changes[1].old?.number, 33);
  assert.equal(changes[1].new?.number, 115);
  assert.equal(model.rows.flatMap((row) => row.old?.text ?? []).join(''), old);
  assert.equal(model.rows.flatMap((row) => row.new?.text ?? []).join(''), next);
});

void test('replacement is one navigation stop; unchanged rows separate insertions and deletions', () => {
  const replacement = diffChanges(createDiffModel('a\nb\nc\n', 'a\nx\ny\nc\n').rows);
  assert.equal(replacement.length, 1);
  assert.equal(replacement[0].old?.text, 'b\n');
  assert.equal(replacement[0].new?.text, 'x\n');
  assert.equal(diffChanges(createDiffModel('same\n', 'same\n').rows).length, 0);
  assert.deepEqual(
    diffChanges(createDiffModel('', 'a\nb\n').rows).map((c) => c.new?.number),
    [1],
  );
  assert.deepEqual(
    diffChanges(createDiffModel('a\nb\n', '').rows).map((c) => c.old?.number),
    [1],
  );
});
