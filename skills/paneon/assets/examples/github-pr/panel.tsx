import { useEffect, useRef, useState } from 'react';
import { agent, definePanel, serverAction, usePanelInput, z } from 'paneon/sdk';
import type { FeedbackTarget as Target } from 'paneon/sdk';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  FeedbackSurface,
  FeedbackToolbar,
  FeedbackProvider,
  FeedbackTarget,
  Input,
  Page,
} from 'paneon/ui';
import { DiffView, diffTargetRanges, locateDiffTarget } from '../../shared/diff.tsx';
import { MarkdownFeedback, locateMarkdownFeedback } from '../../shared/markdown-feedback';
import { githubReview } from './github.ts';
import type { PRChecks, PRComparison, PRDetail, PRList, PRSnapshot } from './github.ts';
import { resolvePRTarget, safeLink } from './model.ts';
import {
  githubPRParamsSchema,
  prFeedbackSchema,
  prFeedbackSubmittedSchema,
  prReviewRequestedSchema,
  repositorySchema,
} from './schema.ts';
import type { GitHubPRParams, PRRef } from './schema.ts';
async function readResult<T>(work: () => T | Promise<T>) {
  try {
    return { ok: true as const, data: await work() };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
  }
}
const sessionInput = z.object({ repository: repositorySchema, sessionId: z.string().min(1) });
export const listPRs = serverAction({
  kind: 'query',
  input: z.object({
    repository: repositorySchema,
    state: z.enum(['open', 'closed', 'merged', 'all']),
    search: z.string(),
    limit: z.number().int().positive(),
  }),
  handler: (ctx, input) => readResult(() => githubReview.list(input.repository, input, ctx.signal)),
});
export const readPR = serverAction({
  kind: 'query',
  input: sessionInput.extend({ number: z.number().int().positive() }),
  handler: (ctx, input) =>
    readResult(() =>
      githubReview.detail(input.repository, input.sessionId, input.number, ctx.signal),
    ),
});
export const readChecks = serverAction({
  kind: 'query',
  input: sessionInput.extend({ detailId: z.string() }),
  handler: (ctx, input) =>
    readResult(() =>
      githubReview.checks(input.repository, input.sessionId, input.detailId, ctx.signal),
    ),
});
export const readComparison = serverAction({
  kind: 'query',
  input: sessionInput.extend({ detailId: z.string() }),
  handler: (ctx, input) =>
    readResult(() =>
      githubReview.comparison(input.repository, input.sessionId, input.detailId, ctx.signal),
    ),
});
export const readFile = serverAction({
  kind: 'query',
  input: sessionInput.extend({ comparisonId: z.string(), filename: z.string() }),
  handler: (ctx, input) =>
    readResult(() =>
      githubReview.diff(
        input.repository,
        input.sessionId,
        input.comparisonId,
        input.filename,
        ctx.signal,
      ),
    ),
});
export const checkFeedback = serverAction({
  kind: 'query',
  input: sessionInput.extend({ feedback: prFeedbackSchema }),
  handler: (_ctx, input) =>
    readResult(() => githubReview.feedback(input.repository, input.sessionId, input.feedback)),
});
export const checkReviewRequest = serverAction({
  kind: 'query',
  input: sessionInput.extend({ detailId: z.string() }),
  handler: (_ctx, input) =>
    readResult(() => githubReview.reviewRequest(input.repository, input.sessionId, input.detailId)),
});

type Tab = 'overview' | 'files' | 'checks';
type ListQuery = { state: 'open' | 'closed' | 'merged' | 'all'; search: string; limit: number };
function GithubPR() {
  const params = usePanelInput<GitHubPRParams>();
  const [sessionId] = useState(() => crypto.randomUUID()),
    session = { repository: params.repository, sessionId };
  const [list, setList] = useState<PRList>(),
    [query, setQuery] = useState<ListQuery>({ state: 'open', search: '', limit: 30 }),
    [search, setSearch] = useState('');
  const [listLoading, setListLoading] = useState(false),
    [listError, setListError] = useState('');
  const [detail, setDetail] = useState<PRDetail>(),
    [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState('');
  const [tab, setTab] = useState<Tab>('overview'),
    [comparison, setComparison] = useState<PRComparison>(),
    [checks, setChecks] = useState<PRChecks>();
  const [selected, setSelected] = useState<PRSnapshot>(),
    [old, setOld] = useState<PRSnapshot>(),
    [locateTarget, setLocateTarget] = useState<Target<PRRef>>();
  const [tabLoading, setTabLoading] = useState(false),
    [tabError, setTabError] = useState(''),
    [fileFilter, setFileFilter] = useState('');
  const [requestLoading, setRequestLoading] = useState(false),
    [requestMessage, setRequestMessage] = useState(''),
    [saved, setSaved] = useState('');
  const snapshots = useRef(new Map<string, PRSnapshot>()),
    details = useRef(new Map<string, PRDetail>());
  const comparisons = useRef(new Map<string, PRComparison>()),
    checkLists = useRef(new Map<string, PRChecks>());
  const listSerial = useRef(0),
    detailSerial = useRef(0),
    tabSerial = useRef(0),
    locating = useRef(0);
  const current = useRef<{ detailId: string; tab: Tab }>({ detailId: '', tab: 'overview' });
  function remember(values: PRSnapshot[]) {
    for (const value of values) snapshots.current.set(value.id, value);
  }
  async function loadList(next: ListQuery) {
    const serial = ++listSerial.current;
    setListLoading(true);
    setListError('');
    setQuery(next);
    try {
      const result = await listPRs({ repository: params.repository, ...next });
      if (serial !== listSerial.current) return;
      if (!result.ok) throw new Error(result.message);
      setList(result.data);
    } catch (error) {
      if (serial === listSerial.current)
        setListError(error instanceof Error ? error.message : String(error));
    } finally {
      if (serial === listSerial.current) setListLoading(false);
    }
  }
  async function open(number: number) {
    const serial = ++detailSerial.current;
    ++tabSerial.current;
    setTabLoading(false);
    setDetailLoading(true);
    setDetailError('');
    setOld(undefined);
    setTabError('');
    try {
      const result = await readPR({ ...session, number });
      if (serial !== detailSerial.current) return;
      if (!result.ok) throw new Error(result.message);
      remember(result.data.snapshots);
      details.current.set(result.data.detail.id, result.data.detail);
      setDetail(result.data.detail);
      current.current = { detailId: result.data.detail.id, tab: 'overview' };
      setTab('overview');
      setComparison(undefined);
      setChecks(undefined);
      setSelected(undefined);
      setFileFilter('');
    } catch (error) {
      if (serial === detailSerial.current)
        setDetailError(
          `无法打开 PR #${number}：${error instanceof Error ? error.message : String(error)}`,
        );
    } finally {
      if (serial === detailSerial.current) setDetailLoading(false);
    }
  }
  async function file(view: PRComparison, filename: string) {
    const serial = ++tabSerial.current;
    setTabLoading(true);
    setTabError('');
    setOld(undefined);
    try {
      const result = await readFile({ ...session, comparisonId: view.id, filename });
      if (
        serial !== tabSerial.current ||
        current.current.detailId !== view.detailId ||
        current.current.tab !== 'files'
      )
        return;
      if (!result.ok) throw new Error(result.message);
      remember([result.data]);
      setSelected(result.data);
    } catch (error) {
      if (serial === tabSerial.current)
        setTabError(
          `文件 ${filename} 未能完整读取：${error instanceof Error ? error.message : String(error)}`,
        );
    } finally {
      if (serial === tabSerial.current) setTabLoading(false);
    }
  }
  async function navigate(next: Tab) {
    ++tabSerial.current;
    setTabLoading(false);
    setTabError('');
    setOld(undefined);
    setTab(next);
    if (!detail) return;
    current.current = { detailId: detail.id, tab: next };
    const serial = tabSerial.current;
    if (next === 'overview') return;
    if (next === 'files' && comparisons.current.has(detail.id)) {
      setComparison(comparisons.current.get(detail.id));
      return;
    }
    if (next === 'checks' && checkLists.current.has(detail.id)) {
      setChecks(checkLists.current.get(detail.id));
      return;
    }
    setTabLoading(true);
    try {
      if (next === 'files') {
        const result = await readComparison({ ...session, detailId: detail.id });
        if (serial !== tabSerial.current || current.current.detailId !== detail.id) return;
        if (!result.ok) throw new Error(result.message);
        comparisons.current.set(detail.id, result.data);
        setComparison(result.data);
        setSelected(undefined);
        if (result.data.files[0]) {
          await file(result.data, result.data.files[0].filename);
        }
      } else {
        const result = await readChecks({ ...session, detailId: detail.id });
        if (serial !== tabSerial.current || current.current.detailId !== detail.id) return;
        if (!result.ok) throw new Error(result.message);
        remember(result.data.snapshots);
        checkLists.current.set(detail.id, result.data.checks);
        setChecks(result.data.checks);
      }
    } catch (error) {
      if (serial === tabSerial.current)
        setTabError(error instanceof Error ? error.message : String(error));
    } finally {
      if (serial === tabSerial.current) setTabLoading(false);
    }
  }
  useEffect(() => {
    void loadList(query);
    if (params.initialPullRequest) void open(params.initialPullRequest);
  }, []);
  const shown = old ? details.current.get(old.detailId) : detail;
  const bodySnapshot =
    old?.source.kind === 'description'
      ? old
      : shown
        ? snapshots.current.get(shown.descriptionSourceId)
        : undefined;
  const displayedDiff = old?.source.kind === 'diff' ? old : selected;
  const displayedChecks =
    old?.source.kind === 'check'
      ? [old]
      : (checks?.sourceIds ?? []).flatMap((id) =>
          snapshots.current.get(id) ? [snapshots.current.get(id) as PRSnapshot] : [],
        );
  async function requestReview() {
    if (!shown || requestLoading) return;
    setRequestLoading(true);
    setRequestMessage('');
    try {
      const result = await checkReviewRequest({ ...session, detailId: shown.id });
      if (!result.ok) throw new Error(result.message);
      const receipt = await agent.emit('review-requested', result.data);
      setRequestMessage(
        `已保存整份 PR 审阅请求，事件 ${receipt.id}。草稿意见未发送；需要 AI 正在等待或之后恢复会话读取。`,
      );
    } catch (error) {
      setRequestMessage(`请求未保存：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRequestLoading(false);
    }
  }
  return (
    <FeedbackProvider<PRRef>
      onSubmit={async (feedback) => {
        setSaved('');
        const result = await checkFeedback({ ...session, feedback });
        if (!result.ok) throw new Error(result.message);
        const receipt = await agent.emit('pr-feedback-submitted', result.data);
        setSaved(`已保存当前完整意见，事件 ${receipt.id}。意见仅交给当前 AI，未发布到 GitHub。`);
      }}
      adapter={{
        resolve(target) {
          const snapshot = snapshots.current.get(target.ref.sourceId);
          if (!snapshot)
            return { status: 'missing', message: '原始 PR 快照已丢失，不能改挂最新内容。' };
          try {
            const text = resolvePRTarget(snapshot, target);
            return { status: 'ready', ...(text === undefined ? {} : { text }) };
          } catch (error) {
            return {
              status: 'stale',
              message: error instanceof Error ? error.message : String(error),
            };
          }
        },
        targetRanges(target: Target<PRRef>) {
          const snapshot = snapshots.current.get(target.ref.sourceId);
          if (!snapshot?.model || !['file', 'hunk', 'lines'].includes(target.ref.kind)) return [];
          return diffTargetRanges(
            snapshot.model,
            target as Target<Extract<PRRef, { kind: 'lines' | 'file' | 'hunk' }>>,
          );
        },
        async locate(target) {
          const serial = ++locating.current,
            snapshot = snapshots.current.get(target.ref.sourceId);
          if (!snapshot) return;
          setOld(snapshot);
          setLocateTarget(target);
          setTab(
            snapshot.source.kind === 'diff'
              ? 'files'
              : snapshot.source.kind === 'check'
                ? 'checks'
                : 'overview',
          );
          await new Promise<void>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done())),
          );
          if (serial !== locating.current) return;
          if (snapshot.source.kind === 'description') {
            const root = document.querySelector<HTMLElement>(
              `[data-pr-body-source="${CSS.escape(snapshot.id)}"]`,
            );
            if (root) locateMarkdownFeedback(root, target.text);
          }
          if (
            snapshot.model &&
            (target.ref.kind === 'file' ||
              target.ref.kind === 'hunk' ||
              target.ref.kind === 'lines')
          )
            locateDiffTarget(snapshot.model, { ...target, ref: target.ref });
        },
      }}
    >
      <Page
        title={`GitHub PR · ${params.repository}`}
        description="真实 gh 只读查询；审阅请求和意见仅交给当前 AI。"
      >
        <FeedbackSurface />
        <FeedbackToolbar />
        <div className="grid gap-4 md:grid-cols-[minmax(14rem,1fr)_minmax(0,3fr)]">
          <aside className="space-y-3">
            <label>
              状态{' '}
              <select
                aria-label="PR 状态"
                value={query.state}
                onChange={(event) =>
                  void loadList({
                    state: event.target.value as ListQuery['state'],
                    search,
                    limit: 30,
                  })
                }
              >
                {(['open', 'closed', 'merged', 'all'] as const).map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </label>
            <Input
              aria-label="搜索 PR"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索 PR"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={listLoading}
                onClick={() => void loadList({ ...query, search, limit: 30 })}
              >
                搜索
              </Button>
              <Button variant="outline" disabled={listLoading} onClick={() => void loadList(query)}>
                刷新列表
              </Button>
            </div>
            {listLoading && <p role="status">读取 PR 列表…</p>}
            {listError && (
              <Alert variant="destructive">
                <AlertTitle>列表查询失败</AlertTitle>
                <AlertDescription>{listError}</AlertDescription>
              </Alert>
            )}
            <p className="text-sm text-muted-foreground">
              已加载 {list?.items.length ?? 0} 条；gh 最大获取量 {query.limit}
              ，不代表完整仓库或固定分页快照。
            </p>
            {list?.items.length === 0 && <p>该查询没有 PR。</p>}
            <div className="max-h-96 space-y-2 overflow-y-auto" aria-label="PR 列表">
              {list?.items.map((pr) => (
                <div key={pr.number} className="rounded-md border p-2">
                  <Button
                    variant={detail?.number === pr.number ? 'secondary' : 'ghost'}
                    className="h-auto w-full justify-start text-left whitespace-normal"
                    onClick={() => void open(pr.number)}
                  >
                    #{pr.number} {pr.title}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {pr.author?.login ?? 'deleted user'} · {pr.headRefName} → {pr.baseRefName} ·{' '}
                    {pr.isDraft ? 'Draft · ' : ''}
                    {pr.state} · {pr.updatedAt}
                  </p>
                </div>
              ))}
            </div>
            {list?.hasMore && (
              <Button
                variant="outline"
                disabled={listLoading}
                onClick={() => void loadList({ ...query, limit: query.limit + 30 })}
              >
                加载更多（增加 30）
              </Button>
            )}
          </aside>
          <main className="min-w-0 space-y-4">
            {detailLoading && <p role="status">读取 PR 详情…</p>}
            {detailError && (
              <Alert variant="destructive">
                <AlertTitle>详情查询失败</AlertTitle>
                <AlertDescription>{detailError}</AlertDescription>
              </Alert>
            )}
            {!shown && !detailLoading && (
              <p>从列表选择 PR，或通过 initialPullRequest 指定初始编号。</p>
            )}
            {old && (
              <Alert>
                <AlertTitle>回看保留快照</AlertTitle>
                <AlertDescription>
                  PR #{old.source.number} · {old.source.kind} · head {old.source.headCommit}
                  。刷新后仍指向原始内容。
                  <Button
                    variant="outline"
                    onClick={() => {
                      setOld(undefined);
                      setTab(current.current.tab);
                    }}
                  >
                    返回当前 PR
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {shown && (
              <>
                <FeedbackTarget<PRRef>
                  target={{
                    sourceId: old?.source.kind === 'pull-request' ? old.id : shown.overviewSourceId,
                    kind: 'pull-request',
                  }}
                >
                  <div className="space-y-2 rounded-md border p-3" data-pr-overview="">
                    <h2 className="text-xl font-semibold">
                      #{shown.number} {shown.title}
                    </h2>
                    <p>
                      {shown.headRefName} → {shown.baseRefName} ·{' '}
                      {shown.author?.login ?? 'deleted user'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge>{shown.state}</Badge>
                      {shown.isDraft && <Badge variant="secondary">Draft</Badge>}
                      <Badge variant="outline">Review: {shown.reviewDecision || 'none'}</Badge>
                      <Badge variant="outline">
                        Merge: {shown.mergeable} / {shown.mergeStateStatus}
                      </Badge>
                    </div>
                    <p className="text-xs break-all text-muted-foreground">
                      Base {shown.baseRefOid}
                      <br />
                      Head {shown.headRefOid}
                      <br />
                      更新于 {shown.updatedAt}
                    </p>
                    <span className="text-sm text-muted-foreground">（可选择整份 PR）</span>
                  </div>
                </FeedbackTarget>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={safeLink(shown.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    在 GitHub 打开 PR
                  </a>
                  <Button
                    variant="outline"
                    disabled={detailLoading}
                    onClick={() => void open(shown.number)}
                  >
                    刷新 PR
                  </Button>
                  <Button disabled={requestLoading} onClick={() => void requestReview()}>
                    {requestLoading ? '保存请求中…' : '请 AI 审阅此 PR'}
                  </Button>
                </div>
                {requestMessage && <p role="status">{requestMessage}</p>}
                <div className="flex flex-wrap gap-2">
                  {(['overview', 'files', 'checks'] as const).map((value) => (
                    <Button
                      variant={tab === value ? 'default' : 'outline'}
                      key={value}
                      onClick={() => void navigate(value)}
                    >
                      {{ overview: '概览与说明', files: '文件改动', checks: '检查' }[value]}
                    </Button>
                  ))}
                </div>
                {tabLoading && (
                  <p role="status">读取 {tab === 'files' ? '固定版本代码' : '检查'}…</p>
                )}
                {tabError && (
                  <Alert variant="destructive">
                    <AlertTitle>内容查询失败</AlertTitle>
                    <AlertDescription>
                      {tabError}{' '}
                      <a
                        href={safeLink(`${shown.url}/files`)}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        查看 GitHub 原始页面
                      </a>
                    </AlertDescription>
                  </Alert>
                )}
                {tab === 'overview' && bodySnapshot && (
                  <div data-pr-body-source={bodySnapshot.id} className="space-y-3">
                    <FeedbackTarget<PRRef>
                      target={{ sourceId: bodySnapshot.id, kind: 'description' }}
                    >
                      <h3 className="rounded-md border p-2 font-medium">
                        PR 说明（可选择整段说明）
                      </h3>
                    </FeedbackTarget>
                    {bodySnapshot.body ? (
                      <MarkdownFeedback<PRRef>
                        source={bodySnapshot.body}
                        target={{ sourceId: bodySnapshot.id, kind: 'description' }}
                      />
                    ) : (
                      <p>没有说明。</p>
                    )}
                  </div>
                )}
                {tab === 'checks' && (
                  <section aria-label="PR 检查" className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      按固定 head 读取 statusCheckRollup；检查失败是所见业务状态。
                      {old?.source.kind === 'check'
                        ? ` 观察于 ${old.source.observedAt}`
                        : checks
                          ? ` 观察于 ${checks.observedAt}`
                          : ''}
                    </p>
                    {displayedChecks.length === 0 && !tabLoading && !tabError && (
                      <p>没有检查记录。</p>
                    )}
                    {displayedChecks.map(
                      (snapshot) =>
                        snapshot.source.kind === 'check' && (
                          <FeedbackTarget<PRRef>
                            key={snapshot.id}
                            target={{ sourceId: snapshot.id, kind: 'check' }}
                          >
                            <div
                              className="rounded-md border p-3"
                              data-pr-check={snapshot.source.key}
                            >
                              <strong>{snapshot.source.name}</strong> ·{' '}
                              <Badge variant="outline">
                                {snapshot.source.status} / {snapshot.source.conclusion ?? 'pending'}
                              </Badge>
                              <p className="text-xs break-all text-muted-foreground">
                                {snapshot.source.key} · {snapshot.source.observedAt}
                              </p>
                              {safeLink(snapshot.source.detailsUrl) && (
                                <a
                                  href={safeLink(snapshot.source.detailsUrl)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline"
                                >
                                  检查详情
                                </a>
                              )}
                            </div>
                          </FeedbackTarget>
                        ),
                    )}
                  </section>
                )}
                {tab === 'files' && (
                  <section className="space-y-3">
                    {comparison && !old && (
                      <>
                        <p className="text-xs break-all text-muted-foreground">
                          固定比较：merge-base {comparison.mergeBaseCommit} → head{' '}
                          {comparison.headCommit}
                        </p>
                        {comparison.notes.map((note) => (
                          <p
                            key={note}
                            className={`text-sm ${comparison.complete ? 'text-muted-foreground' : 'text-destructive'}`}
                          >
                            {note}
                          </p>
                        ))}
                        <a
                          href={safeLink(comparison.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          GitHub 原始文件改动
                        </a>
                        <Input
                          aria-label="搜索文件"
                          value={fileFilter}
                          onChange={(event) => setFileFilter(event.target.value)}
                          placeholder="搜索文件路径"
                        />
                        <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                          {comparison.files
                            .filter((item) =>
                              `${item.filename} ${item.previous_filename ?? ''}`
                                .toLowerCase()
                                .includes(fileFilter.toLowerCase()),
                            )
                            .map((item) => (
                              <Button
                                key={item.filename}
                                variant="outline"
                                className="h-auto text-left whitespace-pre-wrap"
                                onClick={() => void file(comparison, item.filename)}
                              >
                                {item.status} · {item.filename}
                              </Button>
                            ))}
                        </div>
                        {comparison.files.length === 0 && <p>该固定比较没有文件改动。</p>}
                      </>
                    )}
                    {displayedDiff?.source.kind === 'diff' && displayedDiff.model && (
                      <>
                        {displayedDiff.notes?.map((note) => (
                          <p key={note} className="text-sm text-muted-foreground">
                            {note}
                          </p>
                        ))}
                        <DiffView
                          key={displayedDiff.id}
                          sourceId={displayedDiff.id}
                          model={displayedDiff.model}
                          oldPath={displayedDiff.source.old?.path}
                          newPath={displayedDiff.source.new?.path}
                          fileOnly={
                            displayedDiff.source.old?.type === 'binary' ||
                            displayedDiff.source.new?.type === 'binary'
                          }
                          locateTarget={
                            locateTarget &&
                            (locateTarget.ref.kind === 'file' ||
                              locateTarget.ref.kind === 'hunk' ||
                              locateTarget.ref.kind === 'lines') &&
                            locateTarget.ref.sourceId === displayedDiff.id
                              ? { ...locateTarget, ref: locateTarget.ref }
                              : undefined
                          }
                        />
                      </>
                    )}
                  </section>
                )}
              </>
            )}
          </main>
        </div>
        {saved && <p role="status">{saved}</p>}
      </Page>
    </FeedbackProvider>
  );
}
export default definePanel({
  id: 'github-pr',
  requires: { paneon: '0.0.0' },
  input: githubPRParamsSchema,
  events: {
    'review-requested': prReviewRequestedSchema,
    'pr-feedback-submitted': prFeedbackSubmittedSchema,
  },
  render: GithubPR,
});
