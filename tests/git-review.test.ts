import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { readGit, validateGitFeedback } from '../skills/paneon/assets/panels/git-review/git.ts';
import { gitReviewParamsSchema } from '../skills/paneon/assets/panels/git-review/schema.ts';
import { createDiffModel, sourceLines } from '../skills/paneon/assets/shared/diff-model.ts';
import { diffTargetText, normalizeDiffTarget } from '../skills/paneon/assets/shared/diff-schema.ts';
import type { GitRef } from '../skills/paneon/assets/shared/diff-schema.ts';
import { fixture, git } from './git-review-fixture.ts';

function required<T>(value: T | undefined): T {
  assert.notEqual(value, undefined);
  return value as T;
}

void test('diff snapshots preserve both originals, Unicode, CRLF and missing final newline', () => {
  let seed = 713;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  const alphabet = ['重复\r\n', '🙂中文\n', 'a\n', 'b\n', '\n'];
  for (let i = 0; i < 300; i++) {
    const make = () =>
      Array.from({ length: next() % 22 }, () => alphabet[next() % alphabet.length]).join('') +
      (next() % 2 ? 'tail' : '');
    const old = make(),
      nextText = make(),
      model = createDiffModel(old, nextText);
    assert.equal(model.rows.flatMap((r) => (r.old ? [r.old.text] : [])).join(''), old);
    assert.equal(model.rows.flatMap((r) => (r.new ? [r.new.text] : [])).join(''), nextText);
    for (const row of model.rows)
      if (row.kind === 'context') assert.equal(row.old?.text, row.new?.text);
  }
  const model = createDiffModel('one\r\n重复 重复🙂\r\nlast', 'one\r\nchanged\r\nlast');
  assert.match(model.hunks[0].patch, /No newline at end of file/);
  const source = required(model.oldText),
    start = source.indexOf('重复', source.indexOf('重复') + 1);
  const target = {
    ref: { sourceId: 'x', kind: 'lines' as const, side: 'old' as const, startLine: 1, endLine: 3 },
    text: { start, end: start + 2, quote: '重复' },
  };
  const normalized = normalizeDiffTarget(model, target);
  assert.deepEqual(normalized.ref, {
    sourceId: 'x',
    kind: 'lines',
    side: 'old',
    startLine: 2,
    endLine: 2,
  });
  assert.deepEqual(normalized.text, { start: 3, end: 5, quote: '重复' });
  assert.equal(diffTargetText(model, normalized), '重复 重复🙂\r\n');
  assert.throws(() =>
    diffTargetText(model, {
      ...target,
      text: { start: start + 2, end: start + 3, quote: '\ud83d' },
    }),
  );
  assert.equal(sourceLines('a\r\nb').length, 2);
});
void test('input validates scoped repositories and explicit initial locations', () => {
  const base = { repositories: [{ id: 'web', path: '.' }] };
  assert.equal(gitReviewParamsSchema.safeParse(base).success, true);
  for (const value of [
    { repositories: [] },
    { repositories: [base.repositories[0], base.repositories[0]] },
    { ...base, initialView: { repositoryId: 'missing', type: 'changes' } },
    { ...base, initialView: { repositoryId: 'web', type: 'history', file: 'a.ts' } },
    { ...base, initialView: { repositoryId: 'web', type: 'changes', file: '../a.ts' } },
  ])
    assert.equal(gitReviewParamsSchema.safeParse(value).success, false);
});
void test('real multi-repository working snapshots, rename/NUL paths, ignore rules and old feedback', async () => {
  const f = await fixture();
  try {
    const params = {
      repositories: [
        { id: 'web', path: relative(process.cwd(), f.repo) },
        { id: 'server', path: f.second },
      ],
    };
    const session = randomUUID(),
      listing = await readGit(params, session, { repositoryId: 'web', type: 'changes' });
    const a = listing.snapshots.filter((s) => s.source.new?.path === 'a.ts');
    assert.equal(a.length, 2);
    const staged = a.find(
      (s) => s.source.view.type === 'changes' && s.source.view.area === 'staged',
    );
    const working = a.find(
      (s) => s.source.view.type === 'changes' && s.source.view.area === 'unstaged',
    );
    assert.ok(staged);
    assert.ok(working);
    assert.match(required(staged.model.oldText), /n = 2/);
    assert.match(required(staged.model.newText), /n = 3/);
    assert.match(required(working.model.oldText), /n = 3/);
    assert.match(required(working.model.newText), /n = 4/);
    assert.equal(
      working.source.new?.contentHash,
      `sha256:${createHash('sha256').update(required(working.model.newText)).digest('hex')}`,
    );
    const paths = listing.snapshots.map((s) => s.source.new?.path ?? s.source.old?.path);
    assert.ok(paths.includes('tracked.log'));
    assert.ok(!paths.includes('ignored.log'));
    assert.ok(paths.includes('untracked\nspace.txt'));
    const renamed = listing.snapshots.find((s) => s.source.old?.path === 'old name\nfile.txt');
    assert.ok(renamed);
    assert.equal(renamed.source.new?.path, 'new name\nfile.txt');
    assert.match(renamed.status, /^R/);
    for (const name of ['binary.bin', 'outside-link']) {
      const snapshot = listing.snapshots.find((s) => s.source.new?.path === name);
      assert.ok(snapshot);
      assert.equal(snapshot.source.new?.type, 'binary');
      assert.equal(snapshot.model.newText, undefined);
    }
    const other = await readGit(params, session, { repositoryId: 'server', type: 'changes' });
    assert.equal(other.snapshots[0].source.repositoryId, 'server');
    await writeFile(join(f.repo, 'a.ts'), 'latest\n');
    const refreshed = await readGit(params, session, { repositoryId: 'web', type: 'changes' });
    assert.notEqual(
      refreshed.snapshots.find(
        (s) =>
          s.source.view.type === 'changes' &&
          s.source.view.area === 'unstaged' &&
          s.source.new?.path === 'a.ts',
      )?.id,
      working.id,
    );
    const start = required(working.model.newText).indexOf('n = 4');
    const value = {
      annotations: [
        {
          id: 'old-opinion',
          comment: '',
          targets: [
            {
              ref: { sourceId: working.id, kind: 'lines', side: 'new', startLine: 1, endLine: 3 },
              text: { start, end: start + 5, quote: 'n = 4' },
            },
            { ref: { sourceId: other.snapshots[0].id, kind: 'file' } },
          ],
        },
      ],
    };
    const result = validateGitFeedback(params, session, value);
    assert.equal(Object.keys(result.sources).length, 2);
    assert.equal(result.annotations[0].targets[0].ref.kind, 'lines');
    assert.deepEqual(result.annotations[0].targets[0].text, { start: 6, end: 11, quote: 'n = 4' });
    const duplicated = structuredClone(value);
    duplicated.annotations[0].targets.push({
      ref: { sourceId: working.id, kind: 'lines', side: 'new', startLine: 2, endLine: 2 },
      text: { start: 6, end: 11, quote: 'n = 4' },
    });
    assert.equal(validateGitFeedback(params, session, duplicated).annotations[0].targets.length, 2);
    assert.throws(() => validateGitFeedback(params, randomUUID(), value), /snapshot is missing/);
    assert.throws(
      () => validateGitFeedback(params, session, { annotations: [], comment: '中'.repeat(66000) }),
      /65536/,
    );
    await assert.rejects(
      readGit(params, session, { repositoryId: 'web', type: 'changes', file: 'missing.txt' }),
      /not present/,
    );
    await mkdir(join(f.repo, 'deleted-dir'));
    await writeFile(join(f.repo, 'deleted-dir/a'), 'gone');
    await git(f.repo, 'add', '--', 'deleted-dir/a');
    await git(f.repo, 'commit', '-qm', 'directory');
    await rm(join(f.repo, 'deleted-dir'), { recursive: true });
    await readGit(params, session, { repositoryId: 'web', type: 'changes' });
  } finally {
    await f.close();
  }
});
void test('root/merge commits, comparisons, fixed-tip history pagination and invalid revisions', async () => {
  const f = await fixture();
  try {
    const params = {
        repositories: [
          { id: 'web', path: f.repo },
          { id: 'empty', path: f.empty },
        ],
      },
      session = randomUUID();
    const root = await readGit(params, session, {
      repositoryId: 'web',
      type: 'history',
      commit: f.rootCommit,
      file: 'a.ts',
    });
    assert.equal(root.snapshots[0].source.view.type, 'history');
    assert.ok(
      root.snapshots.every(
        (s) => s.source.view.type === 'history' && s.source.view.parent === null && !s.source.old,
      ),
    );
    assert.match(root.description, /空树/);
    const compare = await readGit(params, session, {
      repositoryId: 'web',
      type: 'compare',
      base: 'base',
      head: 'HEAD',
      mode: 'branch',
    });
    assert.ok(
      compare.snapshots.every(
        (s) => s.source.view.type === 'compare' && s.source.view.mergeBaseCommit === f.rootCommit,
      ),
    );
    const direct = await readGit(params, session, {
      repositoryId: 'web',
      type: 'compare',
      base: f.feature,
      head: f.rootCommit,
      mode: 'commits',
    });
    assert.match(required(direct.snapshots[0].model.newText), /n = 1/);
    for (const revision of ['--help', 'missing-branch'])
      await assert.rejects(
        readGit(params, session, { repositoryId: 'web', type: 'history', commit: revision }),
      );
    const empty = await readGit(params, session, { repositoryId: 'empty', type: 'history' });
    assert.equal(empty.history?.commits.length, 0);
    await writeFile(join(f.empty, 'new'), 'new\n');
    assert.equal(
      (await readGit(params, session, { repositoryId: 'empty', type: 'changes' })).snapshots.length,
      1,
    );
    const tree = await git(f.repo, 'rev-parse', 'HEAD^{tree}');
    let tip = f.feature;
    for (let i = 0; i < 55; i++)
      tip = await git(f.repo, 'commit-tree', tree, '-p', tip, '-m', `history ${i}`);
    await git(f.repo, 'update-ref', 'refs/heads/main', tip);
    const first = await readGit(params, session, { repositoryId: 'web', type: 'history' });
    assert.equal(first.history?.commits.length, 50);
    assert.equal(first.history?.hasMore, true);
    const newer = await git(f.repo, 'commit-tree', tree, '-p', tip, '-m', 'new tip');
    await git(f.repo, 'update-ref', 'refs/heads/main', newer);
    const next = await readGit(params, session, {
      repositoryId: 'web',
      type: 'history',
      tip: first.history?.tip,
      offset: 50,
    });
    assert.equal(next.history?.tip, tip);
    assert.equal(next.history?.hasMore, false);
    assert.equal(
      new Set(
        [...(first.history?.commits ?? []), ...(next.history?.commits ?? [])].map((c) => c.oid),
      ).size,
      57,
    );
    const side = await git(f.repo, 'commit-tree', tree, '-p', f.rootCommit, '-m', 'side');
    const merge = await git(f.repo, 'commit-tree', tree, '-p', tip, '-p', side, '-m', 'merge');
    const merged = await readGit(params, session, {
      repositoryId: 'web',
      type: 'history',
      commit: merge,
    });
    assert.match(merged.description, /合并提交，只展示第一父/);
    const a = await git(f.repo, 'commit-tree', tree, '-p', f.rootCommit, '-m', 'A'),
      b = await git(f.repo, 'commit-tree', tree, '-p', f.rootCommit, '-m', 'B');
    const m1 = await git(f.repo, 'commit-tree', tree, '-p', a, '-p', b, '-m', 'M1'),
      m2 = await git(f.repo, 'commit-tree', tree, '-p', b, '-p', a, '-m', 'M2');
    await assert.rejects(
      readGit(params, session, {
        repositoryId: 'web',
        type: 'compare',
        mode: 'branch',
        base: m1,
        head: m2,
      }),
      /Multiple merge bases/,
    );
    const orphan = await git(f.repo, 'commit-tree', tree, '-m', 'orphan');
    await assert.rejects(
      readGit(params, session, { repositoryId: 'web', type: 'compare', base: orphan, head: tip }),
      /common ancestor/,
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      readGit(params, session, { repositoryId: 'web', type: 'changes' }, controller.signal),
    );
  } finally {
    await f.close();
  }
});
void test('hunk/line targets reject altered patches and non-source positions', () => {
  const model = createDiffModel('a\nb\n', 'a\nx\n'),
    h = model.hunks[0];
  const ref: GitRef = {
    sourceId: 'x',
    kind: 'hunk',
    oldStart: h.oldStart,
    oldLines: h.oldLines,
    newStart: h.newStart,
    newLines: h.newLines,
    patch: h.patch,
  };
  assert.equal(diffTargetText(model, { ref }), undefined);
  assert.throws(() => diffTargetText(model, { ref: { ...ref, patch: 'fake' } }));
  assert.throws(() =>
    diffTargetText(model, {
      ref: { sourceId: 'x', kind: 'lines', side: 'new', startLine: 1, endLine: 8 },
      text: { start: 0, end: 1, quote: 'a' },
    }),
  );
});
void test('conflicts, gitlinks, invalid UTF-8 and external diff config are represented without content substitution', async () => {
  const f = await fixture();
  try {
    const params = {
        repositories: [
          { id: 'web', path: f.repo },
          { id: 'empty', path: f.empty },
        ],
      },
      session = randomUUID();
    await git(f.repo, 'update-index', '--add', '--cacheinfo', `160000,${f.feature},module`);
    await writeFile(join(f.repo, 'invalid-utf8.txt'), Buffer.from([0xc3, 0x28]));
    await writeFile(join(f.repo, '.gitattributes'), 'a.ts diff=evil\n');
    await git(f.repo, 'config', 'diff.evil.textconv', 'false');
    const normal = await readGit(params, session, { repositoryId: 'web', type: 'changes' });
    const link = normal.snapshots.find((s) => s.source.new?.path === 'module');
    assert.ok(link);
    assert.equal(link.source.new?.type, 'binary');
    assert.ok(link.notes.some((n) => n.includes('Gitlink')));
    assert.equal(
      normal.snapshots.find((s) => s.source.new?.path === 'invalid-utf8.txt')?.source.new?.type,
      'binary',
    );
    assert.ok(
      normal.snapshots.some(
        (s) => s.source.new?.path === 'a.ts' && s.model.newText?.includes('n = 4'),
      ),
    );
    await writeFile(join(f.empty, 'conflict.txt'), 'base\n');
    await git(f.empty, 'add', '.');
    await git(f.empty, 'commit', '-qm', 'base');
    await git(f.empty, 'checkout', '-qb', 'side');
    await writeFile(join(f.empty, 'conflict.txt'), 'side\n');
    await git(f.empty, 'commit', '-qam', 'side');
    await git(f.empty, 'checkout', '-q', 'main');
    await writeFile(join(f.empty, 'conflict.txt'), 'main\n');
    await git(f.empty, 'commit', '-qam', 'main');
    await assert.rejects(git(f.empty, 'merge', 'side', '--no-edit'));
    const conflicted = await readGit(params, session, { repositoryId: 'empty', type: 'changes' });
    const conflict = conflicted.snapshots.filter((s) => s.source.new?.path === 'conflict.txt');
    assert.equal(conflict.length, 1);
    assert.equal(
      conflict[0].source.view.type === 'changes' && conflict[0].source.view.area,
      'unstaged',
    );
    assert.ok(conflict[0].notes.some((n) => n.includes('Unmerged conflict')));
    assert.match(required(conflict[0].model.newText), /<<<<<<< HEAD/);
    assert.equal(conflict[0].source.old, undefined);
  } finally {
    await f.close();
  }
});

void test('repository root paths preserve spaces and trailing newlines', async () => {
  const f = await fixture();
  try {
    const root = join(f.root, 'repo space \n');
    await mkdir(root);
    await git(root, 'init', '-q', '-b', 'main');
    await writeFile(join(root, 'file.txt'), 'content\n');
    const listing = await readGit({ repositories: [{ id: 'odd', path: root }] }, randomUUID(), {
      repositoryId: 'odd',
      type: 'changes',
    });
    assert.equal(listing.snapshots[0].model.newText, 'content\n');
  } finally {
    await f.close();
  }
});

void test('history decorates exact commits with HEAD, local/remote branches and peeled tags', async () => {
  const f = await fixture();
  try {
    await git(f.repo, 'tag', 'v1', f.feature);
    await git(f.repo, 'tag', '-am', 'Reviewed', 'reviewed', f.feature);
    await git(f.repo, 'tag', '-am', 'Nested release', 'nested', 'reviewed');
    const tree = await git(f.repo, 'rev-parse', 'HEAD^{tree}');
    await git(f.repo, 'tag', 'tree-only', tree);
    await git(f.repo, 'tag', '-am', 'Tree', 'annotated-tree', tree);
    await git(f.repo, 'tag', '-am', 'Nested tree', 'nested-tree', 'annotated-tree');
    await git(f.repo, 'update-ref', 'refs/remotes/origin/main', f.feature);
    await git(f.repo, 'tag', 'root-version', f.rootCommit);
    const result = await readGit({ repositories: [{ id: 'repo', path: f.repo }] }, randomUUID(), {
      repositoryId: 'repo',
      type: 'history',
    });
    const tip = required(result.history?.commits.find((commit) => commit.oid === f.feature));
    for (const ref of [
      { kind: 'head', name: 'HEAD' },
      { kind: 'branch', name: 'main' },
      { kind: 'remote', name: 'origin/main' },
      { kind: 'tag', name: 'v1' },
      { kind: 'tag', name: 'reviewed' },
      { kind: 'tag', name: 'nested' },
    ])
      assert.ok(tip.refs.some((actual) => actual.kind === ref.kind && actual.name === ref.name));
    assert.ok(!tip.refs.some((ref) => ref.name.includes('tree')));
    for (const ref of [
      { kind: 'branch', name: 'main', ref: 'refs/heads/main' },
      { kind: 'remote', name: 'origin/main', ref: 'refs/remotes/origin/main' },
      { kind: 'tag', name: 'reviewed', ref: 'refs/tags/reviewed' },
    ])
      assert.ok(
        result.historyRefs?.some(
          (actual) =>
            actual.ref === ref.ref && actual.kind === ref.kind && actual.name === ref.name,
        ),
      );
    assert.ok(!result.historyRefs?.some((ref) => ref.name.includes('tree')));
    const root = required(result.history?.commits.find((commit) => commit.oid === f.rootCommit));
    assert.deepEqual(
      root.refs.filter((ref) => ref.kind === 'tag').map((ref) => ref.name),
      ['root-version'],
    );
    await git(f.repo, 'checkout', '--detach', '-q', 'HEAD');
    const detached = await readGit({ repositories: [{ id: 'repo', path: f.repo }] }, randomUUID(), {
      repositoryId: 'repo',
      type: 'history',
    });
    assert.ok(detached.history?.commits[0].refs.some((ref) => ref.kind === 'head'));
  } finally {
    await f.close();
  }
});

void test('single-branch history preserves complete messages and fixed tips without checking out', async () => {
  const f = await fixture();
  try {
    const params = { repositories: [{ id: 'web', path: f.repo }] },
      session = randomUUID();
    const tree = await git(f.repo, 'rev-parse', `${f.feature}^{tree}`);
    const message =
      'fix(workflow): retain background activity\n\nKeep timers active.\nPreserve <plain text> and 中文.\n\nAdd regression coverage.';
    const topic = await git(f.repo, 'commit-tree', tree, '-p', f.rootCommit, '-m', message);
    await git(f.repo, 'update-ref', 'refs/heads/topic', topic);
    const listing = await readGit(params, session, {
      repositoryId: 'web',
      type: 'history',
      branch: 'topic',
    });
    assert.equal(listing.currentBranch, 'main');
    assert.equal(listing.history?.tip, topic);
    assert.deepEqual(
      listing.history?.commits.map((c) => c.oid),
      [topic, f.rootCommit],
    );
    assert.equal(listing.history?.selectedCommit?.message, message + '\n');
    assert.equal(listing.history?.selectedCommit?.subject, message.split('\n')[0]);
    assert.ok(
      listing.snapshots.every(
        (s) => s.source.view.type === 'history' && s.source.view.commit === topic,
      ),
    );
    const next = await git(f.repo, 'commit-tree', tree, '-p', topic, '-m', 'Advance topic');
    await git(f.repo, 'update-ref', 'refs/heads/topic', next);
    const pinned = await readGit(params, session, {
      repositoryId: 'web',
      type: 'history',
      branch: 'topic',
      tip: topic,
    });
    assert.equal(pinned.history?.commits[0].oid, topic);
    const refreshed = await readGit(params, session, {
      repositoryId: 'web',
      type: 'history',
      branch: 'topic',
    });
    assert.equal(refreshed.history?.commits[0].oid, next);
    assert.equal(await git(f.repo, 'symbolic-ref', '--short', 'HEAD'), 'main');
    assert.equal(await git(f.repo, 'rev-parse', 'HEAD'), f.feature);
    await assert.rejects(
      readGit(params, session, { repositoryId: 'web', type: 'history', branch: '--all' }),
    );
    assert.equal(
      gitReviewParamsSchema.safeParse({
        ...params,
        initialView: { repositoryId: 'web', type: 'history', branch: 'topic' },
      }).success,
      true,
    );
  } finally {
    await f.close();
  }
});
