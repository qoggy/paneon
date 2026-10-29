import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DirectoryInputError,
  directoryErrorMessage,
  listDirectories,
  repositoryCatalog,
  resolveRepository,
} from '../skills/paneon/assets/panels/git-review/repositories.ts';
import {
  createReviewInput,
  repositoryLabels,
} from '../skills/paneon/assets/panels/git-review/input.ts';
import { RepositoryFeedback } from '../skills/paneon/assets/panels/git-review/repository-feedback.ts';
import { readGit, readGitFile } from '../skills/paneon/assets/panels/git-review/git.ts';
import {
  publicGitFeedback,
  validateGitFeedback,
} from '../skills/paneon/assets/panels/git-review/feedback.ts';
import { gitReviewParamsSchema } from '../skills/paneon/assets/panels/git-review/schema.ts';
import type { AnnotationValue } from '../src/sdk/annotation.ts';
import type { GitRef } from '../skills/paneon/assets/panels/git-review/schema.ts';
import { fixture, git } from './git-review-fixture.ts';

void test('absolute directories resolve subdirectories, aliases and independent worktrees', async (t) => {
  const f = await fixture();
  try {
    const root = await realpath(f.repo);
    const nested = join(f.repo, 'nested');
    await mkdir(nested);
    const alias = join(f.root, 'alias');
    await symlink(f.repo, alias);
    for (const path of [f.repo, nested, alias])
      assert.equal((await resolveRepository(path)).path, root);
    for (const path of ['.', './web', '~/web', 'web']) {
      await assert.rejects(resolveRepository(path), /absolute/);
      assert.equal(gitReviewParamsSchema.safeParse({ repositories: [path] }).success, false);
    }
    await assert.rejects(resolveRepository(join(f.repo, 'a.ts')), /directory/);
    await assert.rejects(resolveRepository(f.root), /Git query failed/);
    await assert.rejects(resolveRepository(join(f.root, 'missing')), /ENOENT/);
    const bare = join(f.root, 'bare');
    await git(f.root, 'init', '--bare', '-q', bare);
    await assert.rejects(resolveRepository(bare), /Git query failed/);
    const linked = join(f.root, 'linked');
    await git(f.repo, 'worktree', 'add', '-qb', 'review', linked, f.rootCommit);
    assert.notEqual((await resolveRepository(linked)).path, root);
    assert.equal((await resolveRepository(f.empty)).path, await realpath(f.empty));
    const errors = t.mock.method(console, 'error', () => {});
    const catalog = await repositoryCatalog({
      repositories: [
        { id: 'a', path: nested },
        { id: 'b', path: join(f.root, 'missing') },
      ],
    });
    assert.equal(catalog[0].repository.path, root);
    assert.equal(catalog[1].repository.id, 'b');
    assert.equal(catalog[1].error, 'Directory not found.');
    assert.equal(errors.mock.calls.length, 1);
    assert.equal((errors.mock.calls[0].arguments[2] as NodeJS.ErrnoException).code, 'ENOENT');
  } finally {
    await f.close();
  }
});

void test('directory copy follows structured error codes without exposing raw diagnostics', () => {
  const permission = Object.assign(new Error('ENOENT text must not determine the reason'), {
    code: 'EACCES',
  });
  assert.equal(
    directoryErrorMessage(permission, 'directory'),
    'You do not have permission to read this directory.',
  );
  assert.equal(
    directoryErrorMessage(Object.assign(new Error('file'), { code: 'ENOTDIR' }), 'directory'),
    'Select a directory, not a file.',
  );
  assert.equal(
    directoryErrorMessage(new Error('ENOENT: raw internal text'), 'repository'),
    'Unable to open this repository.',
  );
  assert.equal(
    directoryErrorMessage(new Error('unexpected filesystem failure'), 'directory'),
    'Unable to read this directory.',
  );
  assert.equal(
    directoryErrorMessage(new DirectoryInputError('Select a directory, not a file.'), 'repository'),
    'Select a directory, not a file.',
  );
});

void test('directory browsing follows directory links, excludes files and reports read errors', async (t) => {
  const f = await fixture();
  try {
    const root = await realpath(f.root);
    await writeFile(join(f.root, 'not-a-directory.txt'), 'file');
    await symlink(f.repo, join(f.root, 'repo-link'));
    await symlink(join(f.root, 'not-a-directory.txt'), join(f.root, 'file-link'));
    await symlink(join(f.root, 'missing'), join(f.root, 'dangling-link'));
    const warnings = t.mock.method(console, 'warn', () => {});
    const result = await listDirectories(f.root);
    assert.equal(result.path, root);
    assert.ok(result.directories.some((entry) => entry.path === join(root, 'web')));
    assert.ok(!result.directories.some((entry) => entry.name === 'not-a-directory.txt'));
    assert.ok(result.directories.some((entry) => entry.path === join(root, 'repo-link')));
    assert.ok(!result.directories.some((entry) => entry.name === 'file-link'));
    assert.ok(!result.directories.some((entry) => entry.name === 'dangling-link'));
    assert.equal(warnings.mock.callCount(), 1);
    assert.equal((await listDirectories(join(root, 'repo-link'))).path, await realpath(f.repo));
    assert.ok(result.directories.every((entry) => entry.path.startsWith(root)));
    await assert.rejects(listDirectories('.'), /absolute/);
    await assert.rejects(listDirectories(join(f.root, 'missing')), /ENOENT/);
    await assert.rejects(listDirectories(join(f.root, 'not-a-directory.txt')), /ENOTDIR/);
  } finally {
    await f.close();
  }
});

void test('submission baseline detects new, changed, deleted and failed opinions and preserves retired feedback', async () => {
  const f = await fixture();
  try {
    const params = {
      repositories: [
        { id: 'a', path: f.repo },
        { id: 'b', path: f.second },
      ],
    };
    const listingA = await readGit(params, { repositoryId: 'a', type: 'changes' });
    const listingB = await readGit(params, { repositoryId: 'b', type: 'changes' });
    const a = await readGitFile(params, listingA.files[0]);
    const b = await readGitFile(params, listingB.files[0]);
    const snapshots = new Map([
      [a.id, a],
      [b.id, b],
    ]);
    const draft: AnnotationValue<GitRef> = {
      annotations: [
        { id: 'opinion-a', comment: 'A', targets: [{ ref: { sourceId: a.id, kind: 'file' } }] },
        { id: 'opinion-b', comment: 'B', targets: [{ ref: { sourceId: b.id, kind: 'file' } }] },
      ],
    };
    const state = new RepositoryFeedback();
    assert.equal(state.hasChanges('a', { annotations: [] }, snapshots), false);
    assert.equal(state.hasChanges('a', draft, snapshots), true);
    assert.throws(() => state.retire('b', draft, snapshots), /unsubmitted/);
    const built = state.build(draft, snapshots);
    const published = publicGitFeedback(built);
    for (const [index, file] of published.files.entries()) {
      assert.equal('repositoryId' in file, false);
      const source = built.sources[[a.id, b.id][index]];
      const { repositoryId: _repositoryId, evidence: _evidence, ...expected } = source;
      const { annotations, ...publishedSource } = file;
      assert.deepEqual(publishedSource, expected);
      assert.deepEqual(annotations, [{ targets: [{ kind: 'file' }], comment: index ? 'B' : 'A' }]);
    }
    assert.equal(
      built.sources[a.id].repositoryId,
      'a',
      'Publishing must preserve internal tracking.',
    );
    assert.equal(built.sources[a.id].repositoryPath, await realpath(f.repo));
    assert.equal(built.sources[b.id].repositoryPath, await realpath(f.second));
    state.accept(draft, validateGitFeedback(params, built));
    assert.equal(state.hasChanges('a', draft, snapshots), false);
    const reordered = {
      annotations: draft.annotations.map(({ id, targets, comment }) => ({ targets, comment, id })),
    };
    assert.equal(
      state.hasChanges('b', reordered, snapshots),
      false,
      'Store updates can change object property order',
    );
    const changed = structuredClone(draft);
    changed.annotations[1].comment = 'B corrected';
    assert.equal(state.hasChanges('a', changed, snapshots), false);
    assert.equal(state.hasChanges('b', changed, snapshots), true);
    state.build(changed, snapshots);
    assert.equal(
      state.hasChanges('b', changed, snapshots),
      true,
      'Only successful delivery advances the baseline',
    );
    const removed = { annotations: [draft.annotations[0]] };
    assert.equal(state.hasChanges('b', removed, snapshots), true);
    assert.equal(state.hasChanges('b', draft, snapshots), false);
    assert.deepEqual(state.retire('b', draft, snapshots), ['opinion-b']);
    snapshots.delete(b.id);
    const correction = validateGitFeedback(
      params,
      state.build({ ...removed, replacesEventId: 42 }, snapshots),
    );
    assert.deepEqual(
      correction.annotations.find((entry) => entry.id === 'opinion-b'),
      built.annotations[1],
    );
    assert.deepEqual(correction.sources[b.id], built.sources[b.id]);
    assert.equal('repositoryId' in publicGitFeedback(correction).files[1], false);
    assert.equal(correction.replacesEventId, 42);
    state.accept(removed, correction);
    const withdrawA = state.build({ annotations: [], replacesEventId: 43 }, snapshots);
    assert.deepEqual(
      withdrawA.annotations.map((entry) => entry.id),
      ['opinion-b'],
    );
    assert.equal(state.hasChanges('a', { annotations: [] }, snapshots), true);
  } finally {
    await f.close();
  }
});

void test('path-only input preserves the selected repository through canonicalization', async () => {
  const f = await fixture();
  try {
    const nested = join(f.second, 'nested');
    await mkdir(nested);
    const initial = createReviewInput(
      gitReviewParamsSchema.parse({
        repositories: [f.repo, nested],
        initialView: { repositoryPath: nested, type: 'changes', file: 'a.ts' },
      }),
    );
    assert.notEqual(initial.repositories[0].id, initial.repositories[1].id);
    assert.equal(initial.request.repositoryId, initial.repositories[1].id);
    const catalog = await repositoryCatalog(initial);
    const configuration = { repositories: catalog.map((entry) => entry.repository) };
    assert.equal(configuration.repositories[1].path, await realpath(f.second));
    assert.equal(configuration.repositories[1].id, initial.request.repositoryId);
    const listing = await readGit(configuration, initial.request);
    const captured = await readGitFile(configuration, listing.files[0]);
    assert.equal(captured.source.repositoryId, initial.repositories[1].id);
    assert.equal(captured.source.repositoryPath, await realpath(f.second));
    const defaultView = createReviewInput({ repositories: [f.repo, f.second] });
    assert.deepEqual(defaultView.request, {
      repositoryId: defaultView.repositories[0].id,
      type: 'changes',
    });
  } finally {
    await f.close();
  }
});

void test('same-name repositories use shortest unique suffixes as the active list changes', () => {
  const a = { id: 'a', path: '/work/project-a/web' };
  const b = { id: 'b', path: '/work/project-b/web' };
  const c = { id: 'c', path: '/other/project-a/web' };
  const api = { id: 'api', path: '/work/api' };
  assert.deepEqual(
    [...repositoryLabels([a, b, api]).values()],
    ['project-a/web', 'project-b/web', 'api'],
  );
  assert.deepEqual(
    [...repositoryLabels([a, b, c]).values()],
    ['work/project-a/web', 'project-b/web', 'other/project-a/web'],
  );
  assert.deepEqual([...repositoryLabels([b, api]).values()], ['web', 'api']);
  assert.deepEqual(
    [...repositoryLabels([{ id: 'root', path: '/web' }, a]).values()],
    ['/web', 'project-a/web'],
  );
  assert.deepEqual([...repositoryLabels([{ id: 'root', path: '/' }]).values()], ['/']);
  assert.deepEqual(
    [
      ...repositoryLabels([
        { id: 'c', path: 'C:\\work\\web' },
        { id: 'd', path: 'D:\\work\\web' },
      ]).values(),
    ],
    ['C:/work/web', 'D:/work/web'],
  );
});
