import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  buildGitFeedback,
  publicGitFeedback,
  validateGitFeedback,
} from '../skills/paneon/assets/panels/git-review/feedback.ts';
import { createDiffModel, sourceLines } from '../skills/paneon/assets/shared/diff-model.ts';
import type { GitSnapshot } from '../skills/paneon/assets/panels/git-review/git.ts';
import type {
  GitRef,
  GitReviewSubmitted,
} from '../skills/paneon/assets/panels/git-review/schema.ts';
import type { AnnotationTarget } from '../src/sdk/annotation.ts';

const original =
  [
    'const service = "orders";',
    ...Array.from({ length: 10 }, (_, index) => `// context ${index}`),
    'const timeout = 1000;',
    '// tail 1',
    '// tail 2',
    '// tail 3',
    '// outside the hunk',
  ].join('\n') + '\n';
const updated = original.replace('timeout = 1000', 'timeout = 5000');
const hash = (text: string) => 'sha256:' + createHash('sha256').update(text).digest('hex');
function snapshot(oldText = original, newText = updated, rename = false): GitSnapshot {
  const source: GitSnapshot['source'] = {
    repositoryId: 'repo',
    repositoryPath: '/work/demo',
    view: { type: 'changes', area: 'unstaged', headCommit: '1'.repeat(40) },
    old: { path: 'src/request.ts', contentHash: hash(oldText), type: 'text' },
    new: {
      path: rename ? 'src/http/request.ts' : 'src/request.ts',
      contentHash: hash(newText),
      type: 'text',
    },
    evidence: [],
  };
  return {
    id: hash(JSON.stringify(source)),
    fileId: 'file',
    status: 'M',
    notes: [],
    notesUI: [],
    source,
    model: createDiffModel(oldText, newText),
  };
}
function lines(
  s: GitSnapshot,
  side: 'old' | 'new',
  line: number,
  quote?: string,
  occurrence = 0,
): AnnotationTarget<GitRef> {
  const text = sourceLines(s.model[`${side}Text`]!)[line - 1].text;
  const selected = quote ?? text.replace(/\r?\n$/, '');
  let start = -1;
  for (let i = 0; i <= occurrence; i++) start = text.indexOf(selected, start + 1);
  return {
    ref: { sourceId: s.id, kind: 'lines', side, startLine: line, endLine: line },
    text: { start, end: start + selected.length, quote: selected },
  };
}
function submit(snapshots: GitSnapshot[], targets: AnnotationTarget<GitRef>[]) {
  const raw = buildGitFeedback(
    { annotations: [{ id: 'internal-uuid', targets, comment: '请修改这里' }] },
    new Map(snapshots.map((s) => [s.id, s])),
  );
  const checked = validateGitFeedback({ repositories: [{ id: 'repo', path: '/work/demo' }] }, raw);
  const before = structuredClone(checked);
  const result = publicGitFeedback(checked);
  assert.deepEqual(
    checked,
    before,
    'publishing must preserve editable draft identities and original evidence',
  );
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].annotations.length, 1);
  assert.equal(result.files[0].annotations[0].comment, '请修改这里');
  assert.equal('id' in result.files[0].annotations[0], false);
  assert.equal('sources' in result, false);
  assert.equal('repositoryId' in result.files[0], false);
  return result;
}
type Target = GitReviewSubmitted['files'][number]['annotations'][number]['targets'][number];
function selected(target: Target) {
  assert.ok('kind' in target && target.kind === 'lines');
  assert.ok('text' in target);
  return target.text.slice(target.selection.start, target.selection.end);
}

for (const [label, side, line] of [
  ['left unchanged line outside hunk', 'old', 1],
  ['left deleted line inside hunk', 'old', 12],
  ['right unchanged line outside hunk', 'new', 1],
] as const) {
  void test(`agent output preserves ${label} with inline original text`, () => {
    const s = snapshot();
    const target = lines(s, side, line);
    const result = submit([s], [target]);
    const output = result.files[0].annotations[0].targets[0];
    assert.ok('kind' in output && output.kind === 'lines');
    assert.equal(output.side, side);
    assert.equal(output.startLine, line);
    assert.equal(output.endLine, line);
    assert.ok('text' in output);
    assert.equal(output.text, sourceLines(s.model[`${side}Text`]!)[line - 1].text);
    assert.equal(selected(output), target.text!.quote);
    assert.equal('quote' in output.selection, false);
  });
}
void test('agent output preserves a whole hunk once with its unified patch', () => {
  const s = snapshot();
  const { rows: _rows, ...hunk } = s.model.hunks[0];
  const result = submit([s], [{ ref: { sourceId: s.id, kind: 'hunk', ...hunk } }]);
  assert.deepEqual(result.files[0].annotations[0].targets, [{ kind: 'hunk', patch: hunk.patch }]);
});
void test('agent output preserves a partial selection inside an added line', () => {
  const s = snapshot();
  const result = submit([s], [lines(s, 'new', 12, '5000')]);
  const target = result.files[0].annotations[0].targets[0];
  assert.ok('kind' in target && target.kind === 'lines');
  assert.deepEqual(target.selection, { start: 16, end: 20, quote: '5000' });
  assert.equal(selected(target), '5000');
});
void test('agent output preserves a file target and both paths of a rename', () => {
  const s = snapshot(original, updated, true);
  const result = submit([s], [{ ref: { sourceId: s.id, kind: 'file' } }]);
  const file = result.files[0];
  assert.ok('old' in file && 'new' in file);
  assert.equal(file.old?.path, 'src/request.ts');
  assert.equal(file.new?.path, 'src/http/request.ts');
  assert.equal(file.old?.contentHash, hash(original));
  assert.equal(file.new?.contentHash, hash(updated));
  assert.deepEqual(file.annotations[0].targets, [{ kind: 'file' }]);
});
void test('agent output keeps one opinion attached to both sides', () => {
  const s = snapshot();
  const result = submit([s], [lines(s, 'old', 12, '1000'), lines(s, 'new', 12, '5000')]);
  assert.deepEqual(result.files[0].annotations[0].targets.map(selected), ['1000', '5000']);
});
void test('agent output groups opinions by original file snapshot', () => {
  const s = snapshot();
  const raw = buildGitFeedback(
    {
      annotations: [
        { id: 'a', targets: [lines(s, 'old', 1)], comment: 'A' },
        { id: 'b', targets: [lines(s, 'new', 12, '5000')], comment: 'B' },
      ],
    },
    new Map([[s.id, s]]),
  );
  const result = publicGitFeedback(raw);
  assert.equal(result.files.length, 1);
  assert.deepEqual(
    result.files[0].annotations.map((x) => x.comment),
    ['A', 'B'],
  );
});
void test('agent output retains the source of a target in another snapshot', () => {
  const a = snapshot(),
    b = snapshot(original, updated, true);
  const result = submit([a, b], [lines(a, 'old', 12, '1000'), lines(b, 'new', 12, '5000')]);
  const targets = result.files[0].annotations[0].targets;
  assert.equal(targets[1].source?.new?.path, 'src/http/request.ts');
  assert.deepEqual(targets.map(selected), ['1000', '5000']);
});
void test('agent output preserves repeated Unicode selections and CRLF offsets', () => {
  const s = snapshot('重复🙂 重复🙂\r\n', '重复🙂 重复🙂\r\n');
  const target = lines(s, 'new', 1, '重复🙂', 1);
  const result = submit([s], [target]);
  const output = result.files[0].annotations[0].targets[0];
  assert.ok('kind' in output && output.kind === 'lines');
  assert.ok('text' in output);
  assert.equal(output.text, '重复🙂 重复🙂\r\n');
  assert.equal(output.selection.start, 5);
  assert.equal(selected(output), '重复🙂');
});
void test('agent output preserves complete feedback corrections and empty withdrawals', () => {
  const s = snapshot();
  const feedback = buildGitFeedback(
    {
      annotations: [{ id: 'a', targets: [lines(s, 'new', 12)], comment: 'corrected' }],
      replacesEventId: 42,
    },
    new Map([[s.id, s]]),
  );
  assert.equal(publicGitFeedback(feedback).replacesEventId, 42);
  assert.deepEqual(publicGitFeedback({ annotations: [], sources: {}, replacesEventId: 43 }), {
    files: [],
    replacesEventId: 43,
  });
});

void test('agent output retains a partial selection in an unchanged right-side line', () => {
  const s = snapshot();
  const result = submit([s], [lines(s, 'new', 1, 'orders')]);
  const target = result.files[0].annotations[0].targets[0];
  assert.ok('kind' in target && target.kind === 'lines');
  assert.equal(target.side, 'new');
  assert.equal(target.startLine, 1);
  assert.equal(target.selection.quote, 'orders');
  assert.equal(selected(target), 'orders');
});

void test('repeated long source lines are preserved once and remain under the event limit', () => {
  const text = 'a'.repeat(40000) + '\n';
  const s = snapshot(text + 'old\n', text + 'new\n');
  const raw = buildGitFeedback(
    {
      annotations: [0, 1].map((start) => ({
        id: `annotation-${start}`,
        comment: `opinion ${start}`,
        targets: [
          {
            ref: {
              sourceId: s.id,
              kind: 'lines' as const,
              side: 'new' as const,
              startLine: 1,
              endLine: 1,
            },
            text: { start, end: start + 1, quote: 'a' },
          },
        ],
      })),
    },
    new Map([[s.id, s]]),
  );
  const checked = validateGitFeedback({ repositories: [{ id: 'repo', path: '/work/demo' }] }, raw);
  const result = publicGitFeedback(checked);
  const [first, second] = result.files[0].annotations.map((annotation) => annotation.targets[0]);
  assert.ok('kind' in first && first.kind === 'lines' && 'text' in first);
  assert.ok('kind' in second && second.kind === 'lines' && 'textRef' in second);
  assert.equal(first.text, text);
  assert.deepEqual(second.textRef, { file: 0, annotation: 0, target: 0 });
  assert.equal('text' in second, false);
  assert.equal(first.text.slice(second.selection.start, second.selection.end), 'a');
  assert.ok(JSON.stringify(result).length < 65536);
});

void test('shared text references preserve cross-file and multi-target opinion relationships', () => {
  const a = snapshot(),
    b = snapshot(original, updated, true);
  const raw = buildGitFeedback(
    {
      annotations: [
        { id: 'first', comment: 'A', targets: [lines(a, 'new', 1)] },
        { id: 'second', comment: 'B', targets: [lines(b, 'new', 1), lines(a, 'old', 1)] },
      ],
    },
    new Map([
      [a.id, a],
      [b.id, b],
    ]),
  );
  const result = publicGitFeedback(raw);
  assert.equal(result.files.length, 2);
  assert.equal(result.files[1].annotations.length, 1);
  const targets = result.files[1].annotations[0].targets;
  assert.equal(targets.length, 2);
  for (const target of targets) {
    assert.ok('kind' in target && target.kind === 'lines' && 'textRef' in target);
    assert.deepEqual(target.textRef, { file: 0, annotation: 0, target: 0 });
  }
  assert.equal(targets[1].source?.new?.path, 'src/request.ts');
});

void test('the existing size limit measures the published payload, including compact hunks', () => {
  const text = 'a'.repeat(24000) + '\n';
  const s = snapshot(text, text.replace(/^a/, 'b'));
  const { rows: _rows, ...hunk } = s.model.hunks[0];
  const raw = buildGitFeedback(
    {
      annotations: [
        {
          id: 'hunk',
          comment: 'review',
          targets: [{ ref: { sourceId: s.id, kind: 'hunk', ...hunk } }],
        },
      ],
    },
    new Map([[s.id, s]]),
  );
  assert.ok(JSON.stringify(raw).length > 65536);
  const checked = validateGitFeedback({ repositories: [{ id: 'repo', path: '/work/demo' }] }, raw);
  assert.ok(JSON.stringify(publicGitFeedback(checked)).length < 65536);
  assert.throws(
    () =>
      validateGitFeedback(
        { repositories: [{ id: 'repo', path: '/work/demo' }] },
        {
          ...raw,
          annotations: raw.annotations.map((annotation) => ({
            ...annotation,
            comment: 'x'.repeat(65536),
          })),
        },
      ),
    /65536/,
  );
});
