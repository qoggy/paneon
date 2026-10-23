import type { Feedback, FeedbackTarget } from 'paneon/sdk';
import { sourceLines } from '../../shared/diff-model.ts';
import { diffTargetText, normalizeDiffTarget } from '../../shared/diff-schema.ts';
import type { GitSnapshot } from './git.ts';
import { gitReviewParamsSchema, gitReviewSubmittedSchema } from './schema.ts';
import type { GitRef, GitReviewParams, GitReviewSubmitted, GitReviewSource } from './schema.ts';

type Evidence = GitReviewSource['evidence'][number];
/** Build only the source fragments required by this explicit submission. Browser memory owns them. */
export function buildGitFeedback(
  feedback: Feedback<GitRef> & { replacesEventId?: number },
  snapshots: ReadonlyMap<string, GitSnapshot>,
): GitReviewSubmitted {
  const sources: Record<string, GitReviewSource> = {};
  const annotations = feedback.annotations.map((annotation) => {
    const targets = annotation.targets.map((target) => {
      const snapshot = snapshots.get(target.ref.sourceId);
      if (!snapshot) throw new Error('Original snapshot is missing. Draft retained.');
      diffTargetText(snapshot.model, target);
      const normalized = normalizeDiffTarget(snapshot.model, target);
      const ref = normalized.ref;
      const source = (sources[snapshot.id] ??= { ...snapshot.source, evidence: [] });
      let evidence: Evidence | undefined;
      if (ref.kind === 'lines') {
        evidence = {
          kind: 'lines',
          side: ref.side,
          startLine: ref.startLine,
          endLine: ref.endLine,
          text: diffTargetText(snapshot.model, normalized)!,
        };
      } else if (ref.kind === 'hunk') {
        const hunk = snapshot.model.hunks.find((h) => h.patch === ref.patch)!;
        evidence = {
          kind: 'hunk',
          oldStart: ref.oldStart,
          oldLines: ref.oldLines,
          newStart: ref.newStart,
          newLines: ref.newLines,
          patch: ref.patch,
          oldText: hunk.rows.flatMap((row) => (row.old ? [row.old.text] : [])).join(''),
          newText: hunk.rows.flatMap((row) => (row.new ? [row.new.text] : [])).join(''),
        };
      }
      if (
        evidence &&
        !source.evidence.some((item) => JSON.stringify(item) === JSON.stringify(evidence))
      )
        source.evidence.push(evidence);
      return normalized;
    });
    return {
      ...annotation,
      targets: [...new Map(targets.map((target) => [JSON.stringify(target), target])).values()],
    };
  });
  return gitReviewSubmittedSchema.parse({ ...feedback, annotations, sources });
}
function checkHunk(evidence: Extract<Evidence, { kind: 'hunk' }>) {
  const header = `@@ -${evidence.oldStart},${evidence.oldLines} +${evidence.newStart},${evidence.newLines} @@\n`;
  if (!evidence.patch.startsWith(header)) throw new Error('Hunk header does not match its range.');
  const lines = evidence.patch.slice(header.length).match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const old: string[] = [],
    next: string[] = [];
  let last: string | undefined,
    changed = false;
  for (const line of lines) {
    if (line === '\\ No newline at end of file\n') {
      if (!last) throw new Error('Invalid hunk newline marker.');
      if (last !== '+') old[old.length - 1] = old.at(-1)!.slice(0, -1);
      if (last !== '-') next[next.length - 1] = next.at(-1)!.slice(0, -1);
      last = undefined;
      continue;
    }
    const kind = line[0];
    if (![' ', '-', '+'].includes(kind) || !line.endsWith('\n'))
      throw new Error('Invalid hunk patch.');
    if (kind !== '+') old.push(line.slice(1));
    if (kind !== '-') next.push(line.slice(1));
    changed ||= kind !== ' ';
    last = kind;
  }
  if (
    !changed ||
    old.length !== evidence.oldLines ||
    next.length !== evidence.newLines ||
    old.join('') !== evidence.oldText ||
    next.join('') !== evidence.newText ||
    sourceLines(evidence.oldText).length !== evidence.oldLines ||
    sourceLines(evidence.newText).length !== evidence.newLines ||
    (evidence.oldLines > 0 && evidence.oldStart < 1) ||
    (evidence.newLines > 0 && evidence.newStart < 1)
  )
    throw new Error('Hunk patch does not match its preserved fragments.');
}
function validateTarget(source: GitReviewSource, target: FeedbackTarget<GitRef>) {
  const ref = target.ref;
  if (ref.kind === 'file') {
    if (target.text) throw new Error('File targets cannot carry text.');
    return;
  }
  if (source.old?.type === 'binary' || source.new?.type === 'binary')
    throw new Error('Binary sources only support file targets.');
  if (ref.kind === 'hunk') {
    if (target.text) throw new Error('Hunk targets cannot carry text.');
    const evidence = source.evidence.find(
      (item) =>
        item.kind === 'hunk' &&
        item.oldStart === ref.oldStart &&
        item.oldLines === ref.oldLines &&
        item.newStart === ref.newStart &&
        item.newLines === ref.newLines &&
        item.patch === ref.patch,
    );
    if (!evidence) throw new Error('Missing preserved hunk evidence.');
    return;
  }
  const evidence = source.evidence.find(
    (item) =>
      item.kind === 'lines' &&
      item.side === ref.side &&
      item.startLine === ref.startLine &&
      item.endLine === ref.endLine,
  );
  if (!source[ref.side] || !evidence || evidence.kind !== 'lines')
    throw new Error('Missing preserved line evidence.');
  // Reuse UTF-16 quote and complete grapheme validation against just the supplied range.
  diffTargetText(
    { [`${ref.side}Text`]: evidence.text, rows: [], hunks: [] },
    {
      ...target,
      ref: { ...ref, startLine: 1, endLine: ref.endLine - ref.startLine + 1 },
    },
  );
}
/** Pure validation: current event + fixed panel configuration, no Git/filesystem/cache lookup. */
export function validateGitFeedback(
  paramsValue: GitReviewParams,
  value: unknown,
): GitReviewSubmitted {
  const params = gitReviewParamsSchema.parse(paramsValue);
  const result = gitReviewSubmittedSchema.parse(value);
  for (const source of Object.values(result.sources)) {
    if (!params.repositories.some((repository) => repository.id === source.repositoryId))
      throw new Error('Unknown source repository.');
    const identities = new Set<string>();
    const sideLines = { old: new Map<number, string>(), new: new Map<number, string>() };
    const addLines = (side: 'old' | 'new', start: number, text: string) => {
      if (text && source[side]?.type !== 'text')
        throw new Error('Evidence requires a text source side.');
      sourceLines(text).forEach((line, index) => {
        const previous = sideLines[side].get(start + index);
        if (previous !== undefined && previous !== line.text)
          throw new Error('Conflicting preserved evidence.');
        sideLines[side].set(start + index, line.text);
      });
    };
    for (const evidence of source.evidence) {
      const identity = JSON.stringify(evidence);
      if (identities.has(identity)) throw new Error('Duplicate preserved evidence.');
      identities.add(identity);
      if (evidence.kind === 'lines') {
        if (
          evidence.endLine < evidence.startLine ||
          sourceLines(evidence.text).length !== evidence.endLine - evidence.startLine + 1
        )
          throw new Error('Evidence line count does not match its range.');
        addLines(evidence.side, evidence.startLine, evidence.text);
      } else {
        checkHunk(evidence);
        addLines('old', evidence.oldStart, evidence.oldText);
        addLines('new', evidence.newStart, evidence.newText);
      }
    }
  }
  for (const annotation of result.annotations)
    for (const target of annotation.targets) {
      const source = result.sources[target.ref.sourceId];
      if (!source) throw new Error('Missing original source. Draft retained.');
      validateTarget(source, target);
    }
  if (JSON.stringify(result).length > 65536)
    throw new Error(
      'Feedback exceeds the 65536-character event limit. Draft retained; reduce selected content or annotations.',
    );
  return result;
}
