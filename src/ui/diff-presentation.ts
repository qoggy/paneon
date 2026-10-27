import { diffArrays } from 'diff';
import type { DiffLine, DiffRow } from '../shared/diff-model';

export type DiffKind = 'context' | 'modify' | 'add' | 'delete';
/** Half-open UTF-16 offsets within the original line, never rewritten text. */
export type DiffInlineSpan = { start: number; end: number; kind: Exclude<DiffKind, 'context'> };
export type DiffCell = { line: DiffLine; kind: DiffKind; spans: DiffInlineSpan[] };
export type DiffDisplayRow = { old?: DiffCell; new?: DiffCell };

const words = new Intl.Segmenter('en', { granularity: 'word' });
type Match = { old: number; next: number; weight: number; score: number; previous?: Match };

/** Pick the strongest ordered line correspondences on the token diff's chosen edit path.
 * A sparse maximum-weight increasing chain avoids pairing every line by index
 * when, for example, a new comment precedes several modified code lines.
 */
function align(matches: Match[], newCount: number): Match[] {
  const best = Array<Match | undefined>(newCount + 1);
  const query = (end: number) => {
    let result: Match | undefined;
    for (let i = end; i > 0; i -= i & -i)
      if ((best[i]?.score ?? 0) > (result?.score ?? 0)) result = best[i];
    return result;
  };
  for (let start = 0; start < matches.length;) {
    let end = start + 1;
    while (end < matches.length && matches[end].old === matches[start].old) end++;
    // Batch one old line so it cannot match more than one new line.
    for (let i = start; i < end; i++) {
      const match = matches[i];
      match.previous = query(match.next);
      match.score = match.weight + (match.previous?.score ?? 0);
    }
    for (let i = start; i < end; i++)
      for (let j = matches[i].next + 1; j <= newCount; j += j & -j)
        if (matches[i].score > (best[j]?.score ?? 0)) best[j] = matches[i];
    start = end;
  }
  const result: Match[] = [];
  for (let match = query(newCount); match; match = match.previous) result.push(match);
  return result.reverse();
}

function changedBlock(old: DiffLine[], next: DiffLine[]): DiffDisplayRow[] {
  const oldBase = old[0]?.start ?? 0,
    newBase = next[0]?.start ?? 0;
  const oldSpans: DiffInlineSpan[] = [],
    newSpans: DiffInlineSpan[] = [];
  const oldCommon = new Set<DiffLine>(),
    newCommon = new Set<DiffLine>();
  const matches: Match[] = [];
  if (old.length && next.length) {
    const tokenize = (lines: DiffLine[]) =>
      Array.from(words.segment(lines.map((line) => line.text).join('')), (part) => part.segment);
    const left = tokenize(old),
      right = tokenize(next);
    // Keep expensive detail bounded, like the existing line model. An oversized
    // or unrelated block still displays every source line with its block color.
    const parts =
      left.length + right.length <= 20_000
        ? diffArrays(left, right, { maxEditLength: 1024 })
        : undefined;
    let oldOffset = oldBase,
      newOffset = newBase,
      oldIndex = 0,
      newIndex = 0;
    for (let i = 0; parts && i < parts.length;) {
      const part = parts[i];
      if (!part.added && !part.removed) {
        for (const token of part.value) {
          while (oldIndex + 1 < old.length && oldOffset >= old[oldIndex].end) oldIndex++;
          while (newIndex + 1 < next.length && newOffset >= next[newIndex].end) newIndex++;
          const weight = token.trim().length;
          if (weight) {
            oldCommon.add(old[oldIndex]);
            newCommon.add(next[newIndex]);
            const previous = matches.at(-1);
            if (previous?.old === oldIndex && previous.next === newIndex) previous.weight += weight;
            else matches.push({ old: oldIndex, next: newIndex, weight, score: 0 });
          }
          oldOffset += token.length;
          newOffset += token.length;
        }
        i++;
        continue;
      }
      const startOld = oldOffset,
        startNew = newOffset;
      while (i < parts.length && (parts[i].added || parts[i].removed)) {
        const change = parts[i++],
          length = change.value.join('').length;
        if (change.removed) oldOffset += length;
        if (change.added) newOffset += length;
      }
      const kind =
        oldOffset > startOld && newOffset > startNew
          ? 'modify'
          : oldOffset > startOld
            ? 'delete'
            : 'add';
      if (oldOffset > startOld) oldSpans.push({ start: startOld, end: oldOffset, kind });
      if (newOffset > startNew) newSpans.push({ start: startNew, end: newOffset, kind });
    }
  }
  const cell = (
    line: DiffLine | undefined,
    kind: DiffKind,
    spans: DiffInlineSpan[],
  ): DiffCell | undefined =>
    line && {
      line,
      kind,
      spans:
        kind !== 'modify'
          ? []
          : spans
              .filter((span) => span.start < line.end && span.end > line.start)
              .map((span) => ({
                ...span,
                start: Math.max(0, span.start - line.start),
                end: Math.min(line.text.length, span.end - line.start),
              })),
    };
  const result: DiffDisplayRow[] = [];
  let oldIndex = 0,
    newIndex = 0;
  const append = (oldEnd: number, newEnd: number) => {
    while (oldIndex < oldEnd || newIndex < newEnd) {
      const left = oldIndex < oldEnd ? old[oldIndex++] : undefined;
      const right = newIndex < newEnd ? next[newIndex++] : undefined;
      // A wrapped/joined line can retain words on the other side without a 1:1
      // row partner. Keep it modified and retain its local whitespace edits.
      result.push({
        old: cell(left, right || (left && oldCommon.has(left)) ? 'modify' : 'delete', oldSpans),
        new: cell(right, left || (right && newCommon.has(right)) ? 'modify' : 'add', newSpans),
      });
    }
  };
  for (const match of align(matches, next.length)) {
    append(match.old, match.next);
    append(match.old + 1, match.next + 1);
  }
  append(old.length, next.length);
  return result;
}

/** Presentation refines changed blocks; patches and annotation coordinates stay untouched. */
export function diffPresentation(rows: readonly DiffRow[]) {
  const split: DiffDisplayRow[] = [];
  for (let i = 0; i < rows.length;) {
    if (rows[i].kind === 'context') {
      const row = rows[i++];
      split.push({
        old: row.old && { line: row.old, kind: 'context', spans: [] },
        new: row.new && { line: row.new, kind: 'context', spans: [] },
      });
      continue;
    }
    const old: DiffLine[] = [],
      next: DiffLine[] = [];
    while (i < rows.length && rows[i].kind !== 'context') {
      const row = rows[i];
      if (row.old) old.push(row.old);
      if (row.new) next.push(row.new);
      i++;
    }
    split.push(...changedBlock(old, next));
  }
  const cells = new Map<DiffLine, DiffCell>();
  for (const row of split) {
    if (row.old) cells.set(row.old.line, row.old);
    if (row.new) cells.set(row.new.line, row.new);
  }
  const unified = rows.map((row) => {
    const side: 'old' | 'new' = row.kind === 'delete' ? 'old' : 'new';
    return { side, cell: cells.get(row[side] as DiffLine) as DiffCell };
  });
  return { split, unified };
}
