import { useEffect, useRef, useState } from 'react';
import { Button } from 'paneon/ui';
import { useLocale } from '../../shared/i18n';
import { queryGit, queryGitBranches, queryGitFile } from './actions.ts';
import { Branches } from './branches.tsx';
import { HistoryRows } from './history.tsx';
import { ChangedFileTree } from './file-tree.tsx';
import type { GitCommit, GitFile, GitListing, GitRequest, GitSnapshot, HistoryRef } from './git.ts';
import type { GitReviewParams, GitSourceView } from './schema.ts';

/** Shared named-action boundary used by the built-in panel and independent readers. */
export function useGitReader(params: GitReviewParams) {
  return {
    read: (request: GitRequest) => queryGit({ params, request }),
    readFile: (file: GitFile) => queryGitFile({ params, file }),
  };
}
const configuration = (repositoryPath: string): GitReviewParams => ({
  repositories: [{ id: 'repository', path: repositoryPath }],
});
export function useGitBranches({ repositoryPath }: { repositoryPath: string }) {
  const [data, setData] = useState<{ refs: HistoryRef[]; currentBranch?: string }>({ refs: [] });
  const [pending, setPending] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setPending(true);
    setError('');
    setData({ refs: [] });
    void queryGitBranches({ repositoryPath })
      .then(
        (result) => {
          if (active) setData(result);
        },
        (failure) => {
          if (active) setError(String(failure));
        },
      )
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, [repositoryPath]);
  return { ...data, pending, error };
}
export function GitBranches({
  repositoryPath,
  selected,
  onSelect,
}: {
  repositoryPath: string;
  selected?: string;
  onSelect: (ref: string) => void;
}) {
  const data = useGitBranches({ repositoryPath });
  return (
    <>
      {data.error && <p role="alert">{data.error}</p>}
      <Branches
        refs={data.refs}
        currentBranch={data.currentBranch}
        selected={selected}
        onSelect={onSelect}
      />
    </>
  );
}
export type GitHistoryProps = { repositoryPath: string; branch?: string; tip?: string };
export function useGitHistory({ repositoryPath, branch, tip }: GitHistoryProps) {
  const [listing, setListing] = useState<GitListing>();
  const [pending, setPending] = useState(true),
    [error, setError] = useState('');
  const current = useRef<GitListing>(undefined),
    serial = useRef(0);
  async function load(more = false) {
    const id = ++serial.current,
      previous = current.current;
    setPending(true);
    setError('');
    if (!more) {
      setListing(undefined);
      current.current = undefined;
    }
    try {
      const result = await queryGit({
        params: configuration(repositoryPath),
        request: {
          repositoryId: 'repository',
          type: 'history',
          branch,
          tip,
          ...(more
            ? {
                historyContext: previous?.historyContext,
                offset: previous?.history?.commits.length ?? 0,
                pageOnly: true,
              }
            : {}),
        },
      });
      if (id !== serial.current) return;
      if (!result.ok) throw new Error(result.message);
      const next = result.data;
      if (more && next.history) {
        next.historyDecorations = previous?.historyDecorations;
        for (const commit of next.history.commits)
          commit.refs = next.historyDecorations?.[commit.oid] ?? [];
        next.history.commits = [...(previous?.history?.commits ?? []), ...next.history.commits];
      }
      current.current = next;
      setListing(next);
    } catch (failure) {
      if (id === serial.current)
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (id === serial.current) setPending(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      serial.current++;
    };
  }, [repositoryPath, branch, tip]);
  return {
    commits: listing?.history?.commits ?? [],
    hasMore: listing?.history?.hasMore ?? false,
    tip: listing?.history?.tip,
    pending,
    error,
    loadMore: () => load(true),
  };
}
export function GitCommitGraph({
  selected,
  onSelect,
  ...props
}: GitHistoryProps & { selected?: string; onSelect: (commit: GitCommit) => void }) {
  const { t } = useLocale(),
    data = useGitHistory(props);
  return (
    <>
      {data.error && <p role="alert">{data.error}</p>}
      <HistoryRows commits={data.commits} selected={selected} onSelect={onSelect} />
      {data.hasMore && (
        <Button
          disabled={data.pending}
          variant="ghost"
          className="w-full"
          onClick={() => void data.loadMore()}
        >
          {t('加载更多（每批 50）')}
        </Button>
      )}
    </>
  );
}
export type GitFilesView =
  | Exclude<GitSourceView, { type: 'history' }>
  | { type: 'history'; commit: string; parent?: string | null };
export type GitFilesProps = { repositoryPath: string; view: GitFilesView };
function viewRequest(view: GitFilesView): GitRequest {
  if (view.type === 'changes') return { repositoryId: 'repository', type: 'changes' };
  if (view.type === 'history')
    return {
      repositoryId: 'repository',
      type: 'history',
      commit: view.commit,
      parent: view.parent,
    };
  return {
    repositoryId: 'repository',
    type: 'compare',
    base: view.baseCommit,
    head: view.headCommit,
    mode: view.mode,
  };
}
export function useGitFiles({ repositoryPath, view }: GitFilesProps) {
  const [files, setFiles] = useState<GitFile[]>([]),
    [pending, setPending] = useState(true),
    [error, setError] = useState('');
  const serial = useRef(0),
    viewKey = JSON.stringify(view);
  useEffect(() => {
    const id = ++serial.current;
    setFiles([]);
    setPending(true);
    setError('');
    void queryGit({ params: configuration(repositoryPath), request: viewRequest(view) })
      .then((result) => {
        if (id !== serial.current) return;
        if (!result.ok) throw new Error(result.message);
        setFiles(
          result.data.files.filter(
            (file) =>
              view.type !== 'changes' ||
              (file.source.view.type === 'changes' && file.source.view.area === view.area),
          ),
        );
      })
      .catch((failure) => {
        if (id === serial.current)
          setError(failure instanceof Error ? failure.message : String(failure));
      })
      .finally(() => {
        if (id === serial.current) setPending(false);
      });
    return () => {
      serial.current++;
    };
  }, [repositoryPath, viewKey]);
  async function readFile(file: GitFile): Promise<GitSnapshot> {
    const result = await queryGitFile({ params: configuration(repositoryPath), file });
    if (!result.ok) throw new Error(result.message);
    return result.data;
  }
  return { files, pending, error, readFile };
}
export function GitChangedFiles({
  selected,
  onSelectFile,
  ...props
}: GitFilesProps & { selected?: string; onSelectFile: (snapshot: GitSnapshot) => void }) {
  const data = useGitFiles(props),
    serial = useRef(0),
    [error, setError] = useState('');
  useEffect(() => {
    serial.current++;
    setError('');
  }, [props.repositoryPath, JSON.stringify(props.view)]);
  async function select(file: GitFile) {
    const id = ++serial.current;
    setError('');
    try {
      const snapshot = await data.readFile(file);
      if (id === serial.current) onSelectFile(snapshot);
    } catch (failure) {
      if (id === serial.current)
        setError(failure instanceof Error ? failure.message : String(failure));
    }
  }
  return (
    <>
      {(data.error || error) && <p role="alert">{data.error || error}</p>}
      <ChangedFileTree
        snapshots={data.files}
        selectedId={selected}
        filter=""
        scopeKey={`${props.repositoryPath}:${JSON.stringify(props.view)}`}
        revealKey={0}
        onSelect={(file) => void select(file)}
      />
    </>
  );
}
