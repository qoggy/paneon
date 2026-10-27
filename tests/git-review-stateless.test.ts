import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readGit, readGitFile } from '../skills/paneon/assets/panels/git-review/git.ts';
import {
  buildGitFeedback,
  validateGitFeedback,
} from '../skills/paneon/assets/panels/git-review/feedback.ts';
import {
  gitFileSchema,
  gitRequestSchema,
  gitReviewSubmittedSchema,
} from '../skills/paneon/assets/panels/git-review/schema.ts';
import type { GitRef } from '../skills/paneon/assets/panels/git-review/schema.ts';
import { jsonValue } from '../src/shared/types.ts';
import { fixture, git } from './git-review-fixture.ts';
const execute = promisify(execFile);
void test('Git feedback declares its local file targets without inventing Git source evidence', () => {
  const target = {
    ref: { kind: 'file' as const, sourceId: 'original-git-source' },
    sourceRef: { path: '/notes.md', snapshotId: 'local' },
    text: { start: 0, end: 4, quote: 'note' },
  };
  const event = buildGitFeedback(
    { annotations: [{ id: 'local', comment: 'review', targets: [target] }] },
    new Map(),
  );
  assert.deepEqual(event.annotations[0].targets, [target]);
  assert.deepEqual(event.sources, {});
  assert.deepEqual(
    validateGitFeedback({ repositories: [{ id: 'repo', path: '/repository' }] }, event),
    event,
  );
});
async function fresh<T>(input: unknown, expression: string): Promise<T> {
  const script = `import {readGit,readGitFile} from ${JSON.stringify(new URL('../skills/paneon/assets/panels/git-review/git.ts', import.meta.url).href)};
import {validateGitFeedback} from ${JSON.stringify(new URL('../skills/paneon/assets/panels/git-review/feedback.ts', import.meta.url).href)};
const input=JSON.parse(process.argv[1]);console.log(JSON.stringify(await (${expression})));`;
  return JSON.parse(
    (await execute(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(input)]))
      .stdout,
  ) as T;
}
void test('fresh processes read subsequent file/page and validate retained annotations after worktree changes', async () => {
  const f = await fixture();
  try {
    const params = { repositories: [{ id: 'web', path: f.repo }] };
    const listing = await readGit(params, { repositoryId: 'web', type: 'changes' });
    const descriptor = listing.files.find(
      (file) =>
        file.source.new?.path === 'a.ts' &&
        file.source.view.type === 'changes' &&
        file.source.view.area === 'unstaged',
    )!;
    const displayed = await readGitFile(params, descriptor);
    const text = displayed.model.newText!,
      start = text.indexOf('n = 4');
    const ref: GitRef = {
      sourceId: displayed.id,
      kind: 'lines',
      side: 'new',
      startLine: 1,
      endLine: 3,
    };
    const event = buildGitFeedback(
      {
        annotations: [
          {
            id: 'kept',
            targets: [
              { ref, text: { start, end: start + 5, quote: 'n = 4' } },
              { ref: { sourceId: displayed.id, kind: 'file' } },
            ],
            comment: '原内容',
          },
        ],
        replacesEventId: 42,
      },
      new Map([[displayed.id, displayed]]),
    );
    await writeFile(join(f.repo, 'a.ts'), 'latest disk contents\n');
    const reopened = await fresh<typeof displayed>(
      { params, descriptor },
      'readGitFile(input.params,input.descriptor)',
    );
    assert.equal(reopened.model.newText, 'latest disk contents\n');
    assert.notEqual(reopened.id, displayed.id);
    const checked = await fresh<typeof event>(
      { params, event },
      'validateGitFeedback(input.params,input.event)',
    );
    assert.deepEqual(checked, event);
    assert.equal(checked.replacesEventId, 42);
    const tree = await git(f.repo, 'rev-parse', 'HEAD^{tree}');
    let tip = f.feature;
    for (let i = 0; i < 53; i++)
      tip = await git(f.repo, 'commit-tree', tree, '-p', tip, '-m', `page ${i}`);
    await git(f.repo, 'update-ref', 'refs/heads/main', tip);
    const first = await readGit(params, {
      repositoryId: 'web',
      type: 'history',
      commit: f.feature,
    });
    const newer = await git(f.repo, 'commit-tree', tree, '-p', tip, '-m', 'newer');
    await git(f.repo, 'update-ref', 'refs/heads/main', newer);
    jsonValue(first);
    assert.equal(
      gitRequestSchema.safeParse({ repositoryId: 'web', type: 'history', offset: 50 }).success,
      false,
    );
    assert.equal(
      gitRequestSchema.safeParse({ repositoryId: 'web', type: 'changes', pageOnly: true }).success,
      false,
    );
    const request = {
      repositoryId: 'web',
      type: 'history',
      historyContext: first.historyContext,
      offset: 50,
      pageOnly: true,
    };
    const next = await fresh<typeof first>(
      { params, request },
      'readGit(input.params,input.request)',
    );
    jsonValue(await readGit(params, { ...request, type: 'history' }));
    assert.equal(next.history?.tip, tip);
    assert.equal(next.history?.commits.length, 5);
    assert.equal(next.files.length, 0);
    assert.ok(!next.history?.commits.some((commit) => commit.oid === newer));
    const file = first.files[0];
    assert.ok(file);
    const later = await fresh<typeof displayed>(
      { params, descriptor: file },
      'readGitFile(input.params,input.descriptor)',
    );
    assert.equal(later.fileId, file.id);
    assert.ok(
      JSON.stringify(request).length < 500,
      'Cursor carries fixed revisions, not catalog/session lookup keys.',
    );
  } finally {
    await f.close();
  }
});
void test('line/character/hunk/file evidence is deduplicated and strictly internally consistent', async () => {
  const f = await fixture();
  try {
    const params = { repositories: [{ id: 'web', path: f.repo }] };
    const listing = await readGit(params, { repositoryId: 'web', type: 'changes' });
    const file = listing.files.find(
      (file) =>
        file.source.new?.path === 'a.ts' &&
        file.source.view.type === 'changes' &&
        file.source.view.area === 'unstaged',
    )!;
    const snapshot = await readGitFile(params, file),
      h = snapshot.model.hunks[0];
    const hunk: GitRef = {
      kind: 'hunk',
      sourceId: snapshot.id,
      oldStart: h.oldStart,
      oldLines: h.oldLines,
      newStart: h.newStart,
      newLines: h.newLines,
      patch: h.patch,
    };
    const line: GitRef = {
      kind: 'lines',
      sourceId: snapshot.id,
      side: 'new',
      startLine: 2,
      endLine: 2,
    };
    const target = { ref: line, text: { start: 6, end: 11, quote: 'n = 4' } };
    const event = buildGitFeedback(
      {
        annotations: [
          {
            id: 'a',
            comment: '',
            targets: [
              { ref: hunk },
              { ref: { sourceId: snapshot.id, kind: 'file' } },
              target,
              target,
            ],
          },
          { id: 'b', comment: 'again', targets: [target] },
        ],
      },
      new Map([[snapshot.id, snapshot]]),
    );
    assert.equal(event.annotations[0].targets.length, 3);
    assert.equal(event.sources[snapshot.id].evidence.length, 2);
    assert.deepEqual(validateGitFeedback(params, event), event);
    const rejects = (mutate: (next: typeof event) => void) => {
      const next = structuredClone(event);
      mutate(next);
      assert.throws(() => validateGitFeedback(params, next));
    };
    rejects((next) => {
      delete next.sources[snapshot.id];
    });
    rejects((next) => {
      next.sources[snapshot.id].repositoryId = 'unknown';
    });
    rejects((next) => {
      next.sources[snapshot.id].new!.path = '../outside';
    });
    rejects((next) => {
      next.sources[snapshot.id].new!.contentHash = 'invalid';
    });
    rejects((next) => {
      next.sources[snapshot.id].new!.type = 'binary';
    });
    rejects((next) => {
      next.sources[snapshot.id].evidence.push(next.sources[snapshot.id].evidence[0]);
    });
    rejects((next) => {
      const e = next.sources[snapshot.id].evidence.find((item) => item.kind === 'lines')!;
      e.text = 'not original\n';
    });
    rejects((next) => {
      next.annotations[0].targets[2].text!.quote = 'false';
    });
    rejects((next) => {
      next.annotations[0].targets[1].text = { start: 0, end: 1, quote: 'x' };
    });
    rejects((next) => {
      const e = next.sources[snapshot.id].evidence.find((item) => item.kind === 'hunk')!;
      if (e.kind === 'hunk') e.oldText = 'false';
    });
    rejects((next) => {
      const e = next.sources[snapshot.id].evidence.find((item) => item.kind === 'hunk')!;
      if (e.kind === 'hunk') e.patch = e.patch.replace('@@', 'bad');
    });
    rejects((next) => {
      const e = next.sources[snapshot.id].evidence.find((item) => item.kind === 'lines')!;
      if (e.kind === 'lines') e.endLine++;
    });
    assert.throws(
      () =>
        validateGitFeedback(params, {
          ...event,
          annotations: event.annotations.map((entry) => ({ ...entry, comment: 'x'.repeat(65536) })),
        }),
      /65536/,
    );
    assert.deepEqual(
      validateGitFeedback(params, { annotations: [], sources: {}, replacesEventId: 42 }),
      { annotations: [], sources: {}, replacesEventId: 42 },
    );
    assert.equal(
      gitReviewSubmittedSchema.safeParse({ ...event, replacesEventId: -1 }).success,
      false,
    );
    const malformed = structuredClone(file);
    malformed.read.entry.newPath = '../outside';
    assert.equal(gitFileSchema.safeParse(malformed).success, false);
    const unicode = structuredClone(event),
      source = unicode.sources[snapshot.id];
    source.evidence = [{ kind: 'lines', side: 'new', startLine: 1, endLine: 1, text: 'a🙂b\n' }];
    unicode.annotations = [
      {
        id: 'unicode',
        comment: '',
        targets: [
          {
            ref: { sourceId: snapshot.id, kind: 'lines', side: 'new', startLine: 1, endLine: 1 },
            text: { start: 1, end: 3, quote: '🙂' },
          },
        ],
      },
    ];
    assert.doesNotThrow(() => validateGitFeedback(params, unicode));
    unicode.annotations[0].targets[0].text = { start: 1, end: 2, quote: '\ud83d' };
    assert.throws(() => validateGitFeedback(params, unicode), /grapheme/);
  } finally {
    await f.close();
  }
});
