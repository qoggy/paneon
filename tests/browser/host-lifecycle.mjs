import { PACKAGE_VERSION } from '../../dist/shared/paths.js';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
const runtimeEntry = new URL('../runtime-fixture.ts', import.meta.url).href;
const { startServer } = await import(runtimeEntry);
const root = await mkdtemp(join(tmpdir(), 'paneon-host-lifecycle-'));
const source = (title) =>
  `import{definePanel,z}from'@qoggy/paneon/sdk';import{Page}from'@qoggy/paneon/ui';function Panel(){return <Page title=${JSON.stringify(title)}/>;}export default definePanel({id:'host-lifecycle',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:Panel});`;
let service, browser;
const evidence = [];
async function settle(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}
try {
  service = await startServer(join(root, 'data'));
  const entry = join(root, 'panel.tsx');
  await writeFile(entry, source('Original frame'));
  const panel = await service.runtime.run(entry, root, {}, false);
  const url = `http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`;
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  async function newPage() {
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    const webRoot = process.env.PANEON_TEST_WEB_ROOT;
    if (webRoot)
      await page.route('**/*', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === `/panels/${panel.instanceId}` || pathname.startsWith('/assets/')) {
          const file = pathname.startsWith('/assets/')
            ? join(webRoot, pathname.slice(1))
            : join(webRoot, 'index.html');
          try {
            const response = await route.fetch();
            return route.fulfill({
              response,
              status: 200,
              body: await readFile(file),
              contentType: file.endsWith('.html')
                ? 'text/html'
                : file.endsWith('.css')
                  ? 'text/css'
                  : 'application/javascript',
            });
          } catch {}
        }
        return route.fallback();
      });
    return page;
  }
  {
    const page = await newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.__frames = [];
      const record = () => {
        const frame = document.querySelector('iframe');
        if (frame && window.__frames.at(-1) !== frame.getAttribute('src'))
          window.__frames.push(frame.getAttribute('src'));
      };
      new MutationObserver(record).observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src'],
      });
    });
    await page.goto(url);
    const frame = page.frameLocator('iframe');
    await frame.getByRole('heading', { name: 'Original frame', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading').count(), 0);
    assert.equal(
      await page.getByRole('button', { name: 'Refresh status', exact: true }).count(),
      0,
    );
    const viewport = page.viewportSize();
    const bounds = await page.locator('iframe').boundingBox();
    assert.equal(bounds.x, 0);
    assert.equal(bounds.y, 0);
    assert.equal(bounds.width, viewport.width);
    assert.equal(bounds.height, viewport.height);
    let releaseOld, capturedOld;
    const gate = new Promise((resolve) => (releaseOld = resolve));
    const captured = new Promise((resolve) => (capturedOld = resolve));
    let held = false;
    const inspectPath = `/api/panels/${panel.instanceId}`;
    await page.route(`**${inspectPath}`, async (route) => {
      if (!held) {
        held = true;
        const response = await route.fetch();
        const data = await response.json();
        assert.equal(data.data.revision, panel.revision);
        capturedOld();
        await gate;
        return route.fulfill({ response });
      }
      return route.continue();
    });
    await page.reload({ waitUntil: 'commit' });
    await captured;
    await writeFile(entry, source('Updated frame'));
    const update = await service.runtime.reload(panel.instanceId);
    await frame
      .getByRole('heading', { name: 'Updated frame', exact: true })
      .waitFor({ timeout: 60000 });
    const delivered = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === inspectPath && response.request().method() === 'GET',
    );
    releaseOld();
    await (await delivered).finished();
    await settle(page);
    const history = await page.evaluate(() => window.__frames);
    const revisions = history.map((src) => decodeURIComponent(src).split('/').at(-2));
    const newIndex = revisions.indexOf(update.revision);
    const rolledBack = newIndex >= 0 && revisions.slice(newIndex + 1).includes(panel.revision);
    const result = {
      check: 'A delayed real old inspect response cannot replace a newer rendered revision.',
      rolledBack,
      revisions,
      pageErrors: errors,
    };
    evidence.push(result);
    {
      assert.equal(rolledBack, false);
      assert.equal(
        await page.locator('iframe').getAttribute('src'),
        `/panels/${panel.instanceId}/${encodeURIComponent(update.revision)}/frame.html`,
      );
      await frame.getByRole('heading', { name: 'Updated frame', exact: true }).waitFor();
      assert.deepEqual(errors, []);
    }
    await page.close();
  }
  console.log(JSON.stringify({ ok: true, evidence }, null, 2));
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
