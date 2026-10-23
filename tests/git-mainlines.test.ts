import test from 'node:test';
import assert from 'node:assert/strict';
import { markMainlines } from '../skills/paneon/assets/panels/git-review/branch-model.ts';
import { readGit } from '../skills/paneon/assets/panels/git-review/git.ts';
import type { HistoryRef } from '../skills/paneon/assets/panels/git-review/git.ts';
import { fixture, git } from './git-review-fixture.ts';
const branch = (name: string): HistoryRef => ({ kind: 'branch', name, ref: `refs/heads/${name}` });
const remote = (name: string): HistoryRef => ({
  kind: 'remote',
  name,
  ref: `refs/remotes/${name}`,
});
const marked = (refs: HistoryRef[], defaults = new Map<string, string>()) =>
  markMainlines(refs, defaults)
    .filter((ref) => ref.mainline)
    .map((ref) => ref.ref)
    .sort();

void test('recorded remote HEAD overrides conventional names and does not star its alias or tags', () => {
  const refs = [
    branch('main'),
    branch('develop'),
    remote('origin/main'),
    remote('origin/develop'),
    remote('origin/HEAD'),
    { kind: 'tag' as const, name: 'main', ref: 'refs/tags/main' },
  ];
  assert.deepEqual(marked(refs, new Map([['origin', 'refs/remotes/origin/develop']])), [
    'refs/heads/develop',
    'refs/remotes/origin/develop',
  ]);
  assert.ok(
    refs.every((ref) => ref.mainline === undefined),
    'Input catalog is not mutated.',
  );
});
void test('offline convention chooses only one mainline per local or remote group', () => {
  assert.deepEqual(
    marked([
      branch('master'),
      branch('main'),
      branch('trunk'),
      remote('origin/master'),
      remote('origin/trunk'),
      remote('upstream/main'),
    ]),
    ['refs/heads/main', 'refs/remotes/origin/master', 'refs/remotes/upstream/main'],
  );
  assert.deepEqual(marked([branch('feature/main'), remote('origin/feature/main')]), []);
  assert.deepEqual(marked([]), []);
});
void test('remote defaults apply independently; missing local counterpart is not invented', () => {
  assert.deepEqual(
    marked(
      [branch('main'), remote('origin/release'), remote('upstream/trunk')],
      new Map([
        ['origin', 'refs/remotes/origin/release'],
        ['upstream', 'refs/remotes/upstream/trunk'],
      ]),
    ),
    ['refs/remotes/origin/release', 'refs/remotes/upstream/trunk'],
  );
});
void test('real Git symbolic refs mark mainlines without changing cached history or checkout', async () => {
  const f = await fixture();
  try {
    await git(f.repo, 'branch', 'develop');
    await git(f.repo, 'update-ref', 'refs/remotes/origin/develop', f.feature);
    await git(f.repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/develop');
    const params = { repositories: [{ id: 'repo', path: f.repo }] };
    const first = await readGit(params, { repositoryId: 'repo', type: 'history' });
    assert.deepEqual(
      first.historyRefs
        ?.filter((ref) => ref.mainline)
        .map((ref) => ref.ref)
        .sort(),
      ['refs/heads/develop', 'refs/remotes/origin/develop'],
    );
    const next = await readGit(params, {
      repositoryId: 'repo',
      type: 'history',
      historyContext: first.historyContext,
      tip: first.history?.tip,
      commit: f.rootCommit,
    });
    assert.equal(
      next.historyRefs,
      undefined,
      'Commit selection retains the existing reference catalog.',
    );
    assert.equal(await git(f.repo, 'symbolic-ref', '--short', 'HEAD'), 'main');
  } finally {
    await f.close();
  }
});
