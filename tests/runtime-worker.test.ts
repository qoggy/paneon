import { PACKAGE_VERSION } from '../dist/shared/paths.js';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import { mkdtempSync, realpathSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const { Runtime } = (await import(
  '../dist/runtime/' + 'lifecycle.js'
)) as typeof import('../src/runtime/lifecycle.js');

void test('worker loads encoded file paths and runs actions/events without filesystem watchers', async () => {
  const root = mkdtempSync(join(tmpdir(), 'paneon-native-worker-'));
  const serverFile = join(root, 'server #?%.js');
  const sdkUrl = new URL('../dist/sdk/server.js', import.meta.url).href;
  writeFileSync(
    serverFile,
    `import{definePanel,serverAction,z}from ${JSON.stringify(sdkUrl)};import{fileURLToPath}from'node:url';
export const read=serverAction({input:z.object({}),handler:async()=>{
const{basename}=await import('node:path');return{cwd:process.cwd(),file:basename(fileURLToPath(import.meta.url)),
watchers:process.getActiveResourcesInfo().filter(type=>/FSEvent|FSWatcher/.test(type))};}});
export const __paneonActions={'panel.tsx#read':read};
export default definePanel({id:'native',input:z.object({}),events:{done:z.object({text:z.string()})},render(){}});`,
  );
  const worker = fork(new URL('../dist/runtime/worker.js', import.meta.url), [], {
    cwd: root,
    execArgv: [],
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  async function request(message: Record<string, unknown>) {
    const reply = once(worker, 'message', { signal: AbortSignal.timeout(15000) });
    worker.send(message);
    const [result] = (await reply) as unknown[];
    return result as { kind: string; data: unknown; error?: { code: string } };
  }
  try {
    const ready = await request({ kind: 'init', serverFile, actions: [], params: {} });
    assert.equal(ready.kind, 'ready');
    const result = await request({
      kind: 'invoke',
      requestId: 'action',
      actionId: 'panel.tsx#read',
      input: {},
    });
    assert.equal(result.error, undefined);
    assert.deepEqual(result.data, {
      cwd: realpathSync(root),
      file: 'server #?%.js',
      watchers: [],
    });
    const event = await request({
      kind: 'validate-event',
      requestId: 'event',
      type: 'done',
      payload: { text: '中文', extra: 'stripped' },
    });
    assert.equal(event.error, undefined);
    assert.deepEqual(event.data, { text: '中文' });
    const invalid = await request({
      kind: 'invoke',
      requestId: 'invalid',
      actionId: 'panel.tsx#read',
      input: null,
    });
    assert.equal(invalid.error?.code, 'INPUT_VALIDATION_FAILED');
  } finally {
    if (worker.exitCode === null && worker.signalCode === null) {
      const exited = once(worker, 'exit');
      worker.kill('SIGKILL');
      await exited;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

void test('reload of an unchanged bundle replaces the process and resets its module state', async () => {
  const root = mkdtempSync(join(tmpdir(), 'paneon-native-reload-'));
  const entry = join(root, 'panel.tsx');
  writeFileSync(
    entry,
    `import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';const state={count:0};
export const read=serverAction({input:z.object({}),handler:async()=>({count:++state.count})});
function Panel(){return <div>Reload</div>}
export default definePanel({id:'reload',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:Panel});`,
  );
  const runtime = new Runtime(join(root, 'data'));
  try {
    const panel = await runtime.run(entry, root, {}, false);
    const invoke = () => runtime.invoke(panel.instanceId, panel.revision, 'panel.tsx#read', {});
    const originalLive = runtime.live.get(panel.instanceId);
    assert.ok(originalLive);
    assert.ok(originalLive.execution);
    const previous = originalLive.execution.child;
    assert.deepEqual(await invoke(), { count: 1 });
    assert.deepEqual(await invoke(), { count: 2 });
    const reloaded = await runtime.reload(panel.instanceId);
    assert.equal(reloaded.revision, panel.revision);
    const currentLive = runtime.live.get(panel.instanceId);
    assert.ok(currentLive);
    assert.ok(currentLive.execution);
    assert.notEqual(currentLive.execution.child.pid, previous.pid);
    assert.notEqual(previous.exitCode ?? previous.signalCode, null);
    assert.deepEqual(await invoke(), { count: 1 });
  } finally {
    await runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('execution and metadata workers exit on disconnect despite author timers', async () => {
  const root = mkdtempSync(join(tmpdir(), 'paneon-disconnected-worker-'));
  const serverFile = join(root, 'timer.mjs');
  const workerFile = new URL('../dist/runtime/worker.js', import.meta.url);
  const sdk = new URL('../dist/sdk/server.js', import.meta.url).href;
  const aborted = join(root, 'aborted');
  writeFileSync(
    serverFile,
    `import{definePanel,serverAction,z}from ${JSON.stringify(sdk)};import{writeFileSync}from'node:fs';setInterval(()=>{},1000);export const read=serverAction({input:z.object({}),handler:async(ctx)=>new Promise(resolve=>ctx.signal.addEventListener('abort',()=>{writeFileSync(${JSON.stringify(aborted)},'yes');resolve({aborted:true})},{once:true}))});export const __paneonActions={read};export default definePanel({id:'disconnect',input:z.object({}),render(){}});`,
  );
  try {
    for (const inspect of [false, true]) {
      const worker = fork(workerFile, [], {
        execArgv: [],
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      try {
        const ready = once(worker, 'message', { signal: AbortSignal.timeout(5000) });
        worker.send({ kind: 'init', serverFile, actions: [], params: {}, inspect });
        const [message] = (await ready) as unknown as [{ kind: string }];
        assert.equal(message.kind, 'ready');
        if (!inspect) {
          worker.send({ kind: 'invoke', requestId: 'pending', actionId: 'read', input: {} });
          await delay(50);
        }
        const exit = once(worker, 'exit', { signal: AbortSignal.timeout(5000) });
        worker.disconnect();
        const [code, signal] = (await exit) as unknown as [number | null, NodeJS.Signals | null];
        assert.equal(code, 0);
        assert.equal(signal, null);
        if (!inspect) assert.equal(readFileSync(aborted, 'utf8'), 'yes');
      } finally {
        if (worker.exitCode === null && worker.signalCode === null) {
          const stopped = once(worker, 'exit');
          worker.kill('SIGKILL');
          await stopped;
        }
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('metadata worker exits when its controller is killed without exit handlers', async () => {
  const root = mkdtempSync(join(tmpdir(), 'paneon-killed-controller-'));
  const serverFile = join(root, 'metadata.mjs'),
    controllerFile = join(root, 'controller.mjs');
  const workerUrl = new URL('../dist/runtime/worker.js', import.meta.url).href;
  const sdk = new URL('../dist/sdk/server.js', import.meta.url).href;
  writeFileSync(
    serverFile,
    `import{definePanel,z}from ${JSON.stringify(sdk)};setInterval(()=>{},1000);export default definePanel({id:'metadata',input:z.object({}),render(){}});`,
  );
  writeFileSync(
    controllerFile,
    `import{fork}from'node:child_process';const worker=fork(new URL(${JSON.stringify(workerUrl)}),[],{execArgv:[],stdio:['ignore','ignore','ignore','ipc']});worker.on('message',m=>{if(m.kind==='ready')process.send({pid:worker.pid});});worker.send({kind:'init',serverFile:${JSON.stringify(serverFile)},actions:[],inspect:true});`,
  );
  const controller = fork(controllerFile, [], {
    execArgv: [],
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  let metadataPid: number | undefined;
  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
      throw error;
    }
  };
  try {
    const [message] = (await once(controller, 'message', {
      signal: AbortSignal.timeout(5000),
    })) as unknown as [{ pid: number }];
    metadataPid = message.pid;
    assert.ok(metadataPid);
    const exited = once(controller, 'exit');
    controller.kill('SIGKILL');
    await exited;
    const deadline = Date.now() + 5000;
    while (alive(metadataPid) && Date.now() < deadline) await delay(20);
    assert.equal(alive(metadataPid), false, 'metadata survived controller death');
  } finally {
    if (controller.exitCode === null && controller.signalCode === null) {
      const exited = once(controller, 'exit');
      controller.kill('SIGKILL');
      await exited;
    }
    if (metadataPid && alive(metadataPid)) process.kill(metadataPid, 'SIGKILL');
    rmSync(root, { recursive: true, force: true });
  }
});
