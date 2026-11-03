import fs from 'node:fs';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const mode = process.argv[2] ?? 'single';
const crossDirectory = mode !== 'single';
const later = mode === 'second' || mode === 'update';
const missingParent = mode === 'missing-parent';
if (process.argv[3] === 'nodefs') {
  const source = new URL('../../dist/runtime/source-watcher.js', import.meta.url).href;
  const fixture = new URL('./source-watcher-vite.mjs', import.meta.url).href;
  registerHooks({
    resolve(specifier, context, next) {
      return specifier === 'vite' && context.parentURL === source
        ? { url: fixture, shortCircuit: true }
        : next(specifier, context);
    },
  });
}
const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'paneon-watch-startup-')));
const first = join(root, 'a/one.ts');
const file = crossDirectory
  ? join(root, missingParent ? 'b/deep/.env' : 'b/deep/two.ts')
  : join(root, 'value.ts');
if (crossDirectory) {
  fs.mkdirSync(join(root, 'a'), { recursive: true });
  fs.mkdirSync(join(root, 'b/deep'), { recursive: true });
  fs.mkdirSync(join(root, 'unrelated/deep'), { recursive: true });
  fs.writeFileSync(first, 'first');
  fs.writeFileSync(join(root, 'unrelated/deep/ignore.ts'), 'ignored');
}
if (!missingParent) fs.writeFileSync(file, 'one');
let release;
let started;
let armed = !later;
const gate = new Promise((resolve) => {
  release = resolve;
});
const blocked = new Promise((resolve) => {
  started = resolve;
});
const originalStat = fs.stat;
// Pause the real backend's registration, not the snapshot's fs/promises reads.
const target = missingParent ? dirname(file) : file;
fs.stat = function (path, ...args) {
  if (!armed || path !== target) return originalStat.call(fs, path, ...args);
  const callback = args.pop();
  return originalStat.call(fs, path, ...args, (...result) => {
    started();
    void gate.then(() => callback(...result));
  });
};
const { SourceWatcher } = await import('../../dist/runtime/source-watcher.js');
const { contentHash } = await import('../../dist/compiler/build-inputs.js');
const errors = [];
const watcher = new SourceWatcher((error) => errors.push(error));
let count = 0;
let returned = false;
try {
  const firstInputs = { files: { [first]: contentHash('first') }, paths: {} };
  const graph = {
    files: {
      ...(crossDirectory ? { [first.replace(/^\/private\//, '/')]: contentHash('first') } : {}),
      ...(!missingParent ? { [file]: contentHash('one') } : {}),
    },
    paths: crossDirectory
      ? {
          [join(root, 'a/.env.local')]: 'missing',
          [join(root, 'a/.env.production')]: 'missing',
          ...(missingParent ? { [file]: 'missing' } : {}),
        }
      : {},
  };
  const changed = async () => {
    count++;
  };
  let pending;
  if (later) {
    const subscription = await watcher.subscribe(
      firstInputs,
      mode === 'update' ? changed : async () => {},
    );
    armed = true;
    pending = mode === 'update' ? subscription.update(graph) : watcher.subscribe(graph, changed);
  } else {
    pending = watcher.subscribe(graph, changed);
  }
  void pending.then(() => {
    returned = true;
  });
  await blocked;
  await delay(50);
  assert.equal(returned, false, 'subscription must wait for native registration');
  fs.writeFileSync(file, 'two');
  // Let this one save's event pass while registration is blocked. Completion
  // must then reconcile the saved bytes, without requiring a second save.
  if (crossDirectory) await delay(600);
  release();
  await pending;
  const deadline = Date.now() + 2000;
  while (!count && Date.now() < deadline) await delay(20);
  assert.equal(count, 1, 'The one save during registration must be reconciled');
  const watched = await watcher.getWatched();
  assert.equal(
    Object.keys(watched).some((path) => path.includes('/unrelated')),
    false,
  );
  assert.deepEqual(errors, []);
} finally {
  release();
  await watcher.stop();
  fs.stat = originalStat;
  fs.rmSync(root, { recursive: true, force: true });
}
