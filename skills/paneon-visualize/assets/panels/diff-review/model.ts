/** Fixed per-instance manifest. Physical paths are opaque to the tree adapter. */
export type Comparison = {
  displayPath?: string;
  oldPath: string | null;
  newPath: string | null;
};
export type ReviewNode = {
  key: string;
  name: string;
  nodes?: ReviewNode[];
  comparison?: Comparison;
};

export type ComparisonStatus = 'A' | 'M' | 'D' | '=' | '!' | 'pending';

/** Null denotes file existence; content equality alone cannot identify an empty added file. */
export function comparisonStatus(
  comparison: Comparison,
  texts?: { oldText: string; newText: string },
): ComparisonStatus {
  if (comparison.oldPath === null) return 'A';
  if (comparison.newPath === null) return 'D';
  if (!texts) return 'pending';
  return texts.oldText === texts.newText ? '=' : 'M';
}

/** Page presentation follows Git Review's palette without importing Git types or states. */
export function comparisonStatusClass(status: ComparisonStatus): string {
  if (status === 'A') return 'text-green-700 dark:text-green-400';
  if (status === 'M') return 'text-blue-600 dark:text-blue-400';
  if (status === '!') return 'text-amber-700 dark:text-amber-400';
  return 'text-muted-foreground';
}

export function comparisonPath(comparison: Comparison): string {
  return (
    comparison.displayPath ??
    (comparison.oldPath ?? comparison.newPath ?? '').split('/').at(-1) ??
    ''
  );
}

export function matchesComparison(comparison: Comparison, term: string): boolean {
  const needle = term.toLowerCase();
  return [comparisonPath(comparison), comparison.oldPath, comparison.newPath].some((path) =>
    path?.toLowerCase().includes(needle),
  );
}

export function visibleFileCount(node: ReviewNode, term: string): number {
  if (node.comparison) return matchesComparison(node.comparison, term) ? 1 : 0;
  return (node.nodes ?? []).reduce((total, child) => total + visibleFileCount(child, term), 0);
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function reviewTree(files: readonly Comparison[], byDirectory = true): ReviewNode[] {
  const roots: ReviewNode[] = [];
  const directories = new Map<string, ReviewNode>();
  files.forEach((comparison, index) => {
    const path = comparisonPath(comparison);
    const parts = path.split('/');
    const name = parts.pop() ?? '';
    let children = roots;
    let directoryPath = '';
    for (const part of byDirectory ? parts : []) {
      directoryPath = directoryPath ? `${directoryPath}/${part}` : part;
      const key = `directory:${directoryPath}`;
      let directory = directories.get(key);
      if (!directory) {
        directory = { key, name: part, nodes: [] };
        directories.set(key, directory);
        children.push(directory);
      }
      children = directory.nodes ?? [];
    }
    // Fixed input order is stable across filtering; duplicate display paths remain distinct.
    children.push({ key: `file:${index}`, name, comparison });
  });
  function arrange(nodes: ReviewNode[]): ReviewNode[] {
    const branches = nodes
      .filter((node) => node.nodes !== undefined)
      .map((start) => {
        let end = start;
        let name = start.name;
        while (end.nodes?.length === 1 && end.nodes[0].nodes !== undefined) {
          end = end.nodes[0];
          name += `/${end.name}`;
        }
        return { ...end, name, nodes: arrange(end.nodes ?? []) };
      })
      .sort((a, b) => compare(a.name, b.name));
    const leaves = nodes
      .filter(
        (node): node is ReviewNode & { comparison: Comparison } => node.comparison !== undefined,
      )
      .sort(
        (a, b) =>
          compare(a.name, b.name) ||
          compare(comparisonPath(a.comparison), comparisonPath(b.comparison)),
      );
    return [...branches, ...leaves];
  }
  return arrange(roots);
}
