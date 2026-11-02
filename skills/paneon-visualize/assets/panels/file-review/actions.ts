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
  handler: (_ctx, { files, fileIndex }) => readManifestFile(process.cwd(), files, fileIndex),
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
