import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from '@qoggy/paneon/sdk';
import { createDiffModel } from '../../shared/diff-model.ts';
import type { DiffModel } from '../../shared/diff-model.ts';
import { normalizeDiffTarget } from '../../shared/diff-schema.ts';
import { resolvePRTarget } from './model.ts';
import {
  oidSchema,
  repositorySchema,
  prFeedbackSchema,
  prFeedbackSubmittedSchema,
  prReviewRequestedSchema,
  prSourceSchema,
} from './schema.ts';
import type { PRFeedbackSubmitted, PRSource } from './schema.ts';

const execute = promisify(execFile);
export type GhReader = (args: string[], signal?: AbortSignal) => Promise<unknown>;
export const runGh: GhReader = async (args, signal) => {
  try {
    const { stdout } = await execute('gh', args, {
      signal,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, GH_PROMPT_DISABLED: '1' },
    });
    return JSON.parse(stdout) as unknown;
  } catch (error) {
    const failure = error as Error & { stderr?: string };
    throw new Error(`gh read failed: ${failure.stderr?.trim() || failure.message}`, {
      cause: error,
    });
  }
};
const digest = (bytes: string | Uint8Array) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const pathSchema = z
  .string()
  .min(1)
  .refine(
    (p) =>
      !p.startsWith('/') && !p.split('/').some((s) => s === '..' || s === '') && !p.includes('\0'),
    'Invalid repository-relative path.',
  );
const user = z.object({ login: z.string() }).nullable();
const listItemSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  state: z.string(),
  headRefName: z.string(),
  baseRefName: z.string(),
  isDraft: z.boolean(),
  updatedAt: z.string(),
  url: z.string(),
  author: user,
});
export type PRListItem = z.infer<typeof listItemSchema>;
export type PRList = { items: PRListItem[]; requested: number; hasMore: boolean };
const detailSchema = listItemSchema.extend({
  body: z.string(),
  baseRefOid: oidSchema,
  headRefOid: oidSchema,
  changedFiles: z.number().int().nonnegative(),
  mergeStateStatus: z.string(),
  mergeable: z.string(),
  reviewDecision: z.string(),
  headRepository: z.object({ name: z.string() }).nullable(),
  headRepositoryOwner: user,
});
export type PRDetail = z.infer<typeof detailSchema> & {
  id: string;
  overviewSourceId: string;
  descriptionSourceId: string;
};
export const prDetailInputSchema = detailSchema.extend({
  id: z.string().min(1),
  overviewSourceId: z.string().min(1),
  descriptionSourceId: z.string().min(1),
});
const fileSchema = z.object({
  filename: pathSchema,
  previous_filename: pathSchema.optional(),
  status: z.enum(['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged']),
  sha: oidSchema,
  patch: z.string().optional(),
});
export type PRFile = Omit<z.infer<typeof fileSchema>, 'patch'> & { patchAvailable: boolean };
export type PRComparison = {
  id: string;
  detailId: string;
  number: number;
  baseCommit: string;
  headCommit: string;
  mergeBaseCommit: string;
  files: PRFile[];
  reportedFiles: number;
  complete: boolean;
  notes: string[];
  url: string;
};
export type PRChecks = { detailId: string; sourceIds: string[]; observedAt: string };
const overviewIdentitySchema = z.object({
  state: z.string(),
  mergeable: z.string(),
  mergeStateStatus: z.string(),
  reviewDecision: z.string(),
  author: user,
  isDraft: z.boolean(),
  baseRefName: z.string(),
  headRefName: z.string(),
});
export type PRSnapshot = {
  id: string;
  source: PRSource;
  body?: string;
  model?: DiffModel;
  notes?: string[];
  notesUI?: { key: string; params?: Record<string, string> }[];
  detailId: string;
  identity?: z.infer<typeof overviewIdentitySchema>;
};

// Requests carry only the source evidence needed for this call. These schemas
// deliberately describe JSON data, not a live renderer or a backend session.
export const prComparisonInputSchema = z.object({
  id: z.string().min(1),
  detailId: z.string().min(1),
  number: z.number().int().positive(),
  baseCommit: oidSchema,
  headCommit: oidSchema,
  mergeBaseCommit: oidSchema,
  files: z.array(fileSchema.omit({ patch: true }).extend({ patchAvailable: z.boolean() })),
  reportedFiles: z.number().int().nonnegative(),
  complete: z.boolean(),
  notes: z.array(z.string()),
  url: z.string(),
});
export const prSnapshotInputSchema = z.object({
  id: z.string().min(1),
  source: prSourceSchema,
  detailId: z.string().min(1),
  body: z.string().optional(),
  identity: overviewIdentitySchema.optional(),
  model: z.object({ oldText: z.string().optional(), newText: z.string().optional() }).optional(),
});
export type PRSnapshotInput = z.infer<typeof prSnapshotInputSchema>;
type ReviewEvidence = {
  detail?: PRDetail;
  comparison?: PRComparison;
  snapshots?: PRSnapshotInput[];
};

/** Fixed-head check observations use GraphQL node IDs, not potentially duplicated names. */
export const checksQuery = `query PaneonPRChecks($owner:String!,$name:String!,$oid:GitObjectID!,$after:String) {
  repository(owner:$owner,name:$name) { object(oid:$oid) { ... on Commit {
    statusCheckRollup { contexts(first:100,after:$after) {
      nodes { __typename ... on CheckRun { id name status conclusion detailsUrl } ... on StatusContext { id context state targetUrl } }
      pageInfo { hasNextPage endCursor }
    } }
  } } }
}`;
const checkNodeSchema = z.discriminatedUnion('__typename', [
  z.object({
    __typename: z.literal('CheckRun'),
    id: z.string().min(1),
    name: z.string(),
    status: z.string(),
    conclusion: z.string().nullable(),
    detailsUrl: z.string().nullable(),
  }),
  z.object({
    __typename: z.literal('StatusContext'),
    id: z.string().min(1),
    context: z.string(),
    state: z.string(),
    targetUrl: z.string().nullable(),
  }),
]);
const checksResponseSchema = z.object({
  data: z.object({
    repository: z
      .object({
        object: z
          .object({
            statusCheckRollup: z
              .object({
                contexts: z.object({
                  nodes: z.array(checkNodeSchema),
                  pageInfo: z.object({
                    hasNextPage: z.boolean(),
                    endCursor: z.string().nullable(),
                  }),
                }),
              })
              .nullable(),
          })
          .nullable(),
      })
      .nullable(),
  }),
  errors: z.array(z.object({ message: z.string() })).optional(),
});
const treeEntrySchema = z.object({
  path: z.string(),
  mode: z.string(),
  type: z.enum(['tree', 'blob', 'commit']),
  sha: oidSchema,
});
type TreeEntry = z.infer<typeof treeEntrySchema>;
type Session = {
  repository: string;
  details: Map<string, PRDetail>;
  snapshots: Map<string, PRSnapshot>;
  comparisons: Map<string, PRComparison>;
};

export class GitHubReview {
  private sessions = new Map<string, Session>();
  private trees = new Map<string, TreeEntry[]>();
  private commits = new Map<string, string>();
  private readonly read: GhReader;
  constructor(read: GhReader = runGh) {
    this.read = read;
  }
  private session(repository: string, sessionId: string) {
    repositorySchema.parse(repository);
    if (!sessionId || sessionId.length > 100) throw new Error('Invalid page session.');
    const previous = this.sessions.get(sessionId);
    if (previous && previous.repository !== repository)
      throw new Error('Session repository mismatch.');
    if (previous) return previous;
    const created: Session = {
      repository,
      details: new Map(),
      snapshots: new Map(),
      comparisons: new Map(),
    };
    this.sessions.set(sessionId, created);
    return created;
  }
  withEvidence(repository: string, sessionId: string, evidence: ReviewEvidence) {
    const session = this.session(repository, sessionId);
    if (evidence.detail) {
      const detail = prDetailInputSchema.parse(evidence.detail);
      const { id, overviewSourceId, descriptionSourceId, ...raw } = detail;
      if (id !== digest(JSON.stringify({ repository, raw })))
        throw new Error('PR detail evidence does not match its identity.');
      session.details.set(id, { ...raw, id, overviewSourceId, descriptionSourceId });
    }
    if (evidence.comparison) {
      const comparison = prComparisonInputSchema.parse(evidence.comparison);
      const detail = session.details.get(comparison.detailId);
      if (
        !detail ||
        comparison.number !== detail.number ||
        comparison.baseCommit !== detail.baseRefOid ||
        comparison.headCommit !== detail.headRefOid
      )
        throw new Error('PR comparison does not match its preserved detail.');
      if (
        comparison.id !==
        digest(
          JSON.stringify({
            repository,
            detailId: comparison.detailId,
            mergeBase: comparison.mergeBaseCommit,
            files: comparison.files,
          }),
        )
      )
        throw new Error('PR comparison evidence does not match its identity.');
      session.comparisons.set(comparison.id, comparison);
    }
    for (const value of evidence.snapshots ?? []) {
      const snapshot = prSnapshotInputSchema.parse(value),
        source = snapshot.source;
      if (
        (source.kind === 'pull-request' && !snapshot.identity) ||
        snapshot.id !==
          digest(
            JSON.stringify({
              repository,
              source,
              ...(snapshot.identity ? { identity: snapshot.identity } : {}),
            }),
          )
      )
        throw new Error('PR source evidence does not match its identity.');
      if (
        source.kind === 'description' &&
        (snapshot.body === undefined || digest(snapshot.body) !== source.contentHash)
      )
        throw new Error('PR description evidence does not match its content hash.');
      if (source.kind === 'diff') {
        const binary = source.old?.type === 'binary' || source.new?.type === 'binary';
        if (!binary)
          for (const side of ['old', 'new'] as const) {
            const text = side === 'old' ? snapshot.model?.oldText : snapshot.model?.newText;
            if (source[side] && (text === undefined || digest(text) !== source[side].contentHash))
              throw new Error('PR diff evidence does not match its content hash.');
          }
        session.snapshots.set(snapshot.id, {
          ...snapshot,
          model: binary
            ? createDiffModel()
            : createDiffModel(snapshot.model?.oldText, snapshot.model?.newText),
        });
      } else
        session.snapshots.set(snapshot.id, {
          id: snapshot.id,
          detailId: snapshot.detailId,
          source,
          ...(snapshot.identity ? { identity: snapshot.identity } : {}),
          ...(snapshot.body === undefined ? {} : { body: snapshot.body }),
        });
    }
    return this;
  }
  private async api(repository: string, endpoint: string, signal?: AbortSignal) {
    repositorySchema.parse(repository);
    return this.read(
      [
        'api',
        '--method',
        'GET',
        '-H',
        'Accept: application/vnd.github+json',
        `repos/${repository}/${endpoint}`,
      ],
      signal,
    );
  }
  private put(
    session: Session,
    source: PRSource,
    detailId: string,
    extra: Pick<PRSnapshot, 'body' | 'model' | 'notes' | 'notesUI'> = {},
    identity?: unknown,
  ) {
    // Use the schema's field order both when issuing an ID and when parsing
    // browser evidence; JSON object insertion order is not an identity contract.
    source = prSourceSchema.parse(source);
    const provenance = identity === undefined ? undefined : overviewIdentitySchema.parse(identity);
    const id = digest(
      JSON.stringify({
        repository: session.repository,
        source,
        ...(provenance === undefined ? {} : { identity: provenance }),
      }),
    );
    const value: PRSnapshot = {
      id,
      source,
      detailId,
      ...extra,
      ...(provenance ? { identity: provenance } : {}),
    };
    if (!session.snapshots.has(id)) session.snapshots.set(id, value);
    return session.snapshots.get(id) as PRSnapshot;
  }
  async list(
    repository: string,
    options: { state?: 'open' | 'closed' | 'merged' | 'all'; search?: string; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<PRList> {
    repositorySchema.parse(repository);
    const limit = options.limit ?? 30;
    if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid PR list limit.');
    const args = [
      'pr',
      'list',
      '--repo',
      repository,
      '--state',
      options.state ?? 'open',
      '--limit',
      String(limit),
      '--json',
      'number,title,state,headRefName,baseRefName,isDraft,updatedAt,url,author',
    ];
    if (options.search) args.push('--search', options.search);
    const raw = z.array(listItemSchema).parse(await this.read(args, signal));
    return {
      items: [...new Map(raw.map((pr) => [pr.number, pr])).values()],
      requested: limit,
      hasMore: raw.length >= limit,
    };
  }
  async detail(
    repository: string,
    sessionId: string,
    number: number,
    signal?: AbortSignal,
  ): Promise<{ detail: PRDetail; snapshots: PRSnapshot[] }> {
    const session = this.session(repository, sessionId);
    z.number().int().positive().parse(number);
    const raw = detailSchema.parse(
      await this.read(
        [
          'pr',
          'view',
          String(number),
          '--repo',
          repository,
          '--json',
          'number,title,state,headRefName,baseRefName,isDraft,updatedAt,url,author,body,baseRefOid,headRefOid,changedFiles,mergeStateStatus,mergeable,reviewDecision,headRepository,headRepositoryOwner',
        ],
        signal,
      ),
    );
    if (raw.number !== number) throw new Error('GitHub returned another pull request.');
    const id = digest(JSON.stringify({ repository, raw })),
      common = { number, baseCommit: raw.baseRefOid, headCommit: raw.headRefOid };
    const overview = this.put(
      session,
      { ...common, kind: 'pull-request', title: raw.title, updatedAt: raw.updatedAt },
      id,
      {},
      {
        state: raw.state,
        mergeable: raw.mergeable,
        mergeStateStatus: raw.mergeStateStatus,
        reviewDecision: raw.reviewDecision,
        author: raw.author,
        isDraft: raw.isDraft,
        baseRefName: raw.baseRefName,
        headRefName: raw.headRefName,
      },
    );
    const description = this.put(
      session,
      { ...common, kind: 'description', contentHash: digest(raw.body) },
      id,
      { body: raw.body },
    );
    const detail: PRDetail = {
      ...raw,
      id,
      overviewSourceId: overview.id,
      descriptionSourceId: description.id,
    };
    session.details.set(id, detail);
    return { detail, snapshots: [overview, description] };
  }
  private detailFrom(session: Session, id: string) {
    const detail = session.details.get(id);
    if (!detail)
      throw new Error(
        'Preserved PR snapshot is missing. Refresh explicitly; existing feedback cannot be reassigned.',
      );
    return detail;
  }
  async checks(
    repository: string,
    sessionId: string,
    detailId: string,
    signal?: AbortSignal,
  ): Promise<{ checks: PRChecks; snapshots: PRSnapshot[] }> {
    const session = this.session(repository, sessionId),
      detail = this.detailFrom(session, detailId),
      [owner, name] = repository.split('/');
    const observedAt = new Date().toISOString(),
      snapshots = new Map<string, PRSnapshot>();
    let after: string | null = null;
    const seen = new Set<string>();
    do {
      const args = [
        'api',
        'graphql',
        '--raw-field',
        `query=${checksQuery}`,
        '--raw-field',
        `owner=${owner}`,
        '--raw-field',
        `name=${name}`,
        '--raw-field',
        `oid=${detail.headRefOid}`,
      ];
      if (after) args.push('--raw-field', `after=${after}`);
      const result = checksResponseSchema.parse(await this.read(args, signal));
      if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join('; '));
      const commit = result.data.repository?.object;
      if (!commit)
        throw new Error('The fixed PR head commit is unavailable for check observations.');
      const contexts = commit.statusCheckRollup?.contexts;
      if (!contexts) break;
      for (const check of contexts.nodes) {
        const isRun = check.__typename === 'CheckRun';
        const detailsUrl = isRun ? check.detailsUrl : check.targetUrl;
        const snapshot = this.put(
          session,
          {
            kind: 'check',
            number: detail.number,
            baseCommit: detail.baseRefOid,
            headCommit: detail.headRefOid,
            key: check.id,
            name: isRun ? check.name : check.context,
            status: isRun ? check.status : check.state,
            conclusion: isRun ? check.conclusion : check.state === 'PENDING' ? null : check.state,
            ...(detailsUrl ? { detailsUrl } : {}),
            observedAt,
          },
          detailId,
        );
        snapshots.set(check.id, snapshot);
      }
      after = contexts.pageInfo.hasNextPage ? contexts.pageInfo.endCursor : null;
      if (contexts.pageInfo.hasNextPage && (!after || seen.has(after)))
        throw new Error('Check pagination did not advance; observations are incomplete.');
      if (after) seen.add(after);
    } while (after);
    return {
      checks: { detailId, sourceIds: [...snapshots.values()].map((s) => s.id), observedAt },
      snapshots: [...snapshots.values()],
    };
  }
  async comparison(
    repository: string,
    sessionId: string,
    detailId: string,
    signal?: AbortSignal,
  ): Promise<PRComparison> {
    const session = this.session(repository, sessionId),
      detail = this.detailFrom(session, detailId);
    const parsed = z
      .object({
        base_commit: z.object({ sha: oidSchema }),
        merge_base_commit: z.object({ sha: oidSchema }),
        files: z.array(fileSchema),
      })
      .parse(
        await this.api(
          repository,
          `compare/${detail.baseRefOid}...${detail.headRefOid}?per_page=1&page=1`,
          signal,
        ),
      );
    if (parsed.base_commit.sha !== detail.baseRefOid)
      throw new Error('Comparison base does not match the preserved PR.');
    const files: PRFile[] = parsed.files.map(({ patch, ...entry }) => ({
      ...entry,
      patchAvailable: patch !== undefined,
    }));
    const complete = files.length < 300 && files.length === detail.changedFiles;
    const notes = [
      `GitHub compare API 最多返回 300 个文件；本次列出 ${parsed.files.length} 个，PR 详情报告 ${detail.changedFiles} 个。`,
    ];
    if (!complete)
      notes.push(
        '文件覆盖范围不完整或无法证明完整；请同时查看 GitHub 原始页面，不将省略内容视为无改动。',
      );
    const id = digest(
      JSON.stringify({ repository, detailId, mergeBase: parsed.merge_base_commit.sha, files }),
    );
    const comparison: PRComparison = {
      id,
      detailId,
      number: detail.number,
      baseCommit: detail.baseRefOid,
      headCommit: detail.headRefOid,
      mergeBaseCommit: parsed.merge_base_commit.sha,
      files,
      reportedFiles: detail.changedFiles,
      complete,
      notes,
      url: `${detail.url}/files`,
    };
    session.comparisons.set(id, comparison);
    return comparison;
  }
  private async tree(repository: string, treeOID: string, signal?: AbortSignal) {
    oidSchema.parse(treeOID);
    const key = `${repository}:${treeOID}`,
      cached = this.trees.get(key);
    if (cached) return cached;
    const result = z
      .object({ sha: oidSchema, truncated: z.boolean(), tree: z.array(treeEntrySchema) })
      .parse(await this.api(repository, `git/trees/${treeOID}`, signal));
    if (result.truncated || result.sha !== treeOID)
      throw new Error(
        'GitHub tree is truncated or mismatched. The file cannot be read completely.',
      );
    this.trees.set(key, result.tree);
    return result.tree;
  }
  private async entry(
    repository: string,
    commitOID: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<TreeEntry> {
    oidSchema.parse(commitOID);
    pathSchema.parse(path);
    const key = `${repository}:${commitOID}`;
    let treeOID = this.commits.get(key);
    if (!treeOID) {
      const commit = z
        .object({ sha: oidSchema, tree: z.object({ sha: oidSchema }) })
        .parse(await this.api(repository, `git/commits/${commitOID}`, signal));
      if (commit.sha !== commitOID) throw new Error('Fixed commit did not match.');
      treeOID = commit.tree.sha;
      this.commits.set(key, treeOID);
    }
    const parts = path.split('/');
    for (let i = 0; i < parts.length; i++) {
      const entries = await this.tree(repository, treeOID, signal),
        entry = entries.find((e) => e.path === parts[i]);
      if (!entry) throw new Error(`Path missing from fixed commit ${commitOID}: ${path}`);
      if (i === parts.length - 1) return entry;
      if (entry.type !== 'tree')
        throw new Error('Refusing to traverse a symbolic link or non-tree object.');
      treeOID = entry.sha;
    }
    throw new Error('Invalid file path.');
  }
  private async content(repository: string, entry: TreeEntry, signal?: AbortSignal) {
    if (entry.type === 'commit' && entry.mode === '160000')
      return { bytes: Buffer.from(entry.sha), mode: entry.mode };
    if (entry.type !== 'blob') throw new Error('Expected a blob or gitlink at the file path.');
    const blob = z
      .object({
        sha: oidSchema,
        size: z.number().int().nonnegative(),
        encoding: z.literal('base64'),
        content: z.string(),
      })
      .parse(await this.api(repository, `git/blobs/${entry.sha}`, signal));
    const bytes = Buffer.from(blob.content, 'base64');
    const actualOID = createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex');
    if (blob.sha !== entry.sha || actualOID !== entry.sha || bytes.length !== blob.size)
      throw new Error('Blob content is incomplete or does not match its fixed object ID.');
    return { bytes, mode: entry.mode };
  }
  async diff(
    repository: string,
    sessionId: string,
    comparisonId: string,
    filename: string,
    signal?: AbortSignal,
  ): Promise<PRSnapshot> {
    const session = this.session(repository, sessionId),
      comparison = session.comparisons.get(comparisonId);
    if (!comparison) throw new Error('Preserved comparison is missing.');
    const file = comparison.files.find((f) => f.filename === filename);
    if (!file) throw new Error('File is outside the comparison API coverage.');
    const oldPath = file.previous_filename ?? file.filename;
    if (file.status === 'renamed' && !file.previous_filename)
      throw new Error('Rename source path is missing.');
    const old =
      file.status === 'added'
        ? undefined
        : await this.content(
            repository,
            await this.entry(repository, comparison.mergeBaseCommit, oldPath, signal),
            signal,
          );
    const next =
      file.status === 'removed'
        ? undefined
        : await this.content(
            repository,
            await this.entry(repository, comparison.headCommit, file.filename, signal),
            signal,
          );
    const decode = (content: typeof old) => {
      if (!content || !['100644', '100755'].includes(content.mode) || content.bytes.includes(0))
        return undefined;
      try {
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content.bytes);
      } catch {
        return undefined;
      }
    };
    const oldText = decode(old),
      newText = decode(next),
      binary = (old && oldText === undefined) || (next && newText === undefined);
    const notes: string[] = [];
    if (!file.patchAvailable)
      notes.push('API 未提供 patch；此视图由固定版本的实际原文生成，不代表没有改动。');
    if (binary)
      notes.push(
        '二进制、无效 UTF-8、符号链接或 gitlink：仅支持文件级反馈；不跟随链接或递归子模块。',
      );
    if (old?.mode !== next?.mode)
      notes.push(`Mode: ${old?.mode ?? 'absent'} → ${next?.mode ?? 'absent'}`);
    const source: PRSource = {
      kind: 'diff',
      number: comparison.number,
      baseCommit: comparison.baseCommit,
      headCommit: comparison.headCommit,
      mergeBaseCommit: comparison.mergeBaseCommit,
      ...(old
        ? {
            old: {
              path: oldPath,
              contentHash: digest(old.bytes),
              type: oldText === undefined ? 'binary' : 'text',
            },
          }
        : {}),
      ...(next
        ? {
            new: {
              path: file.filename,
              contentHash: digest(next.bytes),
              type: newText === undefined ? 'binary' : 'text',
            },
          }
        : {}),
    };
    return this.put(session, source, comparison.detailId, {
      model: binary ? createDiffModel() : createDiffModel(oldText, newText),
      notes,
      notesUI: notes.map((key) =>
        key.startsWith('Mode: ')
          ? {
              key: 'Mode: {old} → {next}',
              params: { old: old?.mode ?? 'absent', next: next?.mode ?? 'absent' },
            }
          : { key },
      ),
    });
  }
  snapshot(repository: string, sessionId: string, sourceId: string) {
    return this.session(repository, sessionId).snapshots.get(sourceId);
  }
  feedback(repository: string, sessionId: string, value: unknown): PRFeedbackSubmitted {
    const session = this.session(repository, sessionId),
      feedback = prFeedbackSchema.parse(value),
      sources: Record<string, PRSource> = {};
    if (!feedback.annotations.length)
      throw new Error('Save at least one annotation before submitting.');
    const annotations = feedback.annotations.map((entry) => {
      const targets = entry.targets.map((target) => {
        const snapshot = session.snapshots.get(target.ref.sourceId);
        if (!snapshot)
          throw new Error(
            'Original PR snapshot is missing. The draft is retained and cannot be reassigned.',
          );
        resolvePRTarget(snapshot, target);
        sources[snapshot.id] = snapshot.source;
        if (
          snapshot.source.kind === 'diff' &&
          snapshot.model &&
          (target.ref.kind === 'file' || target.ref.kind === 'hunk' || target.ref.kind === 'lines')
        )
          return normalizeDiffTarget(snapshot.model, { ...target, ref: target.ref });
        return target;
      });
      return {
        ...entry,
        targets: [...new Map(targets.map((target) => [JSON.stringify(target), target])).values()],
      };
    });
    const result = prFeedbackSubmittedSchema.parse({
      repository,
      ...feedback,
      annotations,
      sources,
    });
    if (JSON.stringify(result).length > 65536)
      throw new Error('Annotations exceed the 65536-character event limit. Draft retained.');
    return result;
  }
  reviewRequest(repository: string, sessionId: string, detailId: string) {
    const detail = this.detailFrom(this.session(repository, sessionId), detailId);
    return prReviewRequestedSchema.parse({
      repository,
      number: detail.number,
      baseCommit: detail.baseRefOid,
      headCommit: detail.headRefOid,
    });
  }
}
export function reviewFromEvidence(
  repository: string,
  sessionId: string,
  evidence: ReviewEvidence = {},
) {
  return new GitHubReview().withEvidence(repository, sessionId, evidence);
}
