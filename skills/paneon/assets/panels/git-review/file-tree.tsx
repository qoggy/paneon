import { useLocale } from '../../shared/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FileDiff, FolderTree, ChevronsUpDown, ChevronsDownUp, TreeIcon } from './file-icons.tsx';
import {
  Button,
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
} from 'paneon/ui';
import type { GitFile } from './git.ts';
import {
  areaNames,
  filterFileTree,
  groupFileTrees,
  leafCount,
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
  const root = useRef<HTMLDivElement>(null);
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
    const selected = snapshots.find((file) => file.id === selectedId);
    const ancestors = groups.flatMap(({ area, nodes }) => [
      ...(area && selected?.source.view.type === 'changes' && selected.source.view.area === area
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
  }, [groups, snapshots, selectedId, scopeKey, revealKey]);
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      const selected = [
        ...(root.current?.querySelectorAll<HTMLElement>('[data-file-id]') ?? []),
      ].find((element) => element.dataset.fileId === selectedId);
      selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    return () => cancelAnimationFrame(handle);
  }, [selectedId, scopeKey, groups, revealKey]);
  function renderNodes(nodes: TreeNode<GitFile>[], area: string, depth = 0) {
    return nodes.map((node) => {
      if (node.kind === 'file') {
        const snapshot = node.snapshot;
        const path = snapshotPath(snapshot);
        const directory = path.slice(0, Math.max(0, path.lastIndexOf('/')));
        return (
          <Button
            key={snapshot.id}
            data-file-id={snapshot.id}
            data-file-status={snapshot.status}
            variant={selectedId === snapshot.id ? 'secondary' : 'ghost'}
            aria-pressed={selectedId === snapshot.id}
            aria-label={snapshotName(snapshot, message)}
            aria-description={snapshotTitle(snapshot, message)}
            title={snapshotTitle(snapshot, message)}
            className={`h-7 w-full min-w-0 justify-start gap-1.5 px-2 text-left text-xs ${statusClass(snapshot.status)}`}
            style={{ paddingLeft: 8 + depth * 12 }}
            onClick={() => onSelect(snapshot)}
            onDoubleClick={() => onOpen(snapshot)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onSelect(snapshot);
                onOpen(snapshot);
              }
            }}
          >
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
              {snapshot.status}
            </span>
          </Button>
        );
      }
      const key = `directory:${area}:${node.path}`;
      const open = !!filter || !collapsed[scopeKey]?.has(key);
      return (
        <Collapsible
          key={node.path}
          open={open}
          onOpenChange={(value) => setOpen(key, value)}
          className="min-w-0"
        >
          <CollapsibleTrigger
            render={
              <Button
                variant="ghost"
                data-file-directory={node.path}
                aria-label={t('Directory {path}', { path: node.path })}
                title={t('{path} · {count} files', { path: node.path, count: node.count })}
                className="h-7 w-full min-w-0 justify-start gap-1 px-2 text-left text-xs"
                style={{ paddingLeft: 4 + depth * 12 }}
              >
                <TreeIcon kind={open ? 'down' : 'right'} />
                <span className="flex text-muted-foreground">
                  <TreeIcon kind={open ? 'open' : 'folder'} />
                </span>
                <span className="min-w-0 truncate">{node.name}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                  {node.count}
                </span>
              </Button>
            }
          />
          <CollapsibleContent>
            {open && renderNodes(node.children, area, depth + 1)}
          </CollapsibleContent>
        </Collapsible>
      );
    });
  }
  return (
    <div
      ref={root}
      className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
      data-file-tree=""
    >
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
                  onClick={() =>
                    setCollapsed((previous) => ({ ...previous, [scopeKey]: new Set() }))
                  }
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
                  onClick={() =>
                    setCollapsed((previous) => ({ ...previous, [scopeKey]: new Set(foldKeys) }))
                  }
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
              <CollapsibleContent>
                {(!area || open) && renderNodes(nodes, area, area ? 1 : 0)}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
