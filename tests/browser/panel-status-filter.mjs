import { PACKAGE_VERSION } from '../../dist/shared/paths.js';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';

const root = await mkdtemp(join(tmpdir(), 'paneon-status-filter-'));
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-status-filter-evidence';
let service;
let browser;
try {
  await mkdir(artifacts, { recursive: true });
  service = await startServer(join(root, 'home'));
  const origin = `http://127.0.0.1:${service.descriptor.port}`;
  // Seed list metadata only; these tests do not need executing panel workers.
  for (let index = 0; index < 25; index++)
    service.runtime.store.save({
      instanceId: String(index + 1),
      definitionId: `${index < 22 ? 'running' : 'closed'}-panel-${index}`,
      entryPath: join(root, 'panel.tsx'),
      cwd: root,
      params: {},
      revision: 'saved',
      watch: false,
      status: index < 22 ? 'running' : 'closed',
      createdAt: new Date(Date.UTC(2026, 9, 24, 0, index)).toISOString(),
      updatedAt: new Date(Date.UTC(2026, 9, 24, 0, index)).toISOString(),
      requires: { paneon: PACKAGE_VERSION },
      paneonVersion: PACKAGE_VERSION,
    });
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  const queries = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/panels') queries.push(url.searchParams);
  });
  const waitSummary = (text) => page.getByText(text, { exact: true }).waitFor();
  const titles = () =>
    page.getByRole('tabpanel').locator('[data-slot="card-title"] a').allTextContents();
  await page.goto(origin);
  await waitSummary('Page 1 of 2 · 25 panels');
  const tabs = page.getByRole('tablist', { name: 'Panel status' });
  assert.equal(await tabs.getAttribute('data-slot'), 'tabs-list');
  assert.equal(
    await page.getByRole('tab', { name: 'All', exact: true }).getAttribute('aria-selected'),
    'true',
  );
  assert.equal((await titles())[0], 'closed-panel-24');
  await page.screenshot({ path: join(artifacts, 'light-en.png') });

  await page.getByRole('link', { name: 'Go to next page', exact: true }).click();
  await waitSummary('Page 2 of 2 · 25 panels');
  assert.equal(new URL(page.url()).search, '?page=2');
  await page.getByRole('tab', { name: 'Running', exact: true }).click();
  await waitSummary('Page 1 of 2 · 22 panels');
  assert.equal(new URL(page.url()).search, '?status=running');
  assert.ok((await titles()).every((title) => title.startsWith('running-')));
  assert.equal(queries.at(-1).get('page'), '1');
  assert.equal(queries.at(-1).get('status'), 'running');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await waitSummary('Page 1 of 2 · 22 panels');
  assert.equal(queries.at(-1).get('status'), 'running');

  // Direct access, reload and query-only history restore the same list view.
  await page.getByRole('link', { name: 'Go to next page', exact: true }).click();
  await waitSummary('Page 2 of 2 · 22 panels');
  assert.equal(new URL(page.url()).search, '?status=running&page=2');
  const direct = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await direct.goto(page.url());
  await direct.getByText('Page 2 of 2 · 22 panels', { exact: true }).waitFor();
  assert.equal(
    await direct.getByRole('tab', { name: 'Running', exact: true }).getAttribute('aria-selected'),
    'true',
  );
  await direct.reload();
  await direct.getByText('Page 2 of 2 · 22 panels', { exact: true }).waitFor();
  assert.equal(new URL(direct.url()).search, '?status=running&page=2');
  await direct.close();

  await page.goBack();
  await waitSummary('Page 1 of 2 · 22 panels');
  assert.equal(new URL(page.url()).search, '?status=running');
  await page.goBack();
  await waitSummary('Page 2 of 2 · 25 panels');
  assert.equal(new URL(page.url()).search, '?page=2');
  assert.equal(
    await page.getByRole('tab', { name: 'All', exact: true }).getAttribute('aria-selected'),
    'true',
  );
  await page.goForward();
  await waitSummary('Page 1 of 2 · 22 panels');
  await page.goForward();
  await waitSummary('Page 2 of 2 · 22 panels');
  await page.goBack();
  await waitSummary('Page 1 of 2 · 22 panels');

  // Switching management pages retains the selected filter.
  const listRequests = queries.length;
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  assert.equal(new URL(page.url()).search, '');
  assert.equal(
    await page.getByRole('link', { name: 'Panels', exact: true }).getAttribute('href'),
    '/?status=running',
  );
  await page.getByRole('link', { name: 'Panels', exact: true }).click();
  await waitSummary('Page 1 of 2 · 22 panels');
  assert.equal(new URL(page.url()).search, '?status=running');
  assert.equal(queries.length, listRequests, 'Returning to Panels must retain loaded data.');
  assert.equal(
    await page.getByRole('tab', { name: 'Running', exact: true }).getAttribute('aria-selected'),
    'true',
  );

  // A delayed prior response must not replace the newer filter results.
  let release;
  let intercepted;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const ready = new Promise((resolve) => {
    intercepted = resolve;
  });
  const delayed = async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('status') !== 'unavailable') return route.continue();
    const response = await route.fetch();
    intercepted();
    await gate;
    await route.fulfill({ response });
  };
  await page.route('**/api/panels?*', delayed);
  await page.getByRole('tab', { name: 'Unavailable', exact: true }).click();
  await ready;
  await page.getByRole('tab', { name: 'Closed', exact: true }).click();
  await waitSummary('Page 1 of 1 · 3 panels');
  release();
  await page.unrouteAll({ behavior: 'wait' });
  assert.ok((await titles()).every((title) => title.startsWith('closed-')));
  assert.equal(
    await page.getByRole('tab', { name: 'Closed', exact: true }).getAttribute('aria-selected'),
    'true',
  );

  // Native Tabs keyboard navigation selects the next status.
  await page.getByRole('tab', { name: 'Closed', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await page.getByText('No panels with this status.', { exact: true }).waitFor();
  await waitSummary('Page 1 of 1 · 0 panels');
  assert.equal(
    await page.getByRole('tab', { name: 'Unavailable', exact: true }).getAttribute('aria-selected'),
    'true',
  );

  await page.getByRole('tab', { name: 'Running', exact: true }).click();
  await waitSummary('Page 1 of 2 · 22 panels');
  await page.getByRole('link', { name: 'Go to next page', exact: true }).click();
  await waitSummary('Page 2 of 2 · 22 panels');
  const historyLength = await page.evaluate(() => history.length);
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await waitSummary('Page 2 of 2 · 21 panels');
  assert.equal((await titles()).length, 1);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await waitSummary('Page 1 of 1 · 20 panels');
  assert.equal((await titles()).length, 20);
  assert.equal(new URL(page.url()).search, '?status=running');
  assert.equal(await page.evaluate(() => history.length), historyLength);
  await page.getByRole('tab', { name: 'All', exact: true }).click();
  await waitSummary('Page 1 of 2 · 25 panels');
  assert.equal(new URL(page.url()).search, '');
  assert.equal(queries.at(-1).has('status'), false);

  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).click();
  await page.getByText('Saved', { exact: true }).waitFor();
  await page.locator('[data-slot=toast-close]').click();
  await page.locator('[data-slot=toast]').waitFor({ state: 'detached' });
  await page.getByRole('combobox', { name: 'Language', exact: true }).click();
  await page.getByRole('option', { name: '简体中文', exact: true }).click();
  await page.getByText('已保存', { exact: true }).waitFor();
  await page.getByRole('link', { name: '面板', exact: true }).click();
  await page.getByRole('tablist', { name: '面板状态', exact: true }).waitFor();
  for (const name of ['全部', '运行中', '已关闭', '不可用'])
    assert.equal(await page.getByRole('tab', { name, exact: true }).count(), 1);
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.screenshot({ path: join(artifacts, 'dark-zh-CN.png') });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: list URL state, direct access, reload, history, retained navigation, status Tabs, filtered pagination, stale responses, keyboard, empty state, closing, and dark Chinese UI.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
