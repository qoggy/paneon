import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
export const TEXT_FILE_MAX_BYTES = 1024 * 1024;
const failure = (code, message) => Object.assign(new Error(message), { code });
/** Also copied into the packaged Skill by build:cli, so standalone panels share this implementation. */
export async function readTextFile(path, { preserveBOM = true } = {}) {
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile())
        throw failure('FILE_NOT_REGULAR', 'The reference does not point to a regular file.');
      if (stat.size > TEXT_FILE_MAX_BYTES)
        throw failure('FILE_TOO_LARGE', 'File preview is limited to 1 MiB.');
      const bytes = Buffer.alloc(TEXT_FILE_MAX_BYTES + 1);
      let length = 0;
      while (length < bytes.length) {
        const { bytesRead } = await file.read(bytes, length, bytes.length - length, null);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > TEXT_FILE_MAX_BYTES)
        throw failure('FILE_TOO_LARGE', 'File preview is limited to 1 MiB.');
      const content = bytes.subarray(0, length);
      try {
        if (content.includes(0)) throw new Error('NUL byte');
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: preserveBOM }).decode(content);
      } catch {
        throw failure('FILE_NOT_TEXT', 'Only UTF-8 text files can be previewed.');
      }
    } finally {
      await file.close();
    }
  } catch (error) {
    const code = error.code;
    if (code === 'ENOENT' || code === 'ENOTDIR')
      throw failure('FILE_NOT_FOUND', 'The referenced file does not exist.');
    if (code === 'EACCES' || code === 'EPERM')
      throw failure('FILE_ACCESS_DENIED', 'The referenced file could not be read.');
    throw error;
  }
}
