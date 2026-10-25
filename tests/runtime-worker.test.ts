import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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
    `import{definePanel,serverAction,z}from'paneon/sdk';const state={count:0};
export const read=serverAction({input:z.object({}),handler:async()=>({count:++state.count})});
function Panel(){return <div>Reload</div>}
export default definePanel({id:'reload',requires:{paneon:'0.0.0'},input:z.object({}),render:Panel});`,
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
