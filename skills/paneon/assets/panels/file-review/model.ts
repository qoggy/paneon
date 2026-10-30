export type FileNode = { key: string; name: string; nodes?: FileNode[]; fileIndex?: number };

/** Follow Diff Review's compressed, directory-first tree while retaining literal path roots. */
export function fileTree(files: readonly string[], byDirectory = true): FileNode[] {
  const roots: FileNode[] = [];
  const directories = new Map<string, FileNode>();
  files.forEach((path, fileIndex) => {
    const parts = path.split('/');
    const name = parts.pop()!;
    let children = roots;
    (byDirectory ? parts : []).forEach((part, index) => {
      const key = `directory:${parts.slice(0, index + 1).join('/') || '/'}`;
      let node = directories.get(key);
      if (!node) {
        node = { key, name: part, nodes: [] };
        directories.set(key, node);
        children.push(node);
      }
      children = node.nodes!;
    });
    children.push({ key: `file:${fileIndex}`, name, fileIndex });
  });
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const arrange = (nodes: FileNode[]): FileNode[] =>
    nodes
      .map((start) => {
        if (!start.nodes) return start;
        let end = start;
        let name = start.name;
        while (end.nodes?.length === 1 && end.nodes[0].nodes) {
          end = end.nodes[0];
          name += `/${end.name}`;
        }
        return { ...end, name, nodes: arrange(end.nodes!) };
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
