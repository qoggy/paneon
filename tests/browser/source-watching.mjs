import { PACKAGE_VERSION } from '../../dist/shared/paths.js';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, writeFile, readFile, unlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startServer } from '../../dist/runtime/server.js';

const root = await realpath(await mkdtemp(join(tmpdir(), 'paneon-source-browser-'))),
  home = join(root, 'data'),
  dir = join(root, 'panel');
await mkdir(home);
await mkdir(dir);
await writeFile(join(home, 'config.json'), JSON.stringify({ server: { port: 0 } }));
const entry = join(dir, 'panel.tsx'),
  env = join(dir, '.env'),
  production = join(dir, '.env.production'),
  shared = join(root, 'shared.ts');
const source = (
  specifier = '../shared',
) => `import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';import{Button,Checkbox,CodeBlock,Markdown}from'@qoggy/paneon/ui';import{useState}from'react';import{value}from'${specifier}';
export const read=serverAction({kind:'query',input:z.object({}),handler:()=>({value})});
function Panel(){const[draft,setDraft]=useState('');return <><h1>Source watching acceptance</h1><p data-testid="value">{value}</p><p data-testid="env">{import.meta.env.VITE_SOURCE_LABEL??'absent'}</p><input aria-label="Draft" value={draft} onChange={e=>setDraft(e.target.value)}/><Checkbox aria-label="Enabled"/><Button onClick={()=>setDraft('clicked')}>Interact</Button><CodeBlock language="typescript" code={'const example = 42;'} /><Markdown>{'**Local Markdown**'}</Markdown></>}
export default definePanel({id:'source-watching',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:Panel});`;
await writeFile(shared, `export const value='outside-one';`);
await writeFile(env, 'VITE_SOURCE_LABEL=one');
await writeFile(entry, source());
let service, browser;
async function until(check, message) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(30);
  }
  throw new Error(message);
}
try {
  service = await startServer(home);
  const panel = await service.runtime.run(entry, dir, {}, true),
    id = panel.instanceId;
  const bytes = (
    await Promise.all(
      service.runtime
        .manifest(id)
        .assets.map(
          async (name) =>
            (await readFile(join(service.runtime.live.get(id).compiled.directory, 'client', name)))
              .length,
        ),
    )
  ).reduce((a, b) => a + b, 0);
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  const errors = [],
    failed = [],
    external = [];
  const origin = 'http://127.0.0.1:' + service.descriptor.port;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(r.url());
  });
  page.on('request', (r) => {
    if (r.url().startsWith('http') && !r.url().startsWith(origin + '/')) external.push(r.url());
  });
  await page.goto(origin + '/panels/' + id);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'Source watching acceptance' }).waitFor();
  await frame.getByTestId('env').getByText('one', { exact: true }).waitFor();
  await frame.getByRole('checkbox', { name: 'Enabled' }).check();
  await frame.getByRole('button', { name: 'Interact', exact: true }).click();
  assert.equal(await frame.getByRole('textbox', { name: 'Draft' }).inputValue(), 'clicked');
  await frame.getByText('Local Markdown', { exact: true }).waitFor();
  await until(
    async () => (await frame.locator('pre [data-shiki-token]').count()) > 0,
    'Code highlighting must work from the built UI package',
  );
  const originalChild = service.runtime.live.get(id).execution.child,
    originalRevision = service.runtime.store.get(id).revision;
  let settled = false;
  const onState = (changed, state) => {
    if (changed === id && !state.building) settled = true;
  };
  service.runtime.on('state', onState);
  await writeFile(entry, await readFile(entry));
  await until(() => settled, 'Unchanged watch must settle');
  service.runtime.off('state', onState);
  assert.equal(service.runtime.live.get(id).execution.child, originalChild);
  assert.equal(service.runtime.store.get(id).revision, originalRevision);
  assert.equal(await frame.getByRole('textbox', { name: 'Draft' }).inputValue(), 'clicked');
  await writeFile(production, 'VITE_SOURCE_LABEL=production');
  await frame.getByTestId('env').getByText('production', { exact: true }).waitFor();
  assert.notEqual(service.runtime.store.get(id).revision, originalRevision);
  await unlink(production);
  await frame.getByTestId('env').getByText('one', { exact: true }).waitFor();
  await writeFile(env, 'VITE_SOURCE_LABEL=two');
  try {
    await frame.getByTestId('env').getByText('two', { exact: true }).waitFor();
  } catch (error) {
    console.error(
      JSON.stringify({
        panel: service.runtime.store.get(id),
        watched: await service.runtime.sources.getWatched(),
        body: await frame.locator('body').textContent(),
        pageErrors: errors,
        failed,
      }),
    );
    console.error(await readFile(service.descriptor.logging.currentFile, 'utf8'));
    throw error;
  }
  await writeFile(shared, `export const value='outside-after-env';`);
  await frame.getByTestId('value').getByText('outside-after-env', { exact: true }).waitFor();
  await writeFile(join(dir, 'new.ts'), `export const value:string=123;`);
  await writeFile(entry, source('./new'));
  await until(
    () => Boolean(service.runtime.store.get(id).diagnostic),
    'Invalid new import must show a diagnostic',
  );
  await writeFile(join(dir, 'new.ts'), `export const value='fixed-new-import';`);
  await frame.getByTestId('value').getByText('fixed-new-import', { exact: true }).waitFor();
  assert.equal(service.runtime.store.get(id).diagnostic, undefined);
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  assert.deepEqual(external, []);
  console.log(
    JSON.stringify({
      clientBytes: bytes,
      checks:
        'Built UI controls/highlighting/Markdown, unchanged drafts and worker, env add/delete/change, outside dependency and failed-new-import browser recovery passed.',
    }),
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
