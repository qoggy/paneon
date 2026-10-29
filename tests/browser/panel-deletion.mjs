import { PACKAGE_VERSION } from '../../dist/shared/paths.js';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';

const root = await mkdtemp(join(tmpdir(), 'paneon-browser-delete-'));
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-panel-deletion-evidence';
let service;
let browser;
try {
  await mkdir(artifacts, { recursive: true });
  service = await startServer(join(root, 'home'));
  const origin = `http://127.0.0.1:${service.descriptor.port}`;
  function seed(status, index) {
    const now = new Date(Date.UTC(2026, 9, 24, 0, index)).toISOString();
    const panel = service.runtime.store.save({
      definitionId: `${status}-${index}`,
      entryPath: join(root, 'panel.tsx'),
      cwd: root,
      params: {},
      revision: 'saved',
      watch: false,
      status,
      createdAt: now,
      updatedAt: now,
      requires: { paneon: PACKAGE_VERSION },
      paneonVersion: PACKAGE_VERSION,
    });
    return panel.instanceId;
  }
  for (let index = 0; index < 21; index++) seed('closed', index);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  const deletes = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'DELETE') deletes.push(request.url());
  });
  const summary = (text) => page.getByText(text, { exact: true }).waitFor();
  const cards = page.getByRole('tabpanel').locator('[data-slot="card"]');
  const openDelete = async (card = cards.first()) => {
    const href = await card.locator('[data-slot="card-title"] a').getAttribute('href');
    const id = new URL(href, origin).pathname.split('/').at(-1);
    await card.getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Delete panel?', exact: true });
    await dialog.waitFor();
    assert.ok((await dialog.textContent()).includes(id));
    return { dialog, id };
  };
  await page.goto(`${origin}/?status=closed&page=2`);
  await summary('Page 2 of 2 · 21 panels');
  assert.equal(await cards.getByRole('button', { name: 'Close', exact: true }).isDisabled(), true);
  const cancelled = await openDelete();
  await cancelled.dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(deletes.length, 0);
  assert.equal(service.runtime.store.listPage().total, 21);

  // A failed deletion remains visible and does not remove the card or change the URL.
  const failed = await openDelete();
  const failureRoute = `**/api/panels/${failed.id}`;
  await page.route(failureRoute, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: { code: 'TEST_FAILURE', message: 'Deletion failed for test' },
      }),
    }),
  );
  await failed.dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await cards.getByRole('alert').getByText('Deletion failed for test', { exact: true }).waitFor();
  assert.equal(
    await cards
      .getByRole('button', { name: 'Delete', exact: true })
      .evaluate((button) => button === document.activeElement),
    true,
  );
  assert.equal(service.runtime.store.listPage().total, 21);
  assert.equal(new URL(page.url()).search, '?status=closed&page=2');
  await page.unroute(failureRoute);

  const historyLength = await page.evaluate(() => history.length);
  const confirmed = await openDelete();
  await confirmed.dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await summary('Page 1 of 1 · 20 panels');
  assert.equal(new URL(page.url()).search, '?status=closed');
  assert.equal(await page.evaluate(() => history.length), historyLength);
  assert.equal(service.runtime.store.find(confirmed.id), undefined);
  await page.screenshot({ path: join(artifacts, 'light-en-list.png') });

  // Completion must refresh the current filter, even if it changed during the request.
  const pending = await openDelete();
  let release;
  let intercepted;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const ready = new Promise((resolve) => {
    intercepted = resolve;
  });
  const pendingRoute = `**/api/panels/${pending.id}`;
  await page.route(pendingRoute, async (route) => {
    intercepted();
    await gate;
    await route.continue();
  });
  await pending.dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await ready;
  assert.equal(
    await cards
      .first()
      .getByRole('button', { name: /Deleting…$/ })
      .isDisabled(),
    true,
  );
  assert.deepEqual(
    await cards
      .first()
      .getByRole('button', { name: /Deleting…$/ })
      .evaluate((button) => ({
        focused: button === document.activeElement,
        nativeDisabled: button.disabled,
      })),
    { focused: true, nativeDisabled: false },
  );
  const requestsWhilePending = deletes.length;
  await page.keyboard.press('Enter');
  assert.equal(await page.getByRole('alertdialog').count(), 0);
  assert.equal(deletes.length, requestsWhilePending);
  await page.getByRole('tab', { name: 'Unavailable', exact: true }).click();
  await summary('Page 1 of 1 · 0 panels');
  const completed = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      response.url().endsWith(`/api/panels/${pending.id}`),
  );
  release();
  await completed;
  await page.unrouteAll({ behavior: 'wait' });
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll('button')).find(
        (button) => button.textContent === 'Refresh',
      )?.disabled,
  );
  await summary('Page 1 of 1 · 0 panels');
  assert.equal(new URL(page.url()).search, '?status=unavailable');
  assert.equal(service.runtime.store.find(pending.id), undefined);

  const unavailable = seed('unavailable', 30);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await summary('Page 1 of 1 · 1 panels');
  const unavailableDelete = await openDelete();
  await unavailableDelete.dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await summary('Page 1 of 1 · 0 panels');
  assert.equal(service.runtime.store.find(unavailable), undefined);

  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    `import{definePanel,z}from'@qoggy/paneon/sdk';function Panel(){return <h1>Live deletion fixture</h1>}export default definePanel({id:'live-deletion',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:Panel});`,
  );
  const live = await service.runtime.run(entry, root, {}, false);
  const host = await browser.newPage();
  host.setDefaultTimeout(10000);
  host.on('pageerror', (error) => errors.push(error.message));
  let streams = 0;
  let streamReady;
  const connected = new Promise((resolve) => {
    streamReady = resolve;
  });
  host.on('websocket', (socket) => {
    if (socket.url().includes(`/api/panels/${live.instanceId}/stream`)) {
      streams++;
      socket.on('framereceived', streamReady);
    }
  });
  await host.goto(`${origin}/panels/${live.instanceId}`);
  await host
    .frameLocator('iframe')
    .getByRole('heading', { name: 'Live deletion fixture', exact: true })
    .waitFor();
  await connected;
  let captured;
  let releaseInspect;
  const inspectReady = new Promise((resolve) => {
    captured = resolve;
  });
  const inspectGate = new Promise((resolve) => {
    releaseInspect = resolve;
  });
  let held = false;
  await host.route(`**/api/panels/${live.instanceId}`, async (route) => {
    if (held) return route.continue();
    held = true;
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    captured();
    await inspectGate;
    await route.fulfill({ response });
  });
  service.runtime.state(live.instanceId);
  await inspectReady;
  await page.getByRole('tab', { name: 'Running', exact: true }).click();
  await summary('Page 1 of 1 · 1 panels');
  assert.equal(await cards.getByRole('button', { name: 'Close', exact: true }).isEnabled(), true);
  assert.equal(await cards.getByRole('button', { name: 'Delete', exact: true }).isEnabled(), true);
  const preferences = await fetch(`${origin}/api/preferences`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${service.descriptor.controlToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ui: { theme: 'dark', language: 'zh-CN' } }),
  });
  assert.equal(preferences.status, 200);
  await cards.getByRole('button', { name: '删除', exact: true }).click();
  const chinese = page.getByRole('alertdialog', { name: '删除面板？', exact: true });
  await chinese
    .getByText('将永久删除此面板及其交互历史。此操作无法撤销。', { exact: true })
    .waitFor();
  await page.screenshot({
    path: join(artifacts, 'dark-zh-confirmation.png'),
    animations: 'disabled',
  });
  await chinese.getByRole('button', { name: '删除', exact: true }).click();
  await summary('第 1 / 1 页 · 共 0 个面板');
  await host.getByText('此面板已不存在。', { exact: true }).waitFor();
  assert.equal(await host.locator('iframe').count(), 0);
  releaseInspect();
  await host.unrouteAll({ behavior: 'wait' });
  const streamCount = streams;
  await host.waitForTimeout(1200);
  assert.equal(
    await host.locator('iframe').count(),
    0,
    'A late inspect response must not restore a deleted frame.',
  );
  assert.equal(streams, streamCount, 'Deleted hosts must stop reconnecting.');
  await host.reload();
  await host.getByText('此面板已不存在。', { exact: true }).waitFor();
  const afterReload = streams;
  await host.waitForTimeout(1200);
  assert.equal(streams, afterReload, 'Old deleted links must stop reconnecting.');
  await host.screenshot({ path: join(artifacts, 'deleted-host.png') });

  // Reconcile a stale card when another client has already deleted the instance.
  await page.getByRole('tab', { name: '已关闭', exact: true }).click();
  await summary('第 1 / 1 页 · 共 19 个面板');
  const staleCard = cards.first();
  const staleHref = await staleCard.locator('[data-slot="card-title"] a').getAttribute('href');
  const staleId = new URL(staleHref, origin).pathname.split('/').at(-1);
  await staleCard.getByRole('button', { name: '删除', exact: true }).click();
  await service.runtime.deletePanel(staleId);
  await page.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click();
  await summary('第 1 / 1 页 · 共 18 个面板');
  assert.equal(await page.getByRole('tabpanel').getByRole('alert').count(), 0);

  // A loaded management page can still show confirmation without fetching a chunk.
  const reconnectPanel = await service.runtime.run(entry, root, {}, false);
  const disconnectedHost = await browser.newPage();
  disconnectedHost.setDefaultTimeout(15000);
  let reconnects = 0;
  disconnectedHost.on('pageerror', (error) => errors.push(error.message));
  disconnectedHost.on('websocket', (socket) => {
    if (socket.url().includes(`/api/panels/${reconnectPanel.instanceId}/stream`)) reconnects++;
  });
  await disconnectedHost.goto(`${origin}/panels/${reconnectPanel.instanceId}`);
  await disconnectedHost
    .frameLocator('iframe')
    .getByRole('heading', { name: 'Live deletion fixture', exact: true })
    .waitFor();
  const home = join(root, 'home');
  const configPath = join(home, 'config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  await writeFile(
    configPath,
    JSON.stringify({ ...config, server: { ...config.server, port: service.descriptor.port } }),
  );
  const offlineManagement = await browser.newPage();
  offlineManagement.on('pageerror', (error) => errors.push(error.message));
  await offlineManagement.goto(`${origin}/?status=closed`);
  await offlineManagement.getByText('第 1 / 1 页 · 共 18 个面板', { exact: true }).waitFor();
  await service.stop();
  await offlineManagement.getByRole('button', { name: '删除', exact: true }).first().click();
  await offlineManagement.getByRole('alertdialog', { name: '删除面板？', exact: true }).waitFor();
  assert.equal(
    await offlineManagement
      .getByRole('heading', { name: '面板', exact: true, includeHidden: true })
      .count(),
    1,
  );
  await offlineManagement
    .getByRole('alertdialog')
    .getByRole('button', { name: '取消', exact: true })
    .click();
  await disconnectedHost.waitForTimeout(4500);
  const attemptsBeforeRestart = reconnects;
  service = await startServer(home);
  await service.runtime.deletePanel(reconnectPanel.instanceId);
  await disconnectedHost.getByText('此面板已不存在。', { exact: true }).waitFor();
  assert.ok(
    reconnects > attemptsBeforeRestart,
    'The host must reconcile after a rejected reconnect.',
  );
  assert.equal(await disconnectedHost.locator('iframe').count(), 0);
  const attemptsAfterMissing = reconnects;
  await disconnectedHost.waitForTimeout(1200);
  assert.equal(reconnects, attemptsAfterMissing);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: separate controls, cancellation, permanent confirmation, errors, all statuses, pagination/URL correction, pending focus, stale cards, offline confirmation, deletion while disconnected and Chinese dark UI.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
