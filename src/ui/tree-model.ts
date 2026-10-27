/** Accessors read the caller's objects; no business node shape is required. */
export type TreeAccessors<T> = {
  getItemId: (item: T) => string;
  getItemLabel: (item: T) => string;
  getItemChildren: (item: T) => readonly T[] | undefined;
};
export type IndexedTreeItem<T> = {
  id: string;
  item: T;
  parentId?: string;
  level: number;
  children?: readonly string[];
};
export type TreeIndex<T> = {
  roots: readonly string[];
  items: ReadonlyMap<string, IndexedTreeItem<T>>;
  branches: readonly string[];
};

/** Input is a finite tree with unique stable IDs and pure accessors. */
export function indexTree<T>(items: readonly T[], accessors: TreeAccessors<T>): TreeIndex<T> {
  const indexed = new Map<string, IndexedTreeItem<T>>();
  const branches: string[] = [];
  function visit(items: readonly T[], level: number, parentId?: string): string[] {
    return items.map((item) => {
      const id = accessors.getItemId(item);
      const children = accessors.getItemChildren(item);
      if (children !== undefined) branches.push(id);
      indexed.set(id, {
        id,
        item,
        parentId,
        level,
        children: children === undefined ? undefined : visit(children, level + 1, id),
      });
      return id;
    });
  }
  const roots = visit(items, 1);
  return { roots, items: indexed, branches };
}

export function treeAncestors<T>(index: TreeIndex<T>, id: string): string[] {
  const ancestors: string[] = [];
  let parentId = index.items.get(id)?.parentId;
  while (parentId !== undefined) {
    ancestors.push(parentId);
    parentId = index.items.get(parentId)?.parentId;
  }
  return ancestors.reverse();
}

export type TreeFilter = {
  included: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
};

/** Filtering projects IDs only, retaining original objects and unfiltered labels. */
export function filterTree<T>(
  index: TreeIndex<T>,
  term: string,
  matches: (item: T, term: string) => boolean,
): TreeFilter {
  const included = new Set<string>();
  const expanded = new Set<string>();
  function visit(id: string): boolean {
    const node = index.items.get(id);
    if (!node) return false;
    const ownMatch = !term || matches(node.item, term);
    let childMatch = false;
    for (const child of node.children ?? []) childMatch = visit(child) || childMatch;
    if (ownMatch || childMatch) included.add(id);
    if (term && childMatch) expanded.add(id);
    return ownMatch || childMatch;
  }
  for (const id of index.roots) visit(id);
  return { included, expanded };
}

export function visibleTreeIds<T>(
  index: TreeIndex<T>,
  baseExpanded: ReadonlySet<string>,
  filter: TreeFilter,
): string[] {
  const visible: string[] = [];
  function visit(ids: readonly string[]) {
    for (const id of ids) {
      if (!filter.included.has(id)) continue;
      visible.push(id);
      if (baseExpanded.has(id) || filter.expanded.has(id))
        visit(index.items.get(id)?.children ?? []);
    }
  }
  visit(index.roots);
  return visible;
}

export function sameTreeIds(left: readonly string[], right: readonly string[]): boolean {
  const ids = new Set(left);
  return ids.size === new Set(right).size && right.every((id) => ids.has(id));
}

export class TreeRevealError extends Error {
  readonly code: 'TREE_ITEM_NOT_FOUND' | 'TREE_ITEM_FILTERED';
  constructor(code: TreeRevealError['code'], id: string) {
    super(
      code === 'TREE_ITEM_NOT_FOUND' ? `Tree item not found: ${id}` : `Tree item filtered: ${id}`,
    );
    this.name = 'TreeRevealError';
    this.code = code;
  }
}
