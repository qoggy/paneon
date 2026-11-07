# Tree

## Use when

Show an expandable hierarchy, such as a file tree, where the human selects or opens items.

## Import

```ts
import {
  Tree,
  TreeRevealError,
  type TreeProps,
  type TreeHandle,
  type TreeItemState,
  type TreeItemPresentation,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// Tree reads your own objects through accessors; IDs must be unique and stable.
interface TreeProps<T> {
  items: readonly T[]; // required: root items
  getItemId: (item: T) => string; // required
  getItemLabel: (item: T) => string; // required
  getItemChildren: (item: T) => readonly T[] | undefined; // required; undefined is a leaf, [] is an empty branch
  'aria-label': string; // required
  renderItemContent?: (item: T, state: TreeItemState) => ReactNode; // row content only; Tree keeps row events and expansion
  getItemPresentation?: (item: T, state: TreeItemState) => TreeItemPresentation;
  isItemSelectable?: (item: T) => boolean; // default: leaves only
  selectedId?: string | null; // controlled
  defaultSelectedId?: string | null; // default null
  onSelectionChange?: (id: string | null) => void; // also fires when the current ID is selected again
  expandedIds?: readonly string[]; // controlled
  defaultExpandedIds?: readonly string[]; // default []
  onExpandedChange?: (ids: readonly string[]) => void;
  onAction?: (item: T) => void; // Enter or double-click on a leaf
  searchTerm?: string; // filters rows and expands branches with matches
  isItemMatchingSearch?: (item: T, term: string) => boolean; // default: case-insensitive label substring
  loading?: boolean;
  emptyState?: ReactNode; // shown when no row is visible and loading is false
  className?: string;
  ref?: Ref<TreeHandle>;
}

interface TreeItemState {
  selected: boolean;
  expanded: boolean;
  isBranch: boolean;
  level: number; // root items are 1
}

interface TreeItemPresentation {
  className?: string;
  style?: CSSProperties;
  title?: string;
  'aria-description'?: string;
  [name: `data-${string}`]: string | number | boolean | undefined;
}

interface TreeHandle {
  revealItem(id: string, options: { signal: AbortSignal }): Promise<void>; // expands ancestors and waits for the row; the caller owns cancellation
  expandAll(): void;
  collapseAll(): void; // no-op while searching
}

// revealItem rejects with a TreeRevealError whose code is 'TREE_ITEM_NOT_FOUND' or 'TREE_ITEM_FILTERED'
// (hidden by searchTerm), or with a DOMException named 'AbortError' when the signal aborts.
```
