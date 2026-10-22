import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildFileTree,
  filterFileTree,
  groupFileTrees,
  leafCount,
  matchesPath,
  selectedAncestors,
  snapshotName,
  snapshotTitle,
  statusClass,
} from '../skills/paneon/assets/panels/git-review/file-tree-model.ts';
import type { TreeSnapshot } from '../skills/paneon/assets/panels/git-review/file-tree-model.ts';
const file = (
  path: string,
  id = path,
  status = 'M',
  area?: 'staged' | 'unstaged' | 'untracked',
): TreeSnapshot => ({
  id,
  status,
  source: { view: area ? { type: 'changes', area } : { type: 'history' }, new: { path } },
});
void test('compresses single directories, stops at branches and direct files, sorts directories first', () => {
  const tree = buildFileTree([
    file('root.ts'),
    file('packages/web/src/feature/a.ts'),
    file('packages/web/src/feature/deep/b.ts'),
    file('packages/web/src/other/a.ts'),
    file('single/path/to/file.ts'),
  ]);
  assert.deepEqual(
    tree.map((n) => n.name),
    ['packages/web/src', 'single/path/to', 'root.ts'],
  );
  const branch = tree[0];
  assert.equal(branch.kind, 'directory');
  if (branch.kind !== 'directory') throw new Error('Expected directory');
  assert.equal(branch.count, 3);
  assert.deepEqual(
    branch.children.map((n) => n.name),
    ['feature', 'other'],
  );
  const feature = branch.children[0];
  assert.equal(feature.kind, 'directory');
  if (feature.kind !== 'directory') throw new Error('Expected feature directory');
  assert.deepEqual(
    feature.children.map((n) => n.name),
    ['deep', 'a.ts'],
  );
  assert.equal(leafCount(tree), 5);
});
void test('same paths in index and working tree retain distinct IDs and groups', () => {
  const groups = groupFileTrees([
    file('a/same.ts', 'work', 'M', 'unstaged'),
    file('a/same.ts', 'index', 'M', 'staged'),
    file('new', 'new', '?', 'untracked'),
  ]);
  assert.deepEqual(
    groups.map((g) => g.area),
    ['staged', 'unstaged', 'untracked'],
  );
  assert.deepEqual(selectedAncestors(groups[0].nodes, 'index'), ['a']);
  assert.deepEqual(selectedAncestors(groups[0].nodes, 'work'), []);
  assert.equal(
    groups.reduce((n, g) => n + leafCount(g.nodes), 0),
    3,
  );
  assert.equal(snapshotName(file('a/same.ts', 'index', 'M', 'staged')), '已暂存 · M a/same.ts');
});
void test('rename uses destination, retains old path and searches both paths case-insensitively', () => {
  const renamed = file('new dir/目标.ts', 'rename', 'R100');
  renamed.source.old = { path: 'old dir/Original.ts' };
  assert.ok(snapshotTitle(renamed).includes('old dir/Original.ts → new dir/目标.ts'));
  const tree = buildFileTree([renamed, file('other/x.ts')]);
  const filtered = filterFileTree(tree, 'OLD DIR/original');
  assert.equal(filtered[0].name, 'new dir');
  assert.equal(leafCount(filtered), 1);
  assert.equal(leafCount(tree), 2);
  assert.ok(matchesPath(renamed, '目标'));
  assert.equal(filterFileTree(tree, 'missing').length, 0);
  assert.equal(filterFileTree(tree, ''), tree);
});
void test('spaces, newlines, Unicode, duplicate basenames and deletions preserve exact paths', () => {
  const special = ' space /中文\n目录/ file \n.ts ';
  const deleted: TreeSnapshot = {
    id: 'deleted',
    status: 'D',
    source: { view: { type: 'history' }, old: { path: 'gone/deleted.ts' } },
  };
  const tree = buildFileTree([
    file(special),
    file('first/same.ts'),
    file('second/same.ts'),
    deleted,
  ]);
  assert.ok(tree.some((n) => n.name === ' space /中文\n目录'));
  assert.deepEqual(selectedAncestors(tree, special), [' space /中文\n目录']);
  assert.ok(snapshotName(file(special)).endsWith(special));
  assert.equal(snapshotName(deleted), 'D gone/deleted.ts');
  assert.equal(leafCount(tree), 4);
});
void test('search retains original branch labels and exact visible leaf counts', () => {
  const tree = buildFileTree([file('a/b/one/match.ts'), file('a/b/two/other.ts')]);
  const filtered = filterFileTree(tree, 'MATCH');
  assert.equal(filtered[0].name, 'a/b');
  assert.equal(leafCount(filtered), 1);
  assert.equal(leafCount(tree), 2);
});
void test('status styling preserves real codes and distinguishes modified, added, deleted and conflicts', () => {
  for (const status of ['M', 'R100', 'T']) assert.match(statusClass(status), /text-blue/);
  for (const status of ['A', '?', 'C100']) assert.match(statusClass(status), /text-green/);
  assert.match(statusClass('D'), /text-muted-foreground/);
  assert.match(statusClass('U'), /text-amber/);
  assert.match(snapshotTitle(file('conflict.ts', 'conflict', 'U')), /未合并冲突/);
  for (const status of ['A', 'M', 'D', 'R100', '?', 'C100', 'T', 'U'])
    assert.ok(snapshotName(file('f', 'f', status)).startsWith(`${status} `));
});
