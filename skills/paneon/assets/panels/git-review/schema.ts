import { feedbackSchema, z } from 'paneon/sdk';
import { gitRefSchema } from '../../shared/diff-schema.ts';
export type { GitRef } from '../../shared/diff-schema.ts';
const nonempty = z.string().refine((s) => s.trim().length > 0, 'Must not be blank.');
export const relativeFile = z
  .string()
  .min(1)
  .refine(
    (s) => !s.startsWith('/') && !s.split('/').includes('..') && !s.includes('\0'),
    'File must be repository-relative.',
  );
const initialView = z.discriminatedUnion('type', [
  z
    .object({ repositoryId: nonempty, type: z.literal('changes'), file: relativeFile.optional() })
    .strict(),
  z
    .object({
      repositoryId: nonempty,
      type: z.literal('history'),
      branch: nonempty.optional(),
      commit: nonempty.optional(),
      file: relativeFile.optional(),
    })
    .strict()
    .refine((v) => !v.file || !!v.commit, 'History file requires commit.'),
  z
    .object({
      repositoryId: nonempty,
      type: z.literal('compare'),
      base: nonempty,
      head: nonempty.optional(),
      mode: z.enum(['branch', 'commits']).optional(),
      file: relativeFile.optional(),
    })
    .strict(),
]);
export const gitReviewParamsSchema = z
  .object({
    title: nonempty.optional(),
    repositories: z
      .array(z.object({ id: nonempty, path: nonempty, label: nonempty.optional() }).strict())
      .min(1),
    initialView: initialView.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.repositories.map((r) => r.id)).size !== v.repositories.length)
      ctx.addIssue({
        code: 'custom',
        path: ['repositories'],
        message: 'Repository IDs must be unique.',
      });
    if (v.initialView && !v.repositories.some((r) => r.id === v.initialView?.repositoryId))
      ctx.addIssue({
        code: 'custom',
        path: ['initialView', 'repositoryId'],
        message: 'Unknown repository.',
      });
  });
export type GitReviewParams = z.infer<typeof gitReviewParamsSchema>;
export const gitSourceViewSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('changes'),
      area: z.enum(['staged', 'unstaged', 'untracked']),
      headCommit: z.string().optional(),
    })
    .strict(),
  z
    .object({ type: z.literal('history'), commit: z.string(), parent: z.string().nullable() })
    .strict(),
  z
    .object({
      type: z.literal('compare'),
      mode: z.enum(['branch', 'commits']),
      baseCommit: z.string(),
      headCommit: z.string(),
      mergeBaseCommit: z.string().optional(),
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
export const gitReviewSourceSchema = z
  .object({
    repositoryId: nonempty,
    view: gitSourceViewSchema,
    old: side.optional(),
    new: side.optional(),
  })
  .strict()
  .refine((v) => v.old || v.new, 'Source requires at least one side.');
export type GitReviewSource = z.infer<typeof gitReviewSourceSchema>;
export type GitSourceView = z.infer<typeof gitSourceViewSchema>;
export const gitFeedbackSchema = feedbackSchema(gitRefSchema);
export const gitReviewSubmittedSchema = gitFeedbackSchema.safeExtend({
  sources: z.record(z.string(), gitReviewSourceSchema),
  replacesEventId: z.number().int().positive().optional(),
});
export type GitReviewSubmitted = z.infer<typeof gitReviewSubmittedSchema>;
