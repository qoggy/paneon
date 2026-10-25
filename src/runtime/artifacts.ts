import { readFileSync } from 'node:fs';
import { readFile, stat, lstat, readdir, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PACKAGE_VERSION } from '../shared/paths.js';
import type { Manifest } from '../shared/types.js';
import type { CompiledPanel } from '../compiler/index.js';
import { buildEnvironment, contentHash } from '../compiler/build-inputs.js';

export class Artifacts {
  private cache = new Map<string, { compiled: CompiledPanel; bytes: number }>();
  private bytes = 0;
  private home: string;
  constructor(home: string) {
    this.home = home;
  }
  read(id: string, revision: string): CompiledPanel | undefined {
    if (!/^sha256:[a-f0-9]{64}$/.test(revision)) return;
    const directory = join(this.home, 'panels', id, revision.replace(':', '-'));
    const cached = this.cache.get(directory);
    if (cached) {
      this.cache.delete(directory);
      this.cache.set(directory, cached);
      return cached.compiled;
    }
    let text: string;
    try {
      text = readFileSync(join(directory, 'manifest.json'), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    const manifest = JSON.parse(text) as Manifest;
    const compiled = { directory, manifest };
    const bytes = Buffer.byteLength(text);
    if (bytes <= 8 * 1024 * 1024) {
      while (this.cache.size >= 32 || this.bytes + bytes > 8 * 1024 * 1024) {
        const oldest = this.cache.keys().next().value;
        if (oldest === undefined) break;
        const value = this.cache.get(oldest);
        if (value) this.bytes -= value.bytes;
        this.cache.delete(oldest);
      }
      this.cache.set(directory, { compiled, bytes });
      this.bytes += bytes;
    }
    return compiled;
  }
  async unchanged(compiled: CompiledPanel) {
    if (compiled.manifest.paneonVersion !== PACKAGE_VERSION) return false;
    const reuse = compiled.manifest.reuse;
    if (!reuse || reuse.environment !== buildEnvironment()) return false;
    const checks: (() => Promise<boolean>)[] = [
      async () =>
        (await readFile(join(compiled.directory, 'manifest.json'), 'utf8')) ===
        JSON.stringify(compiled.manifest),
      ...Object.entries(reuse.files).map(
        ([path, expected]) =>
          async () =>
            contentHash(await readFile(path)) === expected,
      ),
      ...Object.entries(reuse.outputs).map(
        ([path, expected]) =>
          async () =>
            contentHash(await readFile(join(compiled.directory, path))) === expected,
      ),
      ...Object.entries(reuse.paths).map(([path, expected]) => async () => {
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
        return actual === expected;
      }),
    ];
    // Bound file descriptors while keeping the HTTP process free during I/O.
    for (let offset = 0; offset < checks.length; offset += 64) {
      try {
        if (
          !(await Promise.all(checks.slice(offset, offset + 64).map((check) => check()))).every(
            Boolean,
          )
        )
          return false;
      } catch (error) {
        if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? ''))
          return false;
        throw error;
      }
    }
    return true;
  }
  forget(directory: string) {
    const cached = this.cache.get(directory);
    if (cached) {
      this.bytes -= cached.bytes;
      this.cache.delete(directory);
    }
  }
  async instances() {
    const entries = await readdir(join(this.home, 'panels'), { withFileTypes: true }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      },
    );
    return entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          /^instance-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
            entry.name,
          ),
      )
      .map((entry) => entry.name);
  }
  async prune(id: string, revision?: string) {
    const root = join(this.home, 'panels', id);
    const info = await lstat(root).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return;
      throw error;
    });
    if (!info?.isDirectory()) return;
    const keep = revision?.replace(':', '-');
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (
        !entry.isDirectory() ||
        entry.name === keep ||
        !/^sha256-[a-f0-9]{64}(-build)?$/.test(entry.name)
      )
        continue;
      const directory = join(root, entry.name);
      await rm(directory, { recursive: true, force: true });
      this.forget(directory);
    }
    if (!keep)
      await rmdir(root).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY') throw error;
      });
  }
  clear() {
    this.cache.clear();
    this.bytes = 0;
  }
}
