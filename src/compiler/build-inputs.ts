import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PACKAGE_ROOT } from '../shared/paths.js';
import type { BuildReuse } from '../shared/types.js';
import type { SourceSnapshot } from './source-snapshot.js';
import { envFiles } from './watch-inputs.js';

export function contentHash(bytes: Uint8Array | string) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function buildEnvironment() {
  // The compiler always selects production. Vite changes these two internal
  // variables while setting up the daemon's source watcher.
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production' };
  delete env.VITE_USER_NODE_ENV;
  return contentHash(
    JSON.stringify([
      process.version,
      process.platform,
      process.arch,
      Object.entries(env).sort(([a], [b]) => a.localeCompare(b)),
    ]),
  );
}

export function captureBuildEnvironment(snapshot: SourceSnapshot, entry: string) {
  const files = snapshot.track(() =>
    envFiles(entry).filter((file) => {
      if (!snapshot.exists(file, 'file')) return false;
      snapshot.read(file);
      return true;
    }),
  );
  for (const name of [
    'index',
    'action-transform',
    'source-snapshot',
    'build-inputs',
    'watch-inputs',
  ])
    snapshot.read(join(PACKAGE_ROOT, 'dist/compiler', name + '.js'));
  snapshot.read(join(PACKAGE_ROOT, 'dist/runtime/worker.js'));
  snapshot.read(join(PACKAGE_ROOT, 'dist/shared/types.js'));
  const require = createRequire(import.meta.url);
  for (const name of ['typescript', 'vite', '@tailwindcss/vite'])
    snapshot.read(require.resolve(name));
  return files;
}

export function buildReuse(
  snapshot: SourceSnapshot,
  directory: string,
  outputs: string[],
  environment: string,
): BuildReuse {
  // Resolution depends on package metadata and on its absence in ancestor
  // directories, including packages supplied by the panel's own node_modules.
  const visited = new Set<string>();
  for (const input of [...snapshot.files]) {
    let parent = dirname(input);
    while (!visited.has(parent)) {
      visited.add(parent);
      const file = join(parent, 'package.json');
      if (snapshot.exists(file, 'file')) snapshot.read(file);
      const next = dirname(parent);
      if (next === parent) break;
      parent = next;
    }
  }
  return {
    environment,
    files: Object.fromEntries(
      [...snapshot.files].map((path) => [path, contentHash(snapshot.read(path))]),
    ),
    paths: snapshot.paths,
    outputs: Object.fromEntries(
      outputs.map((path) => [path, contentHash(readFileSync(join(directory, path)))]),
    ),
  };
}
