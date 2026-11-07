import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { PANEL_IFRAME_ALLOW, PANEL_IFRAME_SANDBOX } from '../../src/shared/browser-actions.ts';
import { PACKAGE_VERSION } from '../../dist/shared/paths.js';
import { startServer } from '../runtime-fixture.ts';

const root = await mkdtemp(join(tmpdir(), 'paneon-browser-permissions-'));
let service, browser;
try {
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    `import {useState} from 'react';
import {agent,definePanel,serverAction,z} from '@qoggy/paneon/sdk';
export const echo=serverAction({input:z.object({text:z.string()}),handler:async(_ctx,{text})=>({text})});
function Panel(){
  const [stored,setStored]=useState(()=>localStorage.getItem('browser-permissions-test')??'empty');
  const [status,setStatus]=useState('');
  return <div>
    <h1>Browser permissions</h1>
    <output aria-label="Stored">{stored}</output>
    <output aria-label="Status">{status}</output>
    <button onClick={async()=>{await navigator.clipboard.writeText('paneon-direct-copy');setStatus('copied');}}>Copy</button>
    <button onClick={()=>{
      const url=URL.createObjectURL(new Blob(['{"downloaded":true}'],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='panel.json';
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }}>Download</button>
    <button onClick={()=>{localStorage.setItem('browser-permissions-test','saved');setStored('saved');}}>Save</button>
    <button onClick={()=>window.open('/?panel-popup=1','_blank')}>Popup</button>
    <button onClick={()=>window.top?.location.assign('/?panel-top=1')}>Navigate</button>
    <button onClick={async()=>{
      const result=await echo({text:'action works'});
      const {id}=await agent.emit('browser-permissions',{text:result.text});
      setStatus(result.text+':'+id);
    }}>Bridge</button>
  </div>;
}
export default definePanel({id:'browser-permissions',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:Panel});`,
  );
  service = await startServer(join(root, 'data'));
  const panel = await service.runtime.run(entry, root, {}, false);
  const origin = `http://127.0.0.1:${service.descriptor.port}`;
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'Browser permissions' }).waitFor();
  assert.equal(await page.locator('iframe').getAttribute('sandbox'), PANEL_IFRAME_SANDBOX);
  assert.equal(await page.locator('iframe').getAttribute('allow'), PANEL_IFRAME_ALLOW);

  await frame.getByRole('button', { name: 'Copy', exact: true }).click();
  await frame.getByLabel('Status').filter({ hasText: 'copied' }).waitFor();
  await context.grantPermissions(['clipboard-read'], { origin });
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'paneon-direct-copy');

  const downloading = page.waitForEvent('download');
  await frame.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloading;
  assert.equal(download.suggestedFilename(), 'panel.json');
  assert.equal(await readFile(await download.path(), 'utf8'), '{"downloaded":true}');

  assert.equal(await frame.getByLabel('Stored').textContent(), 'empty');
  await frame.getByRole('button', { name: 'Save', exact: true }).click();
  await page.reload();
  await frame.getByRole('heading', { name: 'Browser permissions' }).waitFor();
  assert.equal(await frame.getByLabel('Stored').textContent(), 'saved');
  const secondPanel = await service.runtime.run(entry, root, {}, false);
  const secondPage = await context.newPage();
  await secondPage.goto(`${origin}/panels/${secondPanel.instanceId}`);
  const secondFrame = secondPage.frameLocator('iframe');
  await secondFrame.getByRole('heading', { name: 'Browser permissions' }).waitFor();
  assert.equal(await secondFrame.getByLabel('Stored').textContent(), 'saved');
  await secondPage.close();
  await page.bringToFront();

  await frame.getByRole('button', { name: 'Bridge', exact: true }).click();
  await frame
    .getByLabel('Status')
    .filter({ hasText: /^action works:\d+$/ })
    .waitFor();
  const events = await service.runtime.events(panel.instanceId, 'browser', 100, 0);
  assert.equal(events.events.length, 1);
  assert.deepEqual(events.events[0].payload, { text: 'action works' });

  const opening = page.waitForEvent('popup');
  await frame.getByRole('button', { name: 'Popup', exact: true }).click();
  const popup = await opening;
  await popup.waitForURL(`${origin}/?panel-popup=1`);
  await popup.getByRole('heading', { name: 'Panels', exact: true }).waitFor();
  // Escaping the sandbox also restores ordinary APIs on the opened page.
  assert.equal(
    await popup.evaluate(() => localStorage.getItem('browser-permissions-test')),
    'saved',
  );
  // Forms remain restricted in the panel, but a popup must not inherit that restriction.
  await popup.evaluate(() => {
    const form = document.createElement('form');
    form.action = '/';
    const input = document.createElement('input');
    input.name = 'popup-form';
    input.value = 'submitted';
    form.append(input);
    document.body.append(form);
    form.submit();
  });
  await popup.waitForURL(`${origin}/?popup-form=submitted`);
  await popup.close();

  await frame.getByRole('button', { name: 'Navigate', exact: true }).click();
  await page.waitForURL(`${origin}/?panel-top=1`);
  await page.getByRole('heading', { name: 'Panels', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'Direct clipboard, Blob download, persistent/shared localStorage, popup, top navigation and SDK action/event bridge pass.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
