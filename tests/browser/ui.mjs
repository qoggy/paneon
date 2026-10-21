import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
await mkdir(join(root, 'tmp'), { recursive: true });
const directory = await mkdtemp(join(root, 'tmp/ui-browser-'));
const relative = directory.slice(root.length);
let server;
let browser;
const errors = [];
try {
  const original = await readFile(
    process.argv[2] ?? join(root, 'examples/components-panel.tsx'),
    'utf8',
  );
  const gallery = original
    .replace("import { definePanel, z } from 'paneon/sdk';", '')
    .replace("from 'paneon/ui'", "from '../../src/ui/index'")
    .replace(/export default definePanel\([\s\S]*$/, 'export default ComponentsPanel;');
  await writeFile(join(directory, 'gallery.tsx'), gallery);
  await writeFile(
    join(directory, 'variants.tsx'),
    await readFile(join(root, 'tests/browser/variants.txt'), 'utf8'),
  );
  await writeFile(
    join(directory, 'entry.tsx'),
    `import {createRoot} from 'react-dom/client';import Gallery from './gallery';import Variants from './variants';import {TooltipProvider} from '../../src/ui/index';import '../../src/ui/styles.css';createRoot(document.getElementById('root')!).render(<TooltipProvider><Gallery /><Variants /></TooltipProvider>);`,
  );
  await writeFile(
    join(directory, 'frame.html'),
    `<html><body><div id="root"></div><script type="module" src="${relative}/entry.tsx"></script></body></html>`,
  );
  await writeFile(
    join(directory, 'index.html'),
    `<html><body><iframe title="Component test" sandbox="allow-scripts" src="${relative}/frame.html" style="width:100%;height:90vh;border:0"></iframe></body></html>`,
  );
  server = await createServer({ root, server: { host: '127.0.0.1', port: 0, cors: true } });
  await server.listen();
  const address = server.httpServer.address();
  const url = `http://127.0.0.1:${address.port}${relative}/index.html`;
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const externalRequests = [];
  const apiRequests = [];
  await page.route('**/*', (route) => {
    const requestUrl = route.request().url();
    if (requestUrl.includes('/api/')) apiRequests.push(requestUrl);
    if (
      !requestUrl.startsWith(`http://127.0.0.1:${address.port}/`) &&
      !requestUrl.startsWith('data:')
    ) {
      externalRequests.push(requestUrl);
      return route.abort();
    }
    return route.continue();
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  // Keep evidence across iframe navigation; component state must survive the earlier tests.
  const lifecycle = [];
  page.on('framenavigated', (frame) => lifecycle.push({ type: 'navigation', url: frame.url() }));
  page.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      try {
        const message = JSON.parse(String(payload));
        lifecycle.push({ type: 'vite', message: message.type });
      } catch {}
    }),
  );
  await page.addInitScript(() => {
    window.__paneonUiSelectionTrace = [];
    const record = (entry) =>
      window.__paneonUiSelectionTrace.push({ at: performance.now(), ...entry });
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target.closest?.('[role="checkbox"], [role^="menuitem"], button');
        if (target)
          record({
            type: 'click',
            target: target.id || target.textContent?.slice(0, 60),
            role: target.getAttribute('role'),
            checked: document.querySelector('#gallery-check')?.getAttribute('aria-checked'),
          });
      },
      true,
    );
    new MutationObserver((changes) => {
      for (const change of changes)
        if (change.target.id === 'gallery-check')
          record({
            type: 'checked',
            old: change.oldValue,
            value: change.target.getAttribute('aria-checked'),
          });
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['aria-checked'],
    });
  });
  await page.goto(url);
  const f = page.frameLocator('iframe');
  const eventually = async (read, expected) => {
    const deadline = Date.now() + 3000;
    let actual;
    do {
      actual = await read();
      if (actual === expected) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    } while (Date.now() < deadline);
    assert.equal(actual, expected);
  };
  const count = async (locator, expected = 1) => assert.equal(await locator.count(), expected);
  const visible = async (locator) => {
    await locator.waitFor({ state: 'visible' });
  };
  await visible(f.getByRole('heading', { name: 'Component gallery', exact: true }));
  await f.getByLabel('Name', { exact: true }).fill('Ada');
  assert.equal(await f.getByLabel('Name', { exact: true }).inputValue(), 'Ada');
  await f.getByLabel('Multiline feedback').fill('line one\nline two');
  assert.equal(await f.getByLabel('Multiline feedback').inputValue(), 'line one\nline two');
  assert.equal(await f.getByLabel('Invalid input').getAttribute('aria-invalid'), 'true');
  assert.equal(
    await f.getByLabel('Invalid input').getAttribute('aria-describedby'),
    'gallery-error',
  );
  await f.getByRole('checkbox', { name: 'Include details' }).check();
  assert.equal(await f.getByRole('checkbox', { name: 'Include details' }).isChecked(), true);
  await f.getByRole('switch', { name: 'Enable option' }).click();
  assert.equal(await f.getByRole('switch', { name: 'Enable option' }).isChecked(), true);
  assert.equal(await f.getByRole('checkbox', { name: 'Disabled checkbox' }).isDisabled(), true);
  assert.equal(await f.getByRole('switch', { name: 'Disabled switch' }).isDisabled(), true);
  await f.getByRole('combobox').click();
  await f.getByRole('option', { name: 'Staging', exact: true }).click();
  assert.match(await f.getByRole('combobox').textContent(), /Staging/);
  await f.getByRole('radio', { name: 'Second option' }).check();
  assert.equal(await f.getByRole('radio', { name: 'Second option' }).isChecked(), true);
  await f.getByRole('radio', { name: 'Second option' }).press('ArrowLeft', { delay: 100 });
  await eventually(() => f.getByRole('radio', { name: 'First option' }).isChecked(), true);
  await f.getByRole('tab', { name: 'Details', exact: true }).click();
  await visible(f.getByRole('tabpanel').filter({ hasText: 'Detailed content' }));
  await f.getByRole('tab', { name: 'Details', exact: true }).press('ArrowLeft');
  await visible(f.getByRole('tabpanel').filter({ hasText: 'Summary content' }));
  assert.equal(await f.getByRole('tab', { name: 'Disabled tab' }).isDisabled(), true);
  await f.getByRole('button', { name: 'First explanation', exact: true }).click();
  await f.getByRole('button', { name: 'Second explanation', exact: true }).press('Enter');
  await visible(f.getByText('First explanation content', { exact: true }));
  await visible(f.getByText('Second explanation content', { exact: true }));
  await f.getByRole('button', { name: 'Toggle extra information' }).click();
  await visible(f.getByText('Extra information', { exact: true }));
  const dialogTrigger = f.getByRole('button', { name: 'Open details dialog' });
  await dialogTrigger.click();
  await visible(f.getByRole('dialog', { name: 'Details dialog' }));
  await f.getByRole('textbox', { name: 'Dialog field' }).fill('inside the dialog');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    assert.equal(
      await f.getByRole('dialog').evaluate((el) => el.contains(el.ownerDocument.activeElement)),
      true,
    );
  }
  await f.getByRole('textbox', { name: 'Dialog field' }).press('Escape');
  await f.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await dialogTrigger.evaluate((el) => el === el.ownerDocument.activeElement), true);
  await f.getByRole('button', { name: 'Open confirmation' }).click();
  await f.getByRole('button', { name: 'Cancel choice' }).click();
  await visible(f.getByText('No choice confirmed', { exact: true }));
  await f.getByRole('button', { name: 'Open confirmation' }).click();
  await f.getByRole('button', { name: 'Confirm choice' }).click();
  await visible(f.getByText('Choice confirmed', { exact: true }));
  await f.getByRole('button', { name: 'Explain this control' }).hover();
  await visible(f.getByRole('tooltip'));
  await page.mouse.move(0, 0);
  await f.getByRole('button', { name: 'Explain this control' }).focus();
  await visible(f.getByRole('tooltip'));
  await f.getByRole('button', { name: 'Explain this control' }).press('Escape');
  try {
    // A modal menu hides the background checkbox from the accessibility tree.
    assert.equal(
      await f.getByRole('checkbox', { name: 'Include details' }).isChecked(),
      true,
      'The earlier checkbox selection must still be set before the menu toggles it.',
    );
    await f.getByRole('button', { name: 'Open actions menu' }).click();
    assert.equal(
      await f.getByRole('menuitem', { name: 'Unavailable action' }).getAttribute('data-disabled'),
      '',
    );
    await f.getByRole('menuitemcheckbox', { name: 'Show details' }).click();
    // React commits controlled state asynchronously; observe it without repeating the click.
    await eventually(() => f.getByRole('checkbox', { name: 'Include details' }).isChecked(), false);
  } catch (error) {
    console.error(
      'Menu selection evidence:',
      JSON.stringify({
        lifecycle,
        selection: await f.locator('body').evaluate(() => window.__paneonUiSelectionTrace),
      }),
    );
    throw error;
  }
  await f.getByRole('button', { name: 'Open actions menu' }).click();
  await f.getByRole('menuitemradio', { name: 'Compact', exact: true }).click();
  await f.getByRole('button', { name: 'Open actions menu' }).click();
  await f.getByRole('menuitem', { name: 'More options' }).hover();
  await visible(f.getByRole('menuitem', { name: 'Nested option' }));
  await f.getByRole('menuitem', { name: 'Nested option' }).click();
  await f.getByRole('button', { name: 'Open actions menu' }).press('Enter');
  await f.getByRole('menuitem', { name: 'More options' }).focus();
  await f.getByRole('menuitem', { name: 'More options' }).press('ArrowRight', { delay: 100 });
  await visible(f.getByRole('menuitem', { name: 'Nested option' }));
  await f.getByRole('menuitem', { name: 'Nested option' }).press('Enter');
  const popoverTrigger = f.getByRole('button', { name: 'Open quick form' });
  await popoverTrigger.click();
  await f.getByLabel('Quick note').fill('inside popover');
  await f.getByLabel('Quick note').press('Escape');
  await f.getByLabel('Quick note').waitFor({ state: 'hidden' });
  assert.equal(await popoverTrigger.evaluate((el) => el === el.ownerDocument.activeElement), true);
  assert.equal(
    await f.getByRole('link', { name: 'Go to previous page' }).getAttribute('aria-disabled'),
    'true',
  );
  await visible(f.getByRole('cell', { name: 'Page 1', exact: true }));
  await f.getByRole('link', { name: 'Go to next page' }).click();
  await visible(f.getByRole('cell', { name: 'Page 2', exact: true }));
  assert.equal(
    await f.getByRole('link', { name: 'Go to next page' }).getAttribute('aria-disabled'),
    'true',
  );
  assert.equal(
    await f.getByRole('link', { name: '2', exact: true }).getAttribute('aria-current'),
    'page',
  );
  await f.getByRole('link', { name: 'Go to previous page' }).press('Enter');
  await visible(f.getByRole('cell', { name: 'Page 1', exact: true }));
  assert.equal(await f.getByRole('button', { name: 'Disabled button' }).isDisabled(), true);
  await count(f.getByRole('status', { name: 'Example loading' }));
  await count(f.locator('.markdown-body h1'));
  await count(f.locator('.markdown-body table'));
  assert.equal(await f.locator('.markdown-body input[type="checkbox"]').first().isDisabled(), true);
  assert.match(
    await f.locator('pre[data-language="typescript"]').first().textContent(),
    /<script>never executes<\/script>/,
  );
  await f.locator('pre[data-language="typescript"] span[style]').first().waitFor();
  await count(f.locator('pre script'), 0);
  assert.equal(
    await f
      .locator('[data-slot="button"]')
      .first()
      .evaluate((el) => getComputedStyle(el).borderRadius),
    '8px',
  );
  await f.getByRole('tab', { name: 'Controlled two', exact: true }).click();
  await visible(f.getByText('Controlled second panel', { exact: true }));
  await f.getByRole('checkbox', { name: 'Uncontrolled checkbox' }).press('Space');
  assert.equal(await f.getByRole('checkbox', { name: 'Uncontrolled checkbox' }).isChecked(), false);
  await f.getByRole('switch', { name: 'Uncontrolled switch' }).press('Space');
  assert.equal(await f.getByRole('switch', { name: 'Uncontrolled switch' }).isChecked(), false);
  await f.getByRole('textbox', { name: 'Controlled textarea' }).fill('controlled\ntext');
  assert.equal(await f.getByLabel('Textarea value').textContent(), 'controlled\ntext');
  await f.getByRole('button', { name: 'Single first', exact: true }).click();
  await visible(f.getByText('Single first content', { exact: true }));
  await f.getByRole('button', { name: 'Single second', exact: true }).click();
  await f.getByText('Single first content', { exact: true }).waitFor({ state: 'hidden' });
  await visible(f.getByText('Single second content', { exact: true }));
  assert.equal(await f.getByRole('button', { name: 'Disabled accordion' }).isDisabled(), true);
  await f.getByRole('button', { name: 'Controlled disclosure', exact: true }).press('Enter');
  await visible(f.getByText('Controlled disclosure content', { exact: true }));
  await f.getByRole('button', { name: 'Controlled popover', exact: true }).click();
  await visible(f.getByText('Controlled popover content', { exact: true }));
  await f.getByText('Controlled popover content', { exact: true }).press('Escape');
  await f.getByText('Controlled popover content', { exact: true }).waitFor({ state: 'hidden' });
  await f.getByRole('button', { name: 'Controlled menu', exact: true }).press('Enter');
  await visible(f.getByRole('menuitem', { name: 'Controlled menu item' }));
  await f.getByRole('menuitem', { name: 'Controlled menu item' }).press('Escape');
  await f.getByRole('menuitem', { name: 'Controlled menu item' }).waitFor({ state: 'hidden' });
  assert.equal(
    await f.getByRole('link', { name: 'Only page' }).getAttribute('aria-current'),
    'page',
  );
  await count(f.getByRole('region', { name: 'Empty pagination' }).getByRole('link'), 0);
  await count(f.locator('.markdown-body script'), 0);
  await count(f.locator('.markdown-body img'), 0);
  assert.match(
    await f.locator('pre[data-language="text"]').first().textContent(),
    /<script>window.executed=true<\/script>\n  whitespace preserved/,
  );
  for (const language of ['javascript', 'typescript', 'jsx', 'tsx', 'json', 'bash', 'yaml', 'diff'])
    await f
      .locator('pre[data-language="' + language + '"] span[style]')
      .first()
      .waitFor();
  assert.equal(
    await f
      .locator('pre[data-language="text"]')
      .last()
      .evaluate((el) => el.scrollWidth > el.clientWidth),
    true,
  );
  await page.screenshot({ path: '/tmp/paneon-ui-gallery.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await f.locator('body').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    true,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(apiRequests, []);
  console.log(
    'UI browser verification passed: all 29 component families, isolated iframe styling, selection, input, keyboard, overlays, focus return, pagination, Markdown, offline bundled highlighting and narrow viewport.',
  );
} finally {
  await browser?.close();
  await server?.close();
  await rm(directory, { recursive: true, force: true });
}
