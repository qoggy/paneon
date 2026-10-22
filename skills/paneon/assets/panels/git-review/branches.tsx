import { useState } from 'react';
import { Button, Input } from 'paneon/ui';
import type { HistoryRef } from './git.ts';

type Node = { name: string; path: string; children: Map<string, Node>; entry?: HistoryRef };
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
function RefIcon({ tag = false }: { tag?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      className="size-3.5 shrink-0 text-muted-foreground"
      aria-hidden="true"
    >
      {tag ? (
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
}: {
  refs: HistoryRef[];
  selected?: string;
  currentBranch?: string;
  onSelect: (ref: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const needle = filter.trim().toLocaleLowerCase();
  const matches = refs.filter((entry) => entry.name.toLocaleLowerCase().includes(needle));
  function render(nodes: Map<string, Node>, kind: HistoryRef['kind'], depth = 0) {
    return [...nodes.values()].map((node) => {
      if (node.entry) {
        const entry = node.entry;
        const active = selected === entry.ref || selected === entry.name;
        const current = entry.kind === 'branch' && entry.name === currentBranch;
        return (
          <Button
            key={entry.ref}
            variant={active ? 'secondary' : 'ghost'}
            aria-label={`${{ branch: '本地分支', remote: '远程分支', tag: '标签' }[kind]} ${entry.name}`}
            aria-pressed={active}
            title={`${entry.name}${current ? ' · 当前分支' : ''}`}
            data-history-ref={entry.ref}
            className="h-7 w-full min-w-0 justify-start gap-1.5 px-2 text-xs font-normal"
            style={{ paddingLeft: 8 + depth * 12 }}
            onClick={() => onSelect(entry.ref)}
          >
            <RefIcon tag={kind === 'tag'} />
            <span className="min-w-0 truncate">{node.name}</span>
            {current && <span className="ml-auto text-muted-foreground">当前</span>}
          </Button>
        );
      }
      const key = `${kind}:${node.path}`;
      const open = !!needle || !collapsed.has(key);
      return (
        <div key={key}>
          <Button
            variant="ghost"
            aria-label={`分支目录 ${node.path.slice(1)}`}
            aria-expanded={open}
            className="h-7 w-full min-w-0 justify-start gap-1.5 px-2 text-xs font-normal"
            style={{ paddingLeft: 8 + depth * 12 }}
            onClick={() =>
              setCollapsed((previous) => {
                const next = new Set(previous);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              })
            }
          >
            <span className="w-3.5 shrink-0 text-muted-foreground" aria-hidden="true">
              {open ? '⌄' : '›'}
            </span>
            <span className="truncate">{node.name}</span>
          </Button>
          {open && render(node.children, kind, depth + 1)}
        </div>
      );
    });
  }
  return (
    <aside aria-label="历史分支" className="flex max-h-64 min-h-0 min-w-0 flex-col md:max-h-none">
      <div className="shrink-0 border-b p-1">
        <Input
          aria-label="搜索分支或标签"
          placeholder="搜索分支或标签"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <nav aria-label="选择历史分支" className="min-h-0 overflow-auto p-1">
        <Button
          variant={!selected || selected === 'HEAD' ? 'secondary' : 'ghost'}
          aria-pressed={!selected || selected === 'HEAD'}
          aria-label="HEAD（当前分支）"
          className="h-7 w-full justify-start px-2 text-xs font-normal"
          onClick={() => onSelect('HEAD')}
        >
          HEAD（当前分支）
        </Button>
        {(['branch', 'remote', 'tag'] as const).map((kind) => {
          const entries = matches.filter((entry) => entry.kind === kind);
          if (!entries.length) return null;
          return (
            <section
              key={kind}
              aria-label={{ branch: '本地分支', remote: '远程分支', tag: '标签' }[kind]}
            >
              <h2 className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                {{ branch: '本地', remote: '远程', tag: '标签' }[kind]}
              </h2>
              {render(branchTree(entries), kind)}
            </section>
          );
        })}
        {needle && !matches.length && (
          <p className="px-2 py-3 text-xs text-muted-foreground">没有匹配的分支或标签。</p>
        )}
      </nav>
    </aside>
  );
}
