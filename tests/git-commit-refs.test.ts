import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  commitRefRevision,
  groupCommitRefs,
  summarizeCommitRefs,
} from '#test-skill/assets/panels/git-review/commit-ref-model.ts';
import type { CommitDecoration } from '#test-skill/assets/panels/git-review/git.ts';

void test('compact summaries prefer the current branch and known mainline without dropping full references', () => {
  const refs: CommitDecoration[] = [
    { kind: 'branch', name: '0.3.x' },
    { kind: 'branch', name: 'main' },
    { kind: 'branch', name: 'develop' },
    { kind: 'remote', name: 'origin/main' },
    { kind: 'remote', name: 'origin/0.3.x' },
    { kind: 'remote', name: 'origin/develop' },
    { kind: 'tag', name: 'v0.3.0' },
  ];
  assert.equal(summarizeCommitRefs(refs, undefined, ['main']), 'origin & main');
  assert.equal(summarizeCommitRefs(refs, 'develop', ['main']), 'origin & develop');
  const groups = groupCommitRefs(refs);
  assert.deepEqual(
    groups.map((group) => group.kind),
    ['branch', 'remote', 'tag'],
  );
  assert.deepEqual(
    groups.flatMap((group) => group.refs),
    refs,
  );
  assert.equal(refs.length, 7);
  const ordered = groupCommitRefs(refs, 'develop', ['main', 'origin/main']);
  assert.deepEqual(
    ordered[0].refs.map((ref) => ref.name),
    ['develop', 'main', '0.3.x'],
  );
  assert.equal(ordered[1].refs[0].name, 'origin/main');
});

void test('remote-only, tags and detached HEAD retain a meaningful complete representative name', () => {
  assert.equal(
    summarizeCommitRefs([{ kind: 'remote', name: 'origin/feature/中文' }]),
    'origin/feature/中文',
  );
  assert.equal(summarizeCommitRefs([{ kind: 'tag', name: 'v0.3.0' }]), 'v0.3.0');
  assert.equal(summarizeCommitRefs([{ kind: 'head', name: 'HEAD' }]), 'HEAD');
  assert.equal(
    summarizeCommitRefs(
      [
        { kind: 'head', name: 'HEAD' },
        { kind: 'branch', name: 'develop' },
      ],
      'develop',
    ),
    'develop',
  );
  assert.equal(summarizeCommitRefs([]), '');
});

void test('same-named branches and tags keep their distinct comparison revisions', () => {
  assert.equal(commitRefRevision({ kind: 'branch', name: 'main' }), 'refs/heads/main');
  assert.equal(
    commitRefRevision({ kind: 'remote', name: 'origin/main' }),
    'refs/remotes/origin/main',
  );
  assert.equal(commitRefRevision({ kind: 'tag', name: 'main' }), 'refs/tags/main');
  assert.equal(commitRefRevision({ kind: 'head', name: 'HEAD' }), 'HEAD');
});
