import { serverAction, z } from '@qoggy/paneon/sdk';
import { readGit, readGitFile, readGitBranches, readGitRevisions } from './git.ts';
import { validateGitFeedback } from './feedback.ts';
import { checkoutGit } from './checkout.ts';
import {
  gitFileSchema,
  gitCheckoutInputSchema,
  gitRequestSchema,
  gitReviewParamsSchema,
  gitReviewSubmittedSchema,
} from './schema.ts';
export const checkoutGitRef = serverAction({
  kind: 'mutation',
  input: gitCheckoutInputSchema,
  handler: (ctx, input) => checkoutGit(input, ctx.signal),
});
export const queryGit = serverAction({
  kind: 'query',
  input: z.object({ params: gitReviewParamsSchema, request: gitRequestSchema }).strict(),
  handler: async (ctx, input) => {
    try {
      return { ok: true as const, data: await readGit(input.params, input.request, ctx.signal) };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
export const queryGitFile = serverAction({
  kind: 'query',
  input: z.object({ params: gitReviewParamsSchema, file: gitFileSchema }).strict(),
  handler: async (ctx, input) => {
    try {
      return { ok: true as const, data: await readGitFile(input.params, input.file, ctx.signal) };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
export const queryGitBranches = serverAction({
  kind: 'query',
  input: z.object({ repositoryPath: z.string().min(1) }).strict(),
  handler: async (ctx, input) => readGitBranches(input.repositoryPath, ctx.signal),
});
export const checkFeedback = serverAction({
  kind: 'query',
  input: z.object({ params: gitReviewParamsSchema, feedback: gitReviewSubmittedSchema }).strict(),
  handler: (_ctx, input) => {
    try {
      return { ok: true as const, data: validateGitFeedback(input.params, input.feedback) };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export const queryGitRevisions = serverAction({
  kind: 'query',
  input: z.object({ params: gitReviewParamsSchema, repositoryId: z.string() }).strict(),
  handler: (ctx, input) => readGitRevisions(input.params, input.repositoryId, ctx.signal),
});
