import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  renameSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Runtime, directory, logger, source, sources, until } from './source-watching-fixture.ts';

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
