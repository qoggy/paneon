import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtempSync,
  realpathSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  renameSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import pino from 'pino';
import type { WatchInputs } from '../src/shared/types.js';

const { Runtime } = (await import(
  '../dist/runtime/' + 'lifecycle.js'
)) as typeof import('../src/runtime/lifecycle.js');
const { SourceWatcher } = (await import(
  '../dist/runtime/' + 'source-watcher.js'
)) as typeof import('../src/runtime/source-watcher.js');
const { contentHash } = (await import(
  '../dist/compiler/' + 'build-inputs.js'
)) as typeof import('../src/compiler/build-inputs.js');
const logger = pino({ level: 'silent' });
const directory = () => realpathSync(mkdtempSync(join(tmpdir(), 'paneon-source-watch-')));
async function until(check: () => boolean, message = 'Expected source update did not complete') {
  const deadline = Date.now() + 20000;
  while (!check() && Date.now() < deadline) await delay(20);
  assert.ok(check(), message);
}
function source(specifier = './value', extra = '') {
  return `import{definePanel,serverAction,z}from'paneon/sdk';import{value}from'${specifier}';${extra}
export const read=serverAction({kind:'query',input:z.object({}),handler:()=>({value})});
export default definePanel({id:'source-watch',requires:{paneon:'0.0.0'},input:z.object({}),render:()=> <div>{value}</div>});`;
}
function inputs(file: string, value: string): WatchInputs {
  return { files: { [file]: contentHash(value) }, paths: {} };
}
function sources(runtime: InstanceType<typeof Runtime>) {
  return (runtime as unknown as { sources: InstanceType<typeof SourceWatcher> }).sources;
}

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
      writeFileSync(file, 'two');
      await until(() => first === 1);
      await child.close();
      const next = await watcher.subscribe({ files: {}, paths: { [file]: 'file' } }, () => {
        later++;
        return Promise.resolve();
      });
      try {
        writeFileSync(file, 'three');
        await until(() => later === 1);
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
      writeFileSync(file, 'two');
      await until(() => a === 1 && b >= 1);
      writeFileSync(file, 'three');
      await until(() => b >= 2);
      release();
      await until(() => a === 2);
      await first.close();
      const before = a;
      writeFileSync(file, 'four');
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

void test(
  'candidate creation, deletion, restoration and failed new imports recover automatically',
  { timeout: 120000 },
  async () => {
    const root = directory(),
      entry = join(root, 'panel.tsx'),
      value = join(root, 'value.ts');
    mkdirSync(join(root, 'value'));
    writeFileSync(join(root, 'value/index.ts'), `export const value='directory';`);
    writeFileSync(entry, source());
    const runtime = new Runtime(join(root, 'data'), logger);
    try {
      const panel = await runtime.run(entry, root, {}, true),
        id = panel.instanceId;
      const current = () => runtime.store.get(id);
      const read = () => runtime.invoke(id, current().revision, 'panel.tsx#read', {});
      assert.deepEqual(await read(), { value: 'directory' });
      writeFileSync(value, `export const value='preferred';`);
      await until(() => current().revision !== panel.revision);
      assert.deepEqual(await read(), { value: 'preferred' });
      unlinkSync(value);
      await until(() => current().revision === panel.revision);
      assert.deepEqual(await read(), { value: 'directory' });
      writeFileSync(value, `export const value='restored';`);
      await until(() => current().revision !== panel.revision);
      assert.deepEqual(await read(), { value: 'restored' });
      writeFileSync(join(root, 'new.ts'), `export const value:string=123;`);
      writeFileSync(entry, source('./new'));
      await until(() => current().diagnostic?.code === 'BUILD_FAILED');
      const failed = current().revision;
      let attempts = 0;
      const onState = (_id: string, state: { building: boolean }) => {
        if (state.building) attempts++;
      };
      runtime.on('state', onState);
      await delay(400);
      assert.equal(attempts, 0, 'An unchanged compile error must not loop');
      runtime.off('state', onState);
      writeFileSync(join(root, 'new.ts'), `export const value='fixed';`);
      await until(() => !current().diagnostic && current().revision !== failed);
      assert.deepEqual(await read(), { value: 'fixed' });
      writeFileSync(entry, source('./missing'));
      await until(() => Boolean(current().diagnostic));
      writeFileSync(join(root, 'missing.ts'), `export const value='created';`);
      await until(() => !current().diagnostic);
      assert.deepEqual(await read(), { value: 'created' });
      const manifest = runtime.manifest(id);
      assert.ok(manifest);
      assert.ok(manifest.watchInputs);
      assert.equal(
        Object.keys(manifest.watchInputs.files).some((p) => p.includes('/node_modules/')),
        false,
      );
      assert.equal('/package.json' in manifest.watchInputs.paths, false);
      await runtime.closePanel(id);
      assert.equal(sources(runtime).size, 0);
    } finally {
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test(
  'production env add/change/delete updates revisions and keeps outside dependencies watched',
  { timeout: 90000 },
  async () => {
    const root = directory(),
      dir = join(root, 'panel');
    mkdirSync(dir);
    const entry = join(dir, 'panel.tsx'),
      shared = join(root, 'shared.ts'),
      env = join(dir, '.env'),
      production = join(dir, '.env.production');
    writeFileSync(shared, `export const value='one';`);
    writeFileSync(env, 'VITE_SOURCE_WATCH=first');
    writeFileSync(
      entry,
      source('../shared').replace(
        'handler:()=>({value})',
        `handler:()=>({value,env:import.meta.env.VITE_SOURCE_WATCH})`,
      ),
    );
    const runtime = new Runtime(join(root, 'data'), logger);
    try {
      const panel = await runtime.run(entry, root, {}, true),
        id = panel.instanceId,
        current = () => runtime.store.get(id);
      const read = () => runtime.invoke(id, current().revision, 'panel.tsx#read', {});
      assert.deepEqual(await read(), { value: 'one', env: 'first' });
      let revision = current().revision;
      writeFileSync(production, 'VITE_SOURCE_WATCH=production');
      await until(() => current().revision !== revision);
      assert.deepEqual(await read(), { value: 'one', env: 'production' });
      revision = current().revision;
      unlinkSync(production);
      await until(() => current().revision !== revision);
      assert.deepEqual(await read(), { value: 'one', env: 'first' });
      revision = current().revision;
      writeFileSync(env, 'VITE_SOURCE_WATCH=changed');
      await until(() => current().revision !== revision);
      assert.deepEqual(await read(), { value: 'one', env: 'changed' });
      revision = current().revision;
      writeFileSync(shared, `export const value='outside-after-env';`);
      await until(() => current().revision !== revision);
      assert.deepEqual(await read(), { value: 'outside-after-env', env: 'changed' });
      assert.equal(sources(runtime).servers, 1);
    } finally {
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test(
  'shared subscriptions survive LRU and close while cold and no-watch paths stay unsubscribed',
  { timeout: 90000 },
  async () => {
    const root = directory(),
      shared = join(root, 'shared.ts');
    writeFileSync(shared, `export const value='one';`);
    const runtime = new Runtime(join(root, 'data'), logger, { maxPanels: 2 });
    const run = async (name: string, watch = true) => {
      const dir = join(root, name);
      mkdirSync(dir);
      const entry = join(dir, 'panel.tsx');
      writeFileSync(entry, source('../shared'));
      return runtime.run(entry, dir, {}, watch);
    };
    try {
      assert.equal(sources(runtime).servers, 0);
      const a = await run('a'),
        b = await run('b');
      assert.equal(sources(runtime).servers, 1);
      assert.equal(sources(runtime).size, 2);
      await run('c', false);
      assert.equal(runtime.live.has(a.instanceId), false);
      assert.equal(sources(runtime).size, 1);
      writeFileSync(shared, `export const value='two';`);
      await until(() => runtime.store.get(b.instanceId).revision !== b.revision);
      assert.equal(runtime.store.get(a.instanceId).revision, a.revision);
      await runtime.observe(a.instanceId);
      assert.equal(runtime.live.get(a.instanceId)?.execution, undefined);
      assert.equal(sources(runtime).size, 2);
      await runtime.closePanel(b.instanceId);
      assert.equal(sources(runtime).size, 1);
      const revision = runtime.store.get(a.instanceId).revision;
      writeFileSync(shared, `export const value='three';`);
      await until(() => runtime.store.get(a.instanceId).revision !== revision);
      assert.equal(runtime.store.get(b.instanceId).status, 'closed');
    } finally {
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test(
  'a save during metadata compilation settles on the newest source without manual reload',
  { timeout: 90000 },
  async () => {
    const root = directory(),
      entry = join(root, 'panel.tsx'),
      marker = join(root, 'metadata'),
      release = join(root, 'release');
    writeFileSync(join(root, 'value.ts'), `export const value='initial';`);
    writeFileSync(entry, source());
    const runtime = new Runtime(join(root, 'data'), logger);
    try {
      const panel = await runtime.run(entry, root, {}, true),
        id = panel.instanceId;
      const gate = `import{writeFileSync,existsSync}from'node:fs';const gate=await new Promise<number>(resolve=>{writeFileSync(${JSON.stringify(marker)},'ready');const timer=setInterval(()=>{if(existsSync(${JSON.stringify(release)})){clearInterval(timer);resolve(1)}},10)});`;
      writeFileSync(
        entry,
        source('./value', gate).replace('handler:()=>({value})', 'handler:()=>({value,gate})'),
      );
      await until(() => existsSync(marker), 'metadata gate was not reached');
      writeFileSync(join(root, 'value.ts'), `export const value='latest';`);
      writeFileSync(release, 'go');
      await until(
        () =>
          !runtime.store.get(id).diagnostic && runtime.store.get(id).revision !== panel.revision,
      );
      assert.deepEqual(
        await runtime.invoke(id, runtime.store.get(id).revision, 'panel.tsx#read', {}),
        { value: 'latest', gate: 1 },
      );
      assert.equal(readFileSync(join(root, 'value.ts'), 'utf8').includes('latest'), true);
      const swapped = join(root, 'value.ts.swap');
      writeFileSync(swapped, `export const value='atomic';`);
      const before = runtime.store.get(id).revision;
      renameSync(swapped, join(root, 'value.ts'));
      await until(() => runtime.store.get(id).revision !== before);
      assert.deepEqual(
        await runtime.invoke(id, runtime.store.get(id).revision, 'panel.tsx#read', {}),
        { value: 'atomic', gate: 1 },
      );
    } finally {
      writeFileSync(release, 'cleanup');
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
