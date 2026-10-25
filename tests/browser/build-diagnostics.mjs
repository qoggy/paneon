import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';
import { Store } from '../../dist/runtime/store.js';

const execute = promisify(execFile);
const root = await realpath(await mkdtemp(join(tmpdir(), 'paneon-build-diagnostics-browser-')));
const artifacts =
  process.env.PANEON_TEST_ARTIFACTS ??
  (await mkdtemp(join(tmpdir(), 'paneon-build-diagnostics-evidence-')));
const home = join(root, 'home');
const entry = join(root, '中文 面板.tsx');
const cli = resolve('dist/cli/index.js');
const source = (
  title,
  broken = false,
) => `import{useState}from'react';import{definePanel,z}from'paneon/sdk';
function Panel(){const [count,setCount]=useState(0);const label:string=${broken ? '42' : JSON.stringify(title)};return <><h1>{label}</h1><button onClick={()=>setCount(count+1)}>Count {count}</button></>}
export default definePanel({id:'build-diagnostics',requires:{paneon:'*'},input:z.object({}),render:Panel});`;
const evidence = [];
let service, browser;
async function command(args, sourceCli = false) {
  let result;
  try {
    result = {
      ...(await execute(
        process.execPath,
        [sourceCli ? resolve('src/cli/index.ts') : cli, ...args],
        { cwd: root, env: { ...process.env, HOME: home }, timeout: 60000 },
      )),
      status: 0,
    };
  } catch (error) {
    result = { stdout: error.stdout ?? '', stderr: error.stderr ?? '', status: error.code };
  }
  evidence.push({ args, sourceCli, ...result });
  return result;
}
try {
  await mkdir(home);
  await mkdir(artifacts, { recursive: true });
  await writeFile(entry, source('Previous working panel'));
  service = await startServer(join(home, '.paneon'));
  const panel = await service.runtime.run(entry, root, {}, false);
  const url = `http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`;
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(30000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(url);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'Previous working panel', exact: true }).waitFor();
  const oldSrc = await page.locator('iframe').getAttribute('src');
  await writeFile(entry, source('Broken panel', true));
  const ordinary = await command(['panel', 'reload', panel.instanceId]);
  assert.equal(ordinary.status, 1);
  assert.equal(ordinary.stdout, '');
  assert.match(ordinary.stderr, /not assignable/);
  assert.match(ordinary.stderr, /中文 面板.tsx:2:\d+/);
  const plain = await command(['panel', 'reload', panel.instanceId, '--json']);
  const debug = await command(['--debug', 'panel', 'reload', panel.instanceId, '--json']);
  assert.equal(plain.status, 1);
  assert.equal(debug.status, 1);
  assert.equal(plain.stderr, '');
  assert.equal(debug.stdout, plain.stdout, 'debug must not alter the failure JSON');
  assert.match(debug.stderr, /build.stage=typecheck/);
  assert.match(debug.stderr, /build.stack=/);
  const diagnostic = JSON.parse(plain.stdout).error;
  assert.equal(diagnostic.details.file, entry);
  assert.equal(diagnostic.details.line, 2);
  assert.match(diagnostic.details.frame, /label:string=42/);
  await page.getByText(diagnostic.message, { exact: true }).waitFor();
  await page.getByText(`${entry}:2:${diagnostic.details.column}`, { exact: true }).waitFor();
  await page.getByText('Show code frame', { exact: true }).click();
  await page.locator('details pre').waitFor({ state: 'visible' });
  assert.match(await page.locator('details pre').innerText(), /label:string=42/);
  assert.equal(
    await page.locator('details pre').evaluate((element) => getComputedStyle(element).overflowX),
    'auto',
  );
  assert.equal(await page.locator('iframe').getAttribute('src'), oldSrc);
  await frame.getByRole('button', { name: 'Count 0', exact: true }).click();
  await frame.getByRole('button', { name: 'Count 1', exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'failure-expanded.png'), fullPage: true });
  await page.evaluate(async () => {
    const response = await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ui: { language: 'zh-CN', theme: 'dark' } }),
    });
    if (!response.ok) throw new Error('Could not change test UI preferences');
  });
  await page.getByText('查看出错代码', { exact: true }).waitFor();
  await page.getByText('新代码编译失败，当前仍显示修改前的页面。', { exact: true }).waitFor();
  await page.getByText(diagnostic.message, { exact: true }).waitFor();
  assert.equal(await page.locator('iframe').getAttribute('src'), oldSrc);
  await frame.getByRole('button', { name: 'Count 1', exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'failure-zh-dark.png'), fullPage: true });
  await page.evaluate(async () => {
    const response = await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ui: { language: 'en', theme: 'light' } }),
    });
    if (!response.ok) throw new Error('Could not restore test UI preferences');
  });
  await page.getByText('Show code frame', { exact: true }).waitFor();
  const beforeInspect = await readFile(entry, 'utf8');
  const inspect = await command(['panel', 'inspect', panel.instanceId, '--json']);
  const debugInspect = await command(['--debug', 'panel', 'inspect', panel.instanceId, '--json']);
  const sourceInspect = await command(['panel', 'inspect', panel.instanceId, '--json'], true);
  assert.equal(inspect.status, 0);
  assert.equal(debugInspect.status, 0);
  assert.equal(sourceInspect.status, 0);
  assert.equal(debugInspect.stdout, inspect.stdout);
  assert.equal(sourceInspect.stdout, inspect.stdout);
  assert.equal(JSON.parse(inspect.stdout).ok, true);
  assert.deepEqual(JSON.parse(inspect.stdout).data.diagnostic, diagnostic);
  assert.equal(await readFile(entry, 'utf8'), beforeInspect);
  assert.match(debugInspect.stderr, /build.stage=typecheck/);
  assert.equal(inspect.stderr, '');
  const stored = new Store(join(home, '.paneon'));
  assert.deepEqual(stored.get(panel.instanceId).diagnostic, diagnostic);
  stored.db.close();
  // Old records remain readable without tool locations or frames.
  const oldDiagnostic = { code: 'BUILD_FAILED', message: 'Old saved diagnostic without position' };
  service.runtime.store.save({
    ...service.runtime.store.get(panel.instanceId),
    diagnostic: oldDiagnostic,
  });
  service.runtime.state(panel.instanceId);
  await page.getByText(oldDiagnostic.message, { exact: true }).waitFor();
  assert.equal(await page.locator('details').count(), 0);
  await frame.getByRole('button', { name: 'Count 1', exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'old-diagnostic.png'), fullPage: true });
  await writeFile(entry, source('Recovered panel'));
  const recovered = await command(['panel', 'reload', panel.instanceId, '--json']);
  assert.equal(recovered.status, 0, recovered.stderr);
  await frame.getByRole('heading', { name: 'Recovered panel', exact: true }).waitFor();
  assert.equal(await page.getByText('BUILD_FAILED', { exact: true }).count(), 0);
  assert.equal(service.runtime.inspect(panel.instanceId).diagnostic, undefined);
  const reopened = new Store(join(home, '.paneon'));
  assert.equal(reopened.get(panel.instanceId).diagnostic, undefined);
  reopened.db.close();
  await page.screenshot({ path: join(artifacts, 'recovered.png'), fullPage: true });
  // A metadata child that exits without IPC must expose its process information
  // through the same CLI debug stream, while the previous frame stays available.
  const abrupt =
    source('Recovered panel').replace('definePanel,z', 'definePanel,serverAction,z') +
    `
const stopped=(()=>{process.stderr.write('metadata process failure 中文');process.exit(31)})();
export const serverOnly=serverAction({input:z.object({}),handler:()=>stopped});`;
  await writeFile(entry, abrupt);
  const processFailure = await command(['--debug', 'panel', 'reload', panel.instanceId, '--json']);
  assert.equal(processFailure.status, 1);
  const processDiagnostic = JSON.parse(processFailure.stdout).error;
  assert.equal(processDiagnostic.details.stage, 'metadata');
  assert.equal(processDiagnostic.details.exitCode, 31);
  assert.match(processDiagnostic.details.stderr, /metadata process failure 中文/);
  assert.match(processFailure.stderr, /build.exitCode=31/);
  assert.match(processFailure.stderr, /build.stderr=metadata process failure 中文/);
  await frame.getByRole('heading', { name: 'Recovered panel', exact: true }).waitFor();
  await writeFile(entry, source('Final recovered panel'));
  assert.equal((await command(['panel', 'reload', panel.instanceId, '--json'])).status, 0);
  await frame.getByRole('heading', { name: 'Final recovered panel', exact: true }).waitFor();

  assert.deepEqual(pageErrors, []);
  const report = {
    ok: true,
    artifacts,
    url,
    entry,
    diagnostic,
    pageErrors,
    checks: [
      'real Chrome original reason and one-based source position',
      'expanded code frame',
      'Chinese/dark preferences preserve original errors and the working iframe',
      'old iframe remains interactive',
      'CLI reload stdout/stderr/exit and debug JSON identity',
      'inspect returns saved failure with ok:true exit:0; built and source CLI',
      'SQLite reopen preserves diagnostic and recovery clears it',
      'abnormal metadata process exit details reach CLI debug stderr',
      'legacy diagnostic without position',
      'successful reload clears failure and renders corrected panel',
    ],
    evidence,
  };
  await writeFile(join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, artifacts, checks: report.checks }, null, 2));
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
