import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { GitHubReview } from '../skills/paneon/assets/examples/github-pr/github.ts';
import { githubPRParamsSchema } from '../skills/paneon/assets/examples/github-pr/schema.ts';
import { resolvePRTarget, safeLink } from '../skills/paneon/assets/examples/github-pr/model.ts';
import { body, code, ids, routeGh } from './github-pr-fixture.ts';
import type { PRFixtureState } from './github-pr-fixture.ts';
function fixture() {
  let state: PRFixtureState = {};
  const calls: string[][] = [];
  const client = new GitHubReview((args, signal) => {
    if (signal?.aborted) return Promise.reject(new Error('aborted'));
    calls.push(args);
    return Promise.resolve(routeGh(args, state));
  });
  return {
    client,
    calls,
    repository: 'example/project',
    session: randomUUID(),
    set(value: PRFixtureState) {
      state = value;
    },
  };
}
void test('PR input is explicit, scoped and rejects option/URL repository injection', () => {
  for (const input of [
    {},
    { repository: '' },
    { repository: '--help' },
    { repository: 'https://github.com/owner/repo' },
    { repository: 'owner/repo/path' },
    { repository: 'owner/repo', initialPullRequest: 0 },
  ])
    assert.equal(githubPRParamsSchema.safeParse(input).success, false);
  assert.deepEqual(
    githubPRParamsSchema.parse({ repository: 'owner/repo', initialPullRequest: 42 }),
    { repository: 'owner/repo', initialPullRequest: 42 },
  );
  assert.equal(safeLink('javascript:alert(1)'), undefined);
  assert.equal(safeLink('https://github.com/example'), 'https://github.com/example');
});
void test('PR list uses growing limits and explicit search/state; no pseudo cursor or writes', async () => {
  const f = fixture();
  const first = await f.client.list(f.repository);
  assert.equal(first.items.length, 30);
  assert.equal(first.hasMore, true);
  const more = await f.client.list(f.repository, { limit: 60, state: 'merged' });
  assert.equal(more.items.length, 31);
  assert.equal(more.hasMore, false);
  assert.equal(more.items[0].state, 'MERGED');
  const searched = await f.client.list(f.repository, {
    limit: 30,
    state: 'closed',
    search: '第二个',
  });
  assert.deepEqual(
    searched.items.map((p) => p.number),
    [202],
  );
  assert.ok(f.calls[1].includes('60'));
  assert.ok(f.calls[2].includes('--search'));
  assert.ok(f.calls.every((args) => args[0] === 'pr' && args[1] === 'list'));
});
void test('description and stable-ID check observations survive same-head changes and cross-PR feedback', async () => {
  const f = fixture(),
    first = await f.client.detail(f.repository, f.session, 101),
    oldBody = first.snapshots.find((s) => s.source.kind === 'description');
  assert.ok(oldBody);
  const checks = await f.client.checks(f.repository, f.session, first.detail.id);
  assert.equal(checks.snapshots.length, 3);
  assert.deepEqual(
    checks.snapshots
      .filter((s) => s.source.kind === 'check')
      .map((s) => s.source.kind === 'check' && s.source.key),
    ['CR_NODE_1', 'CR_NODE_2', 'SC_NODE_1'],
  );
  assert.equal(
    checks.snapshots[0].source.kind === 'check' && checks.snapshots[0].source.conclusion,
    'FAILURE',
  );
  f.set({ version: 1 });
  const refreshed = await f.client.detail(f.repository, f.session, 101),
    newerChecks = await f.client.checks(f.repository, f.session, refreshed.detail.id);
  assert.equal(refreshed.detail.headRefOid, first.detail.headRefOid);
  assert.notEqual(refreshed.detail.descriptionSourceId, first.detail.descriptionSourceId);
  assert.notEqual(newerChecks.snapshots[0].id, checks.snapshots[0].id);
  const second = await f.client.detail(f.repository, f.session, 202),
    start = body().indexOf('缓存', body().indexOf('缓存') + 1);
  const target = {
    ref: { sourceId: oldBody.id, kind: 'description' as const },
    text: { start, end: start + 2, quote: '缓存' },
  };
  const result = f.client.feedback(f.repository, f.session, {
    annotations: [
      {
        id: 'original',
        comment: '',
        targets: [
          target,
          { ref: { sourceId: checks.snapshots[0].id, kind: 'check' } },
          { ref: { sourceId: second.detail.overviewSourceId, kind: 'pull-request' } },
        ],
      },
    ],
  });
  assert.equal(result.annotations[0].id, 'original');
  assert.equal(Object.keys(result.sources).length, 3);
  assert.equal(result.sources[oldBody.id].kind, 'description');
  assert.equal(result.sources[second.detail.overviewSourceId].number, 202);
  assert.equal(resolvePRTarget(oldBody, target), body());
  assert.throws(
    () =>
      f.client.feedback(f.repository, f.session, {
        annotations: [
          {
            id: 'wrong-kind',
            comment: '',
            targets: [{ ref: { sourceId: oldBody.id, kind: 'check' } }],
          },
        ],
      }),
    /kind/,
  );
  assert.throws(
    () =>
      f.client.feedback(f.repository, f.session, {
        annotations: [
          {
            id: 'wrong-text',
            comment: '',
            targets: [{ ...target, text: { start, end: start + 2, quote: '错误' } }],
          },
        ],
      }),
    /Markdown/,
  );
  assert.throws(
    () =>
      f.client.feedback(f.repository, randomUUID(), {
        annotations: [{ id: 'old', comment: '', targets: [target] }],
      }),
    /schema|Unrecognized|snapshot is missing/i,
  );
  assert.deepEqual(f.client.reviewRequest(f.repository, f.session, first.detail.id), {
    repository: f.repository,
    number: 101,
    baseCommit: ids.base,
    headCommit: ids.head,
  });
});
void test('fixed merge-base/head raw blobs generate exact diff, even after head moves', async () => {
  const f = fixture(),
    first = await f.client.detail(f.repository, f.session, 101),
    comparison = await f.client.comparison(f.repository, f.session, first.detail.id);
  assert.equal(comparison.mergeBaseCommit, ids.merge);
  assert.equal(comparison.complete, true);
  assert.equal('patch' in comparison.files[0], false);
  f.set({ headVersion: 1 });
  await f.client.detail(f.repository, f.session, 101);
  const snapshot = await f.client.diff(f.repository, f.session, comparison.id, 'src/a.ts');
  assert.equal(snapshot.model?.oldText, code(1));
  assert.equal(snapshot.model?.newText, code(2));
  assert.equal(snapshot.source.headCommit, ids.head);
  assert.equal(snapshot.source.kind === 'diff' && snapshot.source.mergeBaseCommit, ids.merge);
  const start = code(2).indexOf('n = 2');
  const value = {
    annotations: [
      {
        id: 'line',
        comment: '',
        targets: [
          {
            ref: { sourceId: snapshot.id, kind: 'lines', side: 'new', startLine: 1, endLine: 3 },
            text: { start, end: start + 5, quote: 'n = 2' },
          },
        ],
      },
    ],
  };
  const result = f.client.feedback(f.repository, f.session, value);
  assert.deepEqual(result.annotations[0].targets[0].text, { start: 6, end: 11, quote: 'n = 2' });
  assert.equal(
    result.annotations[0].targets[0].ref.kind === 'lines' &&
      result.annotations[0].targets[0].ref.startLine,
    2,
  );
  const renamed = await f.client.diff(f.repository, f.session, comparison.id, 'src/new name\n.ts');
  assert.equal(renamed.source.kind === 'diff' && renamed.source.old?.path, 'src/old name\n.ts');
  assert.ok(renamed.notes?.some((n) => n.includes('API 未提供 patch')));
  for (const path of ['binary.bin', 'link', 'module', 'invalid.txt']) {
    const special = await f.client.diff(f.repository, f.session, comparison.id, path);
    assert.equal(special.model?.newText, undefined);
    assert.equal(special.source.kind === 'diff' && special.source.new?.type, 'binary');
  }
  const added = await f.client.diff(f.repository, f.session, comparison.id, 'added.txt'),
    removed = await f.client.diff(f.repository, f.session, comparison.id, 'deleted.txt');
  assert.equal(added.source.kind === 'diff' && added.source.old, undefined);
  assert.equal(removed.source.kind === 'diff' && removed.source.new, undefined);
  assert.ok(
    f.calls
      .filter((args) => args[0] === 'api' && args[1] !== 'graphql')
      .every((args) => args.includes('GET')),
  );
  assert.equal(
    f.calls.some((args) => args[0] === 'pr' && args[1] === 'diff'),
    false,
  );
});
void test('coverage, truncated objects, corrupt blobs, absent snapshots and limits fail explicitly', async () => {
  const f = fixture();
  f.set({ coverage: true });
  const first = await f.client.detail(f.repository, f.session, 101),
    comparison = await f.client.comparison(f.repository, f.session, first.detail.id);
  assert.equal(comparison.files.length, 300);
  assert.equal(comparison.reportedFiles, 301);
  assert.equal(comparison.complete, false);
  assert.ok(comparison.notes.some((n) => n.includes('不完整')));
  await assert.rejects(
    f.client.diff(f.repository, f.session, comparison.id, 'not-in-coverage.txt'),
    /coverage/,
  );
  f.set({ truncatedTree: true });
  await assert.rejects(
    f.client.diff(f.repository, f.session, comparison.id, 'src/a.ts'),
    /truncated/,
  );
  const fresh = fixture(),
    d = await fresh.client.detail(fresh.repository, fresh.session, 101),
    c = await fresh.client.comparison(fresh.repository, fresh.session, d.detail.id);
  fresh.set({ corruptBlob: true });
  await assert.rejects(
    fresh.client.diff(fresh.repository, fresh.session, c.id, 'src/a.ts'),
    /incomplete/,
  );
  assert.throws(
    () =>
      f.client.feedback(f.repository, f.session, { annotations: [], comment: '中'.repeat(66000) }),
    /65536/,
  );
  assert.throws(() => f.client.feedback(f.repository, f.session, { annotations: [] }), /选择/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(f.client.list(f.repository, {}, controller.signal), /aborted/);
});
void test('checks page through statusCheckRollup with stable IDs; query failure is separate from FAILURE', async () => {
  const f = fixture();
  f.set({ paginateChecks: true });
  const d = await f.client.detail(f.repository, f.session, 101),
    checks = await f.client.checks(f.repository, f.session, d.detail.id);
  assert.equal(checks.checks.sourceIds.length, 3);
  const queries = f.calls.filter((args) => args[1] === 'graphql');
  assert.equal(queries.length, 2);
  assert.ok(queries[1].includes('after=cursor-1'));
  f.set({ fail: 'checks' });
  await assert.rejects(f.client.checks(f.repository, f.session, d.detail.id), /checks failure/);
});
