import { useLocale } from '../../shared/i18n';
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
  const { t, language, message } = useLocale();
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
    [detailError, setDetailError] = useState<string | { number: number; error: string }>('');
  const [tab, setTab] = useState<Tab>('overview'),
    [comparison, setComparison] = useState<PRComparison>(),
    [checks, setChecks] = useState<PRChecks>();
  const [selected, setSelected] = useState<PRSnapshot>(),
    [old, setOld] = useState<PRSnapshot>(),
    [locateTarget, setLocateTarget] = useState<Target<PRRef>>();
  const [tabLoading, setTabLoading] = useState(false),
    [tabError, setTabError] = useState<string | { filename: string; error: string }>(''),
    [fileFilter, setFileFilter] = useState('');
  const [requestLoading, setRequestLoading] = useState(false),
    [requestMessage, setRequestMessage] = useState<{ id?: number; error?: string }>(),
    [saved, setSaved] = useState<number>();
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
        setDetailError({ number, error: error instanceof Error ? error.message : String(error) });
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
        setTabError({ filename, error: error instanceof Error ? error.message : String(error) });
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
    setRequestMessage(undefined);
    try {
      const result = await checkReviewRequest({ ...session, detailId: shown.id });
      if (!result.ok) throw new Error(result.message);
      const receipt = await agent.emit('review-requested', result.data);
      setRequestMessage({ id: receipt.id });
    } catch (error) {
      setRequestMessage({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setRequestLoading(false);
    }
  }
  return (
    <FeedbackProvider<PRRef>
      onSubmit={async (feedback) => {
        setSaved(undefined);
        const result = await checkFeedback({ ...session, feedback });
        if (!result.ok) throw new Error(result.message);
        const receipt = await agent.emit('pr-feedback-submitted', result.data);
        setSaved(receipt.id);
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
        description={t('真实 gh 只读查询；审阅请求和意见仅交给当前 AI。')}
      >
        <FeedbackSurface />
        <FeedbackToolbar />
        <div className="grid gap-4 md:grid-cols-[minmax(14rem,1fr)_minmax(0,3fr)]">
          <aside className="space-y-3">
            <label>
              {t('状态')}{' '}
              <select
                aria-label={t('PR 状态')}
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
                    {t(state)}
                  </option>
                ))}
              </select>
            </label>
            <Input
              aria-label={t('搜索 PR')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('搜索 PR')}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={listLoading}
                onClick={() => void loadList({ ...query, search, limit: 30 })}
              >
                {t('搜索')}
              </Button>
              <Button variant="outline" disabled={listLoading} onClick={() => void loadList(query)}>
                {t('刷新列表')}
              </Button>
            </div>
            {listLoading && <p role="status">{t('读取 PR 列表…')}</p>}
            {listError && (
              <Alert variant="destructive">
                <AlertTitle>{t('列表查询失败')}</AlertTitle>
                <AlertDescription>{listError}</AlertDescription>
              </Alert>
            )}
            <p className="text-sm text-muted-foreground">
              {t('已加载')} {list?.items.length ?? 0} {t('条；gh 最大获取量')} {query.limit}
              {t('，不代表完整仓库或固定分页快照。')}
            </p>
            {list?.items.length === 0 && <p>{t('该查询没有 PR。')}</p>}
            <div className="max-h-96 space-y-2 overflow-y-auto" aria-label={t('PR 列表')}>
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
                    {pr.author?.login ?? t('deleted user')} · {pr.headRefName} → {pr.baseRefName} ·{' '}
                    {pr.isDraft ? `${t('Draft')} · ` : ''}
                    {pr.state} ·{' '}
                    {new Intl.DateTimeFormat(language, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(pr.updatedAt))}
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
                {t('加载更多（增加 30）')}
              </Button>
            )}
          </aside>
          <main className="min-w-0 space-y-4">
            {detailLoading && <p role="status">{t('读取 PR 详情…')}</p>}
            {detailError && (
              <Alert variant="destructive">
                <AlertTitle>{t('详情查询失败')}</AlertTitle>
                <AlertDescription>
                  {typeof detailError === 'string'
                    ? detailError
                    : t('Unable to open PR #{number}: {error}', detailError)}
                </AlertDescription>
              </Alert>
            )}
            {!shown && !detailLoading && (
              <p>{t('从列表选择 PR，或通过 initialPullRequest 指定初始编号。')}</p>
            )}
            {old && (
              <Alert>
                <AlertTitle>{t('回看保留快照')}</AlertTitle>
                <AlertDescription>
                  PR #{old.source.number} · {old.source.kind} · head {old.source.headCommit}
                  {t('。刷新后仍指向原始内容。')}
                  <Button
                    variant="outline"
                    onClick={() => {
                      setOld(undefined);
                      setTab(current.current.tab);
                    }}
                  >
                    {t('返回当前 PR')}
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
                      {shown.author?.login ?? t('deleted user')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge>{shown.state}</Badge>
                      {shown.isDraft && <Badge variant="secondary">{t('Draft')}</Badge>}
                      <Badge variant="outline">
                        {t('Review:')} {shown.reviewDecision || 'none'}
                      </Badge>
                      <Badge variant="outline">
                        {t('Merge:')} {shown.mergeable} / {shown.mergeStateStatus}
                      </Badge>
                    </div>
                    <p className="text-xs break-all text-muted-foreground">
                      {t('Base')} {shown.baseRefOid}
                      <br />
                      {t('Head')} {shown.headRefOid}
                      <br />
                      {t('更新于')}{' '}
                      {new Intl.DateTimeFormat(language, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(shown.updatedAt))}
                    </p>
                    <span className="text-sm text-muted-foreground">{t('（可选择整份 PR）')}</span>
                  </div>
                </FeedbackTarget>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={safeLink(shown.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {t('在 GitHub 打开 PR')}
                  </a>
                  <Button
                    variant="outline"
                    disabled={detailLoading}
                    onClick={() => void open(shown.number)}
                  >
                    {t('刷新 PR')}
                  </Button>
                  <Button disabled={requestLoading} onClick={() => void requestReview()}>
                    {requestLoading ? t('保存请求中…') : t('请 AI 审阅此 PR')}
                  </Button>
                </div>
                {requestMessage && (
                  <p role="status">
                    {requestMessage.id !== undefined
                      ? t(
                          'Saved the complete PR review request as event {id}. Draft annotations were not sent; the AI must be waiting or resume later to read it.',
                          { id: requestMessage.id },
                        )
                      : t('Request not saved: {error}', { error: requestMessage.error ?? '' })}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {(['overview', 'files', 'checks'] as const).map((value) => (
                    <Button
                      variant={tab === value ? 'default' : 'outline'}
                      key={value}
                      onClick={() => void navigate(value)}
                    >
                      {
                        { overview: t('概览与说明'), files: t('文件改动'), checks: t('检查') }[
                          value
                        ]
                      }
                    </Button>
                  ))}
                </div>
                {tabLoading && (
                  <p role="status">
                    {t('读取')} {tab === 'files' ? t('固定版本代码') : t('检查')}…
                  </p>
                )}
                {tabError && (
                  <Alert variant="destructive">
                    <AlertTitle>{t('内容查询失败')}</AlertTitle>
                    <AlertDescription>
                      {typeof tabError === 'string'
                        ? tabError
                        : t('Could not completely read file {filename}: {error}', tabError)}{' '}
                      <a
                        href={safeLink(`${shown.url}/files`)}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {t('查看 GitHub 原始页面')}
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
                        {t('PR 说明（可选择整段说明）')}
                      </h3>
                    </FeedbackTarget>
                    {bodySnapshot.body ? (
                      <MarkdownFeedback<PRRef>
                        source={bodySnapshot.body}
                        target={{ sourceId: bodySnapshot.id, kind: 'description' }}
                      />
                    ) : (
                      <p>{t('没有说明。')}</p>
                    )}
                  </div>
                )}
                {tab === 'checks' && (
                  <section aria-label={t('PR 检查')} className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {t('按固定 head 读取 statusCheckRollup；检查失败是所见业务状态。')}
                      {old?.source.kind === 'check'
                        ? t('Observed at {date}', {
                            date: new Intl.DateTimeFormat(language, {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            }).format(new Date(old.source.observedAt)),
                          })
                        : checks
                          ? t('Observed at {date}', {
                              date: new Intl.DateTimeFormat(language, {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              }).format(new Date(checks.observedAt)),
                            })
                          : ''}
                    </p>
                    {displayedChecks.length === 0 && !tabLoading && !tabError && (
                      <p>{t('没有检查记录。')}</p>
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
                                  {t('检查详情')}
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
                          {t('固定比较：merge-base')} {comparison.mergeBaseCommit} → head{' '}
                          {comparison.headCommit}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t(
                            'GitHub compare API returns at most 300 files; listed {listed}, PR reports {reported}.',
                            { listed: comparison.files.length, reported: comparison.reportedFiles },
                          )}
                        </p>
                        {comparison.notes.slice(1).map((note) => (
                          <p
                            key={message(note)}
                            className={`text-sm ${comparison.complete ? 'text-muted-foreground' : 'text-destructive'}`}
                          >
                            {message(note)}
                          </p>
                        ))}
                        <a
                          href={safeLink(comparison.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {t('GitHub 原始文件改动')}
                        </a>
                        <Input
                          aria-label={t('搜索文件')}
                          value={fileFilter}
                          onChange={(event) => setFileFilter(event.target.value)}
                          placeholder={t('搜索文件路径')}
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
                        {comparison.files.length === 0 && <p>{t('该固定比较没有文件改动。')}</p>}
                      </>
                    )}
                    {displayedDiff?.source.kind === 'diff' && displayedDiff.model && (
                      <>
                        {displayedDiff.notesUI?.map((note) => (
                          <p key={note.key} className="text-sm text-muted-foreground">
                            {message(note.key, note.params)}
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
        {saved && (
          <p role="status">
            {t(
              'Saved complete annotations as event {id}. Annotations go only to the current AI and were not published to GitHub.',
              { id: saved },
            )}
          </p>
        )}
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
