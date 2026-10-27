import {
  Fragment,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, ReactNode, Ref } from 'react';
import { Button } from './button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible';
import { cn } from './utils';
import {
  filterTree,
  indexTree,
  sameTreeIds,
  treeAncestors,
  TreeRevealError,
  visibleTreeIds,
} from './tree-model';
import type { TreeIndex, TreeFilter } from './tree-model';

export type TreeItemState = {
  selected: boolean;
  expanded: boolean;
  isBranch: boolean;
  /** Root nodes start at 1. */
  level: number;
};
export type TreeItemPresentation = {
  className?: string;
  style?: CSSProperties;
  title?: string;
  'aria-description'?: string;
} & { [name: `data-${string}`]: string | number | boolean | undefined };
export type TreeProps<T> = {
  items: readonly T[];
  getItemId: (item: T) => string;
  getItemLabel: (item: T) => string;
  /** undefined is a leaf; [] is a fully loaded empty container. */
  getItemChildren: (item: T) => readonly T[] | undefined;
  /** Display content only; row events and expansion remain owned by Tree. */
  renderItemContent?: (item: T, state: TreeItemState) => ReactNode;
  getItemPresentation?: (item: T, state: TreeItemState) => TreeItemPresentation;
  /** Defaults to leaves only. Does not disable focus, expansion or action. */
  isItemSelectable?: (item: T) => boolean;
  selectedId?: string | null;
  defaultSelectedId?: string | null;
  /** Explicit selection intent, including selecting the current ID again. */
  onSelectionChange?: (id: string | null) => void;
  expandedIds?: readonly string[];
  defaultExpandedIds?: readonly string[];
  onExpandedChange?: (ids: readonly string[]) => void;
  /** Leaf Enter/double-click; receives the original object. */
  onAction?: (item: T) => void;
  searchTerm?: string;
  isItemMatchingSearch?: (item: T, term: string) => boolean;
  loading?: boolean;
  emptyState?: ReactNode;
  className?: string;
  'aria-label': string;
  ref?: Ref<TreeHandle>;
};
export type TreeHandle = {
  /** Waits for accepted expansion and a mounted row; caller owns cancellation. */
  revealItem: (id: string, options: { signal: AbortSignal }) => Promise<void>;
  expandAll: () => void;
  /** No-op while searching. */
  collapseAll: () => void;
};
type PendingReveal = {
  id: string;
  signal: AbortSignal;
  onAbort: () => void;
  resolve: () => void;
  reject: (error: Error) => void;
  frame?: number;
};
type CommittedTree<T> = { index: TreeIndex<T>; filter: TreeFilter; expanded: ReadonlySet<string> };

/** A labelled hierarchy of native buttons; it does not claim APG treeview navigation. */
export function Tree<T>({
  items,
  getItemId,
  getItemLabel,
  getItemChildren,
  renderItemContent,
  getItemPresentation,
  isItemSelectable,
  selectedId,
  defaultSelectedId = null,
  onSelectionChange,
  expandedIds,
  defaultExpandedIds = [],
  onExpandedChange,
  onAction,
  searchTerm = '',
  isItemMatchingSearch,
  loading,
  emptyState,
  className,
  'aria-label': label,
  ref,
}: TreeProps<T>) {
  const index = useMemo(
    () => indexTree(items, { getItemId, getItemLabel, getItemChildren }),
    [items, getItemId, getItemLabel, getItemChildren],
  );
  const filter = useMemo(
    () =>
      filterTree(
        index,
        searchTerm,
        isItemMatchingSearch ??
          ((item, term) => getItemLabel(item).toLowerCase().includes(term.toLowerCase())),
      ),
    [index, searchTerm, isItemMatchingSearch, getItemLabel],
  );
  const [internal, setInternal] = useState({
    selected: defaultSelectedId,
    expanded: defaultExpandedIds,
    selectionReset: 0,
    expansionReset: 0,
  });
  const internalSelected = internal.selected;
  const internalExpanded = internal.expanded;
  const selectedNode = internalSelected === null ? undefined : index.items.get(internalSelected);
  const resetSelection =
    selectedId === undefined &&
    internalSelected !== null &&
    (!selectedNode ||
      !(isItemSelectable?.(selectedNode.item) ?? selectedNode.children === undefined));
  const validExpanded = internalExpanded.filter(
    (id) => index.items.get(id)?.children !== undefined,
  );
  const resetExpansion = expandedIds === undefined && !sameTreeIds(validExpanded, internalExpanded);
  // Reconcile this component's state before commit, without an effect-driven render cascade.
  if (resetSelection || resetExpansion)
    setInternal({
      selected: resetSelection ? null : internalSelected,
      expanded: resetExpansion ? validExpanded : internalExpanded,
      selectionReset: internal.selectionReset + Number(resetSelection),
      expansionReset: internal.expansionReset + Number(resetExpansion),
    });
  const selection = selectedId === undefined ? internalSelected : selectedId;
  const baseExpanded = expandedIds ?? internalExpanded;
  const expanded = useMemo(() => new Set(baseExpanded), [baseExpanded]);
  const visible = useMemo(() => visibleTreeIds(index, expanded, filter), [index, expanded, filter]);
  const root = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const pending = useRef<PendingReveal | null>(null);
  const committed = useRef<CommittedTree<T> | null>(null);
  const focused = useRef<string | null>(null);
  const previous = useRef<{ index: TreeIndex<T>; visible: string[] } | null>(null);

  function selectable(item: T) {
    return isItemSelectable?.(item) ?? getItemChildren(item) === undefined;
  }
  function select(id: string, item: T) {
    if (!selectable(item)) return;
    if (selectedId === undefined && selection !== id)
      setInternal((value) => ({ ...value, selected: id }));
    onSelectionChange?.(id);
  }
  function requestExpanded(ids: readonly string[]) {
    if (sameTreeIds(baseExpanded, ids)) return;
    if (expandedIds === undefined) setInternal((value) => ({ ...value, expanded: ids }));
    onExpandedChange?.(ids);
  }
  const settleReveal = useCallback((error?: Error) => {
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    current.signal.removeEventListener('abort', current.onAbort);
    if (current.frame !== undefined) cancelAnimationFrame(current.frame);
    if (error) current.reject(error);
    else current.resolve();
  }, []);
  const cancelReveal = useCallback(() => {
    settleReveal(new DOMException('Tree reveal cancelled.', 'AbortError'));
  }, [settleReveal]);
  function queueReveal() {
    const current = pending.current;
    const view = committed.current;
    if (!current || !view) return;
    if (!view.index.items.has(current.id)) {
      settleReveal(new TreeRevealError('TREE_ITEM_NOT_FOUND', current.id));
      return;
    }
    if (!view.filter.included.has(current.id)) {
      settleReveal(new TreeRevealError('TREE_ITEM_FILTERED', current.id));
      return;
    }
    if (
      !treeAncestors(view.index, current.id).every(
        (id) => view.expanded.has(id) || view.filter.expanded.has(id),
      )
    )
      return;
    if (!rows.current.has(current.id) || current.frame !== undefined) return;
    current.frame = requestAnimationFrame(() => {
      current.frame = undefined;
      if (pending.current !== current) return;
      const row = rows.current.get(current.id);
      if (!row?.isConnected || !row.getClientRects().length) return;
      row.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      settleReveal();
    });
  }
  function toggle(id: string, open: boolean) {
    cancelReveal();
    requestExpanded(open ? [...baseExpanded, id] : baseExpanded.filter((value) => value !== id));
  }

  useImperativeHandle(ref, () => ({
    revealItem(id, { signal }) {
      cancelReveal();
      if (signal.aborted)
        return Promise.reject(new DOMException('Tree reveal cancelled.', 'AbortError'));
      if (!index.items.has(id))
        return Promise.reject(new TreeRevealError('TREE_ITEM_NOT_FOUND', id));
      if (!filter.included.has(id))
        return Promise.reject(new TreeRevealError('TREE_ITEM_FILTERED', id));
      return new Promise<void>((resolve, reject) => {
        const onAbort = () => cancelReveal();
        pending.current = { id, signal, onAbort, resolve, reject };
        signal.addEventListener('abort', onAbort, { once: true });
        requestExpanded([...new Set([...baseExpanded, ...treeAncestors(index, id)])]);
        queueReveal();
      });
    },
    expandAll() {
      cancelReveal();
      requestExpanded(index.branches);
    },
    collapseAll() {
      if (searchTerm) return;
      cancelReveal();
      requestExpanded([]);
    },
  }));

  useLayoutEffect(() => {
    committed.current = { index, filter, expanded };
    queueReveal();
    const activeId = focused.current;
    if (activeId !== null && !visible.includes(activeId)) {
      const old = previous.current;
      const ancestor =
        old &&
        treeAncestors(old.index, activeId)
          .reverse()
          .find((id) => visible.includes(id));
      const position = old?.visible.indexOf(activeId) ?? -1;
      const neighbor =
        old &&
        [...old.visible.slice(position + 1), ...old.visible.slice(0, position).reverse()].find(
          (id) => visible.includes(id),
        );
      (rows.current.get(ancestor ?? neighbor ?? visible[0]) ?? root.current)?.focus({
        preventScroll: true,
      });
    }
    previous.current = { index, visible };
  });
  useLayoutEffect(() => () => cancelReveal(), [cancelReveal]);

  const notified = useRef({ selection: 0, expansion: 0 });
  useEffect(() => {
    if (notified.current.selection !== internal.selectionReset) {
      notified.current.selection = internal.selectionReset;
      onSelectionChange?.(null);
    }
    if (notified.current.expansion !== internal.expansionReset) {
      notified.current.expansion = internal.expansionReset;
      onExpandedChange?.(internal.expanded);
    }
  }, [
    internal.selectionReset,
    internal.expansionReset,
    internal.expanded,
    onSelectionChange,
    onExpandedChange,
  ]);

  function renderNodes(ids: readonly string[]): ReactNode {
    return ids
      .filter((id) => filter.included.has(id))
      .map((id) => {
        const node = index.items.get(id);
        if (!node) return null;
        const isBranch = node.children !== undefined;
        const open = expanded.has(id) || filter.expanded.has(id);
        const state: TreeItemState = {
          selected: selection === id && selectable(node.item),
          expanded: isBranch && open,
          isBranch,
          level: node.level,
        };
        const {
          className: rowClass,
          style,
          ...presentation
        } = getItemPresentation?.(node.item, state) ?? {};
        const row = (
          <Button
            {...presentation}
            ref={(element) => {
              if (element) rows.current.set(id, element);
              else rows.current.delete(id);
            }}
            data-tree-item={id}
            variant={state.selected ? 'secondary' : 'ghost'}
            aria-pressed={selectable(node.item) ? state.selected : undefined}
            aria-label={getItemLabel(node.item)}
            className={cn(
              'h-7 w-full min-w-0 justify-start gap-1 px-2 text-left text-xs',
              rowClass,
            )}
            style={{ paddingLeft: (isBranch ? 4 : 8) + (node.level - 1) * 12, ...style }}
            onClick={() => select(id, node.item)}
            onDoubleClick={isBranch ? undefined : () => onAction?.(node.item)}
            onKeyDown={
              isBranch
                ? undefined
                : (event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    select(id, node.item);
                    onAction?.(node.item);
                  }
            }
          >
            {isBranch && (
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3.5 shrink-0"
                aria-hidden="true"
              >
                <path d={open ? 'm4 6 4 4 4-4' : 'm6 4 4 4-4 4'} />
              </svg>
            )}
            {renderItemContent ? (
              renderItemContent(node.item, state)
            ) : (
              <span className="min-w-0 truncate">{getItemLabel(node.item)}</span>
            )}
          </Button>
        );
        return isBranch ? (
          <Collapsible
            key={id}
            open={open}
            onOpenChange={(value) => toggle(id, value)}
            className="min-w-0"
          >
            <CollapsibleTrigger render={row} />
            <CollapsibleContent>{open && renderNodes(node.children ?? [])}</CollapsibleContent>
          </Collapsible>
        ) : (
          <Fragment key={id}>{row}</Fragment>
        );
      });
  }
  return (
    <div
      ref={root}
      role="group"
      aria-label={label}
      aria-busy={loading}
      tabIndex={-1}
      className={className}
      onFocusCapture={(event) => {
        focused.current =
          (event.target as HTMLElement).closest<HTMLElement>('[data-tree-item]')?.dataset
            .treeItem ?? null;
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) focused.current = null;
      }}
    >
      {!visible.length && !loading ? emptyState : renderNodes(index.roots)}
    </div>
  );
}
