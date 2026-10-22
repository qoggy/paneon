/** Page-local directory model; Git paths remain byte-for-byte JavaScript strings. */
export type TreeSnapshot = {
  id: string;
  status: string;
  source: {
    view: { type: string; area?: 'staged' | 'unstaged' | 'untracked' };
    old?: { path: string };
    new?: { path: string };
  };
};
export type FileNode<T extends TreeSnapshot> = { kind: 'file'; name: string; snapshot: T };
export type DirectoryNode<T extends TreeSnapshot> = {
  kind: 'directory';
  path: string;
  name: string;
  count: number;
  children: TreeNode<T>[];
};
export type TreeNode<T extends TreeSnapshot> = FileNode<T> | DirectoryNode<T>;
export const areaNames = { staged: '已暂存', unstaged: '未暂存', untracked: '未跟踪' } as const;
export const snapshotPath = (snapshot: TreeSnapshot) =>
  snapshot.source.new?.path ?? snapshot.source.old?.path ?? '';
export const snapshotName = (snapshot: TreeSnapshot, t: (key: string) => string = (key) => key) =>
  `${snapshot.source.view.type === 'changes' && snapshot.source.view.area ? `${t(areaNames[snapshot.source.view.area])} · ` : ''}${snapshot.status} ${snapshotPath(snapshot)}`;
export function snapshotTitle(snapshot: TreeSnapshot, t: (key: string) => string = (key) => key) {
  const { old, new: next } = snapshot.source;
  return `${snapshotName(snapshot, t)}${old && next && old.path !== next.path ? ` (${old.path} → ${next.path})` : ''}${snapshot.status[0] === 'U' ? ` · ${t('未合并冲突')}` : ''}`;
}
export function matchesPath(snapshot: TreeSnapshot, filter: string) {
  const needle = filter.toLowerCase();
  return [snapshot.source.old?.path, snapshot.source.new?.path].some((path) =>
    path?.toLowerCase().includes(needle),
  );
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function buildFileTree<T extends TreeSnapshot>(snapshots: T[]): TreeNode<T>[] {
  type Branch = { path: string; name: string; dirs: Map<string, Branch>; files: FileNode<T>[] };
  const root: Branch = { path: '', name: '', dirs: new Map(), files: [] };
  for (const snapshot of snapshots) {
    const parts = snapshotPath(snapshot).split('/');
    const name = parts.pop() ?? '';
    let branch = root;
    for (const part of parts) {
      let child = branch.dirs.get(part);
      if (!child) {
        child = {
          path: branch.path ? `${branch.path}/${part}` : part,
          name: part,
          dirs: new Map(),
          files: [],
        };
        branch.dirs.set(part, child);
      }
      branch = child;
    }
    branch.files.push({ kind: 'file', name, snapshot });
  }
  function children(branch: Branch): TreeNode<T>[] {
    const dirs = [...branch.dirs.values()]
      .sort((a, b) => compare(a.name, b.name))
      .map((start): DirectoryNode<T> => {
        let end = start;
        let name = start.name;
        while (!end.files.length && end.dirs.size === 1) {
          const next = [...end.dirs.values()][0];
          name += `/${next.name}`;
          end = next;
        }
        const nodes = children(end);
        return {
          kind: 'directory',
          name,
          path: end.path,
          count: leafCount(nodes),
          children: nodes,
        };
      });
    return [...dirs, ...branch.files.sort((a, b) => compare(a.name, b.name))];
  }
  return children(root);
}
export function leafCount<T extends TreeSnapshot>(nodes: TreeNode<T>[]): number {
  return nodes.reduce((count, node) => count + (node.kind === 'file' ? 1 : node.count), 0);
}
export function filterFileTree<T extends TreeSnapshot>(
  nodes: TreeNode<T>[],
  filter: string,
): TreeNode<T>[] {
  if (!filter) return nodes;
  return nodes.flatMap((node): TreeNode<T>[] => {
    if (node.kind === 'file') return matchesPath(node.snapshot, filter) ? [node] : [];
    const children = filterFileTree(node.children, filter);
    return children.length ? [{ ...node, children, count: leafCount(children) }] : [];
  });
}
export function selectedAncestors<T extends TreeSnapshot>(
  nodes: TreeNode<T>[],
  id?: string,
): string[] {
  function find(nodes: TreeNode<T>[]): string[] | undefined {
    for (const node of nodes) {
      if (node.kind === 'file') {
        if (node.snapshot.id === id) return [];
      } else {
        const ancestors = find(node.children);
        if (ancestors) return [node.path, ...ancestors];
      }
    }
  }
  return find(nodes) ?? [];
}
export function groupFileTrees<T extends TreeSnapshot>(snapshots: T[]) {
  const groups = new Map<string, T[]>();
  for (const snapshot of snapshots) {
    const area = snapshot.source.view.type === 'changes' ? (snapshot.source.view.area ?? '') : '';
    const files = groups.get(area) ?? [];
    files.push(snapshot);
    groups.set(area, files);
  }
  return ['', 'staged', 'unstaged', 'untracked'].flatMap((area) => {
    const files = groups.get(area);
    return files ? [{ area, nodes: buildFileTree(files) }] : [];
  });
}
export function statusClass(status: string) {
  switch (status[0]) {
    case 'D':
      return 'text-muted-foreground';
    case 'M':
    case 'R':
    case 'T':
      return 'text-blue-600 dark:text-blue-400';
    case 'A':
    case '?':
    case 'C':
      return 'text-green-700 dark:text-green-400';
    case 'U':
      return 'text-amber-700 dark:text-amber-400';
    default:
      return '';
  }
}
