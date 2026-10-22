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
import { useSubmission } from '../../shared/submission.ts';
import { readGit, validateGitFeedback } from './git.ts';
import { CommitDetails, HistoryRows } from './history.tsx';
import { ChangedFileTree } from './file-tree.tsx';
import { Branches } from './branches.tsx';
import { useHistorySplit } from './history-split.ts';
import { useHistoryColumns } from './history-columns.ts';
import type { GitListing, GitRequest, GitSnapshot } from './git.ts';
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

type ViewState = { request: GitRequest; listing?: GitListing; selected?: string };
function initialRequest(params: GitReviewParams): GitRequest {
  return params.initialView ?? { repositoryId: params.repositories[0].id, type: 'changes' };
}
const keyOf = (request: GitRequest) => `${request.repositoryId}:${request.type}`;
function Review() {
  const params = usePanelInput<GitReviewParams>();
  const [sessionId] = useState(() => crypto.randomUUID());
  const first = initialRequest(params);
  const [view, setView] = useState<ViewState>({ request: first });
  const historyColumns = useHistoryColumns(view.request.type === 'history');
  const views = useRef(new Map<string, ViewState>());
  const snapshots = useRef(new Map<string, GitSnapshot>());
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
      throw new Error('首次提交需要选择内容或填写整体意见。');
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
    // Keep the displayed commit, files and diff consistent until the replacement is ready.
    if (!more && !previous?.listing) save({ request });
    try {
      const result = await queryGit({ params, sessionId, request });
      if (!result.ok) throw new Error(result.message);
      const listing = result.data;
      if (id !== serial.current || activeKey.current !== key) return;
      listing.snapshots.forEach((snapshot) => snapshots.current.set(snapshot.id, snapshot));
      if (more && previous?.listing?.history && listing.history) {
        listing.history.commits = [...previous.listing.history.commits, ...listing.history.commits];
        listing.snapshots = previous.listing.snapshots;
        listing.description = previous.listing.description;
        listing.history.selectedCommit = previous.listing.history.selectedCommit;
      }
      const sameHistory =
        request.type !== 'history' ||
        ((request.branch ?? 'HEAD') === (previous?.request.branch ?? 'HEAD') &&
          listing.history?.selectedCommit?.oid === previous?.listing?.history?.selectedCommit?.oid);
      let selected = request.file
        ? listing.snapshots.find(
            (s) => s.source.old?.path === request.file || s.source.new?.path === request.file,
          )?.id
        : sameHistory
          ? previous?.selected
          : undefined;
      if (selected && !listing.snapshots.some((s) => s.id === selected)) {
        const original = snapshots.current.get(selected)?.source;
        selected = listing.snapshots.find(
          (s) =>
            s.source.old?.path === original?.old?.path &&
            s.source.new?.path === original?.new?.path &&
            s.source.view.type === original?.view.type &&
            (s.source.view.type !== 'changes' ||
              (original?.view.type === 'changes' && s.source.view.area === original.view.area)),
        )?.id;
      }
      if (
        !more &&
        request.commit &&
        listing.history?.tip === previous?.listing?.history?.tip &&
        previous?.listing?.history &&
        listing.history &&
        previous.listing.history.commits.length > listing.history.commits.length
      ) {
        listing.history.commits = previous.listing.history.commits;
        listing.history.hasMore = previous.listing.history.hasMore;
      }
      setOldSnapshot(undefined);
      save({
        request: { ...request, ...(listing.history?.tip ? { tip: listing.history.tip } : {}) },
        listing,
        selected: listing.snapshots.some((s) => s.id === selected)
          ? selected
          : request.type === 'history'
            ? undefined
            : listing.snapshots[0]?.id,
      });
    } catch (failure) {
      if (id === serial.current)
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (id === serial.current) setPending(false);
    }
  }
  useEffect(() => {
    void load(first); /* One initial navigation; file data updates are explicit. */
  }, []);
  function navigate(repositoryId: string, type: GitRequest['type']) {
    serial.current++;
    setPending(false);
    setError('');
    setOldSnapshot(undefined);
    const key = `${repositoryId}:${type}`;
    activeKey.current = key;
    const saved = views.current.get(key);
    if (saved) {
      setView(saved);
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
  const historyDiff = view.request.type === 'history' && !!selected;
  const historySplit = useHistorySplit(historyDiff);
  const listing = view.listing,
    request = view.request;
  const fileList = (
    <aside
      className={`flex max-h-64 min-h-0 min-w-0 flex-col ${request.type === 'history' ? 'md:max-h-1/2' : 'md:max-h-none'}`}
      aria-label="改动文件"
    >
      <div className="min-h-0 overflow-auto p-1" data-file-scroll="">
        {listing?.snapshots.length === 0 && <p className="p-2 text-sm">该范围没有文件改动。</p>}
        <ChangedFileTree
          snapshots={listing?.snapshots ?? []}
          selectedId={selected?.id}
          filter=""
          scopeKey={keyOf(request)}
          revealKey={fileReveal}
          onSelect={(snapshot) => {
            setOldSnapshot(undefined);
            save({ ...view, selected: snapshot.id });
          }}
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
          <h1 className="min-w-0 truncate text-lg font-semibold" title={params.title ?? 'Git 审阅'}>
            {params.title ?? 'Git 审阅'}
          </h1>
          <span className="text-xs text-muted-foreground">只读审阅 · 评论提交给当前 AI</span>
        </header>
        <div
          className="flex flex-wrap items-center gap-2 border-b pb-3"
          aria-label="Git 与评论操作"
        >
          <label className="flex items-center gap-2 text-sm">
            仓库
            <select
              className="h-9 max-w-44 rounded-md border bg-background px-2"
              aria-label="仓库"
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
              {{ changes: '未提交改动', history: '提交记录', compare: '分支/版本对比' }[type]}
            </Button>
          ))}
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              const { tip: _tip, offset: _offset, file: _file, ...refresh } = request;
              void load(refresh);
            }}
          >
            {request.type === 'changes'
              ? '刷新改动'
              : request.type === 'history'
                ? '刷新历史'
                : '刷新比较'}
          </Button>
          <FeedbackToolbar className="md:ml-auto" />
        </div>
        {request.type === 'compare' && (
          <div className="flex flex-wrap items-end gap-2">
            <label>
              Base
              <Input
                aria-label="Base"
                list="git-branches"
                value={request.base ?? ''}
                onChange={(e) => editRequest({ base: e.target.value })}
              />
            </label>
            <label>
              Head
              <Input
                aria-label="Head"
                list="git-branches"
                placeholder="HEAD"
                value={request.head ?? ''}
                onChange={(e) => editRequest({ head: e.target.value })}
              />
            </label>
            <label>
              比较方式{' '}
              <select
                aria-label="比较方式"
                value={request.mode ?? 'branch'}
                onChange={(e) => editRequest({ mode: e.target.value as 'branch' | 'commits' })}
              >
                <option value="branch">分支三点比较</option>
                <option value="commits">提交端点比较</option>
              </select>
            </label>
            <Button
              disabled={pending || !request.base}
              onClick={() => void load({ ...request, head: request.head || 'HEAD' })}
            >
              比较
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
            <AlertTitle>读取失败</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex h-5 min-w-0 shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <p className="min-w-0 flex-1 truncate" title={listing?.description}>
            {listing?.description}
          </p>
          {pending && (
            <span role="status" className="shrink-0">
              读取 Git…
            </span>
          )}
        </div>
        <div
          ref={historySplit.workspaceRef}
          style={historySplit.workspaceStyle}
          data-git-workspace=""
          className={`grid min-h-0 flex-1 gap-3 ${request.type === 'history' ? (historyDiff ? 'md:min-h-[calc(27.75rem+1px)] md:grid-rows-[var(--history-rows)] md:gap-y-0' : 'md:min-h-[12.75rem] md:grid-rows-1') : 'md:grid-cols-[minmax(13rem,1fr)_minmax(0,4fr)]'}`}
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
                aria-label="提交历史"
                className="flex max-h-72 min-h-0 min-w-0 flex-col md:max-h-none"
              >
                <div className="min-h-0 overflow-auto" data-commit-scroll="">
                  {listing?.history?.commits.length === 0 && (
                    <p className="p-3 text-sm">没有提交记录。</p>
                  )}
                  <HistoryRows
                    key={`${request.repositoryId}:${request.branch ?? 'HEAD'}:${listing?.history?.tip ?? ''}`}
                    commits={listing?.history?.commits ?? []}
                    selected={listing?.history?.selectedCommit?.oid}
                    onSelect={(commit) =>
                      void load({ ...request, offset: 0, file: undefined, commit: commit.oid })
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
                      加载更多（每批 50）
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
          {(request.type !== 'history' || selected) && (
            <section
              aria-label="文件差异"
              className="max-h-[70dvh] min-h-0 min-w-0 overflow-auto rounded-md border p-3 md:max-h-none"
              data-git-diff-scroll=""
            >
              {oldSnapshot && (
                <div
                  role="note"
                  className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs"
                >
                  <strong>回看保留快照</strong>
                  <span
                    className="min-w-0 flex-1 truncate"
                    title={JSON.stringify(oldSnapshot.source.view)}
                  >
                    仓库 {oldSnapshot.source.repositoryId} ·{' '}
                    {oldSnapshot.source.view.type === 'history'
                      ? `提交 ${oldSnapshot.source.view.commit.slice(0, 10)}`
                      : oldSnapshot.source.view.type === 'changes'
                        ? { staged: '已暂存改动', unstaged: '未暂存改动', untracked: '未跟踪文件' }[
                            oldSnapshot.source.view.area
                          ]
                        : `${oldSnapshot.source.view.baseCommit.slice(0, 10)} → ${oldSnapshot.source.view.headCommit.slice(0, 10)}`}
                    · 评论仍指向原内容
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setOldSnapshot(undefined)}>
                    返回当前浏览
                  </Button>
                </div>
              )}
              {selected && (
                <>
                  {selected.notes.map((note) => (
                    <p key={note} className="text-sm text-muted-foreground">
                      {note}
                    </p>
                  ))}
                  <DiffView
                    key={selected.id}
                    sourceId={selected.id}
                    model={selected.model}
                    locateTarget={
                      locateTarget?.ref.sourceId === selected.id ? locateTarget : undefined
                    }
                    oldPath={selected.source.old?.path}
                    newPath={selected.source.new?.path}
                    fileOnly={
                      selected.source.old?.type === 'binary' ||
                      selected.source.new?.type === 'binary'
                    }
                  />
                </>
              )}

              {!selected && !pending && (
                <p className="text-sm text-muted-foreground">选择文件查看差异。</p>
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
