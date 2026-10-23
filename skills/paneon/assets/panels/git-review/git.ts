import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readlink, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { createDiffModel } from '../../shared/diff-model.ts';
import type { DiffModel } from '../../shared/diff-model.ts';
import { diffTargetText, normalizeDiffTarget } from '../../shared/diff-schema.ts';
import { markMainlines } from './branch-model.ts';
import {
  gitFeedbackSchema,
  gitReviewParamsSchema,
  gitReviewSubmittedSchema,
  relativeFile,
} from './schema.ts';
import type {
  GitReviewParams,
  GitReviewSource,
  GitReviewSubmitted,
  GitSourceView,
} from './schema.ts';

const exec = promisify(execFile);
const hash = (bytes: Uint8Array | string) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
async function git(path: string, args: string[], signal?: AbortSignal) {
  try {
    return (
      await exec('git', ['-C', path, '-c', 'core.quotepath=false', ...args], {
        encoding: 'buffer',
        maxBuffer: 32 * 1024 * 1024,
        signal,
      })
    ).stdout;
  } catch (error) {
    const e = error as Error & { stderr?: Buffer };
    throw new Error(`Git query failed: ${e.stderr?.toString('utf8').trim() || e.message}`, {
      cause: error,
    });
  }
}
const text = async (path: string, args: string[], signal?: AbortSignal) =>
  (await git(path, args, signal)).toString('utf8').trim();
async function commitOID(path: string, ref: string, signal?: AbortSignal) {
  if (!ref || ref.startsWith('-') || ref.includes('\0') || /[\r\n]/.test(ref))
    throw new Error('Invalid revision.');
  return text(path, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], signal);
}
async function headOID(path: string, signal?: AbortSignal) {
  // Only an unborn branch is an empty history; other failures remain errors.
  const refs = await text(path, ['rev-parse', '--is-inside-work-tree'], signal);
  if (refs !== 'true') throw new Error('Expected a working-tree repository.');
  const symbolic = await text(
    path,
    ['rev-parse', '--verify', '--quiet', '--end-of-options', 'HEAD'],
    signal,
  ).catch(() => '');
  if (symbolic) return commitOID(path, symbolic, signal);
  const branch = await text(path, ['symbolic-ref', '-q', 'HEAD'], signal).catch(() => '');
  if (!branch) throw new Error('HEAD cannot be resolved.');
  return undefined;
}
async function repository(params: GitReviewParams, id: string, signal?: AbortSignal) {
  const repo = params.repositories.find((r) => r.id === id);
  if (!repo) throw new Error('Unknown repository.');
  const configured = resolve(process.cwd(), repo.path);
  const root = (await git(configured, ['rev-parse', '--show-toplevel'], signal))
    .toString('utf8')
    .replace(/\n$/, '');
  return realpath(root);
}

type Entry = {
  oldMode: string;
  newMode: string;
  oldOID: string;
  newOID: string;
  status: string;
  oldPath: string;
  newPath: string;
};
export function parseRaw(raw: string): Entry[] {
  const parts = raw.split('\0');
  const entries: Entry[] = [];
  for (let i = 0; i < parts.length && parts[i];) {
    const match = /^:(\d{6}) (\d{6}) ([a-f0-9]+) ([a-f0-9]+) ([A-Z][0-9]*)$/.exec(parts[i++]);
    if (!match || !parts[i]) throw new Error('Invalid NUL-delimited Git file list.');
    const oldPath = parts[i++],
      newPath = /^[RC]/.test(match[5]) ? parts[i++] : oldPath;
    if (!newPath) throw new Error('Missing rename destination.');
    entries.push({
      oldMode: match[1],
      newMode: match[2],
      oldOID: match[3],
      newOID: match[4],
      status: match[5],
      oldPath,
      newPath,
    });
  }
  return entries;
}
type Content = { bytes: Buffer; mode: string };
async function objectContent(
  path: string,
  oid: string,
  mode: string,
  signal?: AbortSignal,
): Promise<Content | undefined> {
  if (mode === '000000') return;
  if (!/^[a-f0-9]{40,64}$/.test(oid) || /^0+$/.test(oid))
    throw new Error('Git object is unavailable. Refresh the view.');
  return {
    bytes:
      mode === '160000' ? Buffer.from(oid) : await git(path, ['cat-file', 'blob', oid], signal),
    mode,
  };
}
async function workingContent(root: string, file: string): Promise<Content | undefined> {
  relativeFile.parse(file);
  const target = resolve(root, file);
  const parent = await realpath(dirname(target)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (parent === undefined) return;
  const rel = relative(root, parent);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`))
    throw new Error('Refusing to read through a directory outside the repository.');
  let stat;
  try {
    stat = await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (stat.isSymbolicLink()) return { bytes: Buffer.from(await readlink(target)), mode: '120000' };
  if (stat.isDirectory())
    return { bytes: Buffer.from('gitlink working directory'), mode: '160000' };
  if (!stat.isFile()) throw new Error('Unsupported filesystem object.');
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    return { bytes: await handle.readFile(), mode: stat.mode & 0o111 ? '100755' : '100644' };
  } finally {
    await handle.close();
  }
}
function decode(content?: Content) {
  if (!content) return;
  if (content.mode === '120000' || content.mode === '160000' || content.bytes.includes(0)) return;
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content.bytes);
  } catch {
    return;
  }
}
export type GitFile = {
  id: string;
  status: string;
  source: {
    repositoryId: string;
    view: GitSourceView;
    old?: { path: string };
    new?: { path: string };
  };
};
export type GitSnapshot = {
  fileId: string;
  id: string;
  source: GitReviewSource;
  model: DiffModel;
  status: string;
  notes: string[];
  notesUI: { key: string; params?: Record<string, string> }[];
};
export type CommitDecoration = {
  kind: 'head' | 'branch' | 'remote' | 'tag';
  name: string;
};
export type GitCommit = {
  oid: string;
  parents: string[];
  subject: string;
  author: string;
  date: string;
  refs: CommitDecoration[];
};
export type GitCommitDetails = GitCommit & { message: string };
export type HistoryRef = {
  kind: 'branch' | 'remote' | 'tag';
  name: string;
  ref: string;
  mainline?: boolean;
};
export type GitHistory = {
  tip?: string;
  selectedCommit?: GitCommitDetails;
  commits: GitCommit[];
  hasMore: boolean;
};
async function commitDecorations(root: string, signal?: AbortSignal) {
  const result = new Map<string, CommitDecoration[]>();
  const refs: HistoryRef[] = [];
  const defaults = new Map<string, string>();
  const add = (oid: string, decoration: CommitDecoration) => {
    const list = result.get(oid) ?? [];
    list.push(decoration);
    result.set(oid, list);
  };
  const head = await headOID(root, signal);
  if (head) add(head, { kind: 'head', name: 'HEAD' });
  const output = await text(
    root,
    [
      'for-each-ref',
      '--format=%(refname)%00%(objecttype)%00%(objectname)%00%(*objecttype)%00%(*objectname)%00%(symref)',
      'refs/heads',
      'refs/remotes',
      'refs/tags',
    ],
    signal,
  );
  for (const line of output.split('\n').filter(Boolean)) {
    const [ref, type, object, peeledType, peeled, symbolic] = line.split('\0');
    const remoteHead = /^refs\/remotes\/([^/]+)\/HEAD$/.exec(ref);
    if (remoteHead && symbolic?.startsWith(`refs/remotes/${remoteHead[1]}/`))
      defaults.set(remoteHead[1], symbolic);
    let oid = type === 'commit' ? object : peeledType === 'commit' ? peeled : undefined;
    // Nested annotated tags require peeling through more than one tag object.
    if (!oid && type === 'tag' && peeledType === 'tag') {
      const targetType = await text(root, ['cat-file', '-t', `${ref}^{}`], signal);
      if (targetType === 'commit') oid = await commitOID(root, ref, signal);
    }
    if (!oid) continue; // Tags on trees/blobs are not commit decorations.
    const kind = ref.startsWith('refs/heads/')
      ? 'branch'
      : ref.startsWith('refs/remotes/')
        ? 'remote'
        : 'tag';
    const name = ref.replace(/^refs\/(heads|remotes|tags)\//, '');
    add(oid, { kind, name });
    refs.push({ kind, name, ref });
  }
  return { decorations: result, refs: markMainlines(refs, defaults) };
}

export type GitListing = {
  listingId: string;
  historyId?: string;
  files: GitFile[];
  snapshots: GitSnapshot[];
  branches: string[];
  description: string;
  descriptionUI: { key: string; params?: Record<string, string> };
  currentBranch?: string;
  historyRefs?: HistoryRef[];
  history?: GitHistory;
};
type FileCapture = {
  file: GitFile;
  entry: Entry;
  root: string;
  working: boolean;
  conflict: boolean;
};
type HistoryCache = {
  repositoryId: string;
  branch: string;
  tip?: string;
  currentBranch?: string;
  branches: string[];
  decorations: Map<string, CommitDecoration[]>;
  refs: HistoryRef[];
};
type Session = {
  params: string;
  snapshots: Map<string, GitSnapshot>;
  listings: Map<string, { repositoryId: string; captures: Map<string, FileCapture> }>;
  histories: Map<string, HistoryCache>;
};
const sessions = new Map<string, Session>();
function trimCache<T>(values: Map<string, T>, limit: number) {
  while (values.size > limit) {
    const oldest = values.keys().next().value;
    if (oldest === undefined) break;
    values.delete(oldest);
  }
}
function session(id: string, params: GitReviewParams) {
  if (!id || id.length > 100) throw new Error('Invalid review session.');
  const key = JSON.stringify(params),
    previous = sessions.get(id);
  if (previous && previous.params !== key) throw new Error('Session parameters do not match.');
  if (previous) return previous;
  const created: Session = {
    params: key,
    snapshots: new Map(),
    listings: new Map(),
    histories: new Map(),
  };
  sessions.set(id, created);
  return created;
}
function capture(
  repositoryId: string,
  view: GitSourceView,
  entry: Entry,
  old: Content | undefined,
  next: Content | undefined,
  notes: string[],
): GitSnapshot {
  const oldText = decode(old),
    newText = decode(next);
  const source: GitReviewSource = {
    repositoryId,
    view,
    ...(old
      ? {
          old: {
            path: entry.oldPath,
            contentHash: hash(old.bytes),
            type: oldText === undefined ? ('binary' as const) : ('text' as const),
          },
        }
      : {}),
    ...(next
      ? {
          new: {
            path: entry.newPath,
            contentHash: hash(next.bytes),
            type: newText === undefined ? ('binary' as const) : ('text' as const),
          },
        }
      : {}),
  };
  if (!old && !next)
    throw new Error(`File disappeared while reading: ${entry.newPath}. Refresh changes.`);
  if (old?.mode !== next?.mode)
    notes.push(`Mode: ${old?.mode ?? 'absent'} → ${next?.mode ?? 'absent'}`);
  if ([old?.mode, next?.mode].includes('120000'))
    notes.push(
      'Symbolic link: link target bytes only; target contents are not read. File-level feedback only.',
    );
  if ([old?.mode, next?.mode].includes('160000'))
    notes.push('Gitlink/submodule object; no recursive file diff. File-level feedback only.');
  if ((old && oldText === undefined) || (next && newText === undefined))
    notes.push('Binary or nonordinary object: file-level feedback only.');
  const binary = source.old?.type === 'binary' || source.new?.type === 'binary';
  return {
    fileId: '',
    id: hash(JSON.stringify(source)),
    source,
    status: entry.status,
    notes,
    notesUI: notes.map((key) =>
      key.startsWith('Mode: ')
        ? {
            key: 'Mode: {old} → {next}',
            params: { old: old?.mode ?? 'absent', next: next?.mode ?? 'absent' },
          }
        : { key },
    ),
    model: binary ? createDiffModel() : createDiffModel(oldText, newText),
  };
}
const rawArgs = [
  'diff',
  '--raw',
  '-z',
  '--no-abbrev',
  '--find-renames',
  '--no-ext-diff',
  '--no-textconv',
];
export type GitRequest = {
  repositoryId: string;
  type: 'changes' | 'history' | 'compare';
  commit?: string;
  branch?: string;
  base?: string;
  head?: string;
  mode?: 'branch' | 'commits';
  tip?: string;
  offset?: number;
  file?: string;
  historyId?: string;
  area?: 'staged' | 'unstaged' | 'untracked';
  listingId?: string;
};
export async function readGit(
  paramsValue: GitReviewParams,
  sessionId: string,
  request: GitRequest,
  signal?: AbortSignal,
): Promise<GitListing> {
  const params = gitReviewParamsSchema.parse(paramsValue),
    cache = session(sessionId, params);
  const root = await repository(params, request.repositoryId, signal);
  const pinnedHistory = request.historyId ? cache.histories.get(request.historyId) : undefined;
  if (
    request.historyId &&
    (!pinnedHistory ||
      pinnedHistory.repositoryId !== request.repositoryId ||
      pinnedHistory.branch !== (request.branch ?? 'HEAD') ||
      pinnedHistory.tip !== request.tip)
  )
    throw new Error('Pinned history is unavailable. Refresh the history.');
  const currentBranch = pinnedHistory
    ? pinnedHistory.currentBranch
    : await text(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], signal).catch(
        (error: Error & { cause?: { code?: number } }) => {
          if (error.cause?.code === 1) return undefined;
          throw error;
        },
      );
  const branches =
    pinnedHistory?.branches ??
    (
      await git(
        root,
        ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'],
        signal,
      )
    )
      .toString('utf8')
      .split('\n')
      .filter(Boolean);
  const pagination = request.listingId ? cache.listings.get(request.listingId) : undefined;
  if (
    request.listingId &&
    (!pagination ||
      pagination.repositoryId !== request.repositoryId ||
      request.type !== 'history' ||
      !pinnedHistory ||
      !request.offset ||
      request.offset < 1)
  )
    throw new Error('Pinned file listing is unavailable. Refresh the history.');
  const listingId = request.listingId ?? randomUUID();
  const captures = pagination?.captures ?? new Map<string, FileCapture>();
  const files: GitFile[] = [...captures.values()].map(({ file }) => file);
  const snapshots: GitSnapshot[] = [];
  let description: string;
  let descriptionUI: GitListing['descriptionUI'];
  let history: GitHistory | undefined;
  let historyRefs: HistoryRef[] | undefined;
  let historyId: string | undefined;
  function addEntries(
    entries: Entry[],
    view: GitSourceView,
    working = false,
    conflicts = new Set<string>(),
  ) {
    for (const entry of entries) {
      const conflict = conflicts.has(entry.newPath) || entry.status === 'U';
      const file: GitFile = {
        id: hash(
          JSON.stringify([
            request.repositoryId,
            view,
            entry,
            view.type === 'changes' ? listingId : '',
          ]),
        ),
        status: entry.status,
        source: {
          repositoryId: request.repositoryId,
          view,
          ...(entry.oldMode !== '000000' ? { old: { path: entry.oldPath } } : {}),
          ...(entry.newMode !== '000000' ? { new: { path: entry.newPath } } : {}),
        },
      };
      files.push(file);
      captures.set(file.id, { file, entry, root, working, conflict });
    }
  }
  if (request.type === 'changes') {
    const headCommit = await headOID(root, signal);
    const stages = (await git(root, ['ls-files', '--unmerged', '-z'], signal))
      .toString('utf8')
      .split('\0')
      .filter(Boolean);
    const conflicts = new Set(stages.map((line) => line.slice(line.indexOf('\t') + 1)));
    const staged = parseRaw(
      (await git(root, [...rawArgs, '--cached', '--'], signal)).toString('utf8'),
    ).filter((e) => !conflicts.has(e.newPath));
    addEntries(staged, {
      type: 'changes',
      area: 'staged',
      ...(headCommit ? { headCommit } : {}),
    });
    const unstaged = parseRaw((await git(root, [...rawArgs, '--'], signal)).toString('utf8'));
    const unique = [...new Map(unstaged.map((e) => [e.newPath, e])).values()];
    addEntries(
      unique,
      { type: 'changes', area: 'unstaged', ...(headCommit ? { headCommit } : {}) },
      true,
      conflicts,
    );
    const untracked = (
      await git(root, ['ls-files', '--others', '--exclude-standard', '-z'], signal)
    )
      .toString('utf8')
      .split('\0')
      .filter(Boolean);
    for (const file of untracked) {
      const entry = {
        oldMode: '000000',
        newMode: '100644',
        oldOID: '',
        newOID: '',
        status: '?',
        oldPath: file,
        newPath: file,
      };
      addEntries(
        [entry],
        { type: 'changes', area: 'untracked', ...(headCommit ? { headCommit } : {}) },
        true,
      );
    }
    description = '手动刷新文件列表；打开文件时捕获内容，已保存的批注保留原始快照。';
    descriptionUI = {
      key: 'Manual refresh lists files; opening a file captures its content. Annotations retain original snapshots.',
    };
  } else if (request.type === 'history') {
    const tip = pinnedHistory
      ? pinnedHistory.tip
      : request.tip
        ? await commitOID(root, request.tip, signal)
        : request.branch
          ? await commitOID(root, request.branch, signal)
          : await headOID(root, signal);
    const offset = request.offset ?? 0;
    if (!Number.isInteger(offset) || offset < 0) throw new Error('Invalid history offset.');
    const commits: GitHistory['commits'] = [];
    const catalog = pinnedHistory ?? (await commitDecorations(root, signal));
    const { decorations, refs } = catalog;
    historyId = request.historyId ?? randomUUID();
    if (!pinnedHistory) {
      cache.histories.set(historyId, {
        repositoryId: request.repositoryId,
        branch: request.branch ?? 'HEAD',
        tip,
        currentBranch,
        branches,
        decorations,
        refs,
      });
      trimCache(cache.histories, 8);
      historyRefs = refs;
    }
    if (tip && (!pinnedHistory || (request.offset !== undefined && request.offset > 0))) {
      const log = (
        await git(
          root,
          [
            'log',
            '--date-order',
            '--format=%H%x00%P%x00%s%x00%an%x00%aI%x00',
            '--max-count=51',
            `--skip=${offset}`,
            tip,
            '--',
          ],
          signal,
        )
      ).toString('utf8');
      const fields = log.split('\0');
      for (let i = 0; i + 4 < fields.length; i += 5)
        commits.push({
          oid: fields[i].trim(),
          parents: fields[i + 1].split(' ').filter(Boolean),
          subject: fields[i + 2],
          author: fields[i + 3],
          date: fields[i + 4],
          refs: decorations.get(fields[i].trim()) ?? [],
        });
    }
    history = {
      ...(tip ? { tip } : {}),
      commits: commits.slice(0, 50),
      hasMore: commits.length > 50,
    };
    const selectedRef = request.commit ?? tip;
    if (selectedRef && !pagination) {
      const commit = await commitOID(root, selectedRef, signal);
      const detail = (
        await git(
          root,
          ['show', '--no-patch', '--format=%H%x00%P%x00%s%x00%an%x00%aI%x00%B%x00', commit, '--'],
          signal,
        )
      )
        .toString('utf8')
        .split('\0');
      history.selectedCommit = {
        oid: detail[0].trim(),
        parents: detail[1].split(' ').filter(Boolean),
        subject: detail[2],
        author: detail[3],
        date: detail[4],
        message: detail[5],
        refs: decorations.get(commit) ?? [],
      };
      const parents = (await text(root, ['rev-list', '--parents', '-n', '1', commit, '--'], signal))
        .split(' ')
        .slice(1);
      const parent = parents[0] ?? null;
      // diff-tree --root has the repository's native empty-tree semantics, including SHA-256 repos.
      const args = parent
        ? [...rawArgs, parent, commit, '--']
        : [
            'diff-tree',
            '--root',
            '--no-commit-id',
            '-r',
            '--raw',
            '-z',
            '--no-abbrev',
            '--find-renames',
            '--no-ext-diff',
            '--no-textconv',
            commit,
            '--',
          ];
      addEntries(parseRaw((await git(root, args, signal)).toString('utf8')), {
        type: 'history',
        commit,
        parent,
      });
      description = parent
        ? `提交 ${commit}；相对第一父 ${parent}${parents.length > 1 ? '（合并提交，只展示第一父差异）' : ''}`
        : `根提交 ${commit}；相对空树`;
      descriptionUI = parent
        ? {
            key: 'Commit {commit}; relative to first parent {parent}{merge}',
            params: {
              commit,
              parent,
              merge: parents.length > 1 ? ' (merge commit; showing first-parent diff only)' : '',
            },
          }
        : { key: 'Root commit {commit}; relative to empty tree', params: { commit } };
    } else {
      description = tip ? `固定历史 tip ${tip}` : '空仓库：没有提交历史';
      descriptionUI = tip
        ? { key: 'Pinned history tip {tip}', params: { tip } }
        : { key: 'Empty repository: no commit history' };
    }
  } else {
    if (!request.base) throw new Error('Comparison base is required.');
    const baseCommit = await commitOID(root, request.base, signal),
      headCommit = await commitOID(root, request.head ?? 'HEAD', signal),
      mode = request.mode ?? 'branch';
    let old = baseCommit,
      mergeBaseCommit: string | undefined;
    if (mode === 'branch') {
      const bases = (
        await text(root, ['merge-base', '--all', baseCommit, headCommit], signal).catch(
          (error: Error & { cause?: { code?: number } }) => {
            if (error.cause?.code === 1) return '';
            throw error;
          },
        )
      )
        .split('\n')
        .filter(Boolean);
      if (bases.length !== 1)
        throw new Error(
          bases.length
            ? 'Multiple merge bases. Choose direct endpoint comparison.'
            : 'No common ancestor; branch comparison cannot be performed.',
        );
      mergeBaseCommit = bases[0];
      old = mergeBaseCommit;
    }
    addEntries(
      parseRaw((await git(root, [...rawArgs, old, headCommit, '--'], signal)).toString('utf8')),
      {
        type: 'compare',
        mode,
        baseCommit,
        headCommit,
        ...(mergeBaseCommit ? { mergeBaseCommit } : {}),
      },
    );
    description = `${mode === 'branch' ? '三点比较，共同祖先' : '端点比较'} ${old} → ${headCommit}`;
    descriptionUI = {
      key:
        mode === 'branch'
          ? 'Three-dot comparison, merge base {old} → {head}'
          : 'Endpoint comparison {old} → {head}',
      params: { old, head: headCommit },
    };
  }
  if (!pagination) {
    cache.listings.set(listingId, { repositoryId: request.repositoryId, captures });
    trimCache(cache.listings, 32);
  }
  if (request.file && !pagination) {
    const file = files.find(
      (item) =>
        (item.source.old?.path === request.file || item.source.new?.path === request.file) &&
        (!request.area ||
          (item.source.view.type === 'changes' && item.source.view.area === request.area)),
    );
    if (!file) throw new Error(`Initial file is not present in this view: ${request.file}`);
    snapshots.push(await readGitFile(params, sessionId, listingId, file.id, signal));
  }
  return {
    listingId,
    files,
    snapshots,
    branches: pinnedHistory ? [] : branches,
    currentBranch,
    description,
    descriptionUI,
    ...(history ? { history, historyId, ...(historyRefs ? { historyRefs } : {}) } : {}),
  };
}
/** Capture exactly the selected entry. Directory queries never read blobs or build diff models. */
export async function readGitFile(
  paramsValue: GitReviewParams,
  sessionId: string,
  listingId: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<GitSnapshot> {
  const cache = session(sessionId, gitReviewParamsSchema.parse(paramsValue));
  const item = cache.listings.get(listingId)?.captures.get(fileId);
  if (!item) throw new Error('File listing has expired. Refresh the view.');
  const { file, entry, root, working, conflict } = item;
  const old = conflict ? undefined : await objectContent(root, entry.oldOID, entry.oldMode, signal);
  let next = working
    ? await workingContent(root, entry.newPath)
    : await objectContent(root, entry.newOID, entry.newMode, signal);
  if (conflict && next) next = { ...next, mode: 'conflict' };
  const snapshot = capture(
    file.source.repositoryId,
    file.source.view,
    entry,
    old,
    next,
    conflict
      ? [
          'Unmerged conflict: working file shown; index stages are not combined into a staged result.',
        ]
      : [],
  );
  snapshot.fileId = fileId;
  cache.snapshots.set(snapshot.id, snapshot);
  return snapshot;
}
export function validateGitFeedback(
  paramsValue: GitReviewParams,
  sessionId: string,
  value: unknown,
): GitReviewSubmitted {
  const params = gitReviewParamsSchema.parse(paramsValue),
    cache = session(sessionId, params),
    feedback = gitFeedbackSchema.parse(value);
  const sources: Record<string, GitReviewSource> = {};
  const annotations = feedback.annotations.map((entry) => {
    const normalized = entry.targets.map((target) => {
      const snapshot = cache.snapshots.get(target.ref.sourceId);
      if (!snapshot)
        throw new Error(
          'Original snapshot is missing. Draft retained; it cannot be reassigned to current files.',
        );
      diffTargetText(snapshot.model, target);
      sources[snapshot.id] = snapshot.source;
      return normalizeDiffTarget(snapshot.model, target);
    });
    // A line-button target and a whole-side text registration can normalize to
    // the same exact target; keep its content once rather than rejecting valid gestures.
    return {
      ...entry,
      targets: [...new Map(normalized.map((target) => [JSON.stringify(target), target])).values()],
    };
  });
  const result = gitReviewSubmittedSchema.parse({ ...feedback, annotations, sources });
  if (JSON.stringify(result).length > 65536)
    throw new Error(
      'Feedback exceeds the 65536-character event limit. Draft retained; reduce selected content or annotations.',
    );
  return result;
}
