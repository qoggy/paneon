import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { agent, definePanel, usePanelInput, useQuery } from '@qoggy/paneon/sdk';
import type { AnnotationValue } from '@qoggy/paneon/sdk';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AnnotationText,
  Button,
  CodeBlock,
  Empty,
  EmptyDescription,
  EmptyHeader,
  Input,
  Markdown,
  Page,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Tree,
  usePageAnnotations,
  useUI,
} from '@qoggy/paneon/ui';
import type { TreeHandle } from '@qoggy/paneon/ui';
import { ChevronsDownUp, ChevronsUpDown, FolderTree, TreeIcon } from '../diff-review/icons';
import { FileReviewSplit } from '../../shared/file-review-split';
import { useSubmission } from '../../shared/submission';
import { useLocale } from '../../shared/i18n';
import { readFile, resolvePaths, validateFeedback } from './actions';
import { publicFileFeedback } from './feedback';
import {
  ancestorKeys,
  directoryKeys,
  fileLanguage,
  fileTree,
  isMarkdown,
  visibleFileCount,
} from './model';
import { fileReviewParamsSchema, fileReviewSubmittedSchema, snapshotKey } from './schema';
import type { FileRef, FileReviewParams, Snapshot } from './schema';

type ReadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; snapshot: Snapshot };

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

/** Child registrations run before this layout effect, including CodeBlock's plain-text registration. */
function Preview({
  snapshot,
  onReady,
}: {
  snapshot: Snapshot;
  onReady: (snapshot: Snapshot) => () => void;
}) {
  const { t } = useLocale();
  useLayoutEffect(() => onReady(snapshot), [snapshot, onReady]);
  const target = { fileIndex: snapshot.fileIndex, snapshotId: snapshot.snapshotId };
  return snapshot.text === '' ? (
    <Empty className="flex-none py-8">
      <EmptyHeader>
        <EmptyDescription>{t('The file has no content.')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  ) : isMarkdown(snapshot.path) ? (
    <div className="p-4">
      <Markdown sourcePath={snapshot.path} annotationTarget={target}>
        {snapshot.text}
      </Markdown>
    </div>
  ) : (
    <CodeBlock
      code={snapshot.text}
      language={fileLanguage(snapshot.path)}
      header={false}
      lineNumbers
      defaultWrap={false}
      annotationTarget={target}
      className="rounded-none border-0"
    />
  );
}

function FileReviewPanel() {
  const value = usePanelInput<FileReviewParams>();
  const { language } = useUI();
  const { t } = useLocale();
  const copy =
    language === 'zh-CN'
      ? {
          title: '文件审阅',
          files: '审阅文件',
          search: '搜索文件',
          actions: '文件操作',
          group: '按目录分组',
          expand: '全部展开',
          collapse: '全部折叠',
          empty: '没有匹配的文件。',
          preview: '文件预览',
          resize: '调整文件列表与预览宽度',
        }
      : {
          title: 'File review',
          files: 'Review files',
          search: 'Search files',
          actions: 'File actions',
          group: 'Group by directory',
          expand: 'Expand all',
          collapse: 'Collapse all',
          empty: 'No matching files.',
          preview: 'File preview',
          resize: 'Resize file list and preview',
        };
  const directoryRoots = useMemo(() => fileTree(value.files), [value.files]);
  const [grouped, setGrouped] = useState(true);
  const roots = useMemo(
    () => (grouped ? directoryRoots : fileTree(value.files, false)),
    [grouped, directoryRoots, value.files],
  );
  const paths = useQuery(resolvePaths, value.files);
  const [expanded, setExpanded] = useState<readonly string[]>(() => directoryKeys(directoryRoots));
  const [search, setSearch] = useState('');
  const [opened, setOpened] = useState(0);
  const [entries, setEntries] = useState<Map<number, ReadState>>(() => new Map());
  const snapshots = useRef(new Map<string, Snapshot>());
  const tree = useRef<TreeHandle>(null);
  const mounted = useRef<string | null>(null);
  const pendingLocation = useRef<{ key: string; resolve: () => void } | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (entries.has(opened)) return;
    const fileIndex = opened;
    setEntries((previous) => new Map(previous).set(fileIndex, { status: 'loading' }));
    void readFile({ files: value.files, fileIndex })
      .then((snapshot) => {
        snapshots.current.set(snapshotKey(snapshot), snapshot);
        setEntries((previous) => new Map(previous).set(fileIndex, { status: 'ready', snapshot }));
      })
      .catch((error: unknown) => {
        console.error('Could not read review file.', value.files[fileIndex], error);
        setEntries((previous) =>
          new Map(previous).set(fileIndex, {
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      });
  }, [opened, entries, value.files]);

  const previewReady = useCallback((snapshot: Snapshot) => {
    const key = snapshotKey(snapshot);
    mounted.current = key;
    if (pendingLocation.current?.key === key) {
      pendingLocation.current.resolve();
      pendingLocation.current = null;
    }
    return () => {
      if (mounted.current === key) mounted.current = null;
    };
  }, []);

  const submission = useSubmission<AnnotationValue<FileRef>>(
    async (feedback) => {
      const sources = new Map<string, Snapshot>();
      for (const annotation of feedback.annotations)
        for (const target of annotation.targets) {
          const key = snapshotKey(target.ref);
          const snapshot = snapshots.current.get(key);
          if (!snapshot) throw new Error('Missing original file snapshot. Draft retained.');
          sources.set(key, snapshot);
        }
      const evidence = { files: [...sources.values()] };
      const validated = await validateFeedback({ params: value, feedback, evidence });
      const receipt = await agent.emit(
        'file-review-submitted',
        publicFileFeedback(validated, evidence),
      );
      setLocked(true);
      return receipt;
    },
    { successToast: 'Annotations submitted.' },
  );

  usePageAnnotations<FileRef>({
    disabled: locked,
    onRequestEdit: locked ? () => setLocked(false) : undefined,
    onSubmit: (feedback) => submission.submit(feedback),
    allowEmptySubmit: submission.hasReceipt,
    adapter: {
      resolve(target) {
        const snapshot = snapshots.current.get(snapshotKey(target.ref));
        return snapshot
          ? {
              status: 'ready',
              text: target.ref.part === 'path' ? value.files[snapshot.fileIndex] : snapshot.text,
            }
          : { status: 'missing', message: 'Missing original file snapshot. Draft retained.' };
      },
      async locate(target) {
        const key = snapshotKey(target.ref);
        const snapshot = snapshots.current.get(key);
        if (!snapshot) throw new Error('Missing original file snapshot. Draft retained.');
        setSearch('');
        setExpanded((previous) => [
          ...new Set([...previous, ...(ancestorKeys(directoryRoots, snapshot.fileIndex) ?? [])]),
        ]);
        if (mounted.current === key) return;
        // Settle a superseded request; the common session owns cancellation of its selection.
        pendingLocation.current?.resolve();
        const ready = new Promise<void>((resolve) => {
          pendingLocation.current = { key, resolve };
        });
        setOpened(snapshot.fileIndex);
        await ready;
      },
    },
  });

  const matches = (index: number, term: string) => {
    const needle = term.toLowerCase();
    return (
      value.files[index].toLowerCase().includes(needle) ||
      !!paths.data?.[index].toLowerCase().includes(needle)
    );
  };
  const state = entries.get(opened);
  const count = (node: Parameters<typeof visibleFileCount>[0]) =>
    visibleFileCount(node, (index) => matches(index, search));
  const hasBranches = roots.some((node) => node.nodes !== undefined);
  const content = (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border"
      aria-label={copy.preview}
    >
      <div
        className="shrink-0 truncate border-b px-4 py-2 text-sm font-medium"
        title={value.files[opened]}
        data-file-review-path=""
      >
        {state?.status === 'ready' ? (
          <AnnotationText
            target={{ fileIndex: opened, snapshotId: state.snapshot.snapshotId, part: 'path' }}
          >
            {value.files[opened]}
          </AnnotationText>
        ) : (
          value.files[opened]
        )}
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto" data-file-review-viewport="">
        {!state || state.status === 'loading' ? (
          <p role="status" className="flex items-center gap-2 p-4">
            <Spinner aria-hidden="true" />
            {t('Reading file…')}
          </p>
        ) : state.status === 'error' ? (
          <Alert variant="destructive" className="m-4 w-auto">
            <AlertTitle>{t('Could not read file.')}</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : (
          <Preview
            key={snapshotKey(state.snapshot)}
            snapshot={state.snapshot}
            onReady={previewReady}
          />
        )}
      </div>
    </section>
  );
  const sidebar = (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        role="toolbar"
        aria-label={copy.actions}
        className="flex shrink-0 items-center gap-0.5 border-b px-1 py-0.5 text-muted-foreground"
      >
        <ToolbarButton label={copy.group} pressed={grouped} onClick={() => setGrouped(!grouped)}>
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
      <Input
        className="h-8 shrink-0 rounded-none border-0 border-b px-2 shadow-none focus-visible:ring-inset"
        aria-label={copy.search}
        placeholder={copy.search}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <Tree
          ref={tree}
          items={roots}
          getItemId={(node) => node.key}
          getItemLabel={(node) => node.name}
          getItemChildren={(node) => node.nodes}
          selectedId={`file:${opened}`}
          onSelectionChange={(key) => {
            if (key) setOpened(Number(key.slice(5)));
          }}
          expandedIds={expanded}
          onExpandedChange={setExpanded}
          onAction={(node) => {
            if (node.fileIndex !== undefined) setOpened(node.fileIndex);
          }}
          searchTerm={search}
          isItemMatchingSearch={(node, term) =>
            node.fileIndex !== undefined && matches(node.fileIndex, term)
          }
          getItemPresentation={(node) => ({
            className: 'gap-1.5',
            title:
              node.fileIndex === undefined
                ? `${node.name} · ${count(node)}`
                : value.files[node.fileIndex],
          })}
          renderItemContent={(node, state) => (
            <>
              <TreeIcon kind={state.isBranch ? (state.expanded ? 'open' : 'folder') : 'file'} />
              <span className="min-w-0 truncate">{node.name}</span>
              {!grouped &&
                node.fileIndex !== undefined &&
                value.files[node.fileIndex].includes('/') && (
                  <span className="min-w-0 flex-1 truncate font-normal text-muted-foreground">
                    {value.files[node.fileIndex].slice(
                      0,
                      value.files[node.fileIndex].lastIndexOf('/'),
                    ) || '/'}
                  </span>
                )}
              {node.nodes && (
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                  {count(node)}
                </span>
              )}
            </>
          )}
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
  );
  return (
    <Page className="mx-0 flex h-screen min-h-0 max-w-none flex-col gap-4 space-y-0 p-4 md:p-4">
      <h1 className="text-lg font-semibold">{value.title ?? copy.title}</h1>
      {paths.error && <p role="alert">{paths.error.message}</p>}
      {value.files.length === 1 ? (
        content
      ) : (
        <FileReviewSplit separatorLabel={copy.resize} sidebar={sidebar}>
          {content}
        </FileReviewSplit>
      )}
      {submission.message && (
        <p role={submission.failed ? 'alert' : 'status'}>{submission.message}</p>
      )}
    </Page>
  );
}

export default definePanel({
  id: 'file-review',
  requires: { paneon: '>=0.2.0 <0.3.0' },
  input: fileReviewParamsSchema,
  events: { 'file-review-submitted': fileReviewSubmittedSchema },
  render: FileReviewPanel,
});
