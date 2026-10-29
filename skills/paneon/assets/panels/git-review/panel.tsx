import { FileDiffNotice } from '../../shared/file-diff-notice';
import { useLocale } from '../../shared/i18n';
import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from '../../shared/icons.tsx';
import { agent, definePanel, usePanelInput } from '@qoggy/paneon/sdk';
import type { AnnotationValue } from '@qoggy/paneon/sdk';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
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
  usePageAnnotations,
  useAnnotations,
} from '@qoggy/paneon/ui';
import { DiffView } from '../../shared/diff.tsx';
import type { DiffViewHandle } from '../../shared/diff.tsx';
import {
  diffAnnotationTargets,
  diffTargetLocation,
  diffTargetText,
} from '../../shared/diff-schema.ts';
import { useSubmission, SubmissionError } from '../../shared/submission.ts';
import {
  checkFeedback,
  checkoutGitRef,
  queryGitRevisions,
  queryGit,
  queryGitFile,
  queryRepositoryCatalog,
} from './actions.ts';
import { RevisionPicker } from './revision-picker.tsx';
import { RepositoryFeedback } from './repository-feedback.ts';
import { RepositoryPicker } from './repository-dialogs.tsx';
import { createReviewInput } from './input.ts';
import { CommitDetails, HistoryRows } from './history.tsx';
import { ChangedFileTree } from './file-tree.tsx';
import { Branches } from './branches.tsx';
import { HistoryWorkspace } from './history-workspace';
import type { HistoryLayout } from './history-workspace';
import { FileReviewSplit } from '../../shared/file-review-split';
import type { FileReviewLayout } from '../../shared/file-review-split';
import type {
  GitFile,
  GitListing,
  GitRequest,
  GitSnapshot,
  GitRevision,
  HistoryRef,
} from './git.ts';
import {
  gitReviewParamsSchema,
  gitReviewSubmittedSchema,
  gitCheckoutCompletedSchema,
} from './schema.ts';
import type { CheckoutReason } from './checkout.ts';
import type { GitRef, GitReviewParams, GitRepository } from './schema.ts';

type ViewState = {
  request: GitRequest;
  listing?: GitListing;
  selected?: string;
  selectedFile?: string;
};
const keyOf = (request: GitRequest) => `${request.repositoryId}:${request.type}`;
function Review() {
  const { t, message } = useLocale();
  const toast = useToastManager();
  const checkoutBusy = useRef(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const input = usePanelInput<GitReviewParams>();
  const annotations = useAnnotations<GitRef>();
  const [initial] = useState(() => createReviewInput(input));
  const [repositories, setRepositories] = useState(initial.repositories);
  const activeRepositories = useRef(initial.repositories);
  const knownRepositories = useRef(new Map(initial.repositories.map((repo) => [repo.id, repo])));
  const [ready, setReady] = useState(false);
  const [catalogPending, setCatalogPending] = useState(true);
  const [repositoryIssues, setRepositoryIssues] = useState<Record<string, string>>({});
  const reader = {
    read: (request: GitRequest) =>
      queryGit({ params: { repositories: activeRepositories.current }, request }),
    readFile: (file: GitFile) =>
      queryGitFile({ params: { repositories: activeRepositories.current }, file }),
  };
  const first = initial.request;
  const [view, setView] = useState<ViewState>({ request: first });
  const currentRepository = repositories.find((repo) => repo.id === view.request.repositoryId)!;
  const [historySelections, setHistorySelections] = useState<Record<string, string>>({});
  const historyLayout = useRef<HistoryLayout>({});
  const views = useRef(new Map<string, ViewState>());
  const snapshots = useRef(new Map<string, GitSnapshot>());
  const fileSnapshots = useRef(new Map<string, GitSnapshot>());
  const [collapsed, setCollapsed] = useState(true);
  const [revisions, setRevisions] = useState<GitRevision[]>([]);
  const [revisionRefresh, setRevisionRefresh] = useState(0);

  const activeKey = useRef(keyOf(first));
  const serial = useRef(0);
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (!ready || view.request.type !== 'compare') return;
    let active = true;
    setRevisions([]);
    void queryGitRevisions({
      params: { repositories: [currentRepository] },
      repositoryId: view.request.repositoryId,
    }).then(
      (refs) => {
        if (active) setRevisions(refs);
      },
      (failure) => {
        if (active) setError(String(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [ready, currentRepository, view.request.repositoryId, view.request.type, revisionRefresh]);
  const [oldSnapshot, setOldSnapshot] = useState<GitSnapshot>();
  const [oldFileSelected, setOldFileSelected] = useState(false);
  const diffView = useRef<DiffViewHandle>(null);
  const mountedDiff = useRef<string | undefined>(undefined);
  const locating = useRef(0);
  const [fileReveal, setFileReveal] = useState(0);
  const [fileGrouping, setFileGrouping] = useState<Record<string, boolean>>({});
  const feedbackState = useRef(new RepositoryFeedback());
  const submission = useSubmission<AnnotationValue<GitRef>>(
    async ({ replacesEventId, ...feedback }) => {
      if (replacesEventId === undefined && feedback.annotations.length === 0)
        throw new SubmissionError('Save at least one annotation before submitting.');
      const result = await checkFeedback({
        params: { repositories: [...knownRepositories.current.values()] },
        feedback: feedbackState.current.build(
          { ...feedback, ...(replacesEventId === undefined ? {} : { replacesEventId }) },
          snapshots.current,
        ),
      });
      if (!result.ok) throw new Error(result.message);
      const checked = result.data;
      const receipt = await agent.emit('git-review-submitted', checked);
      feedbackState.current.accept(feedback, checked);
      return receipt;
    },
    { successToast: 'Annotations submitted.' },
  );
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
        request.historyContext &&
        request.historyContext.tip === previous?.listing?.historyContext?.tip;
      // Selection responds immediately. Old files/details must never masquerade as the requested commit.
      // Branch navigation keeps the repository's ref tree while the new graph loads.
      save({
        request,
        ...(request.type === 'history' && previous?.listing
          ? {
              listing: {
                ...previous.listing,
                files: [],
                snapshots: [],
                description: '',
                descriptionUI: { key: '' },
                history:
                  sameGraph && previous.listing.history
                    ? { ...previous.listing.history, selectedCommit: undefined }
                    : undefined,
              },
            }
          : {}),
      });
    }
    try {
      const result = await reader.read({ ...request, ...(more ? { pageOnly: true } : {}) });
      if (!result.ok) throw new Error(result.message);
      if (id !== serial.current || activeKey.current !== key) return;
      const listing = result.data;
      setRepositoryIssues((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(
            ([repositoryId]) => repositoryId !== request.repositoryId,
          ),
        ),
      );
      listing.snapshots.forEach((snapshot) => {
        snapshots.current.set(snapshot.id, snapshot);
        fileSnapshots.current.set(`${listing.listingId}:${snapshot.fileId}`, snapshot);
      });
      if (
        listing.history &&
        previous?.listing?.history &&
        !!request.historyContext &&
        listing.historyContext?.tip === previous.listing.historyContext?.tip
      ) {
        listing.history.commits = more
          ? [...previous.listing.history.commits, ...listing.history.commits]
          : previous.listing.history.commits;
        if (!more) listing.history.hasMore = previous.listing.history.hasMore;
        listing.historyRefs = previous.listing.historyRefs;
        listing.historyDecorations = previous.listing.historyDecorations;
        listing.currentBranch = previous.listing.currentBranch;
        listing.branches = previous.listing.branches;
        for (const commit of listing.history.commits)
          commit.refs = listing.historyDecorations?.[commit.oid] ?? [];
        if (listing.history.selectedCommit)
          listing.history.selectedCommit.refs =
            listing.historyDecorations?.[listing.history.selectedCommit.oid] ?? [];
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
          ...(listing.historyContext ? { historyContext: listing.historyContext } : {}),
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
  function selectFile(file: GitFile) {
    serial.current++;
    setPending(false);
    setOldFileSelected(false);
    save({ ...view, selectedFile: file.id });
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
      const result = await reader.readFile(file);
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
  async function initialize() {
    setCatalogPending(true);
    setError('');
    try {
      const catalog = await queryRepositoryCatalog({ repositories: initial.repositories });
      const normalized = catalog.map((entry) => entry.repository);
      activeRepositories.current = normalized;
      knownRepositories.current = new Map(normalized.map((repo) => [repo.id, repo]));
      setRepositories(normalized);
      setRepositoryIssues(
        Object.fromEntries(
          catalog
            .filter((entry) => entry.error)
            .map((entry) => [entry.repository.id, entry.error!]),
        ),
      );
      setReady(true);
      setCatalogPending(false);
      await load(first);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setCatalogPending(false);
    }
  }
  useEffect(() => {
    void initialize(); /* One initial navigation; data updates are explicit. */
  }, []);
  function addRepository(repository: GitRepository) {
    knownRepositories.current.set(repository.id, repository);
    activeRepositories.current = [...activeRepositories.current, repository];
    setRepositories(activeRepositories.current);
    void load({ repositoryId: repository.id, type: 'changes' });
  }
  function removalReason(id: string) {
    if (id === view.request.repositoryId)
      return t('Switch to another repository before removing this one.');
    if (feedbackState.current.hasChanges(id, annotations.value, snapshots.current))
      return t('This repository has unsubmitted annotations. Handle them before removing it.');
    return undefined;
  }
  function removeRepository(id: string) {
    if (checkoutBusy.current || submission.pending || removalReason(id)) return;
    for (const annotationId of feedbackState.current.retire(
      id,
      annotations.value,
      snapshots.current,
    ))
      annotations.removeAnnotation(annotationId);
    for (const [sourceId, snapshot] of snapshots.current)
      if (snapshot.source.repositoryId === id) snapshots.current.delete(sourceId);
    for (const [key, snapshot] of fileSnapshots.current)
      if (snapshot.source.repositoryId === id) fileSnapshots.current.delete(key);
    for (const type of ['changes', 'history', 'compare']) views.current.delete(`${id}:${type}`);
    setHistorySelections((previous) =>
      Object.fromEntries(Object.entries(previous).filter(([key]) => key !== id)),
    );
    setFileGrouping((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(
          ([key]) => !['changes', 'history', 'compare'].some((type) => key === `${id}:${type}`),
        ),
      ),
    );
    activeRepositories.current = activeRepositories.current.filter((repo) => repo.id !== id);
    setRepositories(activeRepositories.current);
  }
  function navigate(repositoryId: string, type: GitRequest['type']) {
    const key = `${repositoryId}:${type}`;
    // Tabs can activate on both focus and mouse-down before React commits the new value.
    if (activeKey.current === key) return;
    serial.current++;
    setPending(false);
    setError('');
    setOldSnapshot(undefined);
    setCollapsed(true);
    activeKey.current = key;
    const saved = views.current.get(key);
    if (saved && (saved.listing || type === 'compare')) {
      setView(saved);
      setCollapsed(!saved.selected);
      return;
    }
    const request: GitRequest = saved?.request ?? { repositoryId, type };
    if (type === 'compare') {
      save({ request });
      return;
    }
    void load(request);
  }
  function editRequest(patch: Partial<GitRequest>) {
    save({ ...view, request: { ...view.request, ...patch } });
  }
  function compareWithCurrentBranch(base: string) {
    void load({
      repositoryId: view.request.repositoryId,
      type: 'compare',
      base,
      head: 'HEAD',
      mode: 'commits',
    });
  }
  async function checkout(entry: HistoryRef) {
    if (checkoutBusy.current || pending || submission.pending) return;
    const listing = view.listing;
    const decorations = Object.entries(listing?.historyDecorations ?? {});
    const headCommit = decorations.find(([, refs]) => refs.some((ref) => ref.kind === 'head'))?.[0];
    const targetCommit = decorations.find(([, refs]) =>
      refs.some((ref) => ref.kind === entry.kind && ref.name === entry.name),
    )?.[0];
    if (!headCommit || !targetCommit) {
      toast.add({
        title: t('Checkout cancelled. Refresh the history and try again.'),
        type: 'error',
      });
      return;
    }
    checkoutBusy.current = true;
    setCheckingOut(true);
    serial.current++;
    locating.current++;
    try {
      const result = await checkoutGitRef({
        params: { repositories: activeRepositories.current },
        repositoryId: view.request.repositoryId,
        target: { kind: entry.kind, ref: entry.ref, commit: targetCommit },
        expectedHead: { branch: listing?.currentBranch ?? null, commit: headCommit },
      });
      if (!result.ok) {
        const reasons: Record<CheckoutReason, string> = {
          dirty: t(
            'Checkout cancelled. Commit, stash or remove local changes and untracked files first.',
          ),
          'in-progress': t(
            'Checkout cancelled. Finish the Git operation or release the repository lock first.',
          ),
          stale: t(
            'Checkout cancelled. HEAD or the target reference changed. Refresh the history first.',
          ),
          current: t('Checkout cancelled. This branch is already checked out.'),
          'local-exists': t('Checkout cancelled. A local branch with this name already exists.'),
          'symbolic-remote': t('Checkout cancelled. Select a concrete remote branch.'),
          'remote-unavailable': t(
            'Checkout cancelled. The remote branch does not match a unique configured remote.',
          ),
          'verification-failed': t(
            'Checkout could not be verified. Refresh and check the repository state.',
          ),
          'git-error': t(
            'Checkout could not be confirmed. Check the Git error and refresh the repository.',
          ),
        };
        toast.add({
          title: reasons[result.reason],
          description: result.message || undefined,
          type: 'error',
        });
        return;
      }
      // Invalidate mutable views, retaining the original snapshots backing annotations.
      for (const type of ['changes', 'history', 'compare'] as const)
        views.current.delete(`${view.request.repositoryId}:${type}`);
      fileSnapshots.current.clear();
      setHistorySelections((previous) => ({ ...previous, [view.request.repositoryId]: 'HEAD' }));
      setRevisionRefresh((value) => value + 1);
      try {
        await agent.emit('git-checkout-completed', result.data);
        toast.add({
          title: result.data.after.branch
            ? t('Checked out {name}.', { name: result.data.after.branch })
            : t('Checked out {name} (detached HEAD).', { name: entry.name }),
          type: 'success',
        });
      } catch (failure) {
        toast.add({
          title: t('Checkout succeeded, but the agent notification failed.'),
          description: failure instanceof Error ? failure.message : String(failure),
          type: 'warning',
        });
      }
      await load({ repositoryId: view.request.repositoryId, type: 'history' });
    } catch (failure) {
      toast.add({
        title: t(
          'Checkout could not be confirmed. Check the Git error and refresh the repository.',
        ),
        description: failure instanceof Error ? failure.message : String(failure),
        type: 'error',
      });
    } finally {
      checkoutBusy.current = false;
      setCheckingOut(false);
    }
  }
  const selected = oldSnapshot ?? snapshots.current.get(view.selected ?? '');
  const historyDiff = view.request.type === 'history' && !!selected && !collapsed;
  const fileDiff = view.request.type !== 'history' && !!selected && !collapsed;
  const fileLayout = useRef<FileReviewLayout | undefined>(undefined);
  const listing = view.listing,
    request = view.request;
  const fileList = (
    <aside
      className={`flex max-h-64 min-w-0 flex-col ${request.type === 'history' ? 'max-md:min-h-0 md:max-h-1/2 md:min-h-32' : 'min-h-0 md:max-h-none'}`}
      aria-label={t('改动文件')}
    >
      <div className="flex min-h-0 flex-1 flex-col" aria-busy={pending}>
        {pending && !listing?.files.length && (
          <p role="status" className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
            <Spinner aria-hidden="true" />
            {t('读取 Git…')}
          </p>
        )}
        <ChangedFileTree
          viewType={request.type}
          pending={pending}
          emptyState={
            error ? null : !listing ? (
              request.type === 'compare' ? (
                <Empty className="flex-none py-20">
                  <EmptyHeader>
                    <EmptyTitle>{t('Select revisions to compare')}</EmptyTitle>
                    <EmptyDescription>
                      {t('Choose a base revision, then click Compare.')}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : null
            ) : undefined
          }
          groupByDirectory={fileGrouping[keyOf(request)] ?? request.type !== 'changes'}
          onGroupByDirectoryChange={(grouped) =>
            setFileGrouping((previous) => ({ ...previous, [keyOf(request)]: grouped }))
          }
          snapshots={listing?.files ?? []}
          selectedId={oldSnapshot && oldFileSelected ? oldSnapshot.fileId : view.selectedFile}
          filter=""
          scopeKey={keyOf(request)}
          revealKey={fileReveal}
          onSelect={selectFile}
          onOpen={(file) => void openFile(file)}
        />
      </div>
    </aside>
  );
  const historyBranches = (
    <Branches
      key={request.repositoryId}
      refs={listing?.historyRefs ?? []}
      selected={historySelections[request.repositoryId] ?? request.branch}
      currentBranch={listing?.currentBranch}
      onCheckout={!pending && !submission.pending ? (entry) => void checkout(entry) : undefined}
      onCompare={compareWithCurrentBranch}
      onSelect={(branch) => {
        setHistorySelections((previous) => ({
          ...previous,
          [request.repositoryId]: branch,
        }));
      }}
      onOpen={(branch) => {
        setHistorySelections((previous) => ({
          ...previous,
          [request.repositoryId]: branch,
        }));
        const {
          area: _area,
          historyContext: _historyContext,
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
  );
  const historyCommits = (
    <section
      aria-label={t('提交历史')}
      className="flex max-h-72 min-h-0 min-w-0 flex-col md:max-h-none"
    >
      <div className="min-h-0 overflow-auto" data-commit-scroll="">
        {listing?.history?.commits.length === 0 && (
          <Empty className="flex-none px-3 py-10">
            <EmptyHeader>
              <EmptyDescription>{t('没有提交记录。')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <HistoryRows
          key={`${request.repositoryId}:${request.branch ?? 'HEAD'}:${listing?.history?.tip ?? ''}`}
          commits={listing?.history?.commits ?? []}
          selected={request.commit ?? listing?.history?.selectedCommit?.oid}
          onCompare={compareWithCurrentBranch}
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
              void load({ ...request, offset: listing.history?.commits.length ?? 0 }, true)
            }
          >
            {t('加载更多（每批 50）')}
          </Button>
        )}
      </div>
    </section>
  );
  const historyFiles = (
    <div data-history-files="" className="flex min-h-0 min-w-0 flex-col gap-1">
      {fileList}
      <CommitDetails commit={listing?.history?.selectedCommit} />
    </div>
  );
  const diffPane = selected && (
    <section
      aria-label={t('文件差异')}
      className="flex h-[70dvh] min-h-0 min-w-0 flex-col overflow-hidden rounded-md border md:h-auto"
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
            title={`${oldSnapshot.source.repositoryPath} · ${JSON.stringify(oldSnapshot.source.view)}`}
          >
            {t('仓库')} {oldSnapshot.source.repositoryPath} ·{' '}
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
          {selected.source.old?.type === 'binary' || selected.source.new?.type === 'binary' ? (
            <FileDiffNotice
              onCollapse={collapseDiff}
              oldPath={selected.source.old?.path}
              newPath={selected.source.new?.path}
              oldRevision={
                !selected.source.old
                  ? undefined
                  : selected.source.view.type === 'history'
                    ? selected.source.view.parent?.slice(0, 8)
                    : selected.source.view.type === 'compare'
                      ? (
                          selected.source.view.mergeBaseCommit ?? selected.source.view.baseCommit
                        ).slice(0, 8)
                      : selected.source.view.area === 'staged'
                        ? selected.source.view.headCommit?.slice(0, 8)
                        : t('暂存区')
              }
              newRevision={
                !selected.source.new
                  ? undefined
                  : selected.source.view.type === 'history'
                    ? selected.source.view.commit.slice(0, 8)
                    : selected.source.view.type === 'compare'
                      ? selected.source.view.headCommit.slice(0, 8)
                      : selected.source.view.area === 'staged'
                        ? t('暂存区')
                        : t('工作区')
              }
            />
          ) : (
            <DiffView
              key={selected.id}
              ref={(handle) => {
                diffView.current = handle;
                mountedDiff.current = handle ? selected.id : undefined;
              }}
              annotationTargets={diffAnnotationTargets(selected.model, selected.id)}
              model={selected.model}
              defaultExpanded
              layout="bounded"
              onCollapse={collapseDiff}
              oldPath={selected.source.old?.path}
              newPath={selected.source.new?.path}
              oldRevision={
                !selected.source.old
                  ? undefined
                  : selected.source.view.type === 'history'
                    ? selected.source.view.parent?.slice(0, 8)
                    : selected.source.view.type === 'compare'
                      ? (
                          selected.source.view.mergeBaseCommit ?? selected.source.view.baseCommit
                        ).slice(0, 8)
                      : selected.source.view.area === 'staged'
                        ? selected.source.view.headCommit?.slice(0, 8)
                        : t('暂存区')
              }
              newRevision={
                !selected.source.new
                  ? undefined
                  : selected.source.view.type === 'history'
                    ? selected.source.view.commit.slice(0, 8)
                    : selected.source.view.type === 'compare'
                      ? selected.source.view.headCommit.slice(0, 8)
                      : selected.source.view.area === 'staged'
                        ? t('暂存区')
                        : t('工作区')
              }
            />
          )}
        </>
      )}

      {!selected && !pending && (
        <p className="text-sm text-muted-foreground">{t('选择文件查看差异。')}</p>
      )}
    </section>
  );
  usePageAnnotations<GitRef>({
    disabled: submission.pending || checkingOut,
    onSubmit: (feedback) => submission.submit(feedback),
    adapter: {
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
      targetRanges(target) {
        const snapshot = snapshots.current.get(target.ref.sourceId);
        return snapshot && mountedDiff.current === snapshot.id
          ? (diffView.current?.getRanges(diffTargetLocation(snapshot.model, target)) ?? [])
          : [];
      },
      async locate(target) {
        const snapshot = snapshots.current.get(target.ref.sourceId);
        if (snapshot) {
          navigate(snapshot.source.repositoryId, snapshot.source.view.type);
          const serial = ++locating.current;
          setOldSnapshot(snapshot);
          setOldFileSelected(true);
          setCollapsed(false);
          setFileReveal((value) => value + 1);
          await new Promise<void>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done())),
          );
          if (serial !== locating.current || mountedDiff.current !== snapshot.id) return;
          await diffView.current?.reveal(diffTargetLocation(snapshot.model, target));
        }
      },
    },
    allowEmptySubmit: submission.hasReceipt,
  });
  return (
    <>
      <Tabs
        value={request.type}
        onValueChange={(type) => navigate(request.repositoryId, type as GitRequest['type'])}
        render={
          <main
            inert={checkingOut || undefined}
            aria-busy={checkingOut || undefined}
            className="flex min-h-[34rem] flex-col gap-3 p-3 md:h-[100dvh] md:min-h-[36rem] md:p-4"
            data-git-workbench=""
          >
            <header
              className="flex min-h-12 flex-wrap items-center gap-4 border-b pb-3"
              aria-label={t('Git 与批注操作')}
            >
              <RepositoryPicker
                repositories={repositories}
                currentId={request.repositoryId}
                disabled={!ready || checkingOut || submission.pending}
                selectionDisabled={!ready || checkingOut}
                issues={repositoryIssues}
                removalReason={removalReason}
                onSelect={(id) => navigate(id, request.type)}
                onAdd={addRepository}
                onRemove={removeRepository}
              />
              <TabsList variant="line" aria-label={t('Git 审阅')}>
                {(['changes', 'history', 'compare'] as const).map((type) => (
                  <TabsTrigger key={type} value={type} disabled={!ready}>
                    {
                      {
                        changes: t('未提交改动'),
                        history: t('提交记录'),
                        compare: t('分支/版本对比'),
                      }[type]
                    }
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="ml-auto flex items-center gap-3">
                {(checkingOut || catalogPending) && (
                  <span
                    role="status"
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Spinner aria-hidden="true" />
                    {checkingOut ? t('Checking out…') : t('读取 Git…')}
                  </span>
                )}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={t('刷新')}
                        disabled={pending || catalogPending}
                        onClick={() => {
                          if (!ready) {
                            void initialize();
                            return;
                          }
                          if (request.type === 'compare') setRevisionRefresh((value) => value + 1);
                          const {
                            tip: _tip,
                            offset: _offset,
                            file: _file,
                            historyContext: _historyContext,
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
                        <RefreshCw aria-hidden="true" />
                      </Button>
                    }
                  />
                  <TooltipContent>{t('刷新')}</TooltipContent>
                </Tooltip>
              </div>
            </header>
            <TabsContent value={request.type} className="flex min-h-0 flex-1 flex-col gap-3">
              {request.type === 'compare' && (
                <div className="flex flex-wrap items-center gap-2">
                  <RevisionPicker
                    label={t('Base')}
                    prefix="base:"
                    value={request.base ?? ''}
                    revisions={revisions}
                    onChange={(base) => editRequest({ base })}
                  />
                  <span aria-hidden="true" className="text-muted-foreground">
                    →
                  </span>
                  <RevisionPicker
                    label={t('Head')}
                    prefix="compare:"
                    value={request.head ?? 'HEAD'}
                    revisions={revisions}
                    onChange={(head) => editRequest({ head })}
                  />
                  <Select
                    items={{ branch: 'Three-dot diff', commits: 'Two-dot diff' }}
                    value={request.mode ?? 'commits'}
                    onValueChange={(value) => editRequest({ mode: value as 'branch' | 'commits' })}
                  >
                    <SelectTrigger aria-label={t('比较方式')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="branch">Three-dot diff</SelectItem>
                      <SelectItem value="commits">Two-dot diff</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    disabled={pending || !request.base}
                    onClick={() => void load({ ...request, head: request.head || 'HEAD' })}
                  >
                    {t('比较')}
                  </Button>
                </div>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertTitle>{t('读取失败')}</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {((request.type !== 'changes' && listing) || pending) && (
                <div className="flex h-5 min-w-0 shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {request.type !== 'changes' && (
                    <p
                      className="min-w-0 flex-1 truncate"
                      title={
                        listing &&
                        message(
                          listing.descriptionUI.key,
                          Object.fromEntries(
                            Object.entries(listing.descriptionUI.params ?? {}).map(
                              ([key, value]) => [key, key === 'merge' ? message(value) : value],
                            ),
                          ),
                        )
                      }
                    >
                      {listing &&
                        message(
                          listing.descriptionUI.key,
                          Object.fromEntries(
                            Object.entries(listing.descriptionUI.params ?? {}).map(
                              ([key, value]) => [key, key === 'merge' ? message(value) : value],
                            ),
                          ),
                        )}
                    </p>
                  )}
                  {pending && (
                    <span role="status" className="flex shrink-0 items-center gap-2">
                      <Spinner aria-hidden="true" />
                      {t('读取 Git…')}
                    </span>
                  )}
                </div>
              )}
              <div
                data-git-workspace=""
                className={`grid min-h-0 flex-1 gap-3 ${request.type === 'history' ? (historyDiff ? 'md:min-h-[calc(27.75rem+1px)] md:grid-rows-1 md:gap-y-0' : 'md:min-h-[12.75rem] md:grid-rows-1') : fileDiff ? 'md:grid-cols-1 md:gap-x-0' : 'md:grid-cols-1'}`}
              >
                {request.type === 'history' ? (
                  <HistoryWorkspace
                    branches={historyBranches}
                    commits={historyCommits}
                    files={historyFiles}
                    diff={diffPane}
                    showDiff={historyDiff}
                    layoutRef={historyLayout}
                  />
                ) : (
                  <FileReviewSplit
                    sidebar={fileList}
                    showContent={fileDiff}
                    layoutRef={fileLayout}
                    separatorLabel={t('调整文件列表与差异宽度')}
                  >
                    {diffPane}
                  </FileReviewSplit>
                )}
              </div>
              {submission.message && (
                <p role={submission.failed ? 'alert' : 'status'} className="text-sm">
                  {submission.message}
                </p>
              )}
            </TabsContent>
          </main>
        }
      />
    </>
  );
}
export default definePanel({
  id: 'git-review',
  requires: { paneon: '>=0.0.1 <0.1.0' },
  input: gitReviewParamsSchema,
  events: {
    'git-review-submitted': gitReviewSubmittedSchema,
    'git-checkout-completed': gitCheckoutCompletedSchema,
  },
  render: Review,
});
