export type GitAuthor = { name: string; email: string };
export type HistoryFilter = {
  text?: string;
  regex?: boolean;
  matchCase?: boolean;
  author?: GitAuthor | 'me';
};

export function historyFilterKey(filter?: HistoryFilter) {
  return JSON.stringify([
    filter?.text ?? '',
    filter?.regex ?? false,
    filter?.matchCase ?? false,
    filter?.author ?? null,
  ]);
}

export function hasHistoryFilter(filter?: HistoryFilter): filter is HistoryFilter {
  return !!(filter?.text || filter?.author);
}

type HistoryNode = { oid: string; parents: string[] };

/** Contract hidden ancestry for display; retain the actual parents for commit actions. */
export function projectHistory(nodes: HistoryNode[], matches: Set<string>) {
  const position: Record<string, number> = {};
  nodes.forEach((node, index) => {
    position[node.oid] = index;
  });
  const nearest = new Map<string, string[]>();
  const edges = new Map<string, { graphParents: string[]; indirectParents: string[] }>();
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    let parents = [...new Set(node.parents.flatMap((oid) => nearest.get(oid) ?? []))];
    if (parents.length > 1) {
      // A hidden merge may reach the same visible history at several depths.
      // Keep the closest frontier, rather than turning every older ancestor into a rail.
      const oldest = parents.reduce((last, oid) => Math.max(last, position[oid]), 0);
      const ancestors = new Set<string>();
      const pending = parents.flatMap((oid) => edges.get(oid)?.graphParents ?? []);
      while (pending.length) {
        const oid = pending.pop() as string;
        if (ancestors.has(oid) || position[oid] > oldest) continue;
        ancestors.add(oid);
        for (const parent of edges.get(oid)?.graphParents ?? []) pending.push(parent);
      }
      parents = parents.filter(
        (oid) => !ancestors.has(oid) || (matches.has(node.oid) && node.parents.includes(oid)),
      );
    }
    if (matches.has(node.oid)) {
      edges.set(node.oid, {
        graphParents: parents,
        indirectParents: parents.filter((oid) => !node.parents.includes(oid)),
      });
      nearest.set(node.oid, [node.oid]);
    } else nearest.set(node.oid, parents);
  }
  return edges;
}
