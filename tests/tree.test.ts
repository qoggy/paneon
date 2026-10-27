import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterTree, indexTree, treeAncestors, visibleTreeIds } from '../src/ui/tree-model.ts';
import { comparisonStatus, reviewTree } from '../skills/paneon/assets/panels/diff-review/model.ts';
import type { Comparison } from '../skills/paneon/assets/panels/diff-review/model.ts';

type Item = { key: string; text: string; nodes?: Item[] };
const leaf: Item = { key: 'leaf', text: 'Match.ts' };
const roots: Item[] = [
  {
    key: 'branch',
    text: 'parent',
    nodes: [
      { key: 'nested', text: 'nested', nodes: [leaf] },
      { key: 'other', text: 'unrelated.ts' },
    ],
  },
  { key: 'empty', text: 'empty', nodes: [] },
];
const accessors = {
  getItemId: (item: Item) => item.key,
  getItemLabel: (item: Item) => item.text,
  getItemChildren: (item: Item) => item.nodes,
};
const match = (item: Item, term: string) => item.text.toLowerCase().includes(term.toLowerCase());

void test('comparison states distinguish file existence from empty content and physical path changes', () => {
  const empty = { oldText: '', newText: '' };
  assert.equal(comparisonStatus({ oldPath: null, newPath: '/tmp/empty' }, empty), 'A');
  assert.equal(comparisonStatus({ oldPath: '/work/empty', newPath: null }, empty), 'D');
  const pair = { oldPath: '/work/prompt.md', newPath: '/tmp/proposal.md' };
  assert.equal(comparisonStatus(pair), 'pending');
  assert.equal(comparisonStatus(pair, empty), '=');
  assert.equal(comparisonStatus(pair, { oldText: 'before', newText: 'after' }), 'M');
});

void test('accessor index retains identity, caller order, ancestors and empty container distinction', () => {
  const index = indexTree(roots, accessors);
  assert.equal(index.items.get('leaf')?.item, leaf);
  assert.equal(index.items.get('leaf')?.level, 3);
  assert.equal(index.items.get('leaf')?.children, undefined);
  assert.deepEqual(index.items.get('empty')?.children, []);
  assert.deepEqual(treeAncestors(index, 'leaf'), ['branch', 'nested']);
  assert.deepEqual(visibleTreeIds(index, new Set(index.branches), filterTree(index, '', match)), [
    'branch',
    'nested',
    'leaf',
    'other',
    'empty',
  ]);
});

void test('search overlays expansion without rewriting base state or original objects', () => {
  const index = indexTree(roots, accessors);
  const base = new Set(['empty']);
  const filtered = filterTree(index, 'MATCH', match);
  assert.deepEqual(visibleTreeIds(index, base, filtered), ['branch', 'nested', 'leaf']);
  assert.deepEqual([...base], ['empty']);
  assert.deepEqual([...filtered.expanded], ['nested', 'branch']);
  assert.equal(index.items.get('leaf')?.item, leaf);
  assert.deepEqual(visibleTreeIds(index, base, filterTree(index, '', match)), ['branch', 'empty']);
});

void test('matching a container does not include unrelated descendants', () => {
  const index = indexTree(roots, accessors);
  assert.deepEqual(
    visibleTreeIds(index, new Set(index.branches), filterTree(index, 'parent', match)),
    ['branch'],
  );
  assert.deepEqual(visibleTreeIds(index, new Set(), filterTree(index, 'empty', match)), ['empty']);
});

void test('path adapter keeps duplicate display paths distinct and returns original descriptors', () => {
  const files: Comparison[] = [
    { displayPath: 'prompts/same.md', oldPath: '/original/a', newPath: '/proposal/a' },
    { displayPath: 'prompts/same.md', oldPath: null, newPath: '/proposal/b' },
    { oldPath: '/original/deleted.md', newPath: null },
  ];
  const tree = reviewTree(files);
  assert.equal(tree[0].name, 'prompts');
  assert.equal(tree[0].nodes?.length, 2);
  assert.notEqual(tree[0].nodes?.[0].key, tree[0].nodes?.[1].key);
  assert.equal(tree[0].nodes?.[0].comparison, files[0]);
  assert.equal(tree[0].nodes?.[1].comparison, files[1]);
  assert.equal(tree[1].name, 'deleted.md');
  assert.equal(tree[1].comparison, files[2]);
  const flat = reviewTree(files, false);
  assert.deepEqual(
    flat.map((node) => node.name),
    ['deleted.md', 'same.md', 'same.md'],
  );
  assert.equal(flat[1].key, tree[0].nodes?.[0].key);
  assert.equal(flat[2].key, tree[0].nodes?.[1].key);
  assert.ok(
    flat.every(
      (node) => node.nodes === undefined && node.comparison === files[Number(node.key.slice(5))],
    ),
  );
});
