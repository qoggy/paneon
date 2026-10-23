import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startGitReviewFixture } from './git-review-fixture.mjs';
import { git } from '../git-review-fixture.ts';
const f = await startGitReviewFixture();
let browser;
try {
  await git(f.repo, 'branch', 'aaa');
  await git(f.repo, 'checkout', '-qb', 'feat/current');
  await git(f.repo, 'update-ref', 'refs/remotes/origin/main', f.feature);
  await git(f.repo, 'update-ref', 'refs/remotes/origin/aaa', f.feature);
  await git(f.repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  const panel = await f.run({ ...f.params, initialView: { repositoryId: 'web', type: 'history' } });
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(f.url(panel));
  const frame = page.frameLocator('iframe');
  const local = frame.getByRole('region', { name: '本地分支', exact: true });
  const main = local.getByRole('button', { name: '本地分支 main', exact: true });
  await main.waitFor();
  assert.equal(await main.getAttribute('data-mainline'), 'true');
  assert.equal(await main.locator('[data-ref-icon="mainline"]').count(), 1);
  assert.equal(
    await local.getByRole('button').first().getAttribute('data-history-ref'),
    'refs/heads/main',
  );
  const current = local.getByRole('button', { name: '本地分支 feat/current', exact: true });
  assert.equal(await current.getAttribute('data-current-branch'), 'true');
  assert.equal(await current.locator('[data-ref-icon="current"]').count(), 1);
  assert.equal(await current.getByText('当前', { exact: true }).count(), 1);
  const remote = frame.getByRole('region', { name: '远程分支', exact: true });
  const remoteMain = remote.getByRole('button', { name: '远程分支 origin/main', exact: true });
  assert.equal(await remoteMain.getAttribute('data-mainline'), 'true');
  assert.equal(
    await remote.locator('[data-history-ref]').first().getAttribute('data-history-ref'),
    'refs/remotes/origin/main',
  );
  assert.equal(await remote.locator('[data-mainline]').count(), 1);
  const color = async (el) => el.locator('svg').evaluate((svg) => getComputedStyle(svg).color);
  assert.notEqual(
    await color(main),
    await color(local.getByRole('button', { name: '本地分支 aaa', exact: true })),
  );
  await main.click();
  assert.equal(await main.getAttribute('aria-pressed'), 'true');
  assert.equal(
    await current.getAttribute('data-current-branch'),
    'true',
    'Viewing main does not change current checkout.',
  );
  assert.equal(await git(f.repo, 'symbolic-ref', '--short', 'HEAD'), 'feat/current');
  const search = frame.getByLabel('搜索分支或标签', { exact: true });
  await search.fill('current');
  assert.equal(await main.count(), 0);
  assert.equal(await current.count(), 1);
  await search.fill('');
  await mkdir('/tmp/paneon-mainlines-evidence', { recursive: true });
  await page.screenshot({ path: '/tmp/paneon-mainlines-evidence/light.png' });
  await f.service.app.inject({
    method: 'POST',
    url: '/api/preferences',
    headers: {
      host: `127.0.0.1:${f.service.descriptor.port}`,
      authorization: `Bearer ${f.service.descriptor.controlToken}`,
    },
    payload: { ui: { theme: 'dark', language: 'en' } },
  });
  await frame.getByRole('region', { name: 'Local branches', exact: true }).waitFor();
  assert.equal(
    await frame.locator('[data-current-branch]').getAttribute('aria-description'),
    'Current branch',
  );
  assert.equal(await frame.locator('[data-mainline]').count(), 2);
  await page.screenshot({ path: '/tmp/paneon-mainlines-evidence/dark.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await frame.locator('main').evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  assert.deepEqual(errors, []);
  assert.equal((await f.events(panel)).length, 0);
  console.log(
    'PASS local/remote mainline stars and priority, current marker, search, selection without checkout, light/dark/en/zh and narrow layout.',
  );
} finally {
  await browser?.close();
  await f.stop();
}
