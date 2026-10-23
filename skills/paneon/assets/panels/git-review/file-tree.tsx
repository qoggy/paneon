import { useLocale } from '../../shared/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'paneon/ui';
import type { GitFile } from './git.ts';
import {
  areaNames,
  filterFileTree,
  groupFileTrees,
  selectedAncestors,
  snapshotName,
  snapshotTitle,
  statusClass,
} from './file-tree-model.ts';
import type { TreeNode } from './file-tree-model.ts';

function TreeIcon({ kind }: { kind: 'file' | 'folder' | 'open' | 'down' | 'right' }) {
  const paths = {
    file: 'M8 2H4v12h9V7L8 2Z M8 2v5h5',
    folder: 'M2 4h5l2 2h5v7H2V4Z',
    open: 'M2 6V4h5l2 2h5 M2 6h13l-2 7H2V6Z',
    down: 'm4 6 4 4 4-4',
    right: 'm6 4 4 4-4 4',
  };
  return (
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
      <path d={paths[kind]} />
    </svg>
  );
}

type Props = {
  snapshots: GitFile[];
  selectedId?: string;
  filter: string;
  scopeKey: string;
  revealKey: number;
  onSelect: (snapshot: GitFile) => void;
};
export function ChangedFileTree({
  snapshots,
  selectedId,
  filter,
  scopeKey,
  revealKey,
  onSelect,
}: Props) {
  const { t, message } = useLocale();
  const groups = useMemo(() => groupFileTrees(snapshots), [snapshots]);
  const [collapsed, setCollapsed] = useState<Record<string, Set<string>>>({});
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ancestors = groups.flatMap(({ area, nodes }) =>
      selectedAncestors(nodes, selectedId).map((path) => `${area}:${path}`),
    );
    setCollapsed((previous) => {
      const saved = previous[scopeKey];
      if (!saved || !ancestors.some((path) => saved.has(path))) return previous;
      return {
        ...previous,
        [scopeKey]: new Set([...saved].filter((path) => !ancestors.includes(path))),
      };
    });
  }, [groups, selectedId, scopeKey, revealKey]);
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
          >
            <TreeIcon kind="file" />
            <span className="min-w-0 truncate">{node.name}</span>
            <span className="ml-auto shrink-0 text-[10px]" aria-hidden="true">
              {snapshot.status}
            </span>
          </Button>
        );
      }
      const key = `${area}:${node.path}`;
      const open = !!filter || !collapsed[scopeKey]?.has(key);
      return (
        <div key={node.path} className="min-w-0">
          <Button
            variant="ghost"
            data-file-directory={node.path}
            aria-label={t('Directory {path}', { path: node.path })}
            aria-expanded={open}
            title={t('{path} · {count} files', { path: node.path, count: node.count })}
            className="h-7 w-full min-w-0 justify-start gap-1 px-2 text-left text-xs"
            style={{ paddingLeft: 4 + depth * 12 }}
            onClick={() =>
              setCollapsed((previous) => {
                const next = new Set(previous[scopeKey]);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return { ...previous, [scopeKey]: next };
              })
            }
          >
            <TreeIcon kind={open ? 'down' : 'right'} />
            <span className="flex text-muted-foreground">
              <TreeIcon kind={open ? 'open' : 'folder'} />
            </span>
            <span className="min-w-0 truncate">{node.name}</span>
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{node.count}</span>
          </Button>
          {open && renderNodes(node.children, area, depth + 1)}
        </div>
      );
    });
  }
  return (
    <div ref={root} className="w-full min-w-0 overflow-hidden" data-file-tree="">
      {groups.map(({ area, nodes }) => {
        const visible = filterFileTree(nodes, filter);
        if (!visible.length) return null;
        return (
          <div key={area} className="min-w-0" data-file-group={area}>
            {area && (
              <div className="px-2 pt-2 pb-1 text-xs text-muted-foreground">
                {t(areaNames[area as keyof typeof areaNames])}
              </div>
            )}
            {renderNodes(visible, area)}
          </div>
        );
      })}
    </div>
  );
}
