/** Source coordinates refer to unmodified UTF-16 text, including CRLF. */
export type DiffLine = { text: string; start: number; end: number; number: number };
export type DiffRow = { kind: 'context' | 'delete' | 'add'; old?: DiffLine; new?: DiffLine };
export type DiffHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  patch: string;
  rows: DiffRow[];
};
export type DiffModel = {
  oldText?: string;
  newText?: string;
  rows: DiffRow[];
  hunks: DiffHunk[];
};
export function sourceLines(text: string): DiffLine[] {
  let start = 0;
  return (text.match(/[^\n]*\n|[^\n]+$/g) ?? []).map((part, index) => {
    const line = { text: part, start, end: start + part.length, number: index + 1 };
    start = line.end;
    return line;
  });
}
// Myers shortest edit path. Bound trace memory for unrelated files; a coarse
// replacement is still exact and never omits content from either side.
function operations(a: DiffLine[], b: DiffLine[]): DiffRow[] {
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix].text === b[prefix].text) prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix].text === b[b.length - 1 - suffix].text
  )
    suffix++;
  const left = a.slice(prefix, a.length - suffix),
    right = b.slice(prefix, b.length - suffix);
  const trace: Map<number, number>[] = [];
  let frontier = new Map<number, number>([[1, 0]]),
    distance = -1,
    cells = 0;
  outer: for (let d = 0; d <= left.length + right.length; d++) {
    cells += 2 * d + 1;
    if (cells > 1_000_000) break;
    trace.push(new Map(frontier));
    const next = new Map<number, number>();
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && (frontier.get(k - 1) ?? -1) < (frontier.get(k + 1) ?? -1))
          ? (frontier.get(k + 1) ?? 0)
          : (frontier.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < left.length && y < right.length && left[x].text === right[y].text) {
        x++;
        y++;
      }
      next.set(k, x);
      if (x >= left.length && y >= right.length) {
        distance = d;
        break outer;
      }
    }
    frontier = next;
  }
  const middle: DiffRow[] = [];
  if (distance < 0)
    middle.push(
      ...left.map((old): DiffRow => ({ kind: 'delete', old })),
      ...right.map((value): DiffRow => ({ kind: 'add', new: value })),
    );
  else {
    let x = left.length,
      y = right.length;
    for (let d = distance; d >= 0; d--) {
      const v = trace[d],
        k = x - y;
      const previousK =
        k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1)) ? k + 1 : k - 1;
      const previousX = v.get(previousK) ?? 0,
        previousY = previousX - previousK;
      while (x > previousX && y > previousY) {
        x--;
        y--;
        middle.push({ kind: 'context', old: left[x], new: right[y] });
      }
      if (d === 0) break;
      if (x === previousX) {
        y--;
        middle.push({ kind: 'add', new: right[y] });
      } else {
        x--;
        middle.push({ kind: 'delete', old: left[x] });
      }
    }
    middle.reverse();
  }
  return [
    ...a.slice(0, prefix).map((old, i): DiffRow => ({ kind: 'context', old, new: b[i] })),
    ...middle,
    ...a
      .slice(a.length - suffix)
      .map((old, i): DiffRow => ({ kind: 'context', old, new: b[b.length - suffix + i] })),
  ];
}
/** Consecutive edited rows form one block; unchanged context ends it. */
export function diffBlocks(rows: readonly DiffRow[]): DiffRow[][] {
  const blocks: DiffRow[][] = [];
  let current: DiffRow[] | undefined;
  for (const row of rows) {
    if (row.kind === 'context') current = undefined;
    else {
      if (!current) blocks.push((current = []));
      current.push(row);
    }
  }
  return blocks;
}

/** Navigation stops are contiguous edits, not merged context windows. */
export function diffChanges(rows: readonly DiffRow[]): { old?: DiffLine; new?: DiffLine }[] {
  const changes: { old?: DiffLine; new?: DiffLine }[] = [];
  let current: { old?: DiffLine; new?: DiffLine } | undefined;
  for (const row of rows) {
    if (row.kind === 'context') {
      current = undefined;
      continue;
    }
    if (!current) {
      current = {};
      changes.push(current);
    }
    current.old ??= row.old;
    current.new ??= row.new;
  }
  return changes;
}
export function createDiffModel(oldText?: string, newText?: string): DiffModel {
  const rows = operations(sourceLines(oldText ?? ''), sourceLines(newText ?? ''));
  const windows: [number, number][] = [];
  rows.forEach((row, index) => {
    if (row.kind === 'context') return;
    const start = Math.max(0, index - 3),
      end = Math.min(rows.length, index + 4),
      last = windows.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else windows.push([start, end]);
  });
  const hunks = windows.map(([start, end]): DiffHunk => {
    const selected = rows.slice(start, end),
      old = selected.flatMap((r) => (r.old ? [r.old] : [])),
      next = selected.flatMap((r) => (r.new ? [r.new] : []));
    const oldStart = old[0]?.number ?? rows.slice(0, start).filter((r) => r.old).length;
    const newStart = next[0]?.number ?? rows.slice(0, start).filter((r) => r.new).length;
    const patch =
      `@@ -${oldStart},${old.length} +${newStart},${next.length} @@\n` +
      selected
        .map((r) => {
          const text = (r.old ?? r.new)?.text ?? '';
          return `${r.kind === 'context' ? ' ' : r.kind === 'delete' ? '-' : '+'}${text}${text.endsWith('\n') ? '' : '\n\\ No newline at end of file\n'}`;
        })
        .join('');
    return {
      oldStart,
      oldLines: old.length,
      newStart,
      newLines: next.length,
      patch,
      rows: selected,
    };
  });
  return {
    ...(oldText === undefined ? {} : { oldText }),
    ...(newText === undefined ? {} : { newText }),
    rows,
    hunks,
  };
}

/** Repository-independent identities for optional diff annotations. */
export type DiffRef = { sourceId: string } & (
  | { kind: 'file' }
  | {
      kind: 'hunk';
      oldStart: number;
      oldLines: number;
      newStart: number;
      newLines: number;
      patch: string;
    }
  | { kind: 'lines'; side: 'old' | 'new'; startLine: number; endLine: number }
);
