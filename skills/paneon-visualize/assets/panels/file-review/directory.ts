import { lstat, opendir, readlink, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { FileReviewParams } from './schema.ts';

export type DirectoryIssue = { path: string; code: string; message: string };
export type SymbolicLink = {
  path: string;
  target: string;
  kind: 'file' | 'directory' | 'unavailable';
  cycle: boolean;
  error?: { code: string; message: string };
};
const readErrors = new Set(['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'EIO', 'ELOOP']);

export function withinDirectory(directory: string, path: string) {
  const suffix = relative(directory, path);
  return suffix !== '' && suffix !== '..' && !suffix.startsWith('..' + sep) && !isAbsolute(suffix);
}

/** Collect metadata only. Preview eligibility remains owned by the existing file reader. */
export async function discoverFiles(cwd: string, params: FileReviewParams) {
  const files = [...(params.files ?? [])];
  const paths = files.map((path) => resolve(cwd, path));
  const seen = new Set(paths);
  const visited = new Map<string, ReadonlySet<string>>();
  const issues: DirectoryIssue[] = [];
  const links = new Map<string, SymbolicLink>();

  async function inspectLink(path: string): Promise<SymbolicLink> {
    const known = links.get(path);
    if (known) return known;
    const link: SymbolicLink = { path, target: await readlink(path), kind: 'file', cycle: false };
    try {
      link.kind = (await stat(path)).isDirectory() ? 'directory' : 'file';
    } catch (error) {
      const { code, message } = error as NodeJS.ErrnoException;
      if (!code || !readErrors.has(code)) throw error;
      link.kind = 'unavailable';
      link.cycle = code === 'ELOOP';
      link.error = { code, message };
    }
    links.set(path, link);
    return link;
  }

  for (const path of seen) {
    try {
      if ((await lstat(path)).isSymbolicLink()) await inspectLink(path);
    } catch (error) {
      if (!readErrors.has((error as NodeJS.ErrnoException).code ?? '')) throw error;
      // Metadata failure must not replace the existing per-file preview error flow.
      console.warn('Could not inspect review file.', path, error);
    }
  }

  async function visitLink(path: string, found: string[], ancestors: ReadonlySet<string>) {
    try {
      const link = await inspectLink(path);
      if (link.kind === 'directory') {
        const target = await realpath(path);
        const cycle = ancestors.has(target);
        if (cycle && !visited.has(path)) link.cycle = true;
        if (!cycle) await visit(path, found, ancestors, target);
      } else found.push(path);
    } catch (error) {
      const { code, message } = error as NodeJS.ErrnoException;
      if (!code || !readErrors.has(code)) throw error;
      issues.push({ path, code, message });
    }
  }

  async function visit(
    path: string,
    found: string[],
    ancestors: ReadonlySet<string>,
    actual: string,
  ) {
    const previous = visited.get(path);
    if (previous && [...previous].every((parent) => ancestors.has(parent))) return;
    visited.set(path, ancestors);
    const link = links.get(path);
    if (link?.kind === 'directory') link.cycle = false;
    const parents = new Set(ancestors).add(actual);
    try {
      const directory = await opendir(path);
      for await (const entry of directory) {
        const child = join(path, entry.name);
        if (entry.isDirectory()) await visit(child, found, parents, join(actual, entry.name));
        else if (entry.isSymbolicLink()) await visitLink(child, found, parents);
        else found.push(child);
      }
    } catch (error) {
      const { code, message } = error as NodeJS.ErrnoException;
      if (!code || !readErrors.has(code)) throw error;
      issues.push({ path, code, message });
    }
  }

  for (const supplied of params.directories ?? []) {
    const found: string[] = [];
    const path = resolve(cwd, supplied);
    try {
      if ((await lstat(path)).isSymbolicLink()) await inspectLink(path);
      await visit(path, found, new Set(), await realpath(path));
    } catch (error) {
      const { code, message } = error as NodeJS.ErrnoException;
      if (!code || !readErrors.has(code)) throw error;
      issues.push({ path, code, message });
    }
    found.sort();
    for (const path of found) {
      if (seen.has(path)) continue;
      seen.add(path);
      files.push(withinDirectory(cwd, path) ? relative(cwd, path) : path);
      paths.push(path);
    }
  }
  return { files, paths, links: [...links.values()], issues };
}
