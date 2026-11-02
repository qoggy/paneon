import { useLocale } from '../../shared/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FileDiff, FolderTree, ChevronsUpDown, ChevronsDownUp, TreeIcon } from './file-icons.tsx';
import {
  Button,
  Tree,
  TreeRevealError,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@qoggy/paneon/ui';
import type { TreeHandle } from '@qoggy/paneon/ui';
import type { GitFile } from './git.ts';
import {
  areaNames,
  filterFileTree,
  groupFileTrees,
  leafCount,
  matchesPath,
  selectedAncestors,
  snapshotName,
  snapshotPath,
  snapshotTitle,
  statusClass,
} from './file-tree-model.ts';
import type { TreeNode } from './file-tree-model.ts';

type Props = {
  viewType: 'changes' | 'history' | 'compare';
  groupByDirectory?: boolean;
  onGroupByDirectoryChange?: (grouped: boolean) => void;
  pending?: boolean;
  emptyState?: ReactNode;
  snapshots: GitFile[];
  selectedId?: string;
  filter: string;
  scopeKey: string;
  revealKey: number;
  onSelect: (snapshot: GitFile) => void;
  onOpen: (snapshot: GitFile) => void;
};
export function ChangedFileTree({
  viewType,
  groupByDirectory,
  onGroupByDirectoryChange,
  pending,
  emptyState,
  snapshots,
  selectedId,
  filter,
  scopeKey,
  revealKey,
  onSelect,
  onOpen,
}: Props) {
  const { t, message } = useLocale();
  const [grouping, setGrouping] = useState<Record<string, boolean>>({});
  const byDirectory = groupByDirectory ?? grouping[scopeKey] ?? viewType !== 'changes';
  const groups = useMemo(() => groupFileTrees(snapshots, byDirectory), [snapshots, byDirectory]);
  const visibleGroups = useMemo(
    () => groups.map(({ area, nodes }) => ({ area, nodes: filterFileTree(nodes, filter) })),
    [groups, filter],
  );
  const [collapsed, setCollapsed] = useState<Record<string, Set<string>>>({});
  const trees = useRef(new Map<string, TreeHandle>());
  const reveal = useRef<{
    id: string;
    area: string;
    controller: AbortController;
    started: boolean;
  } | null>(null);
  function cancelReveal() {
    reveal.current?.controller.abort();
    reveal.current = null;
  }
  function startReveal(area: string, tree: TreeHandle) {
    const job = reveal.current;
    if (!job || job.area !== area || job.started || job.controller.signal.aborted) return;
    job.started = true;
    void tree.revealItem(job.id, { signal: job.controller.signal }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (error instanceof TreeRevealError && error.code === 'TREE_ITEM_FILTERED') return;
      console.error('Failed to reveal Git file.', error);
    });
  }
  const foldKeys = useMemo(() => {
    const keys: string[] = [];
    function directories(nodes: TreeNode<GitFile>[], area: string) {
      for (const node of nodes) {
        if (node.kind !== 'directory') continue;
        keys.push(`directory:${area}:${node.path}`);
        directories(node.children, area);
      }
    }
    for (const { area, nodes } of visibleGroups) {
      if (!nodes.length) continue;
      if (area) keys.push(`group:${area}`);
      directories(nodes, area);
    }
    return keys;
  }, [visibleGroups]);
  function setOpen(key: string, open: boolean) {
    cancelReveal();
    setCollapsed((previous) => {
      const next = new Set(previous[scopeKey]);
      if (open) next.delete(key);
      else next.add(key);
      return { ...previous, [scopeKey]: next };
    });
  }
  function firstFile(nodes: TreeNode<GitFile>[]): GitFile | undefined {
    for (const node of nodes) {
      const file = node.kind === 'file' ? node.snapshot : firstFile(node.children);
      if (file) return file;
    }
  }
  const diffFile =
    snapshots.find((file) => file.id === selectedId) ??
    firstFile(visibleGroups.flatMap(({ nodes }) => nodes));
  useEffect(() => {
    cancelReveal();
    const selected = snapshots.find((file) => file.id === selectedId);
    if (!selected) return;
    const area = selected.source.view.type === 'changes' ? (selected.source.view.area ?? '') : '';
    const ancestors = groups.flatMap(({ area, nodes }) => [
      ...(area && selected.source.view.type === 'changes' && selected.source.view.area === area
        ? [`group:${area}`]
        : []),
      ...selectedAncestors(nodes, selectedId).map((path) => `directory:${area}:${path}`),
    ]);
    setCollapsed((previous) => {
      const saved = previous[scopeKey];
      if (!saved || !ancestors.some((path) => saved.has(path))) return previous;
      return {
        ...previous,
        [scopeKey]: new Set([...saved].filter((path) => !ancestors.includes(path))),
      };
    });
    const job = { id: selected.id, area, controller: new AbortController(), started: false };
    reveal.current = job;
    const tree = trees.current.get(area);
    if (tree) startReveal(area, tree);
    return () => {
      job.controller.abort();
      if (reveal.current === job) reveal.current = null;
    };
  }, [groups, snapshots, selectedId, scopeKey, revealKey]);

  function directoryKeys(nodes: TreeNode<GitFile>[], area: string): string[] {
    return nodes.flatMap((node) =>
      node.kind === 'file'
        ? []
        : [`directory:${area}:${node.path}`, ...directoryKeys(node.children, area)],
    );
  }
  function renderTree(area: string, visibleNodes: TreeNode<GitFile>[]) {
    const nodes = groups.find((group) => group.area === area)?.nodes ?? [];
    const keys = directoryKeys(nodes, area);
    const counts = new Map<string, number>();
    function count(nodes: TreeNode<GitFile>[]) {
      for (const node of nodes)
        if (node.kind === 'directory') {
          counts.set(node.path, node.count);
          count(node.children);
        }
    }
    count(visibleNodes);
    return (
      <Tree
        ref={(tree) => {
          if (tree) {
            trees.current.set(area, tree);
            startReveal(area, tree);
          } else trees.current.delete(area);
        }}
        items={nodes}
        getItemId={(node) =>
          node.kind === 'file' ? node.snapshot.id : `directory:${area}:${node.path}`
        }
        getItemLabel={(node) =>
          node.kind === 'file'
            ? snapshotName(node.snapshot, message)
            : t('Directory {path}', { path: node.path })
        }
        getItemChildren={(node) => (node.kind === 'directory' ? node.children : undefined)}
        isItemSelectable={(node) => node.kind === 'file'}
        selectedId={selectedId ?? null}
        expandedIds={keys.filter((key) => !collapsed[scopeKey]?.has(key))}
        onExpandedChange={(ids) =>
          setCollapsed((previous) => {
            const next = new Set(previous[scopeKey]);
            const expanded = new Set(ids);
            for (const key of keys) {
              if (expanded.has(key)) next.delete(key);
              else next.add(key);
            }
            return { ...previous, [scopeKey]: next };
          })
        }
        onSelectionChange={(id) => {
          const file = snapshots.find((file) => file.id === id);
          if (file) onSelect(file);
        }}
        onAction={(node) => {
          if (node.kind === 'file') onOpen(node.snapshot);
        }}
        searchTerm={filter}
        isItemMatchingSearch={(node, term) =>
          node.kind === 'file' && matchesPath(node.snapshot, term)
        }
        getItemPresentation={(node, state) => {
          const depth = state.level - 1 + (area ? 1 : 0);
          if (node.kind === 'file')
            return {
              'data-file-id': node.snapshot.id,
              'data-file-status': node.snapshot.status,
              title: snapshotTitle(node.snapshot, message),
              'aria-description': snapshotTitle(node.snapshot, message),
              className: `h-7 w-full min-w-0 justify-start gap-1.5 px-2 text-left text-xs ${statusClass(node.snapshot.status)}`,
              style: { paddingLeft: 8 + depth * 12 },
            };
          return {
            'data-file-directory': node.path,
            title: t('{path} · {count} files', {
              path: node.path,
              count: counts.get(node.path) ?? node.count,
            }),
            className: 'h-7 w-full min-w-0 justify-start gap-1 px-2 text-left text-xs',
            style: { paddingLeft: 4 + depth * 12 },
          };
        }}
        renderItemContent={(node, state) => {
          if (node.kind === 'directory')
            return (
              <>
                <span className="flex text-muted-foreground">
                  <TreeIcon kind={state.expanded ? 'open' : 'folder'} />
                </span>
                <span className="min-w-0 truncate">{node.name}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                  {counts.get(node.path) ?? node.count}
                </span>
              </>
            );
          const path = snapshotPath(node.snapshot);
          const directory = path.slice(0, Math.max(0, path.lastIndexOf('/')));
          return (
            <>
              <TreeIcon kind="file" />
              <span className="min-w-0 truncate">{node.name}</span>
              {!byDirectory && directory && (
                <span
                  className="min-w-0 flex-1 truncate font-normal text-muted-foreground"
                  data-file-parent=""
                >
                  {directory}
                </span>
              )}
              <span className="ml-auto shrink-0 text-[10px]" aria-hidden="true">
                {node.snapshot.status}
              </span>
            </>
          );
        }}
        aria-label={t('改动文件')}
      />
    );
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden" data-file-tree="">
      {snapshots.length > 0 && (
        <div
          className="flex shrink-0 items-center gap-0.5 border-b px-1 py-0.5 text-muted-foreground"
          role="toolbar"
          aria-label={t('文件操作')}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="size-7"
                  aria-label={t('查看文件差异')}
                  disabled={!diffFile}
                  onClick={() => {
                    if (!diffFile) return;
                    onSelect(diffFile);
                    onOpen(diffFile);
                  }}
                >
                  <FileDiff className="size-4" aria-hidden="true" />
                </Button>
              }
            />
            <TooltipContent>{t('查看文件差异')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant={byDirectory ? 'secondary' : 'ghost'}
                  className="size-7"
                  aria-label={t('按目录分组')}
                  aria-pressed={byDirectory}
                  onClick={() => {
                    cancelReveal();
                    setGrouping((previous) => ({ ...previous, [scopeKey]: !byDirectory }));
                    onGroupByDirectoryChange?.(!byDirectory);
                  }}
                >
                  <FolderTree className="size-4" aria-hidden="true" />
                </Button>
              }
            />
            <TooltipContent>{t('按目录分组')}</TooltipContent>
          </Tooltip>
          <div className="flex-1" />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="size-7"
                  aria-label={t('全部展开')}
                  disabled={!foldKeys.length}
                  onClick={() => {
                    cancelReveal();
                    setCollapsed((previous) => ({ ...previous, [scopeKey]: new Set() }));
                  }}
                >
                  <ChevronsUpDown className="size-4" aria-hidden="true" />
                </Button>
              }
            />
            <TooltipContent>{t('全部展开')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="size-7"
                  aria-label={t('全部折叠')}
                  disabled={!foldKeys.length || !!filter}
                  onClick={() => {
                    cancelReveal();
                    setCollapsed((previous) => ({ ...previous, [scopeKey]: new Set(foldKeys) }));
                  }}
                >
                  <ChevronsDownUp className="size-4" aria-hidden="true" />
                </Button>
              }
            />
            <TooltipContent>{t('全部折叠')}</TooltipContent>
          </Tooltip>
        </div>
      )}
      <div className="min-h-0 overflow-auto p-1" data-file-scroll="" aria-busy={pending}>
        {!pending &&
          snapshots.length === 0 &&
          (emptyState !== undefined ? (
            emptyState
          ) : (
            <Empty className={`flex-none ${viewType === 'history' ? 'py-12' : 'py-20'}`}>
              <EmptyHeader>
                <EmptyTitle>
                  {t(
                    viewType === 'changes'
                      ? 'Working tree clean'
                      : viewType === 'compare'
                        ? 'No file differences between these revisions'
                        : 'No file changes in this commit',
                  )}
                </EmptyTitle>
                {viewType === 'changes' && (
                  <EmptyDescription>{t('There are no uncommitted file changes.')}</EmptyDescription>
                )}
              </EmptyHeader>
            </Empty>
          ))}
        {visibleGroups.map(({ area, nodes }) => {
          if (!nodes.length) return null;
          const open = !!filter || !collapsed[scopeKey]?.has(`group:${area}`);
          return (
            <Collapsible
              key={area}
              open={!area || open}
              onOpenChange={(value) => setOpen(`group:${area}`, value)}
              className="min-w-0"
              data-file-group={area}
            >
              {area && (
                <CollapsibleTrigger
                  render={
                    <Button
                      variant="ghost"
                      className="h-7 w-full justify-start gap-1 px-1 text-xs"
                      data-file-area={area}
                    >
                      <TreeIcon kind={open ? 'down' : 'right'} />
                      {t(areaNames[area as keyof typeof areaNames])}
                      <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                        {leafCount(nodes)}
                      </span>
                    </Button>
                  }
                />
              )}
              <CollapsibleContent>{(!area || open) && renderTree(area, nodes)}</CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
