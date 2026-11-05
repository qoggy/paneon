import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { serverAction, z } from '@qoggy/paneon/sdk';
import { readTextFile } from '../../shared/read-text-file.js';
import {
  evidenceSchema,
  fileFeedbackSchema,
  fileReviewParamsSchema,
  validateRanges,
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
      files: fileReviewParamsSchema.shape.files,
      fileIndex: z.number().int().nonnegative(),
    })
    .strict(),
  handler: async (_ctx, { files, fileIndex }) => {
    try {
      const snapshot = await readManifestFile(process.cwd(), files, fileIndex);
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
  input: fileReviewParamsSchema.shape.files,
  handler: (_ctx, files) => files.map((path) => resolve(process.cwd(), path)),
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
      const supplied = params.files[file.fileIndex];
      if (
        supplied === undefined ||
        resolve(process.cwd(), supplied) !== file.path ||
        snapshotId(file.path, file.text) !== file.snapshotId
      )
        throw new Error('Unknown or inconsistent file snapshot.');
    }
    return validateRanges(feedback, evidence, params.files);
  },
});
