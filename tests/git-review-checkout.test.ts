import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkoutGit } from '../skills/paneon/assets/panels/git-review/checkout.ts';
import { gitCheckoutCompletedSchema } from '../skills/paneon/assets/panels/git-review/schema.ts';
import type { GitCheckoutInput } from '../skills/paneon/assets/panels/git-review/schema.ts';
import { git } from './git-review-fixture.ts';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'paneon-checkout-'));
  const repo = join(root, 'repo');
  await mkdir(repo);
  await git(repo, 'init', '-qb', 'main');
  await git(repo, 'config', 'user.name', 'Checkout test');
  await git(repo, 'config', 'user.email', 'checkout@example.test');
  await writeFile(join(repo, 'tracked.txt'), 'main\n');
  await writeFile(join(repo, '.gitignore'), '*.log\n');
  await git(repo, 'add', '.');
  await git(repo, 'commit', '-qm', 'Main');
  const main = await git(repo, 'rev-parse', 'HEAD');
  await git(repo, 'checkout', '-qb', 'feature');
  await writeFile(join(repo, 'tracked.txt'), 'feature\n');
  await git(repo, 'commit', '-qam', 'Feature');
  const feature = await git(repo, 'rev-parse', 'HEAD');
  await git(repo, 'checkout', '-q', 'main');
  await git(repo, 'remote', 'add', 'origin', repo);
  await git(repo, 'update-ref', 'refs/remotes/origin/review/topic', feature);
  await git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/review/topic');
  await git(repo, 'tag', 'v1', main);
  await git(repo, 'tag', '-am', 'Release', 'release', feature);
  const input = (
    kind: GitCheckoutInput['target']['kind'],
    ref: string,
    commit = feature,
  ): GitCheckoutInput => ({
    params: { repositories: [{ id: 'repo', path: repo }] },
    repositoryId: 'repo',
    target: { kind, ref, commit },
    expectedHead: { branch: 'main', commit: main },
  });
  return {
    root,
    repo,
    main,
    feature,
    input,
    close: () => rm(root, { recursive: true, force: true }),
  };
}

void test('local checkout is verified and returns complete before/after evidence', async () => {
  const f = await fixture();
  try {
    const result = await checkoutGit(f.input('branch', 'refs/heads/feature'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(gitCheckoutCompletedSchema.safeParse(result.data).success, true);
    assert.equal(result.data.repositoryId, 'repo');
    assert.equal(await git(result.data.repositoryPath, 'rev-parse', 'HEAD'), f.feature);
    assert.deepEqual(result.data.before, { branch: 'main', commit: f.main });
    assert.deepEqual(result.data.after, { branch: 'feature', commit: f.feature });
    assert.equal(await readFile(join(f.repo, 'tracked.txt'), 'utf8'), 'feature\n');
    assert.equal(await git(f.repo, 'status', '--porcelain'), '');
    assert.equal(await git(f.repo, 'stash', 'list'), '');
  } finally {
    await f.close();
  }
});

void test('remote checkout creates the named tracking branch without fetching or moving existing branches', async () => {
  const f = await fixture();
  try {
    const result = await checkoutGit(f.input('remote', 'refs/remotes/origin/review/topic'));
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) return;
    assert.deepEqual(result.data.after, { branch: 'review/topic', commit: f.feature });
    assert.equal(
      await git(f.repo, 'rev-parse', '--symbolic-full-name', '@{upstream}'),
      'refs/remotes/origin/review/topic',
    );
    assert.equal(await git(f.repo, 'rev-parse', 'main'), f.main);
    assert.equal(await git(f.repo, 'rev-parse', 'feature'), f.feature);
  } finally {
    await f.close();
  }
});

for (const [tag, atFeature] of [
  ['v1', false],
  ['release', true],
] as const)
  void test(`checkout ${tag} explicitly detaches HEAD and can return to a local branch`, async () => {
    const f = await fixture();
    try {
      const commit = atFeature ? f.feature : f.main;
      const result = await checkoutGit(f.input('tag', `refs/tags/${tag}`, commit));
      assert.equal(result.ok, true, JSON.stringify(result));
      if (!result.ok) return;
      assert.deepEqual(result.data.after, { branch: null, commit });
      assert.equal(await git(f.repo, 'rev-parse', '--abbrev-ref', 'HEAD'), 'HEAD');
      const back = await checkoutGit({
        ...f.input('branch', 'refs/heads/main', f.main),
        expectedHead: result.data.after,
      });
      assert.equal(back.ok, true);
      assert.equal(await git(f.repo, 'branch', '--show-current'), 'main');
    } finally {
      await f.close();
    }
  });

for (const dirty of ['staged', 'unstaged', 'untracked'] as const)
  void test(`rejects ${dirty} changes even when Git could carry them across branches`, async () => {
    const f = await fixture();
    try {
      await writeFile(join(f.repo, dirty === 'untracked' ? 'new.txt' : 'tracked.txt'), 'keep me\n');
      if (dirty === 'staged') await git(f.repo, 'add', 'tracked.txt');
      const before = await git(f.repo, 'status', '--porcelain');
      const index = await git(f.repo, 'ls-files', '--stage');
      const refs = await git(f.repo, 'show-ref');
      const result = await checkoutGit(f.input('remote', 'refs/remotes/origin/review/topic'));
      assert.deepEqual(result, { ok: false, reason: 'dirty', message: '' });
      assert.equal(await git(f.repo, 'rev-parse', 'HEAD'), f.main);
      assert.equal(await git(f.repo, 'status', '--porcelain'), before);
      assert.equal(await git(f.repo, 'ls-files', '--stage'), index);
      assert.equal(await git(f.repo, 'show-ref'), refs);
      assert.equal(
        await readFile(join(f.repo, dirty === 'untracked' ? 'new.txt' : 'tracked.txt'), 'utf8'),
        'keep me\n',
      );
      assert.equal(await git(f.repo, 'stash', 'list'), '');
    } finally {
      await f.close();
    }
  });

for (const marker of [
  'MERGE_HEAD',
  'CHERRY_PICK_HEAD',
  'REVERT_HEAD',
  'rebase-merge',
  'rebase-apply',
  'sequencer',
  'BISECT_LOG',
  'index.lock',
])
  void test(`refuses an in-progress operation: ${marker}`, async () => {
    const f = await fixture();
    try {
      const path = join(f.repo, '.git', marker);
      if (['rebase-merge', 'rebase-apply', 'sequencer'].includes(marker)) await mkdir(path);
      else await writeFile(path, `${f.main}\n`);
      const result = await checkoutGit(f.input('branch', 'refs/heads/feature'));
      assert.deepEqual(result, { ok: false, reason: 'in-progress', message: '' });
      assert.equal(await git(f.repo, 'rev-parse', 'HEAD'), f.main);
    } finally {
      await f.close();
    }
  });

void test('rejects stale HEAD, moved targets, current branch, existing local names and remote aliases', async () => {
  const f = await fixture();
  try {
    const cases: [GitCheckoutInput, string][] = [
      [
        {
          ...f.input('branch', 'refs/heads/feature'),
          expectedHead: { branch: 'feature', commit: f.main },
        },
        'stale',
      ],
      [
        {
          ...f.input('branch', 'refs/heads/feature'),
          expectedHead: { branch: 'main', commit: f.feature },
        },
        'stale',
      ],
      [f.input('branch', 'refs/heads/feature', f.main), 'stale'],
      [f.input('branch', 'refs/heads/main', f.main), 'current'],
      [f.input('remote', 'refs/remotes/origin/HEAD'), 'symbolic-remote'],
    ];
    await git(f.repo, 'branch', 'review/topic', f.main);
    cases.push([f.input('remote', 'refs/remotes/origin/review/topic'), 'local-exists']);
    const refs = await git(f.repo, 'show-ref');
    for (const [input, reason] of cases) {
      const result = await checkoutGit(input);
      assert.deepEqual(result, { ok: false, reason, message: '' });
      assert.equal(await git(f.repo, 'rev-parse', 'HEAD'), f.main);
      assert.equal(await git(f.repo, 'show-ref'), refs);
    }
  } finally {
    await f.close();
  }
});

void test('respects another worktree and resolves operation markers in linked worktrees', async () => {
  const f = await fixture();
  try {
    const linked = join(f.root, 'linked');
    await git(f.repo, 'worktree', 'add', '-q', linked, 'feature');
    const result = await checkoutGit(f.input('branch', 'refs/heads/feature'));
    assert.equal(result.ok, false);
    assert.equal(await git(f.repo, 'branch', '--show-current'), 'main');
    assert.equal(await git(linked, 'branch', '--show-current'), 'feature');
    const marker = await git(linked, 'rev-parse', '--git-path', 'CHERRY_PICK_HEAD');
    await writeFile(marker, `${f.main}\n`);
    const linkedInput = f.input('tag', 'refs/tags/v1', f.main);
    linkedInput.params.repositories[0].path = linked;
    linkedInput.expectedHead = { branch: 'feature', commit: f.feature };
    assert.deepEqual(await checkoutGit(linkedInput), {
      ok: false,
      reason: 'in-progress',
      message: '',
    });
  } finally {
    await f.close();
  }
});

void test('ignored local files cannot be overwritten by checkout', async () => {
  const f = await fixture();
  try {
    await git(f.repo, 'checkout', '-q', 'feature');
    await writeFile(join(f.repo, 'private.log'), 'tracked target\n');
    await git(f.repo, 'add', '-f', 'private.log');
    await git(f.repo, 'commit', '-qm', 'Track an ignored path');
    const target = await git(f.repo, 'rev-parse', 'HEAD');
    await git(f.repo, 'checkout', '-q', 'main');
    await writeFile(join(f.repo, 'private.log'), 'local ignored data\n');
    assert.equal(await git(f.repo, 'status', '--porcelain'), '');
    const result = await checkoutGit(f.input('branch', 'refs/heads/feature', target));
    assert.equal(result.ok, false);
    assert.equal(await git(f.repo, 'rev-parse', 'HEAD'), f.main);
    assert.equal(await readFile(join(f.repo, 'private.log'), 'utf8'), 'local ignored data\n');
  } finally {
    await f.close();
  }
});

void test('checkout accepts only configured repositories and exact typed references', async () => {
  const f = await fixture();
  try {
    const unknown = await checkoutGit({
      ...f.input('branch', 'refs/heads/feature'),
      repositoryId: 'other',
    });
    assert.equal(unknown.ok, false);
    for (const ref of ['feature', 'refs/tags/release', '--force', 'refs/heads/feature\n'])
      await assert.rejects(checkoutGit(f.input('branch', ref)));
    assert.equal(await git(f.repo, 'branch', '--show-current'), 'main');
  } finally {
    await f.close();
  }
});
