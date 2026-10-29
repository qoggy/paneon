import { annotationValueSchema, z } from '@qoggy/paneon/sdk';
import { gitRefSchema } from '../../shared/diff-schema.ts';
export type { GitRef } from '../../shared/diff-schema.ts';
const nonempty = z.string().refine((s) => s.trim().length > 0, 'Must not be blank.');
export const absoluteDirectory = nonempty.refine(
  (path) =>
    !path.includes('\0') &&
    (/^\//.test(path) || /^[a-zA-Z]:[\\/]/.test(path) || /^\\\\[^\\]+\\[^\\]+/.test(path)),
  'Enter an absolute directory path.',
);
export const gitRepositorySchema = z.object({ id: nonempty, path: absoluteDirectory }).strict();
export type GitRepository = z.infer<typeof gitRepositorySchema>;
export const relativeFile = z
  .string()
  .min(1)
  .refine(
    (s) => !s.startsWith('/') && !s.split('/').includes('..') && !s.includes('\0'),
    'File must be repository-relative.',
  );
const initialView = z.discriminatedUnion('type', [
  z
    .object({
      repositoryPath: absoluteDirectory,
      type: z.literal('changes'),
      file: relativeFile.optional(),
    })
    .strict(),
  z
    .object({
      repositoryPath: absoluteDirectory,
      type: z.literal('history'),
      branch: nonempty.optional(),
      commit: nonempty.optional(),
      file: relativeFile.optional(),
    })
    .strict()
    .refine((v) => !v.file || !!v.commit, 'History file requires commit.'),
  z
    .object({
      repositoryPath: absoluteDirectory,
      type: z.literal('compare'),
      base: nonempty.nullable(),
      head: nonempty.optional(),
      mode: z.enum(['branch', 'commits']).optional(),
      file: relativeFile.optional(),
    })
    .strict(),
]);
export const gitReviewParamsSchema = z
  .object({
    repositories: z.array(absoluteDirectory).min(1),
    initialView: initialView.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.repositories).size !== v.repositories.length)
      ctx.addIssue({
        code: 'custom',
        path: ['repositories'],
        message: 'Repository paths must be unique.',
      });
    if (v.initialView && !v.repositories.includes(v.initialView.repositoryPath))
      ctx.addIssue({
        code: 'custom',
        path: ['initialView', 'repositoryPath'],
        message: 'Unknown repository.',
      });
  });
export type GitReviewParams = z.infer<typeof gitReviewParamsSchema>;

/** Internal configuration keeps session identities separate from public path-only input. */
export const gitConfigurationSchema = z
  .object({ repositories: z.array(gitRepositorySchema).min(1) })
  .strict()
  .refine(
    (v) => new Set(v.repositories.map((r) => r.id)).size === v.repositories.length,
    'Repository IDs must be unique.',
  );
export type GitConfiguration = z.infer<typeof gitConfigurationSchema>;
const oid = z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/);
export const gitCheckoutTargetSchema = z
  .object({ kind: z.enum(['branch', 'remote', 'tag']), ref: nonempty, commit: oid })
  .strict()
  .refine(
    ({ kind, ref }) =>
      ref.startsWith({ branch: 'refs/heads/', remote: 'refs/remotes/', tag: 'refs/tags/' }[kind]) &&
      !/[\0\r\n]/.test(ref),
    'Checkout requires a full reference matching its kind.',
  );
export const gitHeadStateSchema = z.object({ branch: nonempty.nullable(), commit: oid }).strict();
export const gitCheckoutInputSchema = z
  .object({
    params: gitConfigurationSchema,
    repositoryId: nonempty,
    target: gitCheckoutTargetSchema,
    expectedHead: gitHeadStateSchema,
  })
  .strict();
export const gitCheckoutCompletedSchema = z
  .object({
    operationId: z.string().uuid(),
    repositoryPath: nonempty,
    target: gitCheckoutTargetSchema,
    before: gitHeadStateSchema,
    after: gitHeadStateSchema,
  })
  .strict();
export type GitCheckoutInput = z.infer<typeof gitCheckoutInputSchema>;
export const gitSourceViewSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('changes'),
      area: z.enum(['staged', 'unstaged', 'untracked']),
      headCommit: oid.optional(),
    })
    .strict(),
  z.object({ type: z.literal('history'), commit: oid, parent: oid.nullable() }).strict(),
  z
    .object({
      type: z.literal('compare'),
      mode: z.enum(['branch', 'commits']),
      baseCommit: oid.nullable(),
      headCommit: oid,
      mergeBaseCommit: oid.optional(),
    })
    .strict(),
]);
const side = z
  .object({
    path: relativeFile,
    contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    type: z.enum(['text', 'binary']),
  })
  .strict();
const lineEvidence = z
  .object({
    kind: z.literal('lines'),
    side: z.enum(['old', 'new']),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    text: z.string(),
  })
  .strict();
const hunkEvidence = z
  .object({
    kind: z.literal('hunk'),
    oldStart: z.number().int().nonnegative(),
    oldLines: z.number().int().nonnegative(),
    newStart: z.number().int().nonnegative(),
    newLines: z.number().int().nonnegative(),
    patch: z.string(),
    oldText: z.string(),
    newText: z.string(),
  })
  .strict();
export const gitReviewSourceSchema = z
  .object({
    repositoryPath: absoluteDirectory,
    view: gitSourceViewSchema,
    old: side.optional(),
    new: side.optional(),
    evidence: z.array(z.discriminatedUnion('kind', [lineEvidence, hunkEvidence])),
  })
  .strict()
  .refine((v) => v.old || v.new, 'Source requires at least one side.');
export type GitReviewSource = z.infer<typeof gitReviewSourceSchema>;
export const gitSnapshotSourceSchema = gitReviewSourceSchema.safeExtend({ repositoryId: nonempty });
export type GitSnapshotSource = z.infer<typeof gitSnapshotSourceSchema>;
export type GitSourceView = z.infer<typeof gitSourceViewSchema>;
export const gitFeedbackSchema = annotationValueSchema(gitRefSchema);
/** Internal drafts and validation retain the original targets and preserved evidence. */
export const gitFeedbackResultSchema = gitFeedbackSchema.safeExtend({
  sources: z.record(z.string(), gitSnapshotSourceSchema),
  replacesEventId: z.number().int().positive().optional(),
});
export type GitFeedbackResult = z.infer<typeof gitFeedbackResultSchema>;
export const gitReviewSubmittedSchema = gitFeedbackSchema.safeExtend({
  sources: z.record(z.string(), gitSnapshotSourceSchema),
  replacesEventId: z.number().int().positive().optional(),
});
export type GitReviewSubmitted = z.infer<typeof gitReviewSubmittedSchema>;

const entrySchema = z
  .object({
    oldMode: z.string().regex(/^\d{6}$/),
    newMode: z.string().regex(/^\d{6}$/),
    oldOID: z.union([oid, z.literal('')]),
    newOID: z.union([oid, z.literal('')]),
    status: z.string().regex(/^(?:[A-Z][0-9]*|\?)$/),
    oldPath: relativeFile,
    newPath: relativeFile,
  })
  .strict();
export const gitFileSchema = z
  .object({
    id: nonempty,
    status: z.string(),
    read: z.object({ entry: entrySchema, working: z.boolean(), conflict: z.boolean() }).strict(),
    source: z
      .object({
        repositoryId: nonempty,
        view: gitSourceViewSchema,
        old: z.object({ path: relativeFile }).strict().optional(),
        new: z.object({ path: relativeFile }).strict().optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((file, ctx) => {
    const { entry, working, conflict } = file.read;
    if (
      file.status !== entry.status ||
      file.source.old?.path !== (entry.oldMode === '000000' ? undefined : entry.oldPath) ||
      file.source.new?.path !== (entry.newMode === '000000' ? undefined : entry.newPath) ||
      working !== (file.source.view.type === 'changes' && file.source.view.area !== 'staged') ||
      (conflict &&
        (!working || file.source.view.type !== 'changes' || file.source.view.area !== 'unstaged'))
    )
      ctx.addIssue({ code: 'custom', message: 'File descriptor does not match its source.' });
  });
export const gitHistoryContextSchema = z
  .object({ repositoryId: nonempty, tip: oid.optional(), branch: nonempty })
  .strict();
export const gitRequestSchema = z
  .object({
    repositoryId: nonempty,
    type: z.enum(['changes', 'history', 'compare']),
    commit: z.string().optional(),
    parent: oid.nullable().optional(),
    branch: z.string().optional(),
    base: z.string().nullable().optional(),
    head: z.string().optional(),
    mode: z.enum(['branch', 'commits']).optional(),
    tip: oid.optional(),
    offset: z.number().int().nonnegative().optional(),
    file: relativeFile.optional(),
    area: z.enum(['staged', 'unstaged', 'untracked']).optional(),
    historyContext: gitHistoryContextSchema.optional(),
    pageOnly: z.boolean().optional(),
  })
  .strict()
  .superRefine((request, ctx) => {
    if (
      request.type === 'history' &&
      (request.offset ?? 0) > 0 &&
      !request.tip &&
      !request.historyContext
    )
      ctx.addIssue({
        code: 'custom',
        message: 'History pagination requires a fixed tip or context.',
      });
    if (request.pageOnly && request.type !== 'history')
      ctx.addIssue({ code: 'custom', message: 'Page-only reads require history.' });
  });
