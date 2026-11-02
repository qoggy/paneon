import { readdir, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { repository } from './git.ts';
import type { GitConfiguration } from './schema.ts';

export class DirectoryInputError extends Error {}

export function directoryErrorMessage(error: unknown, operation: 'repository' | 'directory') {
  if (error instanceof DirectoryInputError) return error.message;
  switch ((error as NodeJS.ErrnoException | null | undefined)?.code) {
    case 'ENOENT':
      return 'Directory not found.';
    case 'ENOTDIR':
      return 'Select a directory, not a file.';
    case 'EACCES':
    case 'EPERM':
      return 'You do not have permission to read this directory.';
    default:
      return operation === 'repository'
        ? 'Unable to open this repository.'
        : 'Unable to read this directory.';
  }
}

export async function resolveRepository(
  path: string,
  signal?: AbortSignal,
): Promise<{ path: string }> {
  if (!isAbsolute(path) || path.includes('\0'))
    throw new DirectoryInputError('Enter an absolute directory path.');
  if (!(await stat(path)).isDirectory())
    throw new DirectoryInputError('Select a directory, not a file.');
  const root = await repository({ repositories: [{ id: 'resolve', path }] }, 'resolve', signal);
  return { path: root };
}

/** Resolve once for duplicate detection; an unavailable configured repository remains visible with its error. */
export async function repositoryCatalog(params: GitConfiguration, signal?: AbortSignal) {
  return Promise.all(
    params.repositories.map(async (entry) => {
      try {
        const resolved = await resolveRepository(entry.path, signal);
        return {
          repository: {
            ...entry,
            path: resolved.path,
          },
        };
      } catch (error) {
        console.error('Repository lookup failed:', entry.path, error);
        return { repository: entry, error: directoryErrorMessage(error, 'repository') };
      }
    }),
  );
}

export async function listDirectories(path: string) {
  if (!isAbsolute(path) || path.includes('\0'))
    throw new DirectoryInputError('Enter an absolute directory path.');
  const root = await realpath(path);
  const entries = await readdir(root, { withFileTypes: true });
  const directories = await Promise.all(
    entries.map(async (entry) => {
      const directory = { name: entry.name, path: join(root, entry.name) };
      if (entry.isDirectory()) return directory;
      if (!entry.isSymbolicLink()) return;
      try {
        if ((await stat(directory.path)).isDirectory()) return directory;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        console.warn('Skipping a dangling directory link:', directory.path, error);
      }
    }),
  );
  return {
    path: root,
    parent: dirname(root),
    directories: directories
      .filter((entry) => entry !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
