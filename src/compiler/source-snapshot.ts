import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { PaneonError } from '../shared/types.js';
import type { BuildReuse, WatchInputs } from '../shared/types.js';
import { contentHash } from './build-inputs.js';

// One compilation reads each source once. A later save belongs to a later Vite
// update; it must never change the revision attached to already-built code.
export class SourceSnapshot {
  private contents = new Map<string, Buffer>();
  private tracking = false;
  private watchedFiles = new Set<string>();
  private watchedPaths = new Set<string>();
  readonly paths: BuildReuse['paths'] = {};
  track<T>(read: () => T): T {
    const previous = this.tracking;
    this.tracking = true;
    try {
      return read();
    } finally {
      this.tracking = previous;
    }
  }
  watchInputs(): WatchInputs {
    return {
      files: Object.fromEntries(
        [...this.watchedFiles].map((path) => [
          path,
          contentHash(this.contents.get(path) as Buffer),
        ]),
      ),
      paths: Object.fromEntries([...this.watchedPaths].map((path) => [path, this.paths[path]])),
    };
  }
  get files(): Iterable<string> {
    return this.contents.keys();
  }
  read(file: string): Buffer {
    const path = realpathSync(file);
    let bytes = this.contents.get(path);
    if (!bytes) {
      bytes = readFileSync(path);
      this.contents.set(path, bytes);
    }
    if (this.tracking) this.watchedFiles.add(path);
    return bytes;
  }
  text(file: string): string {
    return this.read(file).toString('utf8');
  }
  exists(file: string, kind: 'file' | 'directory') {
    const path = resolve(file);
    const stat = statSync(path, { throwIfNoEntry: false });
    const actual = !stat
      ? 'missing'
      : stat.isFile()
        ? 'file'
        : stat.isDirectory()
          ? 'directory'
          : 'other';
    this.paths[path] = actual;
    if (this.tracking) this.watchedPaths.add(path);
    return actual === kind;
  }
  assertUnchanged(files: Iterable<string>) {
    for (const file of files) {
      let current: Buffer | undefined;
      try {
        current = readFileSync(file);
      } catch {
        // Deletion is a source change too, not an unknown compiler failure.
      }
      if (!current?.equals(this.read(file)))
        throw new PaneonError('BUILD_SOURCE_CHANGED', 'Panel source changed during compilation.', {
          entryPath: file,
        });
    }
  }
}
