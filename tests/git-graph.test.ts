import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutGitGraph } from '../skills/paneon/assets/panels/git-review/graph.ts';

void test('commit graph follows merge parents and joins their shared ancestor', () => {
  const commits = [
    { oid: 'merge', parents: ['left', 'right'] },
    { oid: 'left', parents: ['root'] },
    { oid: 'right', parents: ['root'] },
    { oid: 'root', parents: [] },
  ];
  const graph = layoutGitGraph(commits);
  const [merge, left, right, root] = graph.rows;
  assert.equal(graph.lanes, 2);
  assert.equal(merge.lane, left.lane);
  assert.notEqual(left.lane, right.lane);
  assert.deepEqual(
    merge.strokes.filter((s) => s.kind === 'outgoing').map((s) => s.to),
    [left.lane, right.lane],
  );
  assert.ok(left.strokes.some((s) => s.kind === 'through' && s.from === right.lane));
  assert.ok(right.strokes.some((s) => s.kind === 'outgoing' && s.to === root.lane));
  assert.equal(root.strokes.filter((s) => s.kind === 'outgoing').length, 0);
});

void test('graph retains its prefix and boundary rails when more history is appended', () => {
  const commits = [
    { oid: 'merge', parents: ['a', 'b', 'c'] },
    { oid: 'a', parents: ['root'] },
    { oid: 'b', parents: ['root'] },
    { oid: 'c', parents: ['root'] },
    { oid: 'root', parents: [] },
  ];
  const complete = layoutGitGraph(commits);
  assert.equal(complete.lanes, 3);
  for (let size = 0; size <= commits.length; size++) {
    const prefix = layoutGitGraph(commits.slice(0, size));
    assert.deepEqual(prefix.rows, complete.rows.slice(0, size));
  }
  assert.equal(complete.rows[0].strokes.filter((s) => s.kind === 'outgoing').length, 3);
  assert.equal(new Set(complete.rows.slice(1, 4).map((r) => r.lane)).size, 3);
  assert.equal(layoutGitGraph([]).rows.length, 0);
  assert.deepEqual(commits[0].parents, ['a', 'b', 'c']);
});

// Walk every drawn edge independently and check it ends at the actual parent,
// including when that parent is below the loaded page boundary.
function assertEdges(commits: { oid: string; parents: string[] }[]) {
  const { rows } = layoutGitGraph(commits);
  rows.forEach((row, index) => {
    const edges = row.strokes.filter((s) => s.kind === 'outgoing');
    assert.equal(edges.length, new Set(commits[index].parents).size);
    edges.forEach((edge, parentIndex) => {
      const parent = [...new Set(commits[index].parents)][parentIndex];
      for (let next = index + 1; next < rows.length; next++) {
        const candidate = rows[next];
        if (candidate.lane === edge.to) {
          assert.equal(candidate.oid, parent, `${row.oid} connected to the wrong parent`);
          assert.ok(candidate.strokes.some((s) => s.kind === 'incoming'));
          return;
        }
        assert.ok(
          candidate.strokes.some((s) => s.kind === 'through' && s.from === edge.to),
          `Connection to ${parent} disappeared at ${candidate.oid}`,
        );
      }
      assert.ok(!commits.slice(0, index + 1).some((c) => c.oid === parent));
    });
  });
}

void test('octopus, crossed merges, disconnected roots and page boundaries retain real ancestry', () => {
  const commits = [
    { oid: 'tip', parents: ['merge-a', 'merge-b', 'side'] },
    { oid: 'merge-a', parents: ['left', 'right'] },
    { oid: 'merge-b', parents: ['right', 'left'] },
    { oid: 'other-root', parents: [] },
    { oid: 'side', parents: ['left', 'right', 'left'] },
    { oid: 'left', parents: ['base'] },
    { oid: 'right', parents: ['base'] },
    { oid: 'base', parents: [] },
  ];
  for (let size = 1; size <= commits.length; size++) assertEdges(commits.slice(0, size));
});

void test('deterministic generated histories do not misconnect merge edges', () => {
  let seed = 28913;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  for (let sample = 0; sample < 80; sample++) {
    const commits = Array.from({ length: 80 }, (_, index) => ({
      oid: `c${index}`,
      parents:
        index === 79
          ? []
          : Array.from(
              new Set([
                `c${index + 1}`,
                ...Array.from(
                  { length: random() % 4 },
                  () => `c${index + 1 + (random() % (79 - index))}`,
                ),
              ]),
            ),
    }));
    assertEdges(commits);
    const full = layoutGitGraph(commits);
    for (const size of [1, 7, 50, 79])
      assert.deepEqual(layoutGitGraph(commits.slice(0, size)).rows, full.rows.slice(0, size));
  }
});

void test('ten thousand linear commits keep one lane without mutating the input', () => {
  const commits = Array.from({ length: 10000 }, (_, index) => ({
    oid: `c${index}`,
    parents: index === 9999 ? [] : [`c${index + 1}`],
  }));
  const graph = layoutGitGraph(commits);
  assert.equal(graph.lanes, 1);
  assert.equal(graph.rows.length, 10000);
  assert.deepEqual(
    graph.rows.at(-1)?.strokes.map((s) => s.kind),
    ['incoming'],
  );
});
