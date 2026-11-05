import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readGit, readGitAuthors } from '#test-skill/assets/panels/git-review/git.ts';
import { projectHistory } from '#test-skill/assets/panels/git-review/history-filter.ts';
import { layoutGitGraph } from '#test-skill/assets/panels/git-review/graph.ts';
import { fixture, git } from './git-review-fixture.ts';

void test('history searches the entire message and pages matching commits at a fixed tip', async () => {
  const f = await fixture();
  try {
    const params = { repositories: [{ id: 'web', path: f.repo }] };
    const tree = await git(f.repo, 'rev-parse', 'HEAD^{tree}');
    const body = await git(
      f.repo,
      'commit-tree',
      tree,
      '-p',
      f.feature,
      '-m',
      'Old subject\n\nbody-only-token',
    );
    let tip = body;
    const ids = [];
    for (let i = 0; i < 63; i++) {
      tip = await git(f.repo, 'commit-tree', tree, '-p', tip, '-m', `Needle ${i}`);
      ids.unshift(tip);
    }
    await git(f.repo, 'update-ref', 'refs/heads/main', tip);
    const request = {
      repositoryId: 'web',
      type: 'history' as const,
      historyFilter: { text: 'needle' },
    };
    const first = await readGit(params, request);
    assert.equal(first.history?.commits.length, 50);
    assert.equal(first.history?.hasMore, true);
    assert.equal(first.history?.selectedCommit, undefined);
    const newer = await git(f.repo, 'commit-tree', tree, '-p', tip, '-m', 'Needle newer');
    await git(f.repo, 'update-ref', 'refs/heads/main', newer);
    const next = await readGit(params, {
      ...request,
      historyContext: first.historyContext,
      offset: 50,
      pageOnly: true,
    });
    assert.equal(next.history?.hasMore, false);
    assert.deepEqual(
      [...first.history.commits, ...next.history.commits].map((c) => c.oid),
      ids,
    );
    const bodyOnly = await readGit(params, {
      ...request,
      historyContext: first.historyContext,
      historyFilter: { text: 'body-only-token' },
    });
    assert.deepEqual(
      bodyOnly.history?.commits.map((c) => c.oid),
      [body],
    );
    assert.match(bodyOnly.history.commits[0].matchedMessage ?? '', /body-only-token/);
    const cleared = await readGit(params, {
      ...request,
      historyContext: bodyOnly.historyContext,
      historyFilter: {},
      pageOnly: true,
    });
    assert.equal(cleared.history?.commits[0].oid, tip);
    assert.equal(cleared.history?.selectedCommit, undefined);
  } finally {
    await f.close();
  }
});

void test('literal, ERE, match-case and hash OR text matching have distinct semantics', async () => {
  const f = await fixture();
  try {
    const params = { repositories: [{ id: 'web', path: f.repo }] };
    const tree = await git(f.repo, 'rev-parse', 'HEAD^{tree}');
    const dotted = await git(f.repo, 'commit-tree', tree, '-p', f.feature, '-m', 'Token.Foo');
    const plain = await git(f.repo, 'commit-tree', tree, '-p', dotted, '-m', 'TokenXFoo');
    const mixed = await git(
      f.repo,
      'commit-tree',
      tree,
      '-p',
      plain,
      '-m',
      `prefix ${dotted.slice(0, 8)}`,
    );
    await git(f.repo, 'update-ref', 'refs/heads/main', mixed);
    const search = async (
      historyFilter: { text: string; regex?: boolean; matchCase?: boolean },
      branch?: string,
    ) => {
      const result = await readGit(params, {
        repositoryId: 'web',
        type: 'history',
        historyFilter,
        branch,
      });
      assert.ok(result.history);
      return result.history.commits.map((c) => c.oid);
    };
    assert.deepEqual(await search({ text: 'token.foo' }), [dotted]);
    assert.deepEqual(await search({ text: 'token.foo', matchCase: true }), []);
    assert.deepEqual(await search({ text: '^Token.Foo$', regex: true }), [plain, dotted]);
    assert.deepEqual(await search({ text: dotted.slice(0, 8) }), [mixed, dotted]);
    assert.deepEqual(await search({ text: dotted }), [dotted]);
    assert.deepEqual(await search({ text: dotted }, 'base'), []);
    const scoped = await readGit(params, {
      repositoryId: 'web',
      type: 'history',
      branch: 'base',
      historyFilter: { text: 'root' },
    });
    const retained = await readGit(params, {
      repositoryId: 'web',
      type: 'history',
      historyContext: scoped.historyContext,
      historyFilter: { text: 'root' },
    });
    assert.equal(retained.historyContext?.branch, 'base');
    await assert.rejects(search({ text: '[', regex: true }), /Git query failed/);
    assert.equal((await search({ text: 'Token', matchCase: true })).length, 2);
  } finally {
    await f.close();
  }
});

void test('author candidates include the complete branch and distinguish names, emails and me', async () => {
  const f = await fixture();
  try {
    const params = { repositories: [{ id: 'web', path: f.repo }] };
    const tree = await git(f.repo, 'rev-parse', 'HEAD^{tree}');
    const commit = (parent: string, email: string, message: string, name = 'Alex') =>
      git(
        f.repo,
        '-c',
        `user.name=${name}`,
        '-c',
        `user.email=${email}`,
        'commit-tree',
        tree,
        '-p',
        parent,
        '-m',
        message,
      );
    const a = await commit(f.feature, 'a@example.test', 'Needle Alice');
    const b = await commit(a, 'b@example.test', 'Needle Bob');
    const alias = await commit(b, 'a@example.test', 'Needle alias', 'Another name');
    await git(f.repo, 'update-ref', 'refs/heads/main', alias);
    await git(f.repo, 'config', 'user.email', 'a@example.test');
    const catalog = await readGitAuthors(params, 'web', alias);
    assert.equal(catalog.me, 'a@example.test');
    assert.ok(
      catalog.authors.some((author) => author.name === 'Alex' && author.email === 'a@example.test'),
    );
    assert.ok(
      catalog.authors.some((author) => author.name === 'Alex' && author.email === 'b@example.test'),
    );
    const me = await readGit(params, {
      repositoryId: 'web',
      type: 'history',
      historyFilter: { text: 'Needle', author: 'me' },
    });
    assert.deepEqual(
      me.history?.commits.map((c) => c.oid),
      [alias, a],
    );
    const exact = await readGit(params, {
      repositoryId: 'web',
      type: 'history',
      historyFilter: { text: 'needle', author: { name: 'Alex', email: 'b@example.test' } },
    });
    assert.deepEqual(
      exact.history?.commits.map((c) => c.oid),
      [b],
    );
    assert.deepEqual(
      (
        await readGit(params, {
          repositoryId: 'web',
          type: 'history',
          historyFilter: { text: 'Alice', author: { name: 'Alex', email: 'b@example.test' } },
        })
      ).history?.commits,
      [],
    );
    assert.deepEqual((await readGitAuthors(params, 'web', f.feature)).authors, [
      { name: 'Fixture', email: 'fixture@example.test' },
    ]);
    await git(f.repo, 'config', 'user.email', '');
    assert.equal((await readGitAuthors(params, 'web', alias)).me, '');
    assert.deepEqual(
      (
        await readGit(params, {
          repositoryId: 'web',
          type: 'history',
          historyFilter: { author: 'me' },
        })
      ).history?.commits,
      [],
    );
  } finally {
    await f.close();
  }
});

void test('filtered merge history retains real parents and contracts hidden ancestry across pages', async () => {
  const f = await fixture();
  try {
    const params = { repositories: [{ id: 'web', path: f.repo }] };
    const tree = await git(f.repo, 'rev-parse', 'HEAD^{tree}');
    const base = await git(f.repo, 'commit-tree', tree, '-p', f.feature, '-m', 'keep base');
    const left = await git(f.repo, 'commit-tree', tree, '-p', base, '-m', 'hidden left');
    const right = await git(f.repo, 'commit-tree', tree, '-p', base, '-m', 'keep right');
    const merge = await git(
      f.repo,
      'commit-tree',
      tree,
      '-p',
      left,
      '-p',
      right,
      '-m',
      'keep merge',
    );
    const hiddenTip = await git(f.repo, 'commit-tree', tree, '-p', merge, '-m', 'hidden tip');
    const tip = await git(f.repo, 'commit-tree', tree, '-p', hiddenTip, '-m', 'keep tip');
    await git(f.repo, 'update-ref', 'refs/heads/main', tip);
    const listing = await readGit(params, {
      repositoryId: 'web',
      type: 'history',
      historyFilter: { text: 'keep' },
    });
    assert.ok(listing.history);
    const commits = listing.history.commits;
    const displayedMerge = commits.find((commit) => commit.oid === merge);
    assert.ok(displayedMerge);
    assert.deepEqual(displayedMerge.parents, [left, right]);
    assert.deepEqual(displayedMerge.graphParents, [right]);
    assert.deepEqual(displayedMerge.indirectParents, []);
    assert.deepEqual(commits[0].graphParents, [merge]);
    assert.deepEqual(commits[0].indirectParents, [merge]);
    assert.ok(commits[0].refs.some((ref) => ref.kind === 'head'));
    const full = layoutGitGraph(commits);
    assert.ok(full.rows[0].strokes.some((edge) => edge.kind === 'outgoing' && edge.dashed));
    assert.deepEqual(layoutGitGraph(commits.slice(0, 1)).rows, full.rows.slice(0, 1));
    const detail = await readGit(params, {
      repositoryId: 'web',
      type: 'history',
      historyFilter: { text: 'keep' },
      historyContext: listing.historyContext,
      commit: merge,
      parent: left,
    });
    assert.deepEqual(detail.history?.selectedCommit?.parents, [left, right]);
    assert.equal(detail.history?.commits.length, 0);
  } finally {
    await f.close();
  }
});

void test('hidden merge ladders do not fan a single history into every older matched ancestor', () => {
  const length = 80;
  const nodes = [
    { oid: 'tip', parents: ['merge0'] },
    ...Array.from({ length }, (_, i) => ({
      oid: `merge${i}`,
      parents: [`a${i}`, ...(i + 1 < length ? [`merge${i + 1}`] : [])],
    })),
    ...Array.from({ length }, (_, i) => ({
      oid: `a${i}`,
      parents: i + 1 < length ? [`a${i + 1}`] : [],
    })),
  ];
  const matches = new Set(['tip', ...Array.from({ length }, (_, i) => `a${i}`)]);
  const edges = projectHistory(nodes, matches);
  assert.deepEqual(edges.get('tip'), { graphParents: ['a0'], indirectParents: ['a0'] });
  const commits = nodes
    .filter((node) => matches.has(node.oid))
    .map((node) => ({ ...node, ...edges.get(node.oid) }));
  assert.equal(layoutGitGraph(commits).lanes, 1);
  assert.deepEqual(
    layoutGitGraph(commits.slice(0, 50)).rows,
    layoutGitGraph(commits).rows.slice(0, 50),
  );
});

void test('independent filtered branches and real merge parents remain distinct', () => {
  const nodes = [
    { oid: 'tip', parents: ['hidden'] },
    { oid: 'hidden', parents: ['left', 'right'] },
    { oid: 'left', parents: ['base'] },
    { oid: 'right', parents: ['base'] },
    { oid: 'base', parents: [] },
  ];
  const edges = projectHistory(nodes, new Set(['tip', 'left', 'right', 'base']));
  assert.deepEqual(edges.get('tip'), {
    graphParents: ['left', 'right'],
    indirectParents: ['left', 'right'],
  });
  const realMerge = [{ oid: 'merge', parents: ['left', 'base'] }, ...nodes.slice(2)];
  assert.deepEqual(
    projectHistory(realMerge, new Set(['merge', 'left', 'base'])).get('merge')?.graphParents,
    ['left', 'base'],
  );
});

void test('projection handles long hidden paths without recursion and never invents sibling ancestry', () => {
  const nodes = Array.from({ length: 12000 }, (_, i) => ({
    oid: `c${i}`,
    parents: i === 11999 ? [] : [`c${i + 1}`],
  }));
  const edges = projectHistory(nodes, new Set(['c0', 'c11999']));
  assert.deepEqual(edges.get('c0'), { graphParents: ['c11999'], indirectParents: ['c11999'] });
  assert.deepEqual(
    projectHistory(
      [
        { oid: 'a', parents: ['root'] },
        { oid: 'b', parents: ['root'] },
        { oid: 'root', parents: [] },
      ],
      new Set(['a', 'b']),
    ).get('a')?.graphParents,
    [],
  );
});

void test('projection preserves visible reachability through varied hidden forks and merges', () => {
  let seed = 41411;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  for (let sample = 0; sample < 30; sample++) {
    const nodes = Array.from({ length: 80 }, (_, index) => ({
      oid: `c${index}`,
      parents:
        index === 79
          ? []
          : [
              ...new Set(
                Array.from(
                  { length: 1 + (random() % 3) },
                  () => `c${index + 1 + (random() % (79 - index))}`,
                ),
              ),
            ],
    }));
    const matches = new Set(nodes.filter(() => random() % 3 === 0).map((node) => node.oid));
    const raw = new Map(nodes.map((node) => [node.oid, node.parents]));
    const projected = projectHistory(nodes, matches);
    const reachable = (start: string, parents: (oid: string) => string[]) => {
      const visited = new Set<string>();
      const pending = [...parents(start)];
      while (pending.length) {
        const oid = pending.pop() as string;
        if (visited.has(oid)) continue;
        visited.add(oid);
        pending.push(...parents(oid));
      }
      return [...visited].filter((oid) => matches.has(oid)).sort();
    };
    for (const oid of matches)
      assert.deepEqual(
        reachable(oid, (id) => projected.get(id)?.graphParents ?? []),
        reachable(oid, (id) => raw.get(id) ?? []),
      );
  }
});
