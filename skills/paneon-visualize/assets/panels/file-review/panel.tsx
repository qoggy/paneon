import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  agent,
  definePanel,
  isElementAnnotationRef,
  usePanelInput,
  useQuery,
} from '@qoggy/paneon/sdk';
import type { AnnotationValue, ElementAnnotationRef } from '@qoggy/paneon/sdk';
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
  EmptyMedia,
  EmptyTitle,
  FileIcon,
  Input,
  Markdown,
  Page,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Tree,
  useAnnotations,
  usePageAnnotations,
  useToastManager,
  useUI,
} from '@qoggy/paneon/ui';
import type { TreeHandle } from '@qoggy/paneon/ui';
import { ArrowUpRight, CodeXml, Eye } from '../../shared/icons';
import { ChevronsDownUp, ChevronsUpDown, FolderTree, TreeIcon } from '../diff-review/icons';
import { FileReviewSplit } from '../../shared/file-review-split';
import { testFilePresentation } from '../../shared/test-file-presentation';
import { useSubmission } from '../../shared/submission';
import { useLocale } from '../../shared/i18n';
import { readFile, resolvePaths, validateFeedback } from './actions';
import { publicFileFeedback } from './feedback';
import {
  ancestorKeys,
  initialExpandedKeys,
  fileLanguage,
  fileTree,
  isMarkdown,
  visibleFileCount,
} from './model';
import type { FileNode } from './model';
import type { SymbolicLink } from './directory.ts';
import { fileReviewParamsSchema, snapshotKey } from './schema';
import type { FileRef, FileReviewParams, Snapshot } from './schema';

type ReadState =
  | { status: 'loading' }
  | { status: 'error'; code?: string; message: string }
  | { status: 'ready'; snapshot: Snapshot };
type MarkdownView = 'rendered' | 'source';

function horizontalViewport(viewport: HTMLElement) {
  return (
    viewport.querySelector<HTMLElement>(
      ':scope > [data-slot="code-block"] > [data-slot="code-block-content"]',
    ) ?? viewport
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

/** Child registrations run before this layout effect, including CodeBlock's plain-text registration. */
function Preview({
  snapshot,
  view,
  onReady,
}: {
  snapshot: Snapshot;
  view: MarkdownView;
  onReady: (snapshot: Snapshot, view: MarkdownView) => () => void;
}) {
  const { t } = useLocale();
  useLayoutEffect(() => onReady(snapshot, view), [snapshot, view, onReady]);
  const target = { fileIndex: snapshot.fileIndex, snapshotId: snapshot.snapshotId };
  return snapshot.text === '' ? (
    <Empty className="flex-none py-8">
      <EmptyHeader>
        <EmptyDescription>{t('The file has no content.')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  ) : isMarkdown(snapshot.path) && view === 'rendered' ? (
    <div className="min-h-full bg-markdown-background p-4">
      <Markdown sourcePath={snapshot.path} annotationTarget={target} outline="auto">
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
  const { t, message } = useLocale();
  const annotations = useAnnotations<FileRef>();
  const toast = useToastManager();
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
          view: 'Markdown 展示方式',
          rendered: '渲染',
          source: '源码',
          locatedSource: '已切换到源码，定位批注内容。',
          scanning: '正在加载文件列表…',
          noFiles: '目录中没有文件。',
          scanFailed: '目录读取失败。',
          incomplete: '部分目录读取失败，其他文件仍可审阅。',
          cycle: '（循环）',
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
          view: 'Markdown view',
          rendered: 'Rendered',
          source: 'Source',
          locatedSource: 'Switched to source to locate the annotation.',
          scanning: 'Loading files…',
          noFiles: 'The directories contain no files.',
          scanFailed: 'Could not read directories.',
          incomplete: 'Some directories could not be read. Other files remain available.',
          cycle: ' (cycle)',
        };
  const paths = useQuery(resolvePaths, value);
  const files = paths.data?.files ?? value.files ?? [];
  const directoryRoots = useMemo(
    () => fileTree(paths.data?.paths ?? [], true, paths.data?.directories ?? [], paths.data?.links),
    [paths.data],
  );
  const initialExpanded = useMemo(
    () =>
      initialExpandedKeys(directoryRoots, paths.data?.directories ?? [], value.files?.length ?? 0),
    [directoryRoots, paths.data, value.files],
  );
  const [grouped, setGrouped] = useState(true);
  const roots = useMemo(
    () => (grouped ? directoryRoots : fileTree(files, false)),
    [grouped, directoryRoots, files],
  );
  const [expanded, setExpanded] = useState<readonly string[]>();
  const [search, setSearch] = useState('');
  const [opened, setOpened] = useState(0);
  const linksByPath = useMemo(
    () => new Map(paths.data?.links.map((link) => [link.path, link]) ?? []),
    [paths.data],
  );
  const openedLink = linksByPath.get(paths.data?.paths[opened] ?? '');
  const linkForNode = (node: FileNode) =>
    node.link ?? linksByPath.get(paths.data?.paths[node.fileIndex ?? -1] ?? '');
  const linkHint = (link: SymbolicLink) => `${link.target}${link.cycle ? copy.cycle : ''}`;
  const [markdownViews, setMarkdownViews] = useState<Record<number, MarkdownView>>({});
  const view = markdownViews[opened] ?? 'rendered';
  const viewport = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef(new Map<string, { top: number; left: number }>());
  const [entries, setEntries] = useState<Map<number, ReadState>>(() => new Map());
  const snapshots = useRef(new Map<string, Snapshot>());
  const tree = useRef<TreeHandle>(null);
  const mounted = useRef<string | null>(null);
  const pendingLocation = useRef<{ key: string; resolve: () => void } | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (entries.has(opened) || files[opened] === undefined) return;
    const fileIndex = opened;
    setEntries((previous) => new Map(previous).set(fileIndex, { status: 'loading' }));
    void readFile({ path: files[fileIndex], fileIndex })
      .then((result) => {
        if (!result.ok) {
          setEntries((previous) =>
            new Map(previous).set(fileIndex, { status: 'error', ...result.error }),
          );
          return;
        }
        const { snapshot } = result;
        snapshots.current.set(snapshotKey(snapshot), snapshot);
        setEntries((previous) => new Map(previous).set(fileIndex, { status: 'ready', snapshot }));
      })
      .catch((error: unknown) => {
        console.error('Could not read review file.', files[fileIndex], error);
        setEntries((previous) =>
          new Map(previous).set(fileIndex, {
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      });
  }, [opened, entries, files]);

  const previewReady = useCallback((snapshot: Snapshot, view: MarkdownView) => {
    const key = `${snapshotKey(snapshot)}:${view}`;
    mounted.current = key;
    if (pendingLocation.current?.key === key) {
      pendingLocation.current.resolve();
      pendingLocation.current = null;
    }
    return () => {
      if (mounted.current === key) mounted.current = null;
    };
  }, []);

  const submission = useSubmission<AnnotationValue<FileRef | ElementAnnotationRef>>(
    async (feedback) => {
      const sources = new Map<string, Snapshot>();
      for (const annotation of feedback.annotations)
        for (const target of annotation.targets) {
          if (isElementAnnotationRef(target.ref)) continue;
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
      async locate(target) {
        const key = snapshotKey(target.ref);
        const snapshot = snapshots.current.get(key);
        if (!snapshot) throw new Error('Missing original file snapshot. Draft retained.');
        setSearch('');
        setExpanded((previous) => [
          ...new Set([
            ...(previous ?? initialExpanded),
            ...(ancestorKeys(directoryRoots, snapshot.fileIndex) ?? []),
          ]),
        ]);
        const reveal = async (nextView: MarkdownView) => {
          const viewKey = `${key}:${nextView}`;
          if (mounted.current === viewKey) return;
          // Settle a superseded request; the common session owns cancellation of its selection.
          pendingLocation.current?.resolve();
          const ready = new Promise<void>((resolve) => {
            pendingLocation.current = { key: viewKey, resolve };
          });
          setMarkdownViews((previous) => ({ ...previous, [snapshot.fileIndex]: nextView }));
          setOpened(snapshot.fileIndex);
          await ready;
        };
        const nextView =
          target.type === 'mermaid'
            ? 'rendered'
            : (markdownViews[snapshot.fileIndex] ?? 'rendered');
        await reveal(nextView);
        if (
          isMarkdown(snapshot.path) &&
          nextView === 'rendered' &&
          target.ref.part !== 'path' &&
          target.type !== 'mermaid' &&
          !annotations.isTargetRendered(target)
        ) {
          await reveal('source');
          toast.add({ title: copy.locatedSource });
        }
      },
    },
  });

  const matches = (index: number, term: string) => {
    const needle = term.toLowerCase();
    return (
      files[index].toLowerCase().includes(needle) ||
      !!paths.data?.paths[index].toLowerCase().includes(needle)
    );
  };
  const state = entries.get(opened);
  // Parent refs are attached after Preview's layout effect; restore before locate resumes.
  useLayoutEffect(() => {
    if (state?.status === 'ready' && viewport.current) {
      const position = scrollPositions.current.get(`${snapshotKey(state.snapshot)}:${view}`);
      viewport.current.scrollTop = position?.top ?? 0;
      horizontalViewport(viewport.current).scrollLeft = position?.left ?? 0;
    }
  }, [state, view]);
  const count = (node: Parameters<typeof visibleFileCount>[0]) =>
    visibleFileCount(node, (index) => matches(index, search));
  const hasBranches = roots.some((node) => node.nodes !== undefined);
  const content = files.length ? (
    <Tabs
      value={view}
      onValueChange={(nextView) =>
        setMarkdownViews((previous) => ({ ...previous, [opened]: nextView as MarkdownView }))
      }
      className="min-h-0 min-w-0 flex-1 gap-0 overflow-hidden rounded-md border-x border-b"
      aria-label={copy.preview}
    >
      <div className="flex h-[33px] shrink-0 items-center justify-between gap-4 border-y px-4 text-sm font-medium">
        <div
          className="min-w-0 truncate"
          title={openedLink ? undefined : files[opened]}
          data-file-review-path=""
        >
          {state?.status === 'ready' ? (
            <AnnotationText
              target={{ fileIndex: opened, snapshotId: state.snapshot.snapshotId, part: 'path' }}
            >
              {files[opened]}
            </AnnotationText>
          ) : (
            files[opened]
          )}
        </div>
        {openedLink && (
          <span className="min-w-0 flex-1 overflow-hidden">
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-block max-w-full truncate align-middle text-xs font-normal text-muted-foreground" />
                }
              >
                → {openedLink.target}
              </TooltipTrigger>
              <TooltipContent>{linkHint(openedLink)}</TooltipContent>
            </Tooltip>
          </span>
        )}
        {state?.status === 'ready' && isMarkdown(state.snapshot.path) && (
          <TabsList
            aria-label={copy.view}
            className="shrink-0 p-0.5 group-data-[orientation=horizontal]/tabs:h-7"
          >
            <TabsTrigger value="rendered" className="px-3 py-0.5 text-xs">
              <Eye className="size-3.5" strokeWidth={1.6} />
              {copy.rendered}
            </TabsTrigger>
            <TabsTrigger value="source" className="px-3 py-0.5 text-xs">
              <CodeXml className="size-3.5" strokeWidth={1.6} />
              {copy.source}
            </TabsTrigger>
          </TabsList>
        )}
      </div>
      <TabsContent
        key={view}
        value={view}
        ref={viewport}
        className="min-h-0 min-w-0 flex-1 overflow-auto"
        data-file-review-viewport=""
        onScrollCapture={(event) => {
          if (state?.status === 'ready')
            scrollPositions.current.set(`${snapshotKey(state.snapshot)}:${view}`, {
              top: event.currentTarget.scrollTop,
              left: horizontalViewport(event.currentTarget).scrollLeft,
            });
        }}
      >
        {!state || state.status === 'loading' ? (
          <p role="status" className="flex items-center gap-2 p-4">
            <Spinner aria-hidden="true" />
            {t('Reading file…')}
          </p>
        ) : state.status === 'error' && state.code === 'FILE_NOT_FOUND' ? (
          <Empty role="status" className="min-h-full rounded-none">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TreeIcon kind="file" />
              </EmptyMedia>
              <EmptyTitle>{t('File not found')}</EmptyTitle>
              <EmptyDescription>
                {t(
                  'No file exists at this path. Check that the path is correct and the file has not been moved or deleted.',
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : state.status === 'error' ? (
          <Alert variant="destructive" className="m-4 w-auto">
            <AlertTitle>{t('Could not read file.')}</AlertTitle>
            <AlertDescription>{message(state.message)}</AlertDescription>
          </Alert>
        ) : (
          <Preview
            key={snapshotKey(state.snapshot)}
            snapshot={state.snapshot}
            view={view}
            onReady={previewReady}
          />
        )}
      </TabsContent>
    </Tabs>
  ) : null;
  const sidebar = (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-file-review-sidebar=""
    >
      <div
        role="toolbar"
        aria-label={copy.actions}
        className="flex h-[33px] shrink-0 items-center gap-0.5 border-y border-t-transparent px-1 text-muted-foreground"
      >
        <Input
          aria-label={copy.search}
          placeholder={copy.search}
          className="h-7 min-w-0 flex-1"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <ToolbarButton label={copy.group} pressed={grouped} onClick={() => setGrouped(!grouped)}>
          <FolderTree className="size-4" aria-hidden="true" />
        </ToolbarButton>
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
      <div className="min-h-0 flex-1 overflow-auto">
        {paths.loading && (
          <p
            role="status"
            className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground"
          >
            <Spinner aria-hidden="true" />
            {copy.scanning}
          </p>
        )}
        <Tree
          ref={tree}
          items={roots}
          loading={paths.loading}
          getItemId={(node) => node.key}
          getItemLabel={(node) => node.name}
          getItemChildren={(node) => node.nodes}
          isItemSelectable={(node) => node.fileIndex !== undefined}
          selectedId={`file:${opened}`}
          onSelectionChange={(key) => {
            if (key) setOpened(Number(key.slice(5)));
          }}
          expandedIds={expanded ?? initialExpanded}
          onExpandedChange={setExpanded}
          onAction={(node) => {
            if (node.fileIndex !== undefined) setOpened(node.fileIndex);
          }}
          searchTerm={search}
          isItemMatchingSearch={(node, term) =>
            node.fileIndex !== undefined && matches(node.fileIndex, term)
          }
          getItemPresentation={(node, state) => {
            const link = linkForNode(node);
            const presentation =
              node.fileIndex === undefined
                ? { className: '' }
                : testFilePresentation(files[node.fileIndex], state.selected);
            return {
              ...presentation,
              className: `gap-1.5 ${presentation.className} ${link?.kind === 'unavailable' ? 'text-destructive' : ''}`,
              title: link
                ? undefined
                : node.fileIndex === undefined
                  ? `${node.name} · ${count(node)}`
                  : files[node.fileIndex],
              'data-symlink': link?.kind,
              'aria-description': link ? linkHint(link) : undefined,
            };
          }}
          renderItemContent={(node, state) => {
            const link = linkForNode(node);
            const label = (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className="relative inline-flex shrink-0">
                  {node.fileIndex === undefined ? (
                    <TreeIcon kind={state.expanded ? 'open' : 'folder'} />
                  ) : (
                    <FileIcon path={files[node.fileIndex]} className="size-3.5" />
                  )}
                  {link && (
                    <ArrowUpRight
                      aria-hidden="true"
                      className="absolute -right-1 -bottom-1 size-2.5 rounded-sm bg-background"
                    />
                  )}
                </span>
                <span className="min-w-0 truncate">{node.name}</span>
              </span>
            );
            return (
              <>
                {link ? (
                  <Tooltip>
                    <TooltipTrigger render={<span className="inline-flex max-w-full min-w-0" />}>
                      {label}
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{linkHint(link)}</TooltipContent>
                  </Tooltip>
                ) : (
                  label
                )}
                {!grouped &&
                  node.fileIndex !== undefined &&
                  files[node.fileIndex].includes('/') && (
                    <span className="min-w-0 flex-1 truncate font-normal text-muted-foreground">
                      {files[node.fileIndex].slice(0, files[node.fileIndex].lastIndexOf('/')) ||
                        '/'}
                    </span>
                  )}
                {node.nodes && (
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                    {count(node)}
                  </span>
                )}
              </>
            );
          }}
          emptyState={
            <Empty className="flex-none px-3 py-8">
              <EmptyHeader>
                <EmptyDescription>
                  {paths.error || (!files.length && paths.data?.issues.length)
                    ? copy.scanFailed
                    : search
                      ? copy.empty
                      : copy.noFiles}
                </EmptyDescription>
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
      {!!paths.data?.issues.length && (
        <Alert>
          <AlertTitle>{copy.incomplete}</AlertTitle>
          <AlertDescription>
            {paths.data.issues.map((issue) => (
              <p key={issue.path}>{issue.message}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}
      {files.length === 1 && !value.directories?.length ? (
        content
      ) : (
        <FileReviewSplit separatorLabel={copy.resize} sidebar={sidebar}>
          {content}
        </FileReviewSplit>
      )}
      {submission.message && (
        <Alert
          variant={submission.failed ? 'destructive' : 'default'}
          role={submission.failed ? 'alert' : 'status'}
        >
          <AlertTitle>{t('Submission')}</AlertTitle>
          <AlertDescription>{submission.message}</AlertDescription>
        </Alert>
      )}
    </Page>
  );
}

export default definePanel({
  id: 'file-review',
  requires: { paneon: '>=0.6.0 <0.7.0' },
  input: fileReviewParamsSchema,
  render: FileReviewPanel,
});
