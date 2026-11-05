/** Child-before-parent input is supplied by git log --date-order. */
type Commit = {
  oid: string;
  parents: readonly string[];
  graphParents?: readonly string[];
  indirectParents?: readonly string[];
};
type Lane = { oid: string; color: number; dashed?: boolean };
export type GraphStroke = {
  kind: 'incoming' | 'outgoing' | 'through';
  from: number;
  to: number;
  color: number;
  dashed?: boolean;
};
export type GraphRow = {
  oid: string;
  lane: number;
  color: number;
  strokes: GraphStroke[];
};

export function layoutGitGraph(commits: readonly Commit[]) {
  const active: (Lane | undefined)[] = [];
  const rows: GraphRow[] = [];
  let colors = 0;
  let lanes = 1;
  for (const commit of commits) {
    let lane = active.findIndex((entry) => entry?.oid === commit.oid);
    const connected = lane !== -1;
    if (!connected) {
      lane = active.findIndex((entry) => !entry);
      if (lane === -1) lane = active.length;
    }
    const current = active[lane] ?? { oid: commit.oid, color: colors++ };
    active[lane] = current;
    const color = current.color;
    const strokes: GraphStroke[] = [];
    active.forEach((entry, at) => {
      if (!entry) return;
      const dash = entry.dashed ? { dashed: true } : {};
      if (at !== lane)
        strokes.push({ kind: 'through', from: at, to: at, color: entry.color, ...dash });
      else if (connected) strokes.push({ kind: 'incoming', from: lane, to: lane, color, ...dash });
    });
    active[lane] = undefined;
    [...new Set(commit.graphParents ?? commit.parents)].forEach((oid, parentIndex) => {
      const dash = commit.indirectParents?.includes(oid) ? { dashed: true } : {};
      let target = active.findIndex((entry) => entry?.oid === oid);
      const parentColor = active[target]?.color ?? (parentIndex === 0 ? color : colors++);
      if (target === -1) {
        target = parentIndex === 0 ? lane : active.findIndex((entry) => !entry);
        if (target === -1) target = active.length;
        active[target] = { oid, color: parentColor, ...dash };
      }
      strokes.push({ kind: 'outgoing', from: lane, to: target, color: parentColor, ...dash });
    });
    lanes = Math.max(lanes, lane + 1, active.length);
    rows.push({ oid: commit.oid, lane, color, strokes });
    // Keep internal holes so unrelated lanes do not jump between rows.
    while (active.length && !active.at(-1)) active.pop();
  }
  return { rows, lanes };
}
