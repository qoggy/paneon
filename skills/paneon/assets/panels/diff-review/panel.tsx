import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronsDownUp, ChevronsUpDown, FileDiff, FolderTree, TreeIcon } from './icons';
import { agent, definePanel, serverAction, usePanelInput, useQuery, z } from '@qoggy/paneon/sdk';
import { readFile } from 'node:fs/promises';
import type { AnnotationValue } from '@qoggy/paneon/sdk';
import type { DiffViewHandle } from '@qoggy/paneon/ui';
import { useSubmission } from '../../shared/submission';
import { FileReviewSplit } from '../../shared/file-review-split';
import {
  comparisonSchema,
  diffReviewParamsSchema,
  diffReviewSubmittedSchema,
  validateRanges,
  validateSources,
} from './schema';
import type { DiffRef, Snapshot } from './schema';
import {
  Button,
  DiffView,
  Empty,
  EmptyDescription,
  EmptyHeader,
  Input,
  Page,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Tree,
  useUI,
  usePageAnnotations,
} from '@qoggy/paneon/ui';
import type { TreeHandle } from '@qoggy/paneon/ui';
import {
  comparisonPath,
  comparisonStatus,
  comparisonStatusClass,
  matchesComparison,
  visibleFileCount,
  reviewTree,
} from './model';
import type { Comparison, ComparisonStatus } from './model';

// Snapshot identity is internal; callers supply only the physical paths.
async function snapshotId(comparison: Comparison, oldText: string, newText: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify([comparison, oldText, newText])),
  );
  return (
    'sha256:' +
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  );
}

export const validateFeedback = serverAction({
  input: z
    .object({
      params: diffReviewParamsSchema,
      feedback: diffReviewSubmittedSchema,
    })
    .strict(),
  handler: (_ctx, { params, feedback }) => validateSources(params, feedback),
});

async function readComparisonTexts(comparison: Comparison, signal: AbortSignal) {
  // Only an explicit null is absent. Relative paths resolve against the panel's --cwd.
  const read = (path: string | null) =>
    path === null ? Promise.resolve('') : readFile(path, { encoding: 'utf8', signal });
  const [oldText, newText] = await Promise.all([
    read(comparison.oldPath),
    read(comparison.newPath),
  ]);
  return { oldText, newText };
}

export const readComparisonStatuses = serverAction({
  kind: 'query',
  input: z.array(comparisonSchema),
  handler: async (ctx, files) =>
    Promise.all(
      files.map(async (comparison) => {
        try {
          const texts = await readComparisonTexts(comparison, ctx.signal);
          return { status: comparisonStatus(comparison, texts) };
        } catch (error) {
          if (ctx.signal.aborted) throw error;
          return {
            status: '!' as const,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    ),
});

export const readComparison = serverAction({
  kind: 'query',
  input: comparisonSchema,
  handler: async (ctx, comparison) => {
    const { oldText, newText } = await readComparisonTexts(comparison, ctx.signal);
    return { id: await snapshotId(comparison, oldText, newText), oldText, newText };
  },
});

function ComparisonView({
  comparison,
  onStatus,
  onRead,
  fileIndex,
  diff,
}: {
  comparison: Comparison;
  fileIndex: number;
  diff: React.RefObject<DiffViewHandle | null>;
  onRead: (index: number, snapshot: Snapshot) => void;
  onStatus: (comparison: Comparison, status: ComparisonStatus) => void;
}) {
  const { language } = useUI();
  const query = useQuery(readComparison, comparison);
  const zh = language === 'zh-CN';
  useEffect(() => {
    if (query.loading) return;
    if (query.error) onStatus(comparison, '!');
    else if (query.data) {
      onRead(fileIndex, query.data);
      onStatus(comparison, comparisonStatus(comparison, query.data));
    }
  }, [comparison, onStatus, onRead, fileIndex, query.loading, query.error, query.data]);
  if (query.loading)
    return (
      <p role="status" className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Spinner aria-hidden="true" />
        {zh ? '正在读取文件…' : 'Reading files…'}
      </p>
    );
  if (query.error)
    return (
      <p role="alert" className="p-4 text-sm text-destructive">
        {zh ? '读取文件失败：' : 'Could not read files: '}
        {query.error.message}
      </p>
    );
  if (!query.data) return null;
  return (
    <SnapshotView comparison={comparison} snapshot={query.data} fileIndex={fileIndex} diff={diff} />
  );
}

function SnapshotView({
  comparison,
  snapshot,
  fileIndex,
  diff,
}: {
  comparison: Comparison;
  snapshot: Snapshot;
  fileIndex: number;
  diff: React.RefObject<DiffViewHandle | null>;
}) {
  return (
    <DiffView
      ref={diff}
      oldText={snapshot.oldText}
      newText={snapshot.newText}
      oldPath={comparison.oldPath ?? undefined}
      newPath={comparison.newPath ?? undefined}
      annotationTargets={{
        old:
          comparison.oldPath === null
            ? undefined
            : { fileIndex, snapshotId: snapshot.id, side: 'old' },
        new:
          comparison.newPath === null
            ? undefined
            : { fileIndex, snapshotId: snapshot.id, side: 'new' },
      }}
      defaultExpanded
      layout="bounded"
    />
  );
}

function ToolbarButton({
  label,
  children,
  onClick,
  disabled,
  pressed,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-sm"
            variant={pressed ? 'secondary' : 'ghost'}
            className="size-7"
            aria-label={label}
            aria-pressed={pressed}
            disabled={disabled}
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function DiffReviewPanel() {
  const value = usePanelInput<z.infer<typeof diffReviewParamsSchema>>();
  const { language } = useUI();
  const copy =
    language === 'zh-CN'
      ? {
          title: '文件差异审阅',
          help: '单击选择，双击或按 Enter 查看文件差异。',
          search: '搜索文件',
          actions: '文件操作',
          viewDiff: '查看文件差异',
          group: '按目录分组',
          expand: '全部展开',
          collapse: '全部折叠',
          resize: '调整文件列表与差异宽度',
          files: '拟议修改的文件',
          empty: '没有匹配的文件。',
          comparison: '文件差异',
          open: '打开一个文件查看差异。',
          statuses: {
            A: '新增',
            M: '修改',
            D: '删除',
            '=': '无变化',
            '!': '读取失败',
            pending: '等待比较',
          },
        }
      : {
          title: 'Diff review',
          help: 'Click to select. Double-click or press Enter to compare the files.',
          search: 'Search files',
          actions: 'File actions',
          viewDiff: 'View file diff',
          group: 'Group by directory',
          expand: 'Expand all',
          collapse: 'Collapse all',
          resize: 'Resize file list and diff',
          files: 'Proposed files',
          empty: 'No matching files.',
          comparison: 'File comparison',
          open: 'Open a file to compare its contents.',
          statuses: {
            A: 'Added',
            M: 'Modified',
            D: 'Deleted',
            '=': 'Unchanged',
            '!': 'Read failed',
            pending: 'Awaiting comparison',
          },
        };
  const [grouped, setGrouped] = useState(true);
  const roots = useMemo(() => reviewTree(value.files, grouped), [value.files, grouped]);
  const initial = useMemo(() => {
    const expanded: string[] = [];
    function visit(nodes: typeof roots) {
      for (const node of nodes)
        if (node.nodes) {
          expanded.push(node.key);
          visit(node.nodes);
        }
    }
    visit(roots);
    return { expanded, selected: 'file:0' };
  }, [roots]);
  const [selected, setSelected] = useState<string | null>(initial.selected);
  // Keep directory expansion while flat mode temporarily omits directory nodes.
  const [expanded, setExpanded] = useState<readonly string[]>(initial.expanded);
  const [search, setSearch] = useState('');
  const [opened, setOpened] = useState<Comparison | null>(value.files[0] ?? null);
  const [statuses, setStatuses] = useState<Record<string, ComparisonStatus>>({});
  const statusQuery = useQuery(readComparisonStatuses, value.files);
  const comparisonStates: Record<string, { status: ComparisonStatus; error?: string }> =
    Object.fromEntries(
      value.files.map((comparison, index) => {
        const key = `file:${index}`;
        return [
          key,
          statuses[key] !== undefined
            ? { status: statuses[key] }
            : statusQuery.error
              ? { status: '!', error: statusQuery.error.message }
              : (statusQuery.data?.[index] ?? { status: comparisonStatus(comparison) }),
        ];
      }),
    );
  const recordStatus = useCallback(
    (comparison: Comparison, status: ComparisonStatus) => {
      const key = `file:${value.files.indexOf(comparison)}`;
      setStatuses((previous) =>
        previous[key] === status ? previous : { ...previous, [key]: status },
      );
    },
    [value.files],
  );
  const tree = useRef<TreeHandle>(null);
  const diff = useRef<DiffViewHandle>(null);
  const snapshots = useRef(new Map<string, Snapshot>());
  const [preserved, setPreserved] = useState<{ fileIndex: number; snapshot: Snapshot } | null>(
    null,
  );
  const mounted = useRef<string | null>(null);
  const locating = useRef(0);
  const recordSnapshot = useCallback((index: number, snapshot: Snapshot) => {
    snapshots.current.set(`${index}:${snapshot.id}`, snapshot);
    mounted.current = `${index}:${snapshot.id}`;
  }, []);
  function open(comparison: Comparison) {
    locating.current++;
    setPreserved(null);
    setOpened(comparison);
  }
  const submission = useSubmission<AnnotationValue<DiffRef>>(
    async (feedback) => {
      const sources = new Map<
        string,
        {
          fileIndex: number;
          snapshotId: string;
          displayPath?: string;
          oldPath: string | null;
          newPath: string | null;
        }
      >();
      const retained: Record<string, Snapshot> = {};
      for (const annotation of feedback.annotations)
        for (const target of annotation.targets) {
          if (target.sourceRef !== undefined) continue;
          const { fileIndex, snapshotId } = target.ref;
          const key = `${fileIndex}:${snapshotId}`;
          const snapshot = snapshots.current.get(key);
          if (!snapshot) throw new Error('Missing original comparison snapshot. Draft retained.');
          sources.set(key, { ...value.files[fileIndex], fileIndex, snapshotId });
          retained[key] = snapshot;
        }
      const result = { ...feedback, sources: [...sources.values()] };
      validateRanges(value, result, retained);
      for (const source of result.sources) {
        const snapshot = retained[`${source.fileIndex}:${source.snapshotId}`];
        if (
          (await snapshotId(value.files[source.fileIndex], snapshot.oldText, snapshot.newText)) !==
          snapshot.id
        )
          throw new Error('Comparison snapshot identity does not match its content.');
      }
      const validated = await validateFeedback({ params: value, feedback: result });
      return agent.emit('diff-review-submitted', validated);
    },
    { successToast: 'Annotations submitted.' },
  );
  usePageAnnotations<DiffRef>({
    onSubmit: (feedback) => submission.submit(feedback),
    allowEmptySubmit: submission.hasReceipt,
    adapter: {
      resolve(target) {
        const { fileIndex, snapshotId, side } = target.ref;
        const snapshot = snapshots.current.get(`${fileIndex}:${snapshotId}`);
        return snapshot
          ? { status: 'ready', text: snapshot[`${side}Text`] }
          : { status: 'missing', message: 'Missing original comparison snapshot. Draft retained.' };
      },
      targetRanges(target) {
        return mounted.current === `${target.ref.fileIndex}:${target.ref.snapshotId}` && target.text
          ? (diff.current?.getRanges({ kind: 'text', side: target.ref.side, ...target.text }) ?? [])
          : [];
      },
      async locate(target) {
        const serial = ++locating.current;
        const { fileIndex, snapshotId, side } = target.ref;
        const snapshot = snapshots.current.get(`${fileIndex}:${snapshotId}`);
        if (!snapshot || !target.text) return;
        setSearch('');
        setSelected(`file:${fileIndex}`);
        setOpened(value.files[fileIndex]);
        setPreserved({ fileIndex, snapshot });
        recordStatus(value.files[fileIndex], comparisonStatus(value.files[fileIndex], snapshot));
        mounted.current = `${fileIndex}:${snapshotId}`;
        // Restore the preserved view before asking its DOM-based coordinate adapter to reveal.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        if (serial !== locating.current) return;
        if (grouped) tree.current?.expandAll();
        await diff.current?.reveal({ kind: 'text', side, ...target.text });
      },
    },
  });
  const selectedFile =
    value.files.find((_, index) => `file:${index}` === selected) ?? value.files[0];
  const hasBranches = roots.some((node) => node.nodes !== undefined);
  return (
    <Page className="mx-0 flex h-screen min-h-0 max-w-none flex-col gap-4 space-y-0 p-4 md:p-4">
      <h1 className="text-lg font-semibold">{value.title ?? copy.title}</h1>
      <p className="text-sm text-muted-foreground">{copy.help}</p>
      <FileReviewSplit
        separatorLabel={copy.resize}
        sidebar={
          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div
              role="toolbar"
              aria-label={copy.actions}
              className="flex shrink-0 items-center gap-0.5 border-b px-1 py-0.5 text-muted-foreground"
            >
              <ToolbarButton
                label={copy.viewDiff}
                disabled={!selectedFile}
                onClick={() => {
                  if (!selectedFile) return;
                  setSelected(`file:${value.files.indexOf(selectedFile)}`);
                  open(selectedFile);
                }}
              >
                <FileDiff className="size-4" aria-hidden="true" />
              </ToolbarButton>
              <ToolbarButton
                label={copy.group}
                pressed={grouped}
                onClick={() => setGrouped(!grouped)}
              >
                <FolderTree className="size-4" aria-hidden="true" />
              </ToolbarButton>
              <div className="flex-1" />
              <ToolbarButton
                label={copy.expand}
                disabled={!hasBranches}
                onClick={() => tree.current?.expandAll()}
              >
                <ChevronsUpDown className="size-4" aria-hidden="true" />
              </ToolbarButton>
              <ToolbarButton
                label={copy.collapse}
                disabled={!hasBranches || !!search}
                onClick={() => tree.current?.collapseAll()}
              >
                <ChevronsDownUp className="size-4" aria-hidden="true" />
              </ToolbarButton>
            </div>
            <div className="shrink-0 border-b p-0">
              <Input
                className="h-8 rounded-none border-0 px-2 shadow-none focus-visible:ring-inset"
                aria-label={copy.search}
                placeholder={copy.search}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <Tree
                ref={tree}
                items={roots}
                getItemId={(node) => node.key}
                getItemLabel={(node) => node.name}
                getItemChildren={(node) => node.nodes}
                getItemPresentation={(node) => {
                  if (!node.comparison)
                    return {
                      className: 'gap-1.5',
                      title: `${node.name} · ${visibleFileCount(node, search)}`,
                    };
                  const { status, error } = comparisonStates[node.key];
                  const description = [
                    copy.statuses[status],
                    comparisonPath(node.comparison),
                    error,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return {
                    className: `gap-1.5 ${comparisonStatusClass(status)}`,
                    title: description,
                    'aria-description': description,
                    'data-comparison-status': status,
                  };
                }}
                isItemSelectable={(node) => node.comparison !== undefined}
                selectedId={selected}
                onSelectionChange={setSelected}
                expandedIds={expanded}
                onExpandedChange={setExpanded}
                onAction={(node) => {
                  if (node.comparison) open(node.comparison);
                }}
                searchTerm={search}
                isItemMatchingSearch={(node, term) =>
                  !!node.comparison && matchesComparison(node.comparison, term)
                }
                renderItemContent={(node, state) => {
                  const path = node.comparison ? comparisonPath(node.comparison) : '';
                  const parent = path.slice(0, Math.max(0, path.lastIndexOf('/')));
                  return (
                    <>
                      <TreeIcon
                        kind={state.isBranch ? (state.expanded ? 'open' : 'folder') : 'file'}
                      />
                      <span className="min-w-0 truncate">{node.name}</span>
                      {!grouped && parent && (
                        <span className="min-w-0 flex-1 truncate font-normal text-muted-foreground">
                          {parent}
                        </span>
                      )}
                      {node.nodes && (
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                          {visibleFileCount(node, search)}
                        </span>
                      )}
                      {node.comparison && (
                        <span
                          aria-hidden="true"
                          className="ml-auto shrink-0 text-[10px] font-normal"
                        >
                          {comparisonStates[node.key].status === 'pending'
                            ? '…'
                            : comparisonStates[node.key].status}
                        </span>
                      )}
                    </>
                  );
                }}
                emptyState={
                  <Empty className="flex-none px-3 py-8">
                    <EmptyHeader>
                      <EmptyDescription>{copy.empty}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                }
                className="p-1"
                aria-label={copy.files}
              />
            </div>
          </section>
        }
      >
        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border"
          aria-label={copy.comparison}
        >
          {preserved ? (
            <SnapshotView
              comparison={value.files[preserved.fileIndex]}
              snapshot={preserved.snapshot}
              fileIndex={preserved.fileIndex}
              diff={diff}
            />
          ) : opened ? (
            // A fresh query/view per manifest entry keeps late responses off another file.
            <ComparisonView
              key={value.files.indexOf(opened)}
              comparison={opened}
              onStatus={recordStatus}
              onRead={recordSnapshot}
              fileIndex={value.files.indexOf(opened)}
              diff={diff}
            />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">{copy.open}</p>
          )}
        </section>
      </FileReviewSplit>
      {submission.message && (
        <p role={submission.failed ? 'alert' : 'status'}>{submission.message}</p>
      )}
    </Page>
  );
}

export default definePanel({
  id: 'diff-review',
  requires: { paneon: '>=0.1.0 <0.2.0' },
  input: diffReviewParamsSchema,
  events: { 'diff-review-submitted': diffReviewSubmittedSchema },
  render: DiffReviewPanel,
});
