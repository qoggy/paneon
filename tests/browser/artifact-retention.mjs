import { PACKAGE_VERSION } from '../../dist/shared/paths.js';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, access, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { startServer } from '../../dist/runtime/server.js';

const root = await mkdtemp(join(tmpdir(), 'paneon-browser-retention-'));
const home = join(root, 'data'),
  entry = join(root, 'panel.tsx');
await mkdir(home);
await writeFile(join(home, 'config.json'), JSON.stringify({ server: { port: 0 } }));
const source = (label) =>
  `import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';import{useState}from'react';export const read=serverAction({input:z.object({}),handler:async()=>({text:${JSON.stringify(label)}})});function Panel(){const[result,setResult]=useState('idle');return <div><h1>${label}</h1><button onClick={()=>void read({}).then(r=>setResult(r.text))}>Read</button><output>{result}</output></div>}export default definePanel({id:'retention-browser',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),events:{done:z.object({text:z.string()})},render:Panel});`;
const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};
let service, browser;
try {
  await writeFile(entry, source('Before'));
  service = await startServer(home);
  const panel = await service.runtime.run(entry, root, {}, false);
  const original = service.runtime.artifact(panel.instanceId, panel.revision).directory;
  const event = await service.runtime.append(panel.instanceId, panel.revision, 'done', {
    text: 'history',
  });
  await service.stop();
  const orphan = 'instance-' + randomUUID(),
    orphanRoot = join(home, 'panels', orphan, 'sha256-' + 'f'.repeat(64));
  await mkdir(orphanRoot, { recursive: true });
  await writeFile(join(orphanRoot, 'leftover'), 'data');
  service = await startServer(home);
  await service.runtime.collectArtifacts();
  assert.equal(await exists(orphanRoot), false);
  assert.equal(service.runtime.resourceUsage.workers, 0);
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  let frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'Before', exact: true }).waitFor();
  await frame.getByRole('button', { name: 'Read', exact: true }).click();
  await frame.locator('output').filter({ hasText: 'Before' }).waitFor();
  await writeFile(entry, source('After'));
  const next = await service.runtime.reload(panel.instanceId);
  await page.reload();
  frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'After', exact: true }).waitFor();
  await frame.getByRole('button', { name: 'Read', exact: true }).click();
  await frame.locator('output').filter({ hasText: 'After' }).waitFor();
  assert.equal(await exists(original), false);
  assert.deepEqual(await readdir(join(home, 'panels', panel.instanceId)), [
    next.revision.replace(':', '-'),
  ]);
  const headers = {
    host: `127.0.0.1:${service.descriptor.port}`,
    authorization: 'Bearer ' + service.descriptor.controlToken,
  };
  assert.equal(
    (
      await service.app.inject({
        url: `/panels/${panel.instanceId}/${panel.revision}/frame.html`,
        headers,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await service.app.inject({
        url: `/panels/${panel.instanceId}/${next.revision}/frame.html`,
        headers,
      })
    ).statusCode,
    200,
  );
  await service.runtime.closePanel(panel.instanceId);
  assert.equal(await exists(join(home, 'panels', panel.instanceId)), false);
  const history = await service.app.inject({
    url: `/api/panels/${panel.instanceId}/events?consumer=browser-retention`,
    headers,
  });
  assert.equal(history.statusCode, 200);
  assert.equal(history.json().data.events[0].id, event.id);
  service.runtime.store.ack(panel.instanceId, 'browser-retention', event.id);
  assert.equal(
    (await service.runtime.events(panel.instanceId, 'browser-retention', 100, 0)).events.length,
    0,
  );
  assert.equal(service.runtime.inspect(panel.instanceId).manifest, undefined);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        ok: true,
        evidence: [
          'Startup sweep removes orphan output without starting workers.',
          'Cold browser page renders and calls its saved action.',
          'Reload serves the new page/action and deletes old output.',
          'Close deletes output and preserves HTTP event reads and acknowledgement.',
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
