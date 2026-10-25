import { readFile, stat } from 'node:fs/promises';
import { join, dirname, sep } from 'node:path';
import { PACKAGE_ROOT } from '../shared/paths.js';
import { contentHash } from './build-inputs.js';
import type { Manifest, WatchInputs } from '../shared/types.js';

export const envNames = ['.env', '.env.local', '.env.production', '.env.production.local'];
export const envFiles = (entry: string) => envNames.map((name) => join(dirname(entry), name));

export function isLocalSource(file: string) {
  return (
    !file.includes(`${sep}node_modules${sep}`) && !file.startsWith(join(PACKAGE_ROOT, 'dist') + sep)
  );
}

export function watchInputsFor(entry: string, manifest: Manifest): WatchInputs {
  if (manifest.watchInputs) return manifest.watchInputs;
  const files = Object.fromEntries(
    manifest.dependencies.flatMap((path) => {
      const hash = manifest.reuse?.files[path];
      return hash ? [[path, hash]] : [];
    }),
  );
  // Historical manifests still watch their successful files and env candidates.
  const paths = Object.fromEntries(
    [...manifest.dependencies, ...envFiles(entry)].map((path) => [
      path,
      manifest.reuse?.paths[path] ?? (path in files ? 'file' : 'missing'),
    ]),
  );
  return { files, paths };
}

export async function watchInputsChanged(inputs: WatchInputs) {
  try {
    for (const [path, expected] of Object.entries(inputs.files))
      if (contentHash(await readFile(path)) !== expected) return true;
    for (const [path, expected] of Object.entries(inputs.paths)) {
      const value = await stat(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return;
        throw error;
      });
      const actual = !value
        ? 'missing'
        : value.isFile()
          ? 'file'
          : value.isDirectory()
            ? 'directory'
            : 'other';
      if (actual !== expected) return true;
    }
    return false;
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return true;
    throw error;
  }
}
