import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtempSync,
  realpathSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  unlinkSync,
  utimesSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import pino from 'pino';
import type { ResourcePool } from '../src/runtime/resource-pool.js';
import type { SourceWatcher } from '../src/runtime/source-watcher.js';

const { Runtime } = (await import(
  '../dist/runtime/' + 'lifecycle.js'
)) as typeof import('../src/runtime/lifecycle.js');
const { Artifacts } = (await import(
  '../dist/runtime/' + 'artifacts.js'
)) as typeof import('../src/runtime/artifacts.js');
const logger = pino({ level: 'silent' });

function source(marker: string, imports = '', value = "'original'") {
  return `import{definePanel,serverAction,z}from'paneon/sdk';import{appendFileSync}from'node:fs';${imports}
const boot=(appendFileSync(${JSON.stringify(marker)},'boot\\n'),true);const state={count:0};
export const read=serverAction({kind:'query',input:z.object({}),handler:()=>({count:++state.count,value:${value},boot})});
function Panel(){return <div>Reuse</div>}
export default definePanel({id:'watch-reuse',requires:{paneon:'0.0.0'},input:z.object({}),render:Panel});`;
}

async function until(check: () => boolean) {
  const deadline = Date.now() + 20000;
  while (!check() && Date.now() < deadline) await delay(20);
  assert.equal(check(), true, 'The expected watch update did not complete.');
}

void test(
  'unchanged watch preserves execution and module state, and undo clears build errors',
  { timeout: 90000 },
  async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'paneon-watch-reuse-')));
    const entry = join(root, 'panel.tsx');
    const marker = join(root, 'boots');
    const text = source(marker);
    writeFileSync(entry, text);
    const runtime = new Runtime(join(root, 'data'), logger);
    const states: { building: boolean }[] = [];
    try {
      const panel = await runtime.run(entry, root, {}, true);
      runtime.on('state', (_id: string, state: { building: boolean }) => states.push(state));
      const live = runtime.live.get(panel.instanceId);
      assert.ok(live?.execution);
      const child = live.execution.child;
      const watcher = live.watcher;
      const boots = readFileSync(marker, 'utf8');
      const read = () => runtime.invoke(panel.instanceId, panel.revision, 'panel.tsx#read', {});
      assert.deepEqual(await read(), { count: 1, value: 'original', boot: true });
      writeFileSync(entry, text);
      await until(() => states.some((state) => state.building));
      await until(() => states.at(-1)?.building === false);
      assert.equal(runtime.live.get(panel.instanceId)?.execution?.child, child);
      assert.equal(runtime.live.get(panel.instanceId)?.watcher, watcher);
      assert.equal(
        readFileSync(marker, 'utf8'),
        boots,
        'no metadata or execution evaluation on a hit',
      );
      assert.deepEqual(await read(), { count: 2, value: 'original', boot: true });

      await delay(200);
      const beforeTouch = states.length;
      const timestamp = new Date(Date.now() + 1000);
      utimesSync(entry, timestamp, timestamp);
      await until(() => states.length > beforeTouch && states.at(-1)?.building === false);
      assert.equal(runtime.live.get(panel.instanceId)?.execution?.child, child);
      assert.equal(readFileSync(marker, 'utf8'), boots);
      assert.equal(runtime.inspect(panel.instanceId).updatedAt, panel.updatedAt);

      await delay(200);
      writeFileSync(entry, text + '\nconst invalid = ;');
      await until(() => runtime.inspect(panel.instanceId).diagnostic?.code === 'BUILD_FAILED');
      assert.equal(runtime.live.get(panel.instanceId)?.execution?.child, child);
      writeFileSync(entry, text);
      await until(() => !runtime.inspect(panel.instanceId).diagnostic);
      assert.equal(states.at(-1)?.building, false);
      assert.equal(runtime.live.get(panel.instanceId)?.execution?.child, child);
      assert.equal(readFileSync(marker, 'utf8'), boots);
      assert.deepEqual(await read(), { count: 3, value: 'original', boot: true });

      const manual = await runtime.reload(panel.instanceId);
      assert.equal(manual.revision, panel.revision);
      assert.notEqual(runtime.live.get(panel.instanceId)?.execution?.child.pid, child.pid);
      assert.deepEqual(await read(), { count: 1, value: 'original', boot: true });
    } finally {
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test(
  'reuse evidence catches resolution, package, environment and output changes without changing source revisions',
  { timeout: 90000 },
  async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'paneon-build-evidence-')));
    const entry = join(root, 'panel.tsx');
    const pkg = join(root, 'node_modules/cache-fixture');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(pkg, 'package.json'),
      JSON.stringify({
        name: 'cache-fixture',
        version: '1.0.0',
        type: 'module',
        main: 'index.js',
        types: 'index.d.ts',
      }),
    );
    writeFileSync(join(pkg, 'index.js'), "export const value='package-before';");
    writeFileSync(join(pkg, 'index.d.ts'), 'export declare const value:string;');
    writeFileSync(join(root, 'value.tsx'), "export const value='local-before';");
    writeFileSync(
      entry,
      source(
        join(root, 'boots'),
        "import{value as local}from'./value';import{value as external}from'cache-fixture';",
        'local+external',
      ),
    );
    const runtime = new Runtime(join(root, 'data'), logger);
    const artifacts = new Artifacts(join(root, 'data'));
    const priorEnv = process.env.VITE_PANEON_REUSE_TEST;
    try {
      const panel = await runtime.run(entry, root, {}, false);
      let compiled = runtime.live.get(panel.instanceId)?.compiled;
      assert.ok(compiled?.manifest.reuse);
      assert.equal(await artifacts.unchanged(compiled), true);
      assert.equal(
        compiled.manifest.dependencies.some((path) => path.includes('/node_modules/')),
        false,
      );

      const candidate = join(root, 'value.ts');
      writeFileSync(candidate, "export const value='local-after';");
      assert.equal(await artifacts.unchanged(compiled), false);
      unlinkSync(candidate);
      assert.equal(await artifacts.unchanged(compiled), true);

      writeFileSync(join(pkg, 'index.js'), "export const value='package-after';");
      assert.equal(await artifacts.unchanged(compiled), false);
      writeFileSync(join(pkg, 'index.js'), "export const value='package-before';");
      assert.equal(await artifacts.unchanged(compiled), true);

      writeFileSync(join(root, '.env.production'), 'VITE_PANEL_LABEL=changed\n');
      assert.equal(await artifacts.unchanged(compiled), false);
      unlinkSync(join(root, '.env.production'));
      process.env.VITE_PANEON_REUSE_TEST = 'changed';
      assert.equal(await artifacts.unchanged(compiled), false);
      if (priorEnv === undefined) delete process.env.VITE_PANEON_REUSE_TEST;
      else process.env.VITE_PANEON_REUSE_TEST = priorEnv;
      assert.equal(await artifacts.unchanged(compiled), true);

      const output = join(compiled.directory, compiled.manifest.serverEntry);
      const bytes = readFileSync(output);
      writeFileSync(output, 'damaged output');
      assert.equal(await artifacts.unchanged(compiled), false);
      writeFileSync(output, bytes);
      unlinkSync(join(compiled.directory, 'client/frame.html'));
      assert.equal(await artifacts.unchanged(compiled), false);
      await runtime.reload(panel.instanceId);
      compiled = runtime.live.get(panel.instanceId)?.compiled;
      assert.ok(compiled?.manifest.reuse);
      assert.equal(await artifacts.unchanged(compiled), true);
      writeFileSync(join(compiled.directory, 'manifest.json'), '{broken');
      assert.equal(await artifacts.unchanged(compiled), false);
      await runtime.reload(panel.instanceId);
      compiled = runtime.live.get(panel.instanceId)?.compiled;
      assert.ok(compiled?.manifest.reuse);
      assert.equal(await artifacts.unchanged(compiled), true);
      const evidence = compiled.manifest.reuse;
      delete compiled.manifest.reuse;
      assert.equal(await artifacts.unchanged(compiled), false, 'old manifests compile normally');
      compiled.manifest.reuse = evidence;
    } finally {
      if (priorEnv === undefined) delete process.env.VITE_PANEON_REUSE_TEST;
      else process.env.VITE_PANEON_REUSE_TEST = priorEnv;
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test(
  'watch reload preserves an execution started while its resource acquisition was pending',
  { timeout: 60000 },
  async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'paneon-watch-wake-race-')));
    const entry = join(root, 'panel.tsx');
    const dependency = join(root, 'value.ts');
    const home = join(root, 'data');
    writeFileSync(dependency, "export const value='before';");
    writeFileSync(entry, source(join(root, 'boots'), "import{value}from'./value';", 'value'));
    let runtime = new Runtime(home, logger);
    let release = () => {};
    let reloading: Promise<void> | undefined;
    try {
      const panel = await runtime.run(entry, root, {}, true);
      await runtime.stop();
      runtime = new Runtime(home, logger);
      const resources = runtime as unknown as { residents: ResourcePool; sources: SourceWatcher };
      let onChange: (() => Promise<void>) | undefined;
      // Drive the real runtime callback directly so the ordering does not depend
      // on filesystem notifications or watcher startup timing.
      resources.sources.subscribe = (_inputs, callback) => {
        onChange = callback;
        return Promise.resolve({ update: () => Promise.resolve(), close: () => Promise.resolve() });
      };
      await runtime.observe(panel.instanceId);
      assert.equal(runtime.live.get(panel.instanceId)?.execution, undefined);
      assert.ok(onChange);

      let acquired = () => {};
      const waiting = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const acquire = resources.residents.acquire.bind(resources.residents);
      let pauseNext = true;
      resources.residents.acquire = async (...args) => {
        const pause = pauseNext;
        pauseNext = false;
        const lease = await acquire(...args);
        if (pause) {
          acquired();
          await gate;
        }
        return lease;
      };

      reloading = onChange();
      await waiting;
      assert.deepEqual(
        await runtime.invoke(panel.instanceId, panel.revision, 'panel.tsx#read', {}),
        { count: 1, value: 'before', boot: true },
      );
      const previous = runtime.live.get(panel.instanceId)?.execution;
      assert.ok(previous?.alive);
      writeFileSync(dependency, "export const value='after';");
      release();
      await reloading;

      const replacement = runtime.live.get(panel.instanceId)?.execution;
      assert.ok(replacement?.alive, 'watch reload must replace the execution it stopped');
      assert.notEqual(replacement.child.pid, previous.child.pid);
      assert.equal(previous.alive, false);
      const current = runtime.inspect(panel.instanceId);
      assert.notEqual(current.revision, panel.revision);
      assert.deepEqual(
        await runtime.invoke(panel.instanceId, current.revision, 'panel.tsx#read', {}),
        { count: 1, value: 'after', boot: true },
      );
    } finally {
      release();
      await reloading;
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test(
  'package and resolution changes miss automatic reuse, and damaged outputs are rebuilt',
  { timeout: 90000 },
  async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'paneon-watch-misses-')));
    const pkg = join(root, 'node_modules/cache-fixture');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(pkg, 'package.json'),
      JSON.stringify({
        name: 'cache-fixture',
        version: '1.0.0',
        type: 'module',
        main: 'index.js',
        types: 'index.d.ts',
      }),
    );
    writeFileSync(join(pkg, 'index.js'), "export const value='package-before';");
    writeFileSync(join(pkg, 'index.d.ts'), 'export declare const value:string;');
    writeFileSync(join(root, 'value.tsx'), "export const value='local-before';");
    const entry = join(root, 'panel.tsx');
    const text = source(
      join(root, 'boots'),
      "import{value as local}from'./value';import{value as external}from'cache-fixture';",
      'local+external',
    );
    writeFileSync(entry, text);
    const runtime = new Runtime(join(root, 'data'), logger, { maxPanels: 1 });
    try {
      const panel = await runtime.run(entry, root, {}, true);
      const other = await runtime.run(entry, root, {}, false);
      await runtime.observe(panel.instanceId);
      await runtime.invoke(panel.instanceId, panel.revision, 'panel.tsx#read', {});
      const first = runtime.live.get(panel.instanceId)?.execution?.child.pid;
      const initialRevision = panel.revision;
      writeFileSync(join(pkg, 'index.js'), "export const value='package-after';");
      writeFileSync(entry, text);
      await until(() => {
        const execution = runtime.live.get(panel.instanceId)?.execution;
        return Boolean(execution?.alive && execution.child.pid !== first);
      });
      assert.equal(runtime.inspect(panel.instanceId).revision, initialRevision);
      assert.deepEqual(
        await runtime.invoke(panel.instanceId, initialRevision, 'panel.tsx#read', {}),
        { count: 1, value: 'local-beforepackage-after', boot: true },
      );
      await runtime.invoke(other.instanceId, other.revision, 'panel.tsx#read', {});
      const beforeWake = readFileSync(join(root, 'boots'), 'utf8');
      await runtime.observe(panel.instanceId);
      assert.equal(
        readFileSync(join(root, 'boots'), 'utf8'),
        beforeWake,
        'same-revision rebuild must replace cached manifest evidence before the next cold wake',
      );
      await runtime.invoke(panel.instanceId, initialRevision, 'panel.tsx#read', {});

      writeFileSync(join(root, 'value.ts'), "export const value='local-after';");
      await delay(200);
      writeFileSync(entry, text);
      await until(() => runtime.inspect(panel.instanceId).revision !== initialRevision);
      const current = runtime.inspect(panel.instanceId);
      assert.deepEqual(
        await runtime.invoke(panel.instanceId, current.revision, 'panel.tsx#read', {}),
        { count: 1, value: 'local-afterpackage-after', boot: true },
      );

      const live = runtime.live.get(panel.instanceId);
      assert.ok(live?.execution);
      const previousPid = live.execution.child.pid;
      writeFileSync(
        join(live.compiled.directory, live.compiled.manifest.serverEntry),
        'damaged output',
      );
      await delay(200);
      writeFileSync(entry, text);
      await until(() => {
        const execution = runtime.live.get(panel.instanceId)?.execution;
        return Boolean(execution?.alive && execution.child.pid !== previousPid);
      });
      assert.deepEqual(
        await runtime.invoke(panel.instanceId, current.revision, 'panel.tsx#read', {}),
        { count: 1, value: 'local-afterpackage-after', boot: true },
      );
    } finally {
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test(
  'cold watch recovery clears a stale diagnostic without metadata evaluation',
  { timeout: 90000 },
  async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'paneon-watch-cold-error-')));
    const entry = join(root, 'panel.tsx');
    const marker = join(root, 'boots');
    const text = source(marker);
    const home = join(root, 'data');
    writeFileSync(entry, text);
    let runtime = new Runtime(home, logger);
    try {
      const panel = await runtime.run(entry, root, {}, true);
      const boots = readFileSync(marker, 'utf8');
      await runtime.stop();
      writeFileSync(entry, text + '\nconst invalid = ;');
      runtime = new Runtime(home, logger);
      await runtime.restore();
      await assert.rejects(runtime.observe(panel.instanceId), { code: 'BUILD_FAILED' });
      assert.equal(runtime.inspect(panel.instanceId).diagnostic?.code, 'BUILD_FAILED');
      await runtime.stop();
      writeFileSync(entry, text);
      runtime = new Runtime(home, logger);
      await runtime.restore();
      await runtime.observe(panel.instanceId);
      assert.equal(runtime.inspect(panel.instanceId).diagnostic, undefined);
      assert.equal(runtime.resourceUsage.workers, 0);
      assert.equal(readFileSync(marker, 'utf8'), boots);
      await runtime.stop();
      writeFileSync(entry, text + '\nconst invalid = ;');
      runtime = new Runtime(home, logger);
      await assert.rejects(runtime.reload(panel.instanceId), { code: 'BUILD_FAILED' });
      assert.equal(
        runtime.resourceUsage.watchers,
        1,
        'a forced cold reload must retain a usable source watcher on failure',
      );
      writeFileSync(entry, text);
      await until(() => !runtime.inspect(panel.instanceId).diagnostic);
      await runtime.stop();
      const manifestFile = join(
        home,
        'panels',
        panel.instanceId,
        panel.revision.replace(':', '-'),
        'manifest.json',
      );
      writeFileSync(manifestFile, '{broken');
      runtime = new Runtime(home, logger);
      await runtime.reload(panel.instanceId);
      assert.equal(runtime.inspect(panel.instanceId).diagnostic, undefined);
      assert.doesNotThrow(() => JSON.parse(readFileSync(manifestFile, 'utf8')));
    } finally {
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test(
  'a stable batch of source saves compiles once and queued watch updates reuse that build',
  { timeout: 90000 },
  async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'paneon-watch-batch-')));
    const names = ['a', 'b', 'c', 'd'];
    const marker = join(root, 'boots');
    const entry = join(root, 'panel.tsx');
    for (const name of names)
      writeFileSync(join(root, name + '.ts'), `export const value='${name}';`);
    const imports = names.map((name) => `import{value as ${name}}from'./${name}';`).join('');
    writeFileSync(entry, source(marker, imports, "[a,b,c,d].join('')"));
    const runtime = new Runtime(join(root, 'data'), logger);
    try {
      const panel = await runtime.run(entry, root, {}, true);
      for (const name of names)
        writeFileSync(join(root, name + '.ts'), `export const value='${name.toUpperCase()}';`);
      await until(() => runtime.inspect(panel.instanceId).revision !== panel.revision);
      await delay(700);
      const current = runtime.inspect(panel.instanceId);
      assert.deepEqual(
        await runtime.invoke(panel.instanceId, current.revision, 'panel.tsx#read', {}),
        { count: 1, value: 'ABCD', boot: true },
      );
      assert.equal(
        readFileSync(marker, 'utf8').match(/boot/g)?.length,
        4,
        'one initial and one changed metadata/execution pair',
      );
      assert.equal(runtime.resourceUsage.compiling, 0);
    } finally {
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
