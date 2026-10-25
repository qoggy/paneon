import { annotationValueSchema, z } from '@qoggy/paneon/sdk';
import { gitRefSchema } from '../../shared/diff-schema.ts';
export const repositorySchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/, 'Expected owner/repository.');
export const oidSchema = z.string().regex(/^[a-f0-9]{40}$/);
export const githubPRParamsSchema = z
  .object({
    repository: repositorySchema,
    initialPullRequest: z.number().int().positive().optional(),
  })
  .strict();
export type GitHubPRParams = z.infer<typeof githubPRParamsSchema>;
export const prRefSchema = z.union([
  z
    .object({ sourceId: z.string().min(1), kind: z.enum(['pull-request', 'description', 'check']) })
    .strict(),
  gitRefSchema,
]);
export type PRRef = z.infer<typeof prRefSchema>;
const contentSide = z
  .object({
    path: z.string().min(1),
    contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    type: z.enum(['text', 'binary']),
  })
  .strict();
const common = {
  number: z.number().int().positive(),
  baseCommit: oidSchema,
  headCommit: oidSchema,
};
export const prSourceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...common,
      kind: z.literal('pull-request'),
      title: z.string(),
      updatedAt: z.string(),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal('description'),
      contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal('check'),
      key: z.string().min(1),
      name: z.string(),
      status: z.string(),
      conclusion: z.string().nullable(),
      detailsUrl: z.string().optional(),
      observedAt: z.string(),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal('diff'),
      mergeBaseCommit: oidSchema,
      old: contentSide.optional(),
      new: contentSide.optional(),
    })
    .strict()
    .refine((s) => s.old || s.new, 'Diff needs at least one side.'),
]);
export type PRSource = z.infer<typeof prSourceSchema>;
export const prFeedbackSchema = annotationValueSchema(prRefSchema);
export const prFeedbackSubmittedSchema = prFeedbackSchema.safeExtend({
  repository: repositorySchema,
  sources: z.record(z.string(), prSourceSchema),
});
export type PRFeedbackSubmitted = z.infer<typeof prFeedbackSubmittedSchema>;
export const prReviewRequestedSchema = z
  .object({ repository: repositorySchema, ...common })
  .strict();
export type PRReviewRequested = z.infer<typeof prReviewRequestedSchema>;
