import { useLocale } from '../../shared/i18n';
import { useEffect, useRef, useState } from 'react';
import { agent, definePanel, serverAction, usePanelInput, z } from 'paneon/sdk';
import type { Feedback, FeedbackTarget as Target } from 'paneon/sdk';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  FeedbackSurface,
  FeedbackToolbar,
  FeedbackProvider,
  Input,
} from 'paneon/ui';
import { DiffView, diffTargetRanges, locateDiffTarget } from '../../shared/diff.tsx';
import { diffTargetText } from '../../shared/diff-schema.ts';
import { useSubmission, SubmissionError } from '../../shared/submission.ts';
import { readGit, readGitFile, validateGitFeedback } from './git.ts';
import { CommitDetails, HistoryRows } from './history.tsx';
import { ChangedFileTree } from './file-tree.tsx';
import { Branches } from './branches.tsx';
import { useHistorySplit } from './history-split.ts';
import { useHistoryColumns } from './history-columns.ts';
import { useFileSplit } from './file-split.ts';
import type { GitFile, GitListing, GitRequest, GitSnapshot } from './git.ts';
import { gitFeedbackSchema, gitReviewParamsSchema, gitReviewSubmittedSchema } from './schema.ts';
import type { GitRef, GitReviewParams } from './schema.ts';

const requestSchema = z
  .object({
    repositoryId: z.string().min(1),
    type: z.enum(['changes', 'history', 'compare']),
    commit: z.string().optional(),
    branch: z.string().optional(),
    base: z.string().optional(),
    head: z.string().optional(),
    mode: z.enum(['branch', 'commits']).optional(),
    tip: z.string().optional(),
    offset: z.number().int().nonnegative().optional(),
    file: z.string().optional(),
    historyId: z.string().optional(),
    listingId: z.string().optional(),
    area: z.enum(['staged', 'unstaged', 'untracked']).optional(),
  })
  .strict();
export const queryGit = serverAction({
  kind: 'query',
  input: z.object({ params: gitReviewParamsSchema, sessionId: z.string(), request: requestSchema }),
  handler: async (ctx, input) => {
    try {
      return {
        ok: true as const,
        data: await readGit(input.params, input.sessionId, input.request, ctx.signal),
      };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
export const queryGitFile = serverAction({
  kind: 'query',
  input: z.object({
    params: gitReviewParamsSchema,
    sessionId: z.string(),
    listingId: z.string(),
    fileId: z.string(),
  }),
  handler: async (ctx, input) => {
    try {
      return {
        ok: true as const,
        data: await readGitFile(
          input.params,
          input.sessionId,
          input.listingId,
          input.fileId,
          ctx.signal,
        ),
      };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
export const checkFeedback = serverAction({
  kind: 'query',
  input: z.object({
    params: gitReviewParamsSchema,
    sessionId: z.string(),
    feedback: gitFeedbackSchema,
  }),
  handler: (_ctx, input) => {
    try {
      return {
        ok: true as const,
        data: validateGitFeedback(input.params, input.sessionId, input.feedback),
      };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

type ViewState = {
  request: GitRequest;
  listing?: GitListing;
  selected?: string;
  selectedFile?: string;
};
function initialRequest(params: GitReviewParams): GitRequest {
  return params.initialView ?? { repositoryId: params.repositories[0].id, type: 'changes' };
}
const keyOf = (request: GitRequest) => `${request.repositoryId}:${request.type}`;
function Review() {
  const { t, message } = useLocale();
  const params = usePanelInput<GitReviewParams>();
  const [sessionId] = useState(() => crypto.randomUUID());
  const first = initialRequest(params);
  const [view, setView] = useState<ViewState>({ request: first });
  const historyColumns = useHistoryColumns(view.request.type === 'history');
  const views = useRef(new Map<string, ViewState>());
  const snapshots = useRef(new Map<string, GitSnapshot>());
  const fileSnapshots = useRef(new Map<string, GitSnapshot>());
  const [collapsed, setCollapsed] = useState(true);
  const activeKey = useRef(keyOf(first));
  const serial = useRef(0);
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const [oldSnapshot, setOldSnapshot] = useState<GitSnapshot>();
  const [locateTarget, setLocateTarget] = useState<Target<GitRef>>();
  const [fileReveal, setFileReveal] = useState(0);
  const submission = useSubmission<Feedback<GitRef>>(async ({ replacesEventId, ...feedback }) => {
    if (
      replacesEventId === undefined &&
      feedback.annotations.length === 0 &&
      !feedback.comment?.trim()
    )
      throw new SubmissionError(
        'First submission requires selected content or an overall annotation.',
      );
    const result = await checkFeedback({ params, sessionId, feedback });
    if (!result.ok) throw new Error(result.message);
    const checked = result.data;
    return agent.emit('git-review-submitted', {
      ...checked,
      ...(replacesEventId === undefined ? {} : { replacesEventId }),
    });
  });
  function save(next: ViewState) {
    views.current.set(keyOf(next.request), next);
    setView(next);
  }
  async function load(request: GitRequest, more = false) {
    const id = ++serial.current,
      key = keyOf(request);
    activeKey.current = key;
    setPending(true);
    setError('');
    const previous = views.current.get(key);
    if (!more) {
      setOldSnapshot(undefined);
      setCollapsed(true);
      const sameGraph =
        request.type === 'history' &&
        request.historyId &&
        request.historyId === previous?.listing?.historyId;
      // Selection responds immediately. Old files/details must never masquerade as the requested commit.
      save({
        request,
        ...(sameGraph && previous?.listing
          ? {
              listing: {
                ...previous.listing,
                files: [],
                snapshots: [],
                description: '',
                descriptionUI: { key: '' },
                history: previous.listing.history
                  ? { ...previous.listing.history, selectedCommit: undefined }
                  : undefined,
              },
            }
          : {}),
      });
    }
    try {
      const result = await queryGit({
        params,
        sessionId,
        request:
          more && previous?.listing
            ? { ...request, listingId: previous.listing.listingId }
            : request,
      });
      if (!result.ok) throw new Error(result.message);
      if (id !== serial.current || activeKey.current !== key) return;
      const listing = result.data;
      listing.snapshots.forEach((snapshot) => {
        snapshots.current.set(snapshot.id, snapshot);
        fileSnapshots.current.set(`${listing.listingId}:${snapshot.fileId}`, snapshot);
      });
      if (
        listing.history &&
        previous?.listing?.history &&
        listing.historyId === previous.listing.historyId
      ) {
        listing.history.commits = more
          ? [...previous.listing.history.commits, ...listing.history.commits]
          : previous.listing.history.commits;
        if (!more) listing.history.hasMore = previous.listing.history.hasMore;
        listing.historyRefs = previous.listing.historyRefs;
        listing.branches = previous.listing.branches;
      }
      if (more && previous?.listing) {
        listing.files = previous.listing.files;
        listing.listingId = previous.listing.listingId;
        listing.snapshots = previous.listing.snapshots;
        listing.description = previous.listing.description;
        listing.descriptionUI = previous.listing.descriptionUI;
        if (listing.history)
          listing.history.selectedCommit = previous.listing.history?.selectedCommit;
      }
      const selected = more ? previous?.selected : listing.snapshots[0]?.id;
      const selectedFile = more ? previous?.selectedFile : listing.snapshots[0]?.fileId;
      if (!more) setCollapsed(!selected);
      save({
        request: {
          ...request,
          ...(listing.history?.tip ? { tip: listing.history.tip } : {}),
          ...(listing.historyId ? { historyId: listing.historyId } : {}),
        },
        listing,
        selected,
        selectedFile,
      });
    } catch (failure) {
      if (id === serial.current)
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (id === serial.current) setPending(false);
    }
  }
  async function openFile(file: GitFile) {
    const listing = view.listing;
    if (!listing) return;
    const id = ++serial.current;
    setOldSnapshot(undefined);
    setError('');
    const known = fileSnapshots.current.get(`${listing.listingId}:${file.id}`);
    setCollapsed(false);
    save({ ...view, selectedFile: file.id, selected: known?.id });
    if (known) {
      setPending(false);
      return;
    }
    setPending(true);
    try {
      const result = await queryGitFile({
        params,
        sessionId,
        listingId: listing.listingId,
        fileId: file.id,
      });
      if (!result.ok) throw new Error(result.message);
      if (id !== serial.current) return;
      snapshots.current.set(result.data.id, result.data);
      fileSnapshots.current.set(`${listing.listingId}:${file.id}`, result.data);
      save({ ...view, selectedFile: file.id, selected: result.data.id });
    } catch (failure) {
      if (id === serial.current)
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (id === serial.current) setPending(false);
    }
  }
  function collapseDiff() {
    setCollapsed(true);
    const file = [...document.querySelectorAll<HTMLElement>('[data-file-id]')].find(
      (element) => element.dataset.fileId === view.selectedFile,
    );
    (file ?? document.querySelector<HTMLElement>('[data-commit-id][aria-pressed=true]'))?.focus({
      preventScroll: true,
    });
  }
  useEffect(() => {
    void load(first); /* One initial navigation; file data updates are explicit. */
  }, []);
  function navigate(repositoryId: string, type: GitRequest['type']) {
    serial.current++;
    setPending(false);
    setError('');
    setOldSnapshot(undefined);
    setCollapsed(true);
    const key = `${repositoryId}:${type}`;
    activeKey.current = key;
    const saved = views.current.get(key);
    if (saved) {
      setView(saved);
      setCollapsed(!saved.selected);
      return;
    }
    const request: GitRequest = { repositoryId, type };
    if (type === 'compare') {
      save({ request });
      return;
    }
    void load(request);
  }
  function editRequest(patch: Partial<GitRequest>) {
    save({ ...view, request: { ...view.request, ...patch } });
  }
  const selected = oldSnapshot ?? snapshots.current.get(view.selected ?? '');
  const historyDiff = view.request.type === 'history' && !!selected && !collapsed;
  const historySplit = useHistorySplit(historyDiff);
  const fileDiff = view.request.type !== 'history' && !!selected && !collapsed;
  const fileDivider = useFileSplit(
    historySplit.workspaceRef,
    fileDiff,
    t('调整文件列表与差异宽度'),
  );
  const listing = view.listing,
    request = view.request;
  const fileList = (
    <aside
      className={`flex max-h-64 min-h-0 min-w-0 flex-col ${request.type === 'history' ? 'md:max-h-1/2' : 'md:max-h-none'}`}
      aria-label={t('改动文件')}
    >
      <div className="min-h-0 overflow-auto p-1" data-file-scroll="" aria-busy={pending}>
        {pending && !listing?.files.length && (
          <p role="status" className="p-2 text-xs text-muted-foreground">
            {t('读取 Git…')}
          </p>
        )}
        {listing?.files.length === 0 && !pending && (
          <p className="p-2 text-sm">{t('该范围没有文件改动。')}</p>
        )}
        <ChangedFileTree
          snapshots={listing?.files ?? []}
          selectedId={oldSnapshot?.fileId ?? view.selectedFile}
          filter=""
          scopeKey={keyOf(request)}
          revealKey={fileReveal}
          onSelect={(file) => void openFile(file)}
        />
      </div>
    </aside>
  );
  return (
    <FeedbackProvider<GitRef>
      disabled={submission.pending}
      onSubmit={(feedback) => submission.submit(feedback)}
      adapter={{
        resolve(target) {
          const snapshot = snapshots.current.get(target.ref.sourceId);
          if (!snapshot) return { status: 'missing', message: '原始快照已丢失，草稿保留。' };
          try {
            const text = diffTargetText(snapshot.model, target);
            return { status: 'ready', ...(text === undefined ? {} : { text }) };
          } catch (failure) {
            return {
              status: 'stale',
              message: failure instanceof Error ? failure.message : String(failure),
            };
          }
        },
        targetRanges(target: Target<GitRef>) {
          const snapshot = snapshots.current.get(target.ref.sourceId);
          return snapshot ? diffTargetRanges(snapshot.model, target) : [];
        },
        async locate(target) {
          const snapshot = snapshots.current.get(target.ref.sourceId);
          if (snapshot) {
            setOldSnapshot(snapshot);
            setCollapsed(false);
            setLocateTarget(target);
            setFileReveal((value) => value + 1);
            await new Promise<void>((done) =>
              requestAnimationFrame(() => requestAnimationFrame(() => done())),
            );
            locateDiffTarget(snapshot.model, target);
          }
        },
      }}
    >
      <FeedbackSurface />
      <main
        className="flex min-h-[34rem] flex-col gap-3 p-3 md:h-[100dvh] md:min-h-[36rem] md:p-4"
        data-git-workbench=""
      >
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1
            className="min-w-0 truncate text-lg font-semibold"
            title={params.title ?? t('Git 审阅')}
          >
            {params.title ?? t('Git 审阅')}
          </h1>
          <span className="text-xs text-muted-foreground">{t('只读审阅 · 批注提交给当前 AI')}</span>
        </header>
        <div
          className="flex flex-wrap items-center gap-2 border-b pb-3"
          aria-label={t('Git 与批注操作')}
        >
          <label className="flex items-center gap-2 text-sm">
            {t('仓库')}
            <select
              className="h-9 max-w-44 rounded-md border bg-background px-2"
              aria-label={t('仓库')}
              value={request.repositoryId}
              onChange={(e) => navigate(e.target.value, request.type)}
            >
              {params.repositories.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.label ?? repo.path.split('/').filter(Boolean).at(-1) ?? repo.id}
                </option>
              ))}
            </select>
          </label>
          {(['changes', 'history', 'compare'] as const).map((type) => (
            <Button
              key={type}
              variant={request.type === type ? 'default' : 'outline'}
              aria-pressed={request.type === type}
              onClick={() => navigate(request.repositoryId, type)}
            >
              {
                { changes: t('未提交改动'), history: t('提交记录'), compare: t('分支/版本对比') }[
                  type
                ]
              }
            </Button>
          ))}
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              const {
                tip: _tip,
                offset: _offset,
                file: _file,
                historyId: _historyId,
                ...refresh
              } = request;
              void load({
                ...refresh,
                ...(selected && !oldSnapshot
                  ? {
                      file: selected.source.new?.path ?? selected.source.old?.path,
                      ...(selected.source.view.type === 'changes'
                        ? { area: selected.source.view.area }
                        : {}),
                    }
                  : {}),
              });
            }}
          >
            {request.type === 'changes'
              ? t('刷新改动')
              : request.type === 'history'
                ? t('刷新历史')
                : t('刷新比较')}
          </Button>
          <FeedbackToolbar className="md:ml-auto" />
        </div>
        {request.type === 'compare' && (
          <div className="flex flex-wrap items-end gap-2">
            <label>
              {t('Base')}
              <Input
                aria-label={t('Base')}
                list="git-branches"
                value={request.base ?? ''}
                onChange={(e) => editRequest({ base: e.target.value })}
              />
            </label>
            <label>
              {t('Head')}
              <Input
                aria-label={t('Head')}
                list="git-branches"
                placeholder="HEAD"
                value={request.head ?? ''}
                onChange={(e) => editRequest({ head: e.target.value })}
              />
            </label>
            <label>
              {t('比较方式')}{' '}
              <select
                aria-label={t('比较方式')}
                value={request.mode ?? 'branch'}
                onChange={(e) => editRequest({ mode: e.target.value as 'branch' | 'commits' })}
              >
                <option value="branch">{t('分支三点比较')}</option>
                <option value="commits">{t('提交端点比较')}</option>
              </select>
            </label>
            <Button
              disabled={pending || !request.base}
              onClick={() => void load({ ...request, head: request.head || 'HEAD' })}
            >
              {t('比较')}
            </Button>
            <datalist id="git-branches">
              {listing?.branches.map((branch) => (
                <option key={branch} value={branch} />
              ))}
            </datalist>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTitle>{t('读取失败')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex h-5 min-w-0 shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <p
            className="min-w-0 flex-1 truncate"
            title={
              listing &&
              message(
                listing.descriptionUI.key,
                Object.fromEntries(
                  Object.entries(listing.descriptionUI.params ?? {}).map(([key, value]) => [
                    key,
                    key === 'merge' ? message(value) : value,
                  ]),
                ),
              )
            }
          >
            {listing &&
              message(
                listing.descriptionUI.key,
                Object.fromEntries(
                  Object.entries(listing.descriptionUI.params ?? {}).map(([key, value]) => [
                    key,
                    key === 'merge' ? message(value) : value,
                  ]),
                ),
              )}
          </p>
          {pending && (
            <span role="status" className="shrink-0">
              {t('读取 Git…')}
            </span>
          )}
        </div>
        <div
          ref={historySplit.workspaceRef}
          style={historySplit.workspaceStyle}
          data-git-workspace=""
          className={`grid min-h-0 flex-1 gap-3 ${request.type === 'history' ? (historyDiff ? 'md:min-h-[calc(27.75rem+1px)] md:grid-rows-[var(--history-rows)] md:gap-y-0' : 'md:min-h-[12.75rem] md:grid-rows-1') : fileDiff ? 'md:grid-cols-[var(--file-columns,13rem_1px_minmax(0,1fr))] md:gap-x-0' : 'md:grid-cols-1'}`}
        >
          {request.type === 'history' ? (
            <div
              data-history-workspace=""
              ref={historyColumns.workspaceRef}
              style={historyColumns.workspaceStyle}
              className="grid min-h-0 gap-3 md:grid-cols-[var(--history-columns)] md:gap-y-0"
            >
              <Branches
                key={request.repositoryId}
                refs={listing?.historyRefs ?? []}
                selected={request.branch}
                currentBranch={listing?.currentBranch}
                onSelect={(branch) => {
                  const {
                    area: _area,
                    historyId: _historyId,
                    tip: _tip,
                    commit: _commit,
                    offset: _offset,
                    file: _file,
                    branch: _branch,
                    ...next
                  } = request;
                  void load({ ...next, ...(branch === 'HEAD' ? {} : { branch }) });
                }}
              />
              <div
                {...historyColumns.dividerProps[0]}
                className="relative hidden bg-border outline-none focus-visible:ring-2 focus-visible:ring-ring data-[dragging]:bg-muted-foreground md:block"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize touch-none hover:bg-muted-foreground/15"
                />
              </div>
              <section
                aria-label={t('提交历史')}
                className="flex max-h-72 min-h-0 min-w-0 flex-col md:max-h-none"
              >
                <div className="min-h-0 overflow-auto" data-commit-scroll="">
                  {listing?.history?.commits.length === 0 && (
                    <p className="p-3 text-sm">{t('没有提交记录。')}</p>
                  )}
                  <HistoryRows
                    key={`${request.repositoryId}:${request.branch ?? 'HEAD'}:${listing?.history?.tip ?? ''}`}
                    commits={listing?.history?.commits ?? []}
                    selected={request.commit ?? listing?.history?.selectedCommit?.oid}
                    onSelect={(commit) =>
                      void load({
                        ...request,
                        offset: 0,
                        file: undefined,
                        area: undefined,
                        commit: commit.oid,
                      })
                    }
                  />
                  {listing?.history?.hasMore && (
                    <Button
                      disabled={pending}
                      variant="ghost"
                      className="w-full"
                      onClick={() =>
                        void load(
                          { ...request, offset: listing.history?.commits.length ?? 0 },
                          true,
                        )
                      }
                    >
                      {t('加载更多（每批 50）')}
                    </Button>
                  )}
                </div>
              </section>
              <div
                {...historyColumns.dividerProps[1]}
                className="relative hidden bg-border outline-none focus-visible:ring-2 focus-visible:ring-ring data-[dragging]:bg-muted-foreground md:block"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize touch-none hover:bg-muted-foreground/15"
                />
              </div>
              <div data-history-files="" className="flex min-h-0 min-w-0 flex-col gap-1">
                {fileList}
                <CommitDetails commit={listing?.history?.selectedCommit} />
              </div>
            </div>
          ) : (
            fileList
          )}
          {fileDiff && (
            <div
              {...fileDivider}
              className="relative hidden bg-border outline-none focus-visible:ring-2 focus-visible:ring-ring data-[dragging]:bg-muted-foreground md:block"
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize touch-none hover:bg-muted-foreground/15"
              />
            </div>
          )}
          {historyDiff && (
            <div
              {...historySplit.dividerProps}
              className="relative hidden bg-border outline-none focus-visible:ring-2 focus-visible:ring-ring data-[dragging]:bg-muted-foreground md:block"
            >
              <span
                aria-hidden="true"
                className="absolute inset-x-0 -top-1.5 z-10 h-3 cursor-row-resize touch-none hover:bg-muted-foreground/15"
              />
            </div>
          )}
          {selected && (
            <section
              aria-label={t('文件差异')}
              className="max-h-[70dvh] min-h-0 min-w-0 overflow-auto rounded-md border md:max-h-none"
              data-git-diff-scroll=""
              hidden={collapsed}
              inert={collapsed}
              style={{ display: collapsed ? 'none' : undefined }}
            >
              {oldSnapshot && (
                <div
                  role="note"
                  className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs"
                >
                  <strong>{t('回看保留快照')}</strong>
                  <span
                    className="min-w-0 flex-1 truncate"
                    title={JSON.stringify(oldSnapshot.source.view)}
                  >
                    {t('仓库')} {oldSnapshot.source.repositoryId} ·{' '}
                    {oldSnapshot.source.view.type === 'history'
                      ? t('Commit {commit}', {
                          commit: oldSnapshot.source.view.commit.slice(0, 10),
                        })
                      : oldSnapshot.source.view.type === 'changes'
                        ? {
                            staged: t('已暂存改动'),
                            unstaged: t('未暂存改动'),
                            untracked: t('未跟踪文件'),
                          }[oldSnapshot.source.view.area]
                        : `${oldSnapshot.source.view.baseCommit.slice(0, 10)} → ${oldSnapshot.source.view.headCommit.slice(0, 10)}`}
                    {t('· 批注仍指向原内容')}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setOldSnapshot(undefined)}>
                    {t('返回当前浏览')}
                  </Button>
                </div>
              )}
              {selected && (
                <>
                  {selected.notesUI.map((note) => (
                    <p key={note.key} className="text-sm text-muted-foreground">
                      {message(note.key, note.params)}
                    </p>
                  ))}
                  <DiffView
                    key={selected.id}
                    sourceId={selected.id}
                    model={selected.model}
                    defaultExpanded
                    onCollapse={collapseDiff}
                    locateTarget={
                      locateTarget?.ref.sourceId === selected.id ? locateTarget : undefined
                    }
                    oldPath={selected.source.old?.path}
                    newPath={selected.source.new?.path}
                    oldRevision={
                      !selected.source.old
                        ? '∅'
                        : selected.source.view.type === 'history'
                          ? (selected.source.view.parent?.slice(0, 8) ?? '∅')
                          : selected.source.view.type === 'compare'
                            ? (
                                selected.source.view.mergeBaseCommit ??
                                selected.source.view.baseCommit
                              ).slice(0, 8)
                            : selected.source.view.area === 'staged'
                              ? (selected.source.view.headCommit?.slice(0, 8) ?? '∅')
                              : t('暂存区')
                    }
                    newRevision={
                      !selected.source.new
                        ? '∅'
                        : selected.source.view.type === 'history'
                          ? selected.source.view.commit.slice(0, 8)
                          : selected.source.view.type === 'compare'
                            ? selected.source.view.headCommit.slice(0, 8)
                            : selected.source.view.area === 'staged'
                              ? t('暂存区')
                              : t('工作区')
                    }
                    fileOnly={
                      selected.source.old?.type === 'binary' ||
                      selected.source.new?.type === 'binary'
                    }
                  />
                </>
              )}

              {!selected && !pending && (
                <p className="text-sm text-muted-foreground">{t('选择文件查看差异。')}</p>
              )}
            </section>
          )}
        </div>
        {submission.message && (
          <p role={submission.failed ? 'alert' : 'status'} className="text-sm">
            {submission.message}
          </p>
        )}
      </main>
    </FeedbackProvider>
  );
}
export default definePanel({
  id: 'git-review',
  requires: { paneon: '0.0.0' },
  input: gitReviewParamsSchema,
  events: { 'git-review-submitted': gitReviewSubmittedSchema },
  render: Review,
});
