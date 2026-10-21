import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startMultipleTabsFixture } from './multiple-tabs-fixture.mjs';

const fixture = await startMultipleTabsFixture();
let browser;
async function until(check, message) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(20);
  }
  throw new Error(message);
}
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  // browser.newPage() creates isolated contexts and misses the shared HTTP connection limit.
  const context = await browser.newContext();
  const pages = [];
  const errors = [];
  for (let i = 0; i < 10; i++) {
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => errors.push(error.message));
    pages.push(page);
    await page.goto(fixture.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Multiple tabs original', exact: true })
      .waitFor();
    await page.getByText('Connected', { exact: true }).waitFor();
  }
  const sockets = fixture.service.app.websocketServer.clients;
  assert.equal(sockets.size, 10);
  const last = pages.at(-1);
  await last
    .frameLocator('iframe')
    .getByRole('button', { name: 'Run test action', exact: true })
    .click();
  await last.frameLocator('iframe').getByText('Action completed', { exact: true }).waitFor();
  assert.equal(await fixture.mutationCount(), 1);
  await fixture.update();
  for (const page of pages)
    await page
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Multiple tabs updated', exact: true })
      .waitFor({ timeout: 60000 });
  assert.equal(await fixture.mutationCount(), 1);
  const disconnected = new Set(sockets);
  for (const socket of disconnected) socket.terminate();
  await until(
    () => sockets.size === 10 && [...sockets].every((socket) => !disconnected.has(socket)),
    'All ten tabs must reconnect.',
  );
  for (const page of pages) await page.getByText('Connected', { exact: true }).waitFor();
  assert.equal(await fixture.mutationCount(), 1);
  await last.reload();
  await last
    .frameLocator('iframe')
    .getByRole('heading', { name: 'Multiple tabs updated', exact: true })
    .waitFor();
  await last.getByText('Connected', { exact: true }).waitFor();
  assert.equal(await fixture.mutationCount(), 1);
  await pages.shift().close();
  await until(() => sockets.size === 9, 'Closing one tab must release its WebSocket.');
  await context.close();
  await until(() => sockets.size === 0, 'Closing the context must release every WebSocket.');
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        ok: true,
        tabs: 10,
        sharedBrowserContext: true,
        actionCalls: 1,
        sourceUpdate: true,
        reconnected: true,
        connectionsAfterClose: sockets.size,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
