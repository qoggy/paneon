import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startServer } from '../../dist/runtime/server.js';

const root = await mkdtemp(join(tmpdir(), 'paneon-production-runtime-'));
const previousEnv = process.env.NODE_ENV;
let service;
let browser;
const source = (heading, range = '0.0.0') => `
import {definePanel,serverAction,z} from 'paneon/sdk';
import {Checkbox} from 'paneon/ui';
export const environment=serverAction({kind:'query',input:z.object({}),handler:async()=>({nodeEnv:process.env.NODE_ENV??'unset'})});
function Panel(){return <><h1>${heading}</h1><Checkbox aria-label="Include details" /></>}
export default definePanel({id:'production-test',requires:{paneon:'${range}'},input:z.object({}),events:{},render:Panel});`;
async function until(condition, description) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await delay(50);
  }
  throw new Error(description);
}
try {
  delete process.env.NODE_ENV;
  service = await startServer(join(root, 'data'));
  const firstEntry = join(root, 'first.tsx');
  const secondEntry = join(root, 'second.tsx');
  await writeFile(firstEntry, source('First panel'));
  const first = await service.runtime.run(firstEntry, root, {}, true);
  assert.equal(
    process.env.NODE_ENV,
    'development',
    'The Vite watcher must reproduce the inherited development environment.',
  );
  await writeFile(secondEntry, source('Second panel'));
  const second = await service.runtime.run(secondEntry, root, {}, true);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const errors = [];
  const firstPage = await browser.newPage();
  const secondPage = await browser.newPage();
  for (const page of [firstPage, secondPage])
    page.on('pageerror', (error) => errors.push(error.message));
  const url = (panel) => `http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`;
  await firstPage.goto(url(first));
  await firstPage
    .frameLocator('iframe')
    .getByRole('heading', { name: 'First panel', exact: true })
    .waitFor();
  await secondPage.goto(url(second));
  const frame = secondPage.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'Second panel', exact: true }).waitFor();
  const checkbox = frame.getByRole('checkbox', { name: 'Include details', exact: true });
  await checkbox.check();
  assert.equal(await checkbox.isChecked(), true);
  const original = second.revision;
  await writeFile(secondEntry, source('Reloaded second panel', '>=99.0.0'));
  await until(
    () =>
      service.runtime.inspect(second.instanceId).diagnostic?.code === 'PANEON_VERSION_UNSUPPORTED',
    'The invalid update did not produce its diagnostic.',
  );
  await frame.getByRole('heading', { name: 'Second panel', exact: true }).waitFor();
  await writeFile(secondEntry, source('Reloaded second panel'));
  await frame
    .getByRole('heading', { name: 'Reloaded second panel', exact: true })
    .waitFor({ timeout: 60000 });
  const updated = service.runtime.inspect(second.instanceId);
  assert.notEqual(updated.revision, original);
  assert.equal(updated.diagnostic, undefined);
  assert.deepEqual(
    await service.runtime.invoke(second.instanceId, updated.revision, 'second.tsx#environment', {}),
    { nodeEnv: 'development' },
    'Production browser compilation must preserve the author action runtime environment.',
  );
  await service.runtime.reload(second.instanceId);
  await frame.getByRole('heading', { name: 'Reloaded second panel', exact: true }).waitFor();
  await checkbox.check();
  assert.equal(await checkbox.isChecked(), true);
  assert.deepEqual(
    errors,
    [],
    'All initial, second-panel and refreshed frames must execute without browser errors, including external React require calls.',
  );
  console.log(
    'Production panels render and Base UI controls remain interactive after watch changes NODE_ENV, second panel creation, invalid-source recovery and reload; action NODE_ENV is preserved.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  if (previousEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnv;
  await rm(root, { recursive: true, force: true });
}
