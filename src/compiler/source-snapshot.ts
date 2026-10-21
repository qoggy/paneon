import { readFileSync, realpathSync } from 'node:fs';
import { PaneonError } from '../shared/types.js';

// One compilation reads each source once. A later save belongs to a later Vite
// update; it must never change the revision attached to already-built code.
export class SourceSnapshot {
  private contents = new Map<string, Buffer>();
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
    return bytes;
  }
  text(file: string): string {
    return this.read(file).toString('utf8');
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
