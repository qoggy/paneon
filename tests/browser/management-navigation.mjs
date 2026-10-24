import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { startServer } from '../../dist/runtime/server.js';

const root = await mkdtemp(join(tmpdir(), 'paneon-management-navigation-'));
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-management-navigation-evidence';
const widths = process.env.PANEON_TEST_DESKTOP_ONLY === '1' ? [1440] : [1440, 390];
let service;
let browser;
try {
  await mkdir(artifacts, { recursive: true });
  service = await startServer(join(root, 'home'));
  const origin = `http://127.0.0.1:${service.descriptor.port}`;
  // Persisted closed panels exercise the real pagination endpoint without starting extra workers.
  for (let index = 0; index < 41; index++) {
    service.runtime.store.save({
      instanceId: `instance-history-${String(index).padStart(2, '0')}`,
      definitionId: `history-${index}`,
      entryPath: join(root, 'history.tsx'),
      cwd: root,
      params: {},
      revision: 'historical',
      watch: false,
      status: 'closed',
      createdAt: new Date(2020, 0, 1, 0, index).toISOString(),
      updatedAt: new Date(2020, 0, 1, 0, index).toISOString(),
      requires: { paneon: '0.0.0' },
      paneonVersion: '0.0.0',
    });
  }
  const entry = join(root, 'probe.tsx');
  await writeFile(
    entry,
    `import {definePanel,z} from 'paneon/sdk';
export default definePanel({id:'navigation-probe',requires:{paneon:'0.0.0'},input:z.object({}),events:{},render:()=> <h1>Author content 原文</h1>});`,
  );
  const panel = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  const mutations = [];
  context.on('page', (page) => {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.method() !== 'GET' && !request.url().endsWith('/api/preferences'))
        mutations.push(request.url());
    });
  });
  const page = await context.newPage();
  let lists = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/panels') lists++;
  });
  await page.goto(origin);
  await page.getByText('Page 1 of 3 · 42 panels', { exact: true }).waitFor();
  const navigation = page.getByRole('navigation', { name: 'Management navigation' });
  assert.equal(await navigation.getAttribute('data-slot'), 'navigation-menu');
  assert.equal(await navigation.locator('a[aria-current="page"]').getAttribute('href'), '/');
  const headerLayout = await page.locator('header').evaluate((header) => {
    const brand = header.querySelector('a').getBoundingClientRect();
    const link = header.querySelector('nav a').getBoundingClientRect();
    return {
      height: header.getBoundingClientRect().height,
      centerOffset: Math.abs(brand.y + brand.height / 2 - link.y - link.height / 2),
    };
  });
  assert.ok(headerLayout.centerOffset < 1, 'Brand and navigation must share a vertical center.');
  assert.ok(headerLayout.height <= 72, 'Navigation must not recreate the tall underline header.');
  await navigation.getByRole('link', { name: 'Panels', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.activeElement?.getAttribute('href') === '/server');
  assert.equal(await page.locator(':focus').getAttribute('href'), '/server');
  await page.getByRole('link', { name: 'Go to next page', exact: true }).click();
  await page.getByText('Page 2 of 3 · 42 panels', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'history-20', exact: true }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 650));
  await page.waitForFunction(() => window.scrollY > 0);
  const scroll = await page.evaluate(() => window.scrollY);
  assert.ok(scroll > 0, 'The retention check must start with a genuinely scrolled list.');
  const count = lists;
  // DOM click keeps the scroll position that a navigation command should restore.
  await page.getByRole('link', { name: 'Settings', exact: true }).evaluate((link) => link.click());
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/settings');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.getByRole('link', { name: 'Server', exact: true }).click();
  await page.getByText(service.descriptor.runtimeId, { exact: true }).waitFor();
  await page.getByText(String(service.descriptor.pid), { exact: true }).waitFor();
  await page.getByText(origin, { exact: true }).waitFor();
  const health = await page.evaluate(async () => (await fetch('/health')).json());
  assert.equal(health.ok, true);
  assert.equal(health.data.controlToken, undefined);
  await page.goBack();
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  await page.goBack();
  await page.getByText('Page 2 of 3 · 42 panels', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.scrollY), scroll);
  assert.equal(lists, count, 'Navigation must retain panel data rather than refetch it.');
  await page.goForward();
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Panels', exact: true }).click();
  await page.getByText('Page 2 of 3 · 42 panels', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.scrollY), scroll);
  assert.equal(lists, count);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByText('Page 2 of 3 · 42 panels', { exact: true }).waitFor();
  assert.equal(lists, count + 1, 'Refresh remains a local panel-list operation.');

  // Direct URLs and reload must work with the production HTML routes, not a dev fallback.
  for (const [path, title] of [
    ['/', 'Panels'],
    ['/server', 'Local Paneon service'],
    ['/settings', 'Settings'],
  ]) {
    const direct = await context.newPage();
    const response = await direct.goto(origin + path);
    assert.equal(response.status(), 200);
    await direct.getByRole('heading', { name: title, exact: true }).waitFor();
    await direct.reload();
    await direct.getByRole('heading', { name: title, exact: true }).waitFor();
    assert.equal(await direct.getByRole('main').count(), 1);
    assert.equal(await direct.locator('h1:visible').count(), 1);
    await direct.close();
  }
  await page.getByRole('link', { name: 'Settings', exact: true }).evaluate((link) => link.click());
  const second = await context.newPage();
  await second.goto(origin + '/settings');
  await second.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let saves = 0;
  await page.route('**/api/preferences', async (route) => {
    if (route.request().method() === 'POST') {
      saves++;
      await gate;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.getByRole('status').getByText('Saving…', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Light', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Dark', exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel('Language', { exact: true }).isDisabled(), true);
  await page.getByRole('link', { name: 'Server', exact: true }).click();
  await page.getByRole('heading', { name: 'Local Paneon service', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('status').getByText('Saving…', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Dark', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Dark', exact: true }).dispatchEvent('click');
  release();
  await page.getByRole('status').getByText('Saved', { exact: true }).waitFor();
  await second.locator('html.dark').waitFor();
  assert.equal(saves, 1, 'A pending save must not accept duplicate writes.');
  await page.unroute('**/api/preferences');

  // Failed writes leave the confirmed values selected and never report Saved.
  await page.route('**/api/preferences', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: { code: 'TEST', message: 'Disk unavailable' } }),
        })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByText('Save failed. Disk unavailable', { exact: true }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Dark', exact: true }).getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(await page.getByRole('status').getByText('Saved', { exact: true }).count(), 0);
  await page.getByLabel('Language', { exact: true }).selectOption('zh-CN');
  await page.getByText('Save failed. Disk unavailable', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Language', { exact: true }).inputValue(), 'en');
  await page.unroute('**/api/preferences');

  await page.getByRole('link', { name: 'Server', exact: true }).click();
  await page.getByText(service.descriptor.runtimeId, { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.route('**/health', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { code: 'TEST', message: 'Service unreachable' } }),
    }),
  );
  await page.getByRole('link', { name: 'Server', exact: true }).click();
  await page
    .getByText('Unable to load service status. Service unreachable', { exact: true })
    .waitFor();
  assert.equal(await page.getByText('running', { exact: true }).count(), 0);
  assert.equal(await page.getByText(service.descriptor.runtimeId, { exact: true }).count(), 0);
  await page.unroute('**/health');

  // Capture preference combinations and routes at the requested widths.
  for (const [theme, language] of [
    ['light', 'en'],
    ['light', 'zh-CN'],
    ['dark', 'en'],
    ['dark', 'zh-CN'],
  ]) {
    await page.goto(origin + '/settings');
    const oldLanguage = await page.locator('html').getAttribute('lang');
    const oldTheme = await page.locator('html').getAttribute('data-theme');
    if (theme !== oldTheme)
      await page
        .getByRole('button', {
          name:
            theme === 'light'
              ? oldLanguage === 'en'
                ? 'Light'
                : '浅色'
              : oldLanguage === 'en'
                ? 'Dark'
                : '深色',
          exact: true,
        })
        .click();
    await page.locator(`html[data-theme="${theme}"]`).waitFor();
    await page
      .getByLabel(oldLanguage === 'en' ? 'Language' : '语言', { exact: true })
      .selectOption(language);
    await page.locator(`html[lang="${language}"]`).waitFor();
    await second.locator(`html[data-theme="${theme}"][lang="${language}"]`).waitFor();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1050 });
      for (const [path, key] of [
        ['/', 'panels'],
        ['/server', 'server'],
        ['/settings', 'settings'],
      ]) {
        await page.locator(`nav a[href="${path}"]`).click();
        await page.locator('main h1:visible').waitFor();
        assert.equal(await page.locator('nav a[aria-current="page"]').getAttribute('href'), path);
        if (path === '/server')
          await page.getByText(service.descriptor.runtimeId, { exact: true }).waitFor();
        if (path === '/')
          await page
            .getByText(
              language === 'en' ? 'Page 1 of 3 · 42 panels' : '第 1 / 3 页 · 共 42 个面板',
              { exact: true },
            )
            .waitFor();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
          `${width} ${theme}/${language} ${path} must not overflow.`,
        );
        if (path === '/')
          await page.getByRole('link', { name: 'history-40', exact: true }).waitFor();
        await page.screenshot({
          animations: 'disabled',
          path: join(artifacts, `${key}-${theme}-${language}-${width}.png`),
          fullPage: true,
        });
      }
    }
  }
  const host = await context.newPage();
  await host.goto(`${origin}/panels/${panel.instanceId}`);
  await host
    .frameLocator('iframe')
    .getByRole('heading', { name: 'Author content 原文', exact: true })
    .waitFor();
  assert.equal(
    await host.locator('nav').count(),
    0,
    'Panel hosts must not inherit management navigation.',
  );
  assert.equal(await host.getByRole('link', { name: 'Paneon', exact: true }).count(), 0);
  assert.deepEqual(mutations, [], 'Management navigation must not create, close or invoke panels.');
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      listState: true,
      scrollRestored: scroll,
      directRoutes: 3,
      history: true,
      healthFailure: true,
      saveFailure: true,
      pendingSave: true,
      multiWindow: true,
      combinations: 4,
      widths,
      panelHost: true,
      artifacts,
    }),
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
