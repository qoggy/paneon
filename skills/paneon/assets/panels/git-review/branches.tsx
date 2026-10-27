import { useLocale } from '../../shared/i18n';
import { useState } from 'react';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
} from '@qoggy/paneon/ui';
import { TreeIcon } from './file-icons.tsx';
import type { HistoryRef } from './git.ts';
import { RevisionContextMenu } from './revision-context-menu.tsx';

type Node = { name: string; path: string; children: Map<string, Node>; entry?: HistoryRef };
const mainlineNode = (node: Node): boolean =>
  !!node.entry?.mainline || [...node.children.values()].some(mainlineNode);
function branchTree(refs: HistoryRef[]) {
  const root: Node = { name: '', path: '', children: new Map() };
  for (const entry of [...refs].sort((a, b) => a.name.localeCompare(b.name))) {
    let parent = root;
    for (const name of entry.name.split('/')) {
      let child = parent.children.get(name);
      if (!child) {
        child = { name, path: `${parent.path}/${name}`, children: new Map() };
        parent.children.set(name, child);
      }
      parent = child;
    }
    parent.entry = entry;
  }
  return root.children;
}
function RefIcon({
  tag = false,
  mainline = false,
  current = false,
}: {
  tag?: boolean;
  mainline?: boolean;
  current?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill={mainline ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.3"
      className={`size-3.5 shrink-0 ${mainline || current ? 'text-amber-500 dark:text-amber-400' : 'text-muted-foreground'}`}
      data-ref-icon={current ? 'current' : mainline ? 'mainline' : tag ? 'tag' : 'branch'}
      aria-hidden="true"
    >
      {mainline && !current ? (
        <path d="m8 1.5 2 4.2 4.6.6-3.3 3.2.8 4.5L8 11.8l-4.1 2.2.8-4.5L1.4 6.3l4.6-.6Z" />
      ) : tag || current ? (
        <path d="m2 8 6-6h6v6l-6 6-6-6ZM11 5h.01" />
      ) : (
        <>
          <circle cx="4" cy="3" r="1.5" />
          <circle cx="4" cy="13" r="1.5" />
          <circle cx="12" cy="4" r="1.5" />
          <path d="M4 4.5v7M12 5.5V7a3 3 0 0 1-3 3H4" />
        </>
      )}
    </svg>
  );
}

export function Branches({
  refs,
  selected,
  currentBranch,
  onSelect,
  onOpen,
  onCompare,
}: {
  refs: HistoryRef[];
  selected?: string;
  currentBranch?: string;
  onSelect: (ref: string) => void;
  onOpen?: (ref: string) => void;
  onCompare?: (ref: string) => void;
}) {
  const { t } = useLocale();
  const headLabel =
    refs.length > 0 && !currentBranch ? t('HEAD (detached)') : t('HEAD（当前分支）');
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const needle = filter.trim().toLocaleLowerCase();
  const matches = refs.filter((entry) => entry.name.toLocaleLowerCase().includes(needle));
  const currentNode = (node: Node) =>
    node.entry?.kind === 'branch' && node.entry.name === currentBranch;
  function render(nodes: Map<string, Node>, kind: HistoryRef['kind'], depth = 0) {
    return [...nodes.values()]
      .sort(
        (a, b) =>
          Number(currentNode(b)) - Number(currentNode(a)) ||
          Number(mainlineNode(b)) - Number(mainlineNode(a)),
      )
      .map((node) => {
        if (node.entry) {
          const entry = node.entry;
          const active = selected === entry.ref || selected === entry.name;
          const current = currentNode(node);
          return (
            <RevisionContextMenu key={entry.ref} revision={entry.ref} onCompare={onCompare}>
              <Button
                variant={active ? 'secondary' : 'ghost'}
                aria-label={`${{ branch: t('本地分支'), remote: t('远程分支'), tag: t('标签') }[kind]} ${entry.name}`}
                aria-pressed={active}
                title={`${entry.name}${current ? t(' · 当前分支') : ''}`}
                aria-description={
                  [entry.mainline && t('主干分支'), current && t('当前分支')]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
                data-mainline={entry.mainline || undefined}
                data-current-branch={current || undefined}
                data-history-ref={entry.ref}
                className="h-7 w-full min-w-0 justify-start gap-1.5 px-2 text-xs font-normal"
                style={{ paddingLeft: 8 + depth * 12 }}
                onClick={() => onSelect(entry.ref)}
                onContextMenu={() => onSelect(entry.ref)}
                onDoubleClick={() => onOpen?.(entry.ref)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || !onOpen) return;
                  event.preventDefault();
                  onSelect(entry.ref);
                  onOpen(entry.ref);
                }}
              >
                <RefIcon tag={kind === 'tag'} mainline={entry.mainline} current={current} />
                <span className="min-w-0 truncate">{node.name}</span>
              </Button>
            </RevisionContextMenu>
          );
        }
        const key = `${kind}:${node.path}`;
        const open = !!needle || !collapsed.has(key);
        return (
          <Collapsible
            key={key}
            open={open}
            onOpenChange={(expanded) =>
              setCollapsed((previous) => {
                const next = new Set(previous);
                if (expanded) next.delete(key);
                else next.add(key);
                return next;
              })
            }
          >
            <CollapsibleTrigger
              render={
                <Button
                  variant="ghost"
                  aria-label={t('Branch directory {path}', { path: node.path.slice(1) })}
                  className="h-7 w-full min-w-0 justify-start gap-1.5 px-2 text-xs font-normal"
                  style={{ paddingLeft: 8 + depth * 12 }}
                >
                  <TreeIcon kind={open ? 'down' : 'right'} />
                  <span className="min-w-0 truncate">{node.name}</span>
                </Button>
              }
            />
            <CollapsibleContent>
              {open && render(node.children, kind, depth + 1)}
            </CollapsibleContent>
          </Collapsible>
        );
      });
  }
  return (
    <aside
      aria-label={t('历史分支')}
      className="flex max-h-64 min-h-0 min-w-0 flex-col md:max-h-none"
    >
      <div className="shrink-0 border-b p-1">
        <Input
          aria-label={t('搜索分支或标签')}
          placeholder={t('搜索分支或标签')}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <nav aria-label={t('选择历史分支')} className="min-h-0 overflow-auto p-1">
        <RevisionContextMenu revision="HEAD" onCompare={onCompare}>
          <Button
            variant={!selected || selected === 'HEAD' ? 'secondary' : 'ghost'}
            aria-pressed={!selected || selected === 'HEAD'}
            aria-label={headLabel}
            className="h-7 w-full justify-start px-2 text-xs font-normal"
            onClick={() => onSelect('HEAD')}
            onContextMenu={() => onSelect('HEAD')}
            onDoubleClick={() => onOpen?.('HEAD')}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || !onOpen) return;
              event.preventDefault();
              onSelect('HEAD');
              onOpen('HEAD');
            }}
          >
            {headLabel}
          </Button>
        </RevisionContextMenu>
        {(['branch', 'remote', 'tag'] as const).map((kind) => {
          const entries = matches.filter((entry) => entry.kind === kind);
          if (!entries.length) return null;
          return (
            <section
              key={kind}
              aria-label={{ branch: t('本地分支'), remote: t('远程分支'), tag: t('标签') }[kind]}
            >
              <h2 className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                {{ branch: t('本地'), remote: t('远程'), tag: t('标签') }[kind]}
              </h2>
              {render(branchTree(entries), kind)}
            </section>
          );
        })}
        {needle && !matches.length && (
          <p className="px-2 py-3 text-xs text-muted-foreground">{t('没有匹配的分支或标签。')}</p>
        )}
      </nav>
    </aside>
  );
}
