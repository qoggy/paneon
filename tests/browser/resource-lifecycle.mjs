import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startServer } from '../../dist/runtime/server.js';

const root = await mkdtemp(join(tmpdir(), 'paneon-browser-lru-'));
const home = join(root, 'data');
const entry = join(root, 'panel.tsx');
await mkdir(home);
await writeFile(join(home, 'config.json'), JSON.stringify({ server: { port: 0 } }));
await writeFile(
  entry,
  `import{useState}from'react';import{definePanel,serverAction,z}from'paneon/sdk';
const state={count:0};export const read=serverAction({input:z.object({}),handler:async()=>({count:++state.count,pid:process.pid})});
function Panel(){const[result,setResult]=useState<{count:number;pid:number}|null>(null);return <div><h1>Cold lifecycle</h1><input aria-label="Draft"/><button onClick={()=>void read({}).then(setResult)}>Read</button><output aria-label="Action result">{result?result.count+':'+result.pid:'idle'}</output></div>}
export default definePanel({id:'cold-lifecycle',requires:{paneon:'0.0.0'},input:z.object({}),events:{done:z.object({text:z.string()})},render:Panel});`,
);
let service;
let browser;
async function until(check) {
  const deadline = Date.now() + 15000;
  while (!(await check()) && Date.now() < deadline) await delay(25);
  assert.equal(await check(), true);
}
try {
  service = await startServer(home);
  const panel = await service.runtime.run(entry, root, {}, true);
  const stored = service.runtime.store.get(panel.instanceId);
  service.runtime.store.append(panel.instanceId, panel.revision, 'done', { text: 'history' });
  await service.stop();
  service = await startServer(home);
  assert.equal(service.runtime.resourceUsage.residentPanels, 0);
  const headers = {
    host: `127.0.0.1:${service.descriptor.port}`,
    authorization: 'Bearer ' + service.descriptor.controlToken,
  };
  const asset = await service.app.inject({
    method: 'GET',
    url: `/panels/${panel.instanceId}/${panel.revision}/frame.html`,
    headers,
  });
  assert.equal(asset.statusCode, 200);
  assert.equal(service.runtime.resourceUsage.residentPanels, 0);
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'Cold lifecycle' }).waitFor();
  await until(() => service.runtime.resourceUsage.watchers === 1);
  assert.equal(service.runtime.resourceUsage.workers, 0);
  await frame.getByLabel('Draft').fill('keep this draft');
  await frame.getByRole('button', { name: 'Read', exact: true }).click();
  await until(async () => (await frame.getByLabel('Action result').textContent()).startsWith('1:'));
  const originalResult = await frame.getByLabel('Action result').textContent();
  const originalChild = service.runtime.live.get(panel.instanceId).execution.child;
  let watchFinished = false;
  const watched = (id, state) => {
    if (id === panel.instanceId && !state.building) watchFinished = true;
  };
  service.runtime.on('state', watched);
  await writeFile(entry, await readFile(entry));
  await until(() => watchFinished);
  service.runtime.off('state', watched);
  assert.equal(service.runtime.live.get(panel.instanceId).execution.child, originalChild);
  assert.equal(await frame.getByLabel('Draft').inputValue(), 'keep this draft');
  assert.equal(await frame.getByLabel('Action result').textContent(), originalResult);
  let maximumWorkers = service.runtime.resourceUsage.workers;
  for (let index = 0; index < 10; index++) {
    const id = 'cold-clone-' + index;
    await cp(join(home, 'panels', panel.instanceId), join(home, 'panels', id), { recursive: true });
    service.runtime.store.save({ ...stored, instanceId: id });
    await service.runtime.invoke(id, panel.revision, 'panel.tsx#read', {});
    maximumWorkers = Math.max(maximumWorkers, service.runtime.resourceUsage.workers);
    assert.ok(service.runtime.resourceUsage.residentPanels <= 10);
    assert.ok(service.runtime.resourceUsage.watchers <= 10);
  }
  assert.equal(
    service.runtime.live.has(panel.instanceId),
    false,
    'open WebSocket must not pin the oldest idle panel',
  );
  assert.equal(await frame.getByLabel('Draft').inputValue(), 'keep this draft');
  assert.equal(await frame.getByLabel('Action result').textContent(), originalResult);
  const events = await service.app.inject({
    method: 'GET',
    url: `/api/panels/${panel.instanceId}/events?consumer=browser-test`,
    headers,
  });
  assert.equal(events.statusCode, 200);
  assert.equal(events.json().data.events.length, 1);
  assert.equal(service.runtime.live.has(panel.instanceId), false);
  await frame.getByRole('button', { name: 'Read', exact: true }).click();
  await until(
    async () => (await frame.getByLabel('Action result').textContent()) !== originalResult,
  );
  assert.ok((await frame.getByLabel('Action result').textContent()).startsWith('1:'));
  assert.equal(await frame.getByLabel('Draft').inputValue(), 'keep this draft');
  assert.ok(maximumWorkers <= 10);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        ok: true,
        maximumWorkers,
        evidence: [
          'Restart restores no historical worker or watcher; direct static assets need no residency.',
          'A real Chrome page attaches bounded watch without an execution child.',
          'An unchanged watched save preserves the worker, browser draft and displayed result.',
          'An open state socket does not pin idle execution; ten other panels evict it.',
          'Draft and displayed result survive eviction; historical events do not wake execution.',
          'The next click restores execution with reset module state and keeps the browser draft.',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
