import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, writeFileSync, unlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Runtime, directory, logger, source, sources, until } from './source-watching-fixture.ts';

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
