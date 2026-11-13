import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { serverAction, z } from '@qoggy/paneon/sdk';
import { readTextFile } from '../../shared/read-text-file.js';
import { discoverFiles, withinDirectory } from './directory.ts';
import {
  evidenceSchema,
  fileFeedbackSchema,
  fileReviewParamsSchema,
  validateSources,
} from './schema.ts';

export const snapshotId = (path: string, text: string) =>
  `sha256:${createHash('sha256')
    .update(JSON.stringify([path, text]))
    .digest('hex')}`;

export async function readManifestFile(cwd: string, files: string[], fileIndex: number) {
  const supplied = files[fileIndex];
  if (supplied === undefined) throw new Error('Unknown manifest file index.');
  const path = resolve(cwd, supplied);
  const text = await readTextFile(path);
  return { fileIndex, path, text, snapshotId: snapshotId(path, text) };
}

export const readFile = serverAction({
  kind: 'query',
  input: z
    .object({
      path: z.string(),
      fileIndex: z.number().int().nonnegative(),
    })
    .strict(),
  handler: async (_ctx, { path, fileIndex }) => {
    try {
      const resolved = resolve(process.cwd(), path);
      const text = await readTextFile(resolved);
      const snapshot = { fileIndex, path: resolved, text, snapshotId: snapshotId(resolved, text) };
      return { ok: true as const, snapshot };
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // Expected read failures are panel data; ordinary thrown errors are redacted by the runtime.
      if (error instanceof Error) {
        switch (code) {
          case 'FILE_NOT_FOUND':
          case 'FILE_ACCESS_DENIED':
          case 'FILE_NOT_REGULAR':
          case 'FILE_TOO_LARGE':
          case 'FILE_NOT_TEXT':
            return { ok: false as const, error: { code, message: error.message } };
        }
      }
      throw error;
    }
  },
});

export const resolvePaths = serverAction({
  kind: 'query',
  input: fileReviewParamsSchema,
  handler: async (_ctx, params) => ({
    ...(await discoverFiles(process.cwd(), params)),
    directories: (params.directories ?? []).map((path) => resolve(process.cwd(), path)),
  }),
});

export const validateFeedback = serverAction({
  input: z
    .object({
      params: fileReviewParamsSchema,
      feedback: fileFeedbackSchema,
      evidence: evidenceSchema,
    })
    .strict(),
  handler: (_ctx, { params, feedback, evidence }) => {
    for (const file of evidence.files) {
      const explicit = params.files ?? [];
      const supplied = explicit[file.fileIndex];
      const matches =
        file.fileIndex < explicit.length
          ? supplied !== undefined && resolve(process.cwd(), supplied) === file.path
          : params.directories?.some((root) =>
              withinDirectory(resolve(process.cwd(), root), file.path),
            );
      if (!matches) throw new Error('Unknown or inconsistent file snapshot.');
    }
    return validateSources(feedback, evidence);
  },
});
