import { readTextFile, TEXT_FILE_MAX_BYTES } from './read-text-file.js';
import { dirname, resolve } from 'node:path';
import { PaneonError } from '../shared/types.js';
import { isFileReferenceRequest, markdownLink } from '../shared/file-references.js';
import type { FilePreview } from '../shared/file-references.js';

export const FILE_PREVIEW_MAX_BYTES = TEXT_FILE_MAX_BYTES;

export async function readFilePreview(cwd: string, input: unknown): Promise<FilePreview> {
  if (!isFileReferenceRequest(input))
    throw new PaneonError('INVALID_FILE_REFERENCE', 'A local file reference is required.');
  const target = markdownLink(input.href);
  if (target.kind !== 'file')
    throw new PaneonError('INVALID_FILE_REFERENCE', 'A local file reference is required.');
  const path = resolve(
    input.sourcePath ? dirname(resolve(cwd, input.sourcePath)) : cwd,
    target.path,
  );
  try {
    return { path, text: await readTextFile(path, { preserveBOM: false }) };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code?.startsWith('FILE_') && error instanceof Error)
      throw new PaneonError(code, error.message);
    throw error;
  }
}
