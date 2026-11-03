import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const source = new URL('../../dist/runtime/source-watcher.js', import.meta.url).href;
const fixture = new URL('./source-watcher-vite.mjs', import.meta.url).href;
if (process.argv[2] !== 'native')
  registerHooks({
    resolve(specifier, context, next) {
      return specifier === 'vite' && context.parentURL === source
        ? { url: fixture, shortCircuit: true }
        : next(specifier, context);
    },
  });
const { SourceWatcher } = await import('../../dist/runtime/source-watcher.js');
const { contentHash } = await import('../../dist/compiler/build-inputs.js');
const root = realpathSync(mkdtempSync(join(tmpdir(), 'paneon-nodefs-')));
const base = join(root, 'b');
const one = join(base, 'more/deep/value.ts');
const two = join(base, 'other/deep/value.ts');
const keeper = join(root, 'keeper.ts');
mkdirSync(base);
mkdirSync(join(root, 'unrelated/deep'), { recursive: true });
writeFileSync(join(root, 'unrelated/deep/ignore.ts'), 'ignored');
writeFileSync(keeper, 'keep');
const errors = [];
const watcher = new SourceWatcher((error) => errors.push(error));
const absent = (file) => ({ files: {}, paths: { [join(file, '..')]: 'missing' } });
const present = (file, value) => ({ files: { [file]: contentHash(value) }, paths: {} });
async function until(check) {
  const deadline = Date.now() + 5000;
  while (!check() && Date.now() < deadline) await delay(20);
  if (!check()) {
    const native = await watcher.server;
    console.error({
      backend: native.watcher.options,
      registered: [...watcher.registered],
      retired: [...watcher.retiredDirectories],
      ignored: [...native.watcher._ignoredPaths],
      closers: [...native.watcher._closers.keys()],
      owners: [...watcher.owners.keys()],
      watched: await watcher.getWatched(),
      a,
      b,
    });
  }
  assert.ok(check(), 'One filesystem update must notify its subscriber');
}
let a = 0,
  b = 0;
try {
  await watcher.subscribe(present(keeper, 'keep'), async () => {});
  const first = await watcher.subscribe(
    { files: {}, paths: { ...absent(one).paths, [base]: 'directory' } },
    async () => {
      a++;
    },
  );
  const second = await watcher.subscribe(absent(two), async () => {
    b++;
  });
  mkdirSync(join(one, '..'), { recursive: true });
  writeFileSync(one, 'one');
  mkdirSync(join(two, '..'), { recursive: true });
  writeFileSync(two, 'two');
  await until(() => a > 0 && b > 0);
  await first.update(present(one, 'one'));
  await second.update(present(two, 'two'));
  await first.close();
  const old = b;
  writeFileSync(two, 'next');
  await until(() => b > old);
  const reopened = await watcher.subscribe(present(one, 'one'), async () => {
    a++;
  });
  const before = a;
  writeFileSync(one, 'reopened');
  await until(() => a > before);
  assert.equal(
    Object.keys(await watcher.getWatched()).some((path) => path.includes('/unrelated')),
    false,
  );
  await reopened.close();
  await second.close();
  rmSync(base, { recursive: true, force: true });
  // A restored manifest may still describe the now-deleted directory and file.
  const again = await watcher.subscribe(
    { files: { [one]: contentHash('reopened') }, paths: { [join(one, '..')]: 'directory' } },
    async () => {
      a++;
    },
  );
  const retiredBefore = a;
  mkdirSync(join(one, '..'), { recursive: true });
  writeFileSync(one, 'after-directory-removal');
  await until(() => a > retiredBefore);
  await again.update(present(one, 'after-directory-removal'));
  // Editing after a recovered publication is covered by the real Runtime
  // fixture. Consecutive synthetic edits here fall inside Chokidar's 50ms
  // change coalescing window, without any compiler consuming the snapshot.
  await again.close();
  assert.deepEqual(errors, []);
} finally {
  await watcher.stop();
  rmSync(root, { recursive: true, force: true });
}
