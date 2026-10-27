import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PaneonError } from '../shared/types.js';
import { isFileReferenceRequest, markdownLink } from '../shared/file-references.js';
import type { FilePreview } from '../shared/file-references.js';

export const FILE_PREVIEW_MAX_BYTES = 1024 * 1024;

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
    const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile())
        throw new PaneonError(
          'FILE_NOT_REGULAR',
          'The reference does not point to a regular file.',
        );
      if (stat.size > FILE_PREVIEW_MAX_BYTES)
        throw new PaneonError('FILE_TOO_LARGE', 'File preview is limited to 1 MiB.');
      // Bound the read even if a file grows after stat(). Never return a truncated preview.
      const bytes = Buffer.alloc(FILE_PREVIEW_MAX_BYTES + 1);
      let length = 0;
      while (length < bytes.length) {
        const { bytesRead } = await file.read(bytes, length, bytes.length - length, null);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > FILE_PREVIEW_MAX_BYTES)
        throw new PaneonError('FILE_TOO_LARGE', 'File preview is limited to 1 MiB.');
      const content = bytes.subarray(0, length);
      let text: string;
      try {
        if (content.includes(0)) throw new Error('NUL byte');
        text = new TextDecoder('utf-8', { fatal: true }).decode(content);
      } catch {
        throw new PaneonError('FILE_NOT_TEXT', 'Only UTF-8 text files can be previewed.');
      }
      return { path, text };
    } finally {
      await file.close();
    }
  } catch (error) {
    if (error instanceof PaneonError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR')
      throw new PaneonError('FILE_NOT_FOUND', 'The referenced file does not exist.');
    if (code === 'EACCES' || code === 'EPERM')
      throw new PaneonError('FILE_ACCESS_DENIED', 'The referenced file could not be read.');
    throw error;
  }
}
