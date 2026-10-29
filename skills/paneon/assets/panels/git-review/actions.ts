import { serverAction, z } from '@qoggy/paneon/sdk';
import { readGit, readGitFile, readGitBranches, readGitRevisions } from './git.ts';
import { validateGitFeedback } from './feedback.ts';
import { checkoutGit } from './checkout.ts';
import {
  directoryErrorMessage,
  listDirectories,
  repositoryCatalog,
  resolveRepository,
} from './repositories.ts';
import {
  gitFileSchema,
  gitCheckoutInputSchema,
  gitRequestSchema,
  gitConfigurationSchema,
  gitFeedbackResultSchema,
  absoluteDirectory,
} from './schema.ts';

export const queryRepositoryCatalog = serverAction({
  kind: 'query',
  input: gitConfigurationSchema,
  handler: (ctx, input) => repositoryCatalog(input, ctx.signal),
});
export const queryRepositoryDirectory = serverAction({
  kind: 'query',
  input: z.object({ path: absoluteDirectory }).strict(),
  handler: async (ctx, input) => {
    try {
      return { ok: true as const, data: await resolveRepository(input.path, ctx.signal) };
    } catch (error) {
      console.error('Repository lookup failed:', input.path, error);
      return {
        ok: false as const,
        message: directoryErrorMessage(error, 'repository'),
      };
    }
  },
});
export const queryDirectories = serverAction({
  kind: 'query',
  input: z.object({ path: absoluteDirectory }).strict(),
  handler: async (_ctx, input) => {
    try {
      return { ok: true as const, data: await listDirectories(input.path) };
    } catch (error) {
      console.error('Directory listing failed:', input.path, error);
      return {
        ok: false as const,
        message: directoryErrorMessage(error, 'directory'),
      };
    }
  },
});
export const checkoutGitRef = serverAction({
  kind: 'mutation',
  input: gitCheckoutInputSchema,
  handler: (ctx, input) => checkoutGit(input, ctx.signal),
});
export const queryGit = serverAction({
  kind: 'query',
  input: z.object({ params: gitConfigurationSchema, request: gitRequestSchema }).strict(),
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
  input: z.object({ params: gitConfigurationSchema, file: gitFileSchema }).strict(),
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
  input: z.object({ params: gitConfigurationSchema, feedback: gitFeedbackResultSchema }).strict(),
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
  input: z.object({ params: gitConfigurationSchema, repositoryId: z.string() }).strict(),
  handler: (ctx, input) => readGitRevisions(input.params, input.repositoryId, ctx.signal),
});
