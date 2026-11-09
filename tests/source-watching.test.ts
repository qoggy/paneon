import { PACKAGE_ROOT } from '../dist/shared/paths.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ViteDevServer } from 'vite';
import { SourceWatcher, directory, inputs, until } from './source-watching-fixture.ts';

async function writeChange(
  watcher: InstanceType<typeof SourceWatcher>,
  file: string,
  value: string,
) {
  const server = await (watcher as unknown as { server: Promise<ViteDevServer> }).server;
  const throttled = (server.watcher as unknown as { _throttled: Map<string, Map<string, unknown>> })
    ._throttled;
  // NodeFs merges same-file changes for 50 ms. These steps need distinct
  // notifications, so wait for the previous window instead of a fixed sleep.
  await until(
    () => !throttled.get('change')?.has(file),
    'The previous filesystem change did not settle',
  );
  writeFileSync(file, value);
}

for (const [mode, backend] of [
  ['single', 'native'],
  ['cross-directory', 'native'],
  ['second', 'native'],
  ['update', 'native'],
  ['cross-directory', 'nodefs'],
  ['second', 'nodefs'],
  ['update', 'nodefs'],
  ['missing-parent', 'nodefs'],
]) {
  void test(`one save during registration is reconciled: ${mode}, ${backend}`, async () => {
    await promisify(execFile)(
      process.execPath,
      [new URL('./fixtures/source-watcher-startup.mjs', import.meta.url).pathname, mode, backend],
      { timeout: 10000 },
    );
  });
}

void test('NodeFs recovers a panel after creating a missing import and its parent directories', async () => {
  await promisify(execFile)(
    process.execPath,
    [new URL('./fixtures/source-watcher-recovery.mjs', import.meta.url).pathname],
    { timeout: 60000 },
  );
});

for (const backend of ['nodefs', 'native'])
  void test(`shared missing paths and retired directories recover without scanning siblings: ${backend}`, async () => {
    await promisify(execFile)(
      process.execPath,
      [new URL('./fixtures/source-watcher-nodefs.mjs', import.meta.url).pathname, backend],
      { timeout: 20000 },
    );
  });

void test('the watcher disables dependency optimization, reports errors and releases its server', async () => {
  const root = directory(),
    file = join(root, 'value.ts');
  writeFileSync(file, 'one');
  const errors: unknown[] = [];
  const watcher = new SourceWatcher((error) => errors.push(error));
  try {
    const subscription = await watcher.subscribe(inputs(file, 'one'), async () => {});
    const native = await (watcher as unknown as { server: Promise<ViteDevServer> }).server;
    assert.equal(native.config.root, PACKAGE_ROOT);
    assert.equal(native.environments.client.depsOptimizer, undefined);
    const failure = new Error('Deliberate watcher error');
    native.watcher.emit('error', failure);
    assert.deepEqual(errors, [failure]);
    await subscription.close();
    assert.deepEqual(native.watcher.getWatched(), {});
    assert.equal(watcher.size, 0);
    assert.equal(watcher.servers, 0);
  } finally {
    await watcher.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

void test(
  'retiring an ancestor preserves child subscribers and later subscriptions can reopen that subtree',
  { timeout: 20000 },
  async () => {
    const root = directory(),
      shared = join(root, 'shared'),
      other = join(root, 'other.ts');
    mkdirSync(shared);
    const file = join(shared, 'value.ts');
    writeFileSync(file, 'one');
    writeFileSync(other, 'other');
    const errors: unknown[] = [],
      watcher = new SourceWatcher((e) => errors.push(e));
    let first = 0,
      later = 0;
    const keeper = await watcher.subscribe({ files: {}, paths: { [other]: 'file' } }, () =>
      Promise.resolve(),
    );
    const parent = await watcher.subscribe({ files: {}, paths: { [shared]: 'directory' } }, () =>
      Promise.resolve(),
    );
    const child = await watcher.subscribe({ files: {}, paths: { [file]: 'file' } }, () => {
      first++;
      return Promise.resolve();
    });
    try {
      await parent.close();
      const beforeFirst = first;
      await writeChange(watcher, file, 'after-parent-close');
      await until(
        () => first > beforeFirst,
        'Closing the ancestor subscription stopped notifications for its child',
      );
      await child.close();
      const next = await watcher.subscribe({ files: {}, paths: { [file]: 'file' } }, () => {
        later++;
        return Promise.resolve();
      });
      try {
        const beforeLater = later;
        await writeChange(watcher, file, 'after-resubscribe');
        await until(
          () => later > beforeLater,
          'A new subscription could not receive notifications from the retired subtree',
        );
      } finally {
        await next.close();
      }
      await keeper.close();
      assert.equal(watcher.size, 0);
      assert.equal(watcher.servers, 0);
      assert.deepEqual(errors, []);
    } finally {
      await parent.close();
      await child.close();
      await keeper.close();
      await watcher.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test(
  'one precise watcher shares paths, reconciles handoffs and coalesces changes without scanning siblings',
  { timeout: 30000 },
  async () => {
    const root = directory(),
      file = join(root, 'value.ts'),
      missing = join(root, 'future/deep/new.ts');
    mkdirSync(join(root, 'unrelated/deep'), { recursive: true });
    writeFileSync(join(root, 'unrelated/deep/ignore.ts'), 'ignored');
    writeFileSync(file, 'one');
    const errors: unknown[] = [],
      watcher = new SourceWatcher((e) => errors.push(e));
    let a = 0,
      b = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = await watcher.subscribe(inputs(file, 'one'), async () => {
      a++;
      if (a === 1) await gate;
    });
    const second = await watcher.subscribe(
      inputs(file.replace(/^\/private\/tmp\//, '/tmp/'), 'one'),
      () => {
        b++;
        return Promise.resolve();
      },
    );
    try {
      assert.equal(watcher.servers, 1);
      assert.equal(watcher.size, 2);
      await writeChange(watcher, file, 'two');
      await until(() => a === 1 && b >= 1);
      await writeChange(watcher, file, 'three');
      await until(() => b >= 2);
      release();
      await until(() => a === 2);
      await first.close();
      const before = a;
      await writeChange(watcher, file, 'four');
      await until(() => b >= 3);
      assert.equal(a, before);
      // This file changed before the new subscription became visible. Reconcile
      // against the captured compiler bytes rather than waiting for another save.
      let caught = 0;
      const late = await watcher.subscribe(inputs(file, 'three'), () => {
        caught++;
        return Promise.resolve();
      });
      await until(() => caught === 1);
      await late.close();
      const missingHandle = await watcher.subscribe(
        { files: {}, paths: { [missing]: 'missing' } },
        () => {
          caught++;
          return Promise.resolve();
        },
      );
      mkdirSync(join(root, 'future/deep'), { recursive: true });
      writeFileSync(missing, 'new');
      await until(() => caught >= 2);
      const watched = await watcher.getWatched();
      assert.equal(
        Object.keys(watched).some((p) => p.includes('/unrelated')),
        false,
      );
      assert.deepEqual(errors, []);
      await missingHandle.close();
    } finally {
      release();
      await first.close();
      await second.close();
      await watcher.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
