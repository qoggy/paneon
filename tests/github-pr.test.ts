import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { GitHubReview } from '../skills/paneon/assets/examples/github-pr/github.ts';
import {
  githubPRParamsSchema,
  prFeedbackSubmittedSchema,
} from '../skills/paneon/assets/examples/github-pr/schema.ts';
import { diffAnnotationTargets } from '../skills/paneon/assets/shared/diff-schema.ts';
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
  assert.equal(result.sources.length, 1);
  assert.ok('kind' in result.sources[0]);
  assert.equal(result.sources[0].kind, 'description');
  assert.equal('id' in result.sources[0].annotations[0], false);
  assert.deepEqual(result.sources[0].annotations[0].targets[0], { text: target.text });
  assert.deepEqual(result.sources[0].annotations[0].targets[1].source, checks.snapshots[0].source);
  assert.deepEqual(
    result.sources[0].annotations[0].targets[2].source,
    second.snapshots.find((s) => s.source.kind === 'pull-request')?.source,
  );
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
  assert.deepEqual(result.sources[0].annotations[0].targets[0].text, {
    start: 6,
    end: 11,
    quote: 'n = 2',
  });
  assert.deepEqual(result.sources[0].annotations[0].targets[0], {
    kind: 'lines',
    side: 'new',
    startLine: 2,
    endLine: 2,
    text: { start: 6, end: 11, quote: 'n = 2' },
  });
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
      f.client.feedback(f.repository, f.session, {
        annotations: [
          {
            id: 'large',
            comment: '中'.repeat(66000),
            targets: [{ ref: { sourceId: first.detail.descriptionSourceId, kind: 'description' } }],
          },
        ],
      }),
    /65536/,
  );
  assert.throws(
    () => f.client.feedback(f.repository, f.session, { annotations: [] }),
    /at least one annotation/,
  );
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

void test('fresh PR readers use browser evidence for checks, fixed diffs, review requests and old feedback', async () => {
  const repository = 'example/project';
  const session = randomUUID();
  const read = (args: string[]) => Promise.resolve(routeGh(args, {}));
  const first = await new GitHubReview(read).detail(repository, session, 101);
  const comparison = await new GitHubReview(read)
    .withEvidence(repository, session, { detail: first.detail })
    .comparison(repository, session, first.detail.id);
  const checks = await new GitHubReview(read)
    .withEvidence(repository, session, { detail: first.detail })
    .checks(repository, session, first.detail.id);
  const snapshot = await new GitHubReview(read)
    .withEvidence(repository, session, { detail: first.detail, comparison })
    .diff(repository, session, comparison.id, 'src/a.ts');
  assert.equal(snapshot.model?.newText, code(2));
  const oldBody = first.snapshots.find((value) => value.source.kind === 'description');
  assert.ok(oldBody);
  const overview = first.snapshots.find((value) => value.source.kind === 'pull-request');
  assert.ok(overview);
  const evidence = [oldBody, overview, checks.snapshots[0], snapshot];
  const reader = new GitHubReview(() =>
    Promise.reject(new Error('Feedback must not read current GitHub content.')),
  ).withEvidence(repository, session, { snapshots: evidence });
  const result = reader.feedback(repository, session, {
    annotations: [
      {
        id: 'old',
        comment: '',
        targets: [
          {
            ref: { sourceId: oldBody.id, kind: 'description' },
            text: { start: 0, end: 1, quote: oldBody.body?.slice(0, 1) },
          },
          { ref: { sourceId: checks.snapshots[0].id, kind: 'check' } },
          { ref: { sourceId: overview.id, kind: 'pull-request' } },
          { ref: { sourceId: snapshot.id, kind: 'file' } },
        ],
      },
    ],
  });
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].annotations[0].targets.length, 4);
  assert.deepEqual(result.sources[0].annotations[0].targets[1].source, checks.snapshots[0].source);
  assert.deepEqual(result.sources[0].annotations[0].targets[2].source, overview.source);
  assert.deepEqual(result.sources[0].annotations[0].targets[3].source, snapshot.source);
  assert.throws(
    () =>
      new GitHubReview(read).withEvidence('another/project', session, { snapshots: [overview] }),
    /identity/,
  );
  assert.deepEqual(
    new GitHubReview(read)
      .withEvidence(repository, session, { detail: first.detail })
      .reviewRequest(repository, session, first.detail.id),
    {
      repository,
      number: 101,
      baseCommit: ids.base,
      headCommit: ids.head,
    },
  );
  assert.throws(
    () =>
      new GitHubReview(read).withEvidence(repository, session, {
        snapshots: [{ ...oldBody, body: 'tampered' }],
      }),
    /content hash/,
  );
  assert.throws(
    () =>
      new GitHubReview(read).withEvidence(repository, session, {
        detail: first.detail,
        comparison: { ...comparison, headCommit: ids.base },
      }),
    /preserved detail/,
  );
});

void test('PR feedback preserves local file targets separately from commit-backed PR sources', async () => {
  const f = fixture();
  const detail = await f.client.detail(f.repository, f.session, 101);
  const description = detail.snapshots.find((snapshot) => snapshot.source.kind === 'description');
  assert.ok(description);
  const common = {
    ref: { sourceId: description.id, kind: 'description' },
    sourceRef: { path: '/local.txt', snapshotId: 'local' },
    text: { start: 0, end: 5, quote: 'local' },
  };
  const result = f.client.feedback(f.repository, f.session, {
    annotations: [
      {
        id: 'mixed',
        comment: '',
        targets: [{ ref: { sourceId: description.id, kind: 'description' } }, common],
      },
    ],
  });
  assert.deepEqual(result.sources[0].annotations[0].targets[1], {
    text: common.text,
    source: common.sourceRef,
  });
  assert.ok('kind' in result.sources[0]);
  assert.equal(result.sources[0].kind, 'description');
});

void test('PR description opinions share source metadata and retain heading and cross-paragraph ranges', async () => {
  const f = fixture();
  const detail = await f.client.detail(f.repository, f.session, 101);
  const snapshot = detail.snapshots.find((s) => s.source.kind === 'description');
  assert.ok(snapshot);
  const ranges = [
    { start: 2, end: 7, quote: body().slice(2, 7) },
    { start: 2, end: body().length - 1, quote: body().slice(2, -1) },
  ];
  const draft = {
    annotations: ranges.map((text, index) => ({
      id: `draft-${index}`,
      targets: [{ ref: { sourceId: snapshot.id, kind: 'description' }, text }],
      comment: index ? '跨段意见' : '',
    })),
  };
  const before = structuredClone(draft);
  const result = f.client.feedback(f.repository, f.session, draft);
  assert.deepEqual(result, {
    repository: f.repository,
    sources: [
      {
        ...snapshot.source,
        annotations: ranges.map((text, index) => ({
          targets: [{ text }],
          comment: index ? '跨段意见' : '',
        })),
      },
    ],
  });
  assert.deepEqual(draft, before);
  assert.deepEqual(prFeedbackSubmittedSchema.parse(result), result);
});

void test('PR diff groups old/new text, replacement, addition and deletion opinions without losing coordinates', async () => {
  const f = fixture();
  const detail = await f.client.detail(f.repository, f.session, 101);
  const comparison = await f.client.comparison(f.repository, f.session, detail.detail.id);
  const changed = await f.client.diff(f.repository, f.session, comparison.id, 'src/a.ts');
  const added = await f.client.diff(f.repository, f.session, comparison.id, 'added.txt');
  const deleted = await f.client.diff(f.repository, f.session, comparison.id, 'deleted.txt');
  assert.ok(changed.model);
  assert.ok(added.model);
  assert.ok(deleted.model);
  const refs = diffAnnotationTargets(changed.model, changed.id);
  assert.ok(refs.old);
  assert.ok(refs.new);
  const oldText = {
    start: code(1).indexOf('n = 1'),
    end: code(1).indexOf('n = 1') + 5,
    quote: 'n = 1',
  };
  const newText = {
    start: code(2).indexOf('n = 2'),
    end: code(2).indexOf('n = 2') + 5,
    quote: 'n = 2',
  };
  const oldBlock = {
    start: code(1).indexOf('const n'),
    end: code(1).indexOf('last'),
    quote: 'const n = 1;\r\n',
  };
  const newBlock = {
    start: code(2).indexOf('const n'),
    end: code(2).indexOf('last'),
    quote: 'const n = 2;\r\n',
  };
  const draft = {
    annotations: [
      { id: 'old', comment: '旧侧', targets: [{ ref: refs.old, text: oldText }] },
      { id: 'new', comment: '新侧', targets: [{ ref: refs.new, text: newText }] },
      {
        id: 'replace',
        comment: '一条替换意见',
        targets: [
          { ref: refs.old, text: oldBlock },
          { ref: refs.new, text: newBlock },
        ],
      },
      {
        id: 'add',
        comment: '新增',
        targets: [
          {
            ref: diffAnnotationTargets(added.model, added.id).new,
            text: { start: 0, end: 6, quote: 'added\n' },
          },
        ],
      },
      {
        id: 'delete',
        comment: '删除',
        targets: [
          {
            ref: diffAnnotationTargets(deleted.model, deleted.id).old,
            text: { start: 0, end: 8, quote: 'deleted\n' },
          },
        ],
      },
    ],
  };
  const result = f.client.feedback(f.repository, f.session, draft);
  const line = (side: string, start: number, end: number, quote: string, number = 2) => ({
    kind: 'lines',
    side,
    startLine: number,
    endLine: number,
    text: { start, end, quote },
  });
  assert.deepEqual(result, {
    repository: f.repository,
    sources: [
      {
        ...changed.source,
        annotations: [
          { targets: [line('old', 6, 11, 'n = 1')], comment: '旧侧' },
          { targets: [line('new', 6, 11, 'n = 2')], comment: '新侧' },
          {
            targets: [
              line('old', 0, 14, 'const n = 1;\r\n'),
              line('new', 0, 14, 'const n = 2;\r\n'),
            ],
            comment: '一条替换意见',
          },
        ],
      },
      {
        ...added.source,
        annotations: [{ targets: [line('new', 0, 6, 'added\n', 1)], comment: '新增' }],
      },
      {
        ...deleted.source,
        annotations: [{ targets: [line('old', 0, 8, 'deleted\n', 1)], comment: '删除' }],
      },
    ],
  });
});

void test('PR linked-file opinions share local snapshots without an unresolved description source', async () => {
  const f = fixture();
  await f.client.detail(f.repository, f.session, 101);
  const sourceRef = { path: '/work/request.ts', snapshotId: 'sha256:local' };
  const annotation = (id: string, source = sourceRef) => ({
    id,
    comment: id,
    targets: [
      {
        ref: { sourceId: 'unavailable-description', kind: 'description' },
        sourceRef: source,
        text: { start: 0, end: 5, quote: 'local' },
      },
    ],
  });
  const result = f.client.feedback(f.repository, f.session, {
    annotations: [
      annotation('first'),
      annotation('second'),
      annotation('new-version', { ...sourceRef, snapshotId: 'sha256:new' }),
    ],
  });
  assert.deepEqual(result, {
    repository: f.repository,
    sources: [
      {
        ...sourceRef,
        annotations: ['first', 'second'].map((comment) => ({
          targets: [{ text: { start: 0, end: 5, quote: 'local' } }],
          comment,
        })),
      },
      {
        ...sourceRef,
        snapshotId: 'sha256:new',
        annotations: [
          { targets: [{ text: { start: 0, end: 5, quote: 'local' } }], comment: 'new-version' },
        ],
      },
    ],
  });
});
