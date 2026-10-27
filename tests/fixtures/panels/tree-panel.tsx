import { useRef, useState } from 'react';
import { definePanel, usePanelInput, z } from '@qoggy/paneon/sdk';
import { Button, Input, Tree, TreeRevealError } from '@qoggy/paneon/ui';
import type { TreeHandle } from '@qoggy/paneon/ui';

type Item = { key: string; title: string; nodes?: Item[] };
const deep: Item = { key: 'deep', title: 'deep.ts' };
const items: Item[] = [
  {
    key: 'folder',
    title: 'folder',
    nodes: [
      { key: 'nested', title: 'nested', nodes: [deep] },
      { key: 'other', title: 'other.ts' },
    ],
  },
  { key: 'empty', title: 'empty', nodes: [] },
  { key: 'solo', title: 'solo.ts' },
  { key: 'locked', title: 'locked.ts' },
];
const input = z.object({ controlled: z.boolean().default(true) });
function Probe() {
  const { controlled } = usePanelInput<z.infer<typeof input>>();
  const tree = useRef<TreeHandle>(null);
  const cancel = useRef<AbortController | null>(null);
  const [expanded, setExpanded] = useState<readonly string[]>([]);
  const [requested, setRequested] = useState<readonly string[]>([]);
  const [automatic, setAutomatic] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [expansionChanges, setExpansionChanges] = useState(0);
  const [selectionChanges, setSelectionChanges] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const [results, setResults] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [mounted, setMounted] = useState(true);
  const [removed, setRemoved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [noItems, setNoItems] = useState(false);
  const [deepSelectable, setDeepSelectable] = useState(true);
  const visibleItems = removed ? items.filter((item) => item.key !== 'folder') : items;
  function reveal(id: string) {
    const controller = new AbortController();
    cancel.current = controller;
    setResults((value) => [...value, `pending:${id}`]);
    void tree.current?.revealItem(id, { signal: controller.signal }).then(
      () => setResults((value) => [...value, `done:${id}`]),
      (error: unknown) =>
        setResults((value) => [
          ...value,
          error instanceof TreeRevealError
            ? error.code
            : error instanceof Error
              ? error.name
              : String(error),
        ]),
    );
  }
  return (
    <main
      className="space-y-2 p-4"
      onKeyDown={(event) => {
        if (!(event.target as Element).closest('[data-tree-item]')) return;
        if (event.key === 'Delete') setRemoved(true);
        if (event.key === 'F2') setSearch('solo');
      }}
    >
      <h1>Tree contract probe</h1>
      <Input
        aria-label="Search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => tree.current?.expandAll()}>Expand all</Button>
        <Button onClick={() => tree.current?.collapseAll()}>Collapse all</Button>
        <Button onClick={() => setExpanded(requested)}>Accept expansion</Button>
        <Button onClick={() => setAutomatic(!automatic)}>Toggle automatic</Button>
        <Button onClick={() => reveal('deep')}>Reveal deep</Button>
        <Button onClick={() => reveal('solo')}>Reveal solo</Button>
        <Button onClick={() => reveal('missing')}>Reveal missing</Button>
        <Button onClick={() => cancel.current?.abort()}>Cancel reveal</Button>
        <Button onClick={() => setMounted(!mounted)}>Toggle mount</Button>
        <Button onClick={() => setRemoved(!removed)}>Toggle removed</Button>
        <Button onClick={() => setLoading(!loading)}>Toggle loading</Button>
        <Button onClick={() => setNoItems(!noItems)}>Toggle data</Button>
        <Button onClick={() => setDeepSelectable(!deepSelectable)}>Toggle selectable</Button>
      </div>
      {mounted && (
        <Tree
          ref={tree}
          items={noItems ? [] : visibleItems}
          getItemId={(item) => item.key}
          getItemLabel={(item) => item.title}
          getItemChildren={(item) => item.nodes}
          isItemSelectable={(item) =>
            item.nodes === undefined &&
            item.key !== 'locked' &&
            (item.key !== 'deep' || deepSelectable)
          }
          selectedId={controlled ? selected : undefined}
          expandedIds={controlled ? expanded : undefined}
          onSelectionChange={(id) => {
            setSelected(id);
            setSelectionChanges((n) => n + 1);
          }}
          onExpandedChange={(ids) => {
            setRequested(ids);
            setExpansionChanges((n) => n + 1);
            if (automatic) setExpanded(ids);
          }}
          onAction={(item) =>
            setActions((value) => [...value, item === deep ? 'deep-original' : item.key])
          }
          searchTerm={search}
          loading={loading}
          emptyState={<p>No nodes</p>}
          getItemPresentation={(item, state) => ({
            'data-probe-id': item.key,
            'data-level': state.level,
            'data-branch': state.isBranch,
          })}
          aria-label="Probe tree"
        />
      )}
      <output data-state>
        {JSON.stringify({
          expanded,
          requested,
          selected,
          expansionChanges,
          selectionChanges,
          actions,
          results,
        })}
      </output>
    </main>
  );
}
export default definePanel({
  id: 'tree-contract-probe',
  requires: { paneon: '>=0.0.1 <0.1.0' },
  input,
  render: Probe,
});
