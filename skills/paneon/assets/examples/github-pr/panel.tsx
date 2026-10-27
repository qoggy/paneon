import { Markdown, usePageAnnotations } from '@qoggy/paneon/ui';
import { FileDiffNotice } from '../../shared/file-diff-notice';
import { usePRCopy } from './copy';
import {
  Check,
  CircleDot,
  Clock3,
  ExternalLink,
  FileCode2,
  GitPullRequest,
  GitMerge,
  MessageSquare,
  RefreshCw,
  Search,
  X,
} from './icons';
import { useEffect, useRef, useState } from 'react';
import { agent, definePanel, serverAction, usePanelInput, z } from '@qoggy/paneon/sdk';
import type { AnnotationTarget as Target } from '@qoggy/paneon/sdk';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useToastManager,
} from '@qoggy/paneon/ui';
import { DiffView } from '../../shared/diff.tsx';
import type { DiffViewHandle } from '../../shared/diff.tsx';
import { diffAnnotationTargets, diffTargetLocation } from '../../shared/diff-schema.ts';
import { locateMarkdownAnnotation } from '../../shared/markdown-annotation';
import {
  GitHubReview,
  reviewFromEvidence,
  prDetailInputSchema,
  prComparisonInputSchema,
  prSnapshotInputSchema,
} from './github.ts';
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
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : String(error),
    };
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
  handler: (ctx, input) =>
    readResult(() => new GitHubReview().list(input.repository, input, ctx.signal)),
});
export const readPR = serverAction({
  kind: 'query',
  input: sessionInput.extend({ number: z.number().int().positive() }),
  handler: (ctx, input) =>
    readResult(() =>
      reviewFromEvidence(input.repository, input.sessionId).detail(
        input.repository,
        input.sessionId,
        input.number,
        ctx.signal,
      ),
    ),
});
export const readChecks = serverAction({
  kind: 'query',
  input: sessionInput.extend({ detailId: z.string(), detail: prDetailInputSchema }),
  handler: (ctx, input) =>
    readResult(() =>
      reviewFromEvidence(input.repository, input.sessionId, { detail: input.detail }).checks(
        input.repository,
        input.sessionId,
        input.detailId,
        ctx.signal,
      ),
    ),
});
export const readComparison = serverAction({
  kind: 'query',
  input: sessionInput.extend({ detailId: z.string(), detail: prDetailInputSchema }),
  handler: (ctx, input) =>
    readResult(() =>
      reviewFromEvidence(input.repository, input.sessionId, { detail: input.detail }).comparison(
        input.repository,
        input.sessionId,
        input.detailId,
        ctx.signal,
      ),
    ),
});
export const readFile = serverAction({
  kind: 'query',
  input: sessionInput.extend({
    comparisonId: z.string(),
    filename: z.string(),
    comparison: prComparisonInputSchema,
    detail: prDetailInputSchema,
  }),
  handler: (ctx, input) =>
    readResult(() =>
      reviewFromEvidence(input.repository, input.sessionId, {
        comparison: input.comparison,
        detail: input.detail,
      }).diff(input.repository, input.sessionId, input.comparisonId, input.filename, ctx.signal),
    ),
});
export const checkFeedback = serverAction({
  kind: 'query',
  input: sessionInput.extend({
    feedback: prFeedbackSchema,
    snapshots: z.array(prSnapshotInputSchema),
  }),
  handler: (_ctx, input) =>
    readResult(() =>
      reviewFromEvidence(input.repository, input.sessionId, {
        snapshots: input.snapshots,
      }).feedback(input.repository, input.sessionId, input.feedback),
    ),
});
export const checkReviewRequest = serverAction({
  kind: 'query',
  input: sessionInput.extend({ detailId: z.string(), detail: prDetailInputSchema }),
  handler: (_ctx, input) =>
    readResult(() =>
      reviewFromEvidence(input.repository, input.sessionId, { detail: input.detail }).reviewRequest(
        input.repository,
        input.sessionId,
        input.detailId,
      ),
    ),
});

type Tab = 'overview' | 'files' | 'checks';
type ListQuery = { state: 'open' | 'closed' | 'merged' | 'all'; search: string; limit: number };
function GithubPR() {
  const { t, language } = usePRCopy();
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
    [old, setOld] = useState<PRSnapshot>();
  const diffView = useRef<DiffViewHandle>(null);
  const mountedDiff = useRef<string | undefined>(undefined);
  const [tabLoading, setTabLoading] = useState(false),
    [tabError, setTabError] = useState<string | { filename: string; error: string }>(''),
    [fileFilter, setFileFilter] = useState('');
  const [requestLoading, setRequestLoading] = useState(false),
    [requestMessage, setRequestMessage] = useState<{ id?: number; error?: string }>();
  const toast = useToastManager();
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
        setDetailError({
          number,
          error: error instanceof Error ? error.message : String(error),
        });
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
      const preservedDetail = details.current.get(view.detailId);
      if (!preservedDetail) throw new Error('Original PR detail is missing.');
      const result = await readFile({
        ...session,
        comparisonId: view.id,
        comparison: view,
        detail: preservedDetail,
        filename,
      });
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
        setTabError({
          filename,
          error: error instanceof Error ? error.message : String(error),
        });
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
        const result = await readComparison({ ...session, detailId: detail.id, detail });
        if (serial !== tabSerial.current || current.current.detailId !== detail.id) return;
        if (!result.ok) throw new Error(result.message);
        comparisons.current.set(detail.id, result.data);
        setComparison(result.data);
        setSelected(undefined);
        if (result.data.files[0]) {
          await file(result.data, result.data.files[0].filename);
        }
      } else {
        const result = await readChecks({ ...session, detailId: detail.id, detail });
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
  const checksObservedAt =
    old?.source.kind === 'check' ? old.source.observedAt : checks?.observedAt;
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    );
  const filteredFiles = (comparison?.files ?? []).filter((item) =>
    `${item.filename} ${item.previous_filename ?? ''}`
      .toLowerCase()
      .includes(fileFilter.toLowerCase()),
  );
  function stateLabel(value: string) {
    return t(
      (
        {
          OPEN: 'open',
          CLOSED: 'closed',
          MERGED: 'merged',
          APPROVED: 'Approved',
          CHANGES_REQUESTED: 'Changes requested',
          REVIEW_REQUIRED: 'Review required',
          MERGEABLE: 'No conflicts',
          CONFLICTING: 'Has conflicts',
          UNKNOWN: 'Unknown',
          CLEAN: 'Ready to merge',
          BLOCKED: 'Merge blocked',
          BEHIND: 'Branch is behind',
          DIRTY: 'Has conflicts',
          DRAFT: 'Draft',
          UNSTABLE: 'Checks need attention',
          HAS_HOOKS: 'Merge requirements pending',
          COMPLETED: 'Completed',
          SUCCESS: 'Passed',
          FAILURE: 'Failed',
          ERROR: 'Failed',
          TIMED_OUT: 'Timed out',
          ACTION_REQUIRED: 'Action required',
          CANCELLED: 'Cancelled',
          SKIPPED: 'Skipped',
          NEUTRAL: 'Neutral',
          PENDING: 'Pending',
          EXPECTED: 'Pending',
          QUEUED: 'Queued',
          IN_PROGRESS: 'In progress',
          WAITING: 'Waiting',
          REQUESTED: 'Pending',
          STALE: 'Out of date',
          STARTUP_FAILURE: 'Failed',
          added: 'Added',
          removed: 'Deleted',
          modified: 'Modified',
          renamed: 'Renamed',
          copied: 'Copied',
          changed: 'Modified',
          unchanged: 'Unchanged',
        } as const
      )[value] ?? 'Not reported',
    );
  }
  function checkIcon(value: string) {
    if (value === 'SUCCESS')
      return (
        <Check
          className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
      );
    if (['FAILURE', 'ERROR', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(value))
      return <X className="size-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />;
    return (
      <Clock3 className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
    );
  }
  function fileTone(status: string) {
    return status === 'added'
      ? 'text-emerald-600 dark:text-emerald-400'
      : status === 'removed'
        ? 'text-muted-foreground line-through'
        : 'text-blue-600 dark:text-blue-400';
  }
  async function requestReview() {
    if (!shown || requestLoading) return;
    setRequestLoading(true);
    setRequestMessage(undefined);
    try {
      const result = await checkReviewRequest({ ...session, detailId: shown.id, detail: shown });
      if (!result.ok) throw new Error(result.message);
      const receipt = await agent.emit('review-requested', result.data);
      setRequestMessage({ id: receipt.id });
    } catch (error) {
      setRequestMessage({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setRequestLoading(false);
    }
  }
  usePageAnnotations<PRRef>({
    onSubmit: async (feedback) => {
      const ids = new Set(
        feedback.annotations.flatMap((annotation) =>
          annotation.targets.map((target) => target.ref.sourceId),
        ),
      );
      const evidence = [...ids].map((id) => {
        const snapshot = snapshots.current.get(id);
        if (!snapshot) throw new Error('Original PR source is missing. Draft retained.');
        return {
          id: snapshot.id,
          source: snapshot.source,
          detailId: snapshot.detailId,
          ...(snapshot.identity ? { identity: snapshot.identity } : {}),
          ...(snapshot.body === undefined ? {} : { body: snapshot.body }),
          ...(snapshot.model
            ? {
                model: {
                  ...(snapshot.model.oldText === undefined
                    ? {}
                    : { oldText: snapshot.model.oldText }),
                  ...(snapshot.model.newText === undefined
                    ? {}
                    : { newText: snapshot.model.newText }),
                },
              }
            : {}),
        };
      });
      const result = await checkFeedback({ ...session, feedback, snapshots: evidence });
      if (!result.ok) throw new Error(result.message);
      await agent.emit('pr-feedback-submitted', result.data);
      toast.add({ title: t('Annotations submitted.'), type: 'success' });
    },
    adapter: {
      resolve(target) {
        const snapshot = snapshots.current.get(target.ref.sourceId);
        if (!snapshot) return { status: 'missing', message: t('Original content is unavailable.') };
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
        if (
          !snapshot?.model ||
          mountedDiff.current !== snapshot.id ||
          (target.ref.kind !== 'file' && target.ref.kind !== 'hunk' && target.ref.kind !== 'lines')
        )
          return [];
        return (
          diffView.current?.getRanges(
            diffTargetLocation(snapshot.model, { ...target, ref: target.ref }),
          ) ?? []
        );
      },
      async locate(target) {
        const serial = ++locating.current,
          snapshot = snapshots.current.get(target.ref.sourceId);
        if (!snapshot) return;
        setOld(snapshot);
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
          if (root) locateMarkdownAnnotation(root, target.text);
        }
        if (
          snapshot.model &&
          (target.ref.kind === 'file' || target.ref.kind === 'hunk' || target.ref.kind === 'lines')
        ) {
          if (mountedDiff.current !== snapshot.id) return;
          await diffView.current?.reveal(
            diffTargetLocation(snapshot.model, { ...target, ref: target.ref }),
          );
        }
      },
    },
  });
  return (
    <>
      <div className="mx-auto w-full max-w-[1600px] p-6 text-sm" data-pr-page="">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <GitPullRequest className="size-5 shrink-0" aria-hidden="true" />
            <h1 className="truncate text-base font-semibold text-foreground">
              {params.repository}
            </h1>
            <span className="shrink-0">/ {t('Pull requests')}</span>
          </div>
        </header>
        <div className="grid grid-cols-[260px_minmax(0,1fr)] gap-6">
          <aside
            aria-label={t('Pull requests')}
            className="min-w-0 self-start overflow-hidden rounded-lg border bg-background"
          >
            <div role="search" className="space-y-2 border-b bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <Select
                  items={(['open', 'closed', 'merged', 'all'] as const).map((value) => ({
                    value,
                    label: t(value),
                  }))}
                  value={query.state}
                  onValueChange={(value) =>
                    void loadList({
                      state: value as ListQuery['state'],
                      search,
                      limit: 30,
                    })
                  }
                >
                  <SelectTrigger size="sm" aria-label={t('PR state')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['open', 'closed', 'merged', 'all'] as const).map((state) => (
                      <SelectItem key={state} value={state}>
                        {t(state)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        type="button"
                        aria-label={t('Refresh list')}
                        disabled={listLoading}
                        onClick={() => void loadList(query)}
                      >
                        <RefreshCw
                          aria-hidden="true"
                          className={listLoading ? 'animate-spin' : ''}
                        />
                      </Button>
                    }
                  />
                  <TooltipContent>{t('Refresh list')}</TooltipContent>
                </Tooltip>
              </div>
              <div className="relative">
                <Input
                  className="h-8 pr-9"
                  aria-label={t('Search PRs')}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void loadList({ ...query, search, limit: 30 });
                    }
                  }}
                  placeholder={t('Search PRs')}
                />
                <Button
                  type="button"
                  onClick={() => void loadList({ ...query, search, limit: 30 })}
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-0 right-0"
                  aria-label={t('Search')}
                  title={t('Search')}
                  disabled={listLoading}
                >
                  <Search aria-hidden="true" />
                </Button>
              </div>
            </div>
            {listLoading && (
              <p
                role="status"
                className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"
              >
                <Spinner aria-hidden="true" />
                {t('Loading pull requests…')}
              </p>
            )}
            {listError && (
              <Alert variant="destructive">
                <AlertTitle>{t('Could not load pull requests')}</AlertTitle>
                <AlertDescription>{listError}</AlertDescription>
              </Alert>
            )}
            {list && (
              <p className="border-b px-3 py-2 text-xs text-muted-foreground">
                {t('{count} loaded', { count: list.items.length })}
              </p>
            )}
            {list?.items.length === 0 && (
              <p className="p-4 text-muted-foreground">{t('No pull requests found.')}</p>
            )}
            <div
              className="max-h-[calc(100vh-270px)] min-h-24 overflow-y-auto"
              aria-label={t('PR list')}
            >
              {list?.items.map((pr) => (
                <button
                  type="button"
                  key={pr.number}
                  aria-label={`#${pr.number} ${pr.title}`}
                  aria-current={shown?.number === pr.number ? 'true' : undefined}
                  onClick={() => void open(pr.number)}
                  className={`group flex w-full items-start gap-2.5 border-b px-3 py-3 text-left last:border-b-0 hover:bg-muted/60 focus-visible:outline-ring ${shown?.number === pr.number ? 'bg-accent' : ''}`}
                >
                  {pr.state === 'MERGED' ? (
                    <GitMerge
                      className="mt-0.5 size-4 shrink-0 text-purple-600 dark:text-purple-400"
                      aria-hidden="true"
                    />
                  ) : (
                    <GitPullRequest
                      className={`mt-0.5 size-4 shrink-0 ${pr.isDraft ? 'text-muted-foreground' : pr.state === 'CLOSED' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                      aria-hidden="true"
                    />
                  )}
                  <span className="min-w-0 space-y-1">
                    <span className="line-clamp-2 block leading-5 font-medium">{pr.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      #{pr.number} · {pr.author?.login ?? t('Deleted user')}
                      {pr.isDraft ? ` · ${t('Draft')}` : ''}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {pr.headRefName} → {pr.baseRefName}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {list?.hasMore && (
              <Button
                variant="ghost"
                className="w-full rounded-none border-t"
                disabled={listLoading}
                onClick={() => void loadList({ ...query, limit: query.limit + 30 })}
              >
                {t('Load more')}
              </Button>
            )}
          </aside>
          <main className="min-w-0 space-y-4" aria-busy={detailLoading}>
            {detailLoading && (
              <p role="status" className="flex items-center gap-2 text-muted-foreground">
                <Spinner aria-hidden="true" />
                {t('Loading pull request…')}
              </p>
            )}
            {detailError && (
              <Alert variant="destructive">
                <AlertTitle>{t('Could not load pull request')}</AlertTitle>
                <AlertDescription>
                  {typeof detailError === 'string'
                    ? detailError
                    : t('Unable to open PR #{number}: {error}', detailError)}
                </AlertDescription>
              </Alert>
            )}
            {!shown && !detailLoading && (
              <div className="flex min-h-96 flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-muted-foreground">
                <GitPullRequest className="size-8" aria-hidden="true" />
                <p>{t('Choose a pull request to review.')}</p>
              </div>
            )}
            {old && (
              <Alert>
                <AlertTitle>{t('Viewing an earlier version')}</AlertTitle>
                <AlertDescription>
                  <div className="flex flex-wrap items-center gap-3">
                    <span>
                      #{old.source.number} · <code>{old.source.headCommit.slice(0, 7)}</code>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setOld(undefined);
                        setTab(current.current.tab);
                      }}
                    >
                      {t('Back to current PR')}
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            {shown && (
              <Tabs
                value={tab}
                onValueChange={(value) => void navigate(value as Tab)}
                className="gap-4"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div data-pr-overview="" className="space-y-3">
                      <h2 className="text-2xl leading-tight font-semibold tracking-tight">
                        {shown.title}{' '}
                        <span className="font-normal text-muted-foreground">#{shown.number}</span>
                      </h2>
                      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                        <Badge
                          className={`gap-1 rounded-full border-0 px-2.5 py-1 ${shown.isDraft ? 'bg-muted text-muted-foreground' : shown.state === 'MERGED' ? 'bg-purple-600 text-white' : shown.state === 'CLOSED' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}
                        >
                          {shown.state === 'MERGED' ? (
                            <GitMerge className="size-3.5" aria-hidden="true" />
                          ) : (
                            <GitPullRequest className="size-3.5" aria-hidden="true" />
                          )}
                          {shown.isDraft ? t('Draft') : stateLabel(shown.state)}
                        </Badge>
                        <span className="font-medium text-foreground">
                          {shown.author?.login ?? t('Deleted user')}
                        </span>
                        <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground">
                          {shown.baseRefName}
                        </code>
                        <span aria-hidden="true">←</span>
                        <code
                          className="max-w-72 truncate rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground"
                          title={shown.headRefName}
                        >
                          {shown.headRefName}
                        </code>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t('Refresh PR')}
                              disabled={detailLoading}
                              onClick={() => void open(shown.number)}
                            >
                              <RefreshCw aria-hidden="true" />
                            </Button>
                          }
                        />
                        <TooltipContent>{t('Refresh PR')}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <a
                              href={safeLink(shown.url)}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={t('Open on GitHub')}
                              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-ring"
                            >
                              <ExternalLink className="size-4" aria-hidden="true" />
                            </a>
                          }
                        />
                        <TooltipContent>{t('Open on GitHub')}</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-3 border-b">
                    <TabsList variant="line" aria-label={t('PR sections')}>
                      {(
                        [
                          { key: 'overview', label: t('Overview'), icon: MessageSquare },
                          { key: 'files', label: t('Files changed'), icon: FileCode2 },
                          { key: 'checks', label: t('Checks'), icon: CircleDot },
                        ] as const
                      ).map(({ key, label, icon: Icon }) => (
                        <TabsTrigger
                          key={key}
                          value={key}
                          aria-label={label}
                          onClick={() => {
                            if (tab === key && tabError) void navigate(key);
                          }}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                          {label}
                          {key === 'files' && (
                            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">
                              {shown.changedFiles}
                            </span>
                          )}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mb-2"
                      disabled={requestLoading}
                      onClick={() => void requestReview()}
                    >
                      {requestLoading ? t('Sending…') : t('Ask AI to review')}
                    </Button>
                  </div>
                </div>
                <TabsContent value={tab} className="space-y-4">
                  {requestMessage && (
                    <p
                      role="status"
                      className={
                        requestMessage.error ? 'text-destructive' : 'text-muted-foreground'
                      }
                    >
                      {requestMessage.id !== undefined
                        ? t('Review request sent to your AI.')
                        : t('Request not sent: {error}', { error: requestMessage.error ?? '' })}
                    </p>
                  )}
                  {tabError && (
                    <Alert variant="destructive">
                      <AlertTitle>{t('Could not load content')}</AlertTitle>
                      <AlertDescription>
                        {typeof tabError === 'string'
                          ? tabError
                          : t('Could not read {filename}: {error}', tabError)}{' '}
                        <a
                          href={safeLink(`${shown.url}/files`)}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {t('Open on GitHub')}
                        </a>
                      </AlertDescription>
                    </Alert>
                  )}
                  {tabLoading && (
                    <p role="status" className="flex items-center gap-2 text-muted-foreground">
                      <Spinner aria-hidden="true" />
                      {tab === 'files' ? t('Loading changes…') : t('Loading checks…')}
                    </p>
                  )}
                  {tab === 'overview' && bodySnapshot && (
                    <div className="grid grid-cols-[minmax(0,1fr)_210px] items-start gap-5">
                      <article
                        data-pr-body-source={bodySnapshot.id}
                        className="min-w-0 overflow-hidden rounded-lg border"
                      >
                        <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3">
                          <span className="font-medium">
                            {shown.author?.login ?? t('Deleted user')}
                          </span>
                          <h3 className="text-xs text-muted-foreground">{t('Description')}</h3>
                        </div>

                        <div className="p-5">
                          {bodySnapshot.body ? (
                            <Markdown<PRRef>
                              annotationTarget={{
                                sourceId: bodySnapshot.id,
                                kind: 'description',
                              }}
                            >
                              {bodySnapshot.body}
                            </Markdown>
                          ) : (
                            <p className="text-muted-foreground">{t('No description provided.')}</p>
                          )}
                        </div>
                      </article>
                      <aside className="min-w-0 divide-y text-sm" aria-label={t('PR details')}>
                        <section className="space-y-2 pb-4">
                          <h3 className="text-xs font-semibold text-muted-foreground">
                            {t('Review')}
                          </h3>
                          <p>{stateLabel(shown.reviewDecision)}</p>
                        </section>
                        <section className="space-y-2 py-4">
                          <h3 className="text-xs font-semibold text-muted-foreground">
                            {t('Merge status')}
                          </h3>
                          <p>{stateLabel(shown.mergeable)}</p>
                          {shown.mergeStateStatus && (
                            <p className="text-xs text-muted-foreground">
                              {stateLabel(shown.mergeStateStatus)}
                            </p>
                          )}
                        </section>
                        <section className="space-y-2 py-4">
                          <h3 className="text-xs font-semibold text-muted-foreground">
                            {t('Updated')}
                          </h3>
                          <time dateTime={shown.updatedAt}>{formatDate(shown.updatedAt)}</time>
                        </section>
                        <Collapsible className="py-4">
                          <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 12 12"
                              fill="none"
                              aria-hidden="true"
                              className="transition-transform group-data-[panel-open]:rotate-90"
                            >
                              <path d="m4 2 4 4-4 4" stroke="currentColor" strokeWidth="1.5" />
                            </svg>
                            {t('Commits')}
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <dl className="mt-3 space-y-2 text-xs">
                              <div className="flex justify-between gap-2">
                                <dt>{t('Base')}</dt>
                                <dd>
                                  <code title={shown.baseRefOid}>
                                    {shown.baseRefOid.slice(0, 7)}
                                  </code>
                                </dd>
                              </div>
                              <div className="flex justify-between gap-2">
                                <dt>{t('Head')}</dt>
                                <dd>
                                  <code title={shown.headRefOid}>
                                    {shown.headRefOid.slice(0, 7)}
                                  </code>
                                </dd>
                              </div>
                            </dl>
                          </CollapsibleContent>
                        </Collapsible>
                      </aside>
                    </div>
                  )}
                  {tab === 'checks' && (
                    <section
                      aria-label={t('PR checks')}
                      className="overflow-hidden rounded-lg border"
                    >
                      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3">
                        <h3 className="font-medium">{t('Checks')}</h3>
                        {checksObservedAt && (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(checksObservedAt)}
                          </span>
                        )}
                      </div>
                      {displayedChecks.length === 0 && !tabLoading && !tabError && (
                        <p className="p-6 text-muted-foreground">{t('No checks reported.')}</p>
                      )}
                      {displayedChecks.map(
                        (snapshot) =>
                          snapshot.source.kind === 'check' && (
                            <div
                              key={snapshot.id}
                              className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
                              data-pr-check={snapshot.source.key}
                            >
                              {checkIcon(snapshot.source.conclusion ?? snapshot.source.status)}
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">{snapshot.source.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {stateLabel(snapshot.source.conclusion ?? snapshot.source.status)}
                                </p>
                              </div>
                              {safeLink(snapshot.source.detailsUrl) && (
                                <a
                                  href={safeLink(snapshot.source.detailsUrl)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:underline"
                                >
                                  {t('Details')}{' '}
                                  <ExternalLink className="inline size-3" aria-hidden="true" />
                                </a>
                              )}
                            </div>
                          ),
                      )}
                    </section>
                  )}
                  {tab === 'files' && (
                    <section className="space-y-3">
                      {comparison && !old && !comparison.complete && (
                        <Alert>
                          <AlertTitle>{t('File list may be incomplete')}</AlertTitle>
                          <AlertDescription>
                            {t('Showing {listed} of {reported} files.', {
                              listed: comparison.files.length,
                              reported: comparison.reportedFiles,
                            })}{' '}
                            <a
                              href={safeLink(comparison.url)}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              {t('Open on GitHub')}
                            </a>
                          </AlertDescription>
                        </Alert>
                      )}
                      <div
                        className={`grid items-start gap-4 ${comparison && !old ? 'grid-cols-[220px_minmax(0,1fr)]' : 'grid-cols-1'}`}
                      >
                        {comparison && !old && (
                          <aside
                            className="sticky top-3 min-w-0 overflow-hidden rounded-lg border"
                            aria-label={t('Changed files')}
                          >
                            <div className="space-y-2 border-b bg-muted/30 p-3">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium">{t('Changed files')}</span>
                                <span className="text-muted-foreground">
                                  {comparison.files.length}
                                </span>
                              </div>
                              <Input
                                className="h-8"
                                aria-label={t('Search files')}
                                placeholder={t('Filter files…')}
                                value={fileFilter}
                                onChange={(event) => setFileFilter(event.target.value)}
                              />
                            </div>
                            <div className="max-h-[calc(100vh-350px)] overflow-y-auto">
                              {filteredFiles.map((item) => (
                                <button
                                  type="button"
                                  key={item.filename}
                                  aria-label={`${stateLabel(item.status)} · ${item.filename}`}
                                  title={
                                    item.previous_filename
                                      ? `${item.previous_filename} → ${item.filename}`
                                      : item.filename
                                  }
                                  aria-current={
                                    displayedDiff?.source.kind === 'diff' &&
                                    (displayedDiff.source.new?.path ??
                                      displayedDiff.source.old?.path) === item.filename
                                      ? 'true'
                                      : undefined
                                  }
                                  onClick={() => void file(comparison, item.filename)}
                                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted/60 focus-visible:outline-ring aria-[current=true]:bg-accent"
                                >
                                  <FileCode2
                                    className={`mt-0.5 size-4 shrink-0 ${fileTone(item.status)}`}
                                    aria-hidden="true"
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span
                                      className={`block truncate text-xs font-medium ${fileTone(item.status)}`}
                                    >
                                      {item.filename.split('/').at(-1)}
                                    </span>
                                    {item.filename.includes('/') && (
                                      <span className="block truncate text-[11px] text-muted-foreground">
                                        {item.filename.slice(0, item.filename.lastIndexOf('/'))}
                                      </span>
                                    )}
                                  </span>
                                </button>
                              ))}
                              {!filteredFiles.length && (
                                <p className="p-3 text-xs text-muted-foreground">
                                  {comparison.files.length
                                    ? t('No matching files.')
                                    : t('No file changes.')}
                                </p>
                              )}
                            </div>
                            <a
                              className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                              href={safeLink(comparison.url)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t('Open on GitHub')}
                              <ExternalLink className="size-3" aria-hidden="true" />
                            </a>
                          </aside>
                        )}
                        <div className="min-w-0 space-y-3">
                          {displayedDiff?.source.kind === 'diff' && displayedDiff.model && (
                            <>
                              {displayedDiff.notesUI
                                ?.filter((note) => note.key === 'Mode: {old} → {next}')
                                .map((note) => (
                                  <p key={note.key} className="text-xs text-muted-foreground">
                                    {t('File mode: {old} → {next}', note.params)}
                                  </p>
                                ))}
                              {displayedDiff.source.old?.type === 'binary' ||
                              displayedDiff.source.new?.type === 'binary' ? (
                                <FileDiffNotice
                                  oldPath={displayedDiff.source.old?.path}
                                  newPath={displayedDiff.source.new?.path}
                                />
                              ) : (
                                <DiffView
                                  key={displayedDiff.id}
                                  ref={(handle) => {
                                    diffView.current = handle;
                                    mountedDiff.current = handle ? displayedDiff.id : undefined;
                                  }}
                                  annotationTargets={diffAnnotationTargets(
                                    displayedDiff.model,
                                    displayedDiff.id,
                                  )}
                                  model={displayedDiff.model}
                                  oldPath={displayedDiff.source.old?.path}
                                  newPath={displayedDiff.source.new?.path}
                                />
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </section>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
export default definePanel({
  id: 'github-pr',
  requires: { paneon: '>=0.0.1 <0.1.0' },
  input: githubPRParamsSchema,
  events: {
    'review-requested': prReviewRequestedSchema,
    'pr-feedback-submitted': prFeedbackSubmittedSchema,
  },
  render: GithubPR,
});
