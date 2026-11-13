import type { SymbolicLink } from './directory.ts';

export type FileNode = {
  key: string;
  name: string;
  nodes?: FileNode[];
  fileIndex?: number;
  link?: SymbolicLink;
};

/** Follow Diff Review's compressed, directory-first tree while retaining literal path roots. */
export function fileTree(
  files: readonly string[],
  byDirectory = true,
  directoryPaths: readonly string[] = [],
  links: readonly SymbolicLink[] = [],
): FileNode[] {
  const roots: FileNode[] = [];
  const directories = new Map<string, FileNode>();
  const boundaries = new Set(directoryPaths.map((path) => `directory:${path}`));
  function childrenAt(parts: readonly string[]) {
    let children = roots;
    parts.forEach((part, index) => {
      const key = `directory:${parts.slice(0, index + 1).join('/') || '/'}`;
      let node = directories.get(key);
      if (!node) {
        node = { key, name: part, nodes: [] };
        directories.set(key, node);
        children.push(node);
      }
      children = node.nodes ??= [];
    });
    return children;
  }
  files.forEach((path, fileIndex) => {
    const parts = path.split('/');
    const name = parts.pop()!;
    const children = childrenAt(byDirectory ? parts : []);
    children.push({ key: `file:${fileIndex}`, name, fileIndex });
  });
  if (byDirectory && links.length) {
    const filePaths = new Set(files);
    for (const link of links) {
      if (link.kind !== 'directory' || filePaths.has(link.path)) continue;
      childrenAt(link.path.split('/'));
      const key = `directory:${link.path}`;
      const node = directories.get(key)!;
      node.link = link;
      if (link.cycle && !node.nodes?.length) node.nodes = undefined;
      boundaries.add(key);
    }
  }
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const arrange = (nodes: FileNode[]): FileNode[] =>
    nodes
      .map((start) => {
        if (!start.nodes) return start;
        let end = start;
        let name = start.name;
        while (end.nodes?.length === 1 && end.nodes[0].nodes && !boundaries.has(end.key)) {
          end = end.nodes[0];
          name += `/${end.name}`;
        }
        return { ...end, name: name || '/', nodes: arrange(end.nodes!) };
      })
      .sort(
        (a, b) =>
          Number(!!b.nodes) - Number(!!a.nodes) ||
          compare(a.name, b.name) ||
          (a.fileIndex !== undefined && b.fileIndex !== undefined
            ? compare(files[a.fileIndex], files[b.fileIndex])
            : 0),
      );
  return arrange(roots);
}

export function visibleFileCount(node: FileNode, matches: (fileIndex: number) => boolean): number {
  if (node.fileIndex !== undefined) return matches(node.fileIndex) ? 1 : 0;
  return (node.nodes ?? []).reduce((total, child) => total + visibleFileCount(child, matches), 0);
}

export function directoryKeys(nodes: readonly FileNode[]): string[] {
  return nodes.flatMap((node) => (node.nodes ? [node.key, ...directoryKeys(node.nodes)] : []));
}

/** Reveal supplied directories and files without expanding other discovered branches. */
export function initialExpandedKeys(
  nodes: readonly FileNode[],
  directoryPaths: readonly string[],
  explicitFileCount: number,
): string[] {
  const supplied = new Set(directoryPaths.map((path) => `directory:${path}`));
  const expanded: string[] = [];
  function visit(node: FileNode): boolean {
    if (!node.nodes) return node.fileIndex !== undefined && node.fileIndex < explicitFileCount;
    let reveal = supplied.has(node.key);
    for (const child of node.nodes) reveal = visit(child) || reveal;
    if (reveal) expanded.push(node.key);
    return reveal;
  }
  for (const node of nodes) visit(node);
  return expanded;
}

export function ancestorKeys(nodes: readonly FileNode[], index: number): string[] | undefined {
  for (const node of nodes) {
    if (node.fileIndex === index) return [];
    if (node.nodes) {
      const found = ancestorKeys(node.nodes, index);
      if (found) return [node.key, ...found];
    }
  }
}

export function fileLanguage(path: string) {
  const extension = path.split('.').at(-1)?.toLowerCase();
  return (
    ({ mjs: 'js', cjs: 'js', py: 'python', md: 'markdown', htm: 'html' } as Record<string, string>)[
      extension ?? ''
    ] ?? extension
  );
}
export const isMarkdown = (path: string) => /\.(md|markdown)$/i.test(path);
