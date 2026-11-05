import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startGitReviewFixture } from './git-review-fixture.mjs';
import { git } from '../git-review-fixture.ts';

const f = await startGitReviewFixture();
let browser;
let release;
try {
  // Fast-import creates a real 10k-commit history without spawning a process per commit.
  const history = Array.from({ length: 10000 }, (_, index) => {
    const message = `Paging history ${index}`;
    return `commit refs/heads/paging\nmark :${index + 1}\ncommitter Reviewer <reviewer@example.test> ${1700000000 + index} +0000\ndata ${Buffer.byteLength(message)}\n${message}\nfrom ${index ? `:${index}` : f.feature}\n\n`;
  }).join('');
  const imported = spawnSync('git', ['-C', f.repo, 'fast-import', '--quiet'], {
    input: history,
    encoding: 'utf8',
  });
  assert.equal(imported.status, 0, imported.stderr);
  await git(f.second, 'fetch', '-q', f.repo, 'paging:refs/heads/paging');
  await git(f.second, 'symbolic-ref', 'HEAD', 'refs/heads/paging');
  const tip = await git(f.repo, 'rev-parse', 'paging');
  const params = {
    repositories: [f.repo, f.second],
    initialView: { repositoryPath: f.repo, type: 'history', branch: 'paging' },
  };
  const panel = await f.run(params);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const pages = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const input = request.url().includes('/actions/') && request.postDataJSON()?.input?.request;
    if (input?.pageOnly && input.offset > 0) pages.push(input);
  });
  await page.goto(f.url(panel));
  const frame = page.frameLocator('iframe');
  const scroll = frame.locator('[data-commit-scroll]');
  const count = (size) => frame.locator(`[data-history-count="${size}"]`).waitFor();
  const down = () =>
    scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
  const more = () => frame.getByRole('button', { name: '加载更早的提交', exact: true });
  const capture = async (name) => {
    if (!process.env.PANEON_TEST_ARTIFACTS) return;
    await mkdir(process.env.PANEON_TEST_ARTIFACTS, { recursive: true });
    await page.screenshot({ path: `${process.env.PANEON_TEST_ARTIFACTS}/${name}.png` });
  };
  await count(50);
  await page.waitForTimeout(200);
  assert.equal(pages.length, 0, 'Opening history does not eagerly fetch more pages.');

  const url = `**/api/panels/${panel.instanceId}/actions/*`;
  let mode = 'delay';
  const waitForPage = () =>
    page.waitForRequest((request) => {
      const input = request.url().includes('/actions/') && request.postDataJSON()?.input?.request;
      return input?.pageOnly && input.offset > 0;
    });
  let requested = waitForPage();
  let gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(url, async (route) => {
    const input = route.request().postDataJSON()?.input?.request;
    if (input?.pageOnly && input.offset > 0) {
      if (mode === 'delay') await gate;
      if (mode === 'fail') {
        await route.abort('failed');
        return;
      }
    }
    await route.continue();
  });
  // Near-end prefetch, repeated scroll events, and stationary reading.
  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight - el.clientHeight * 1.5;
  });
  await requested;
  await frame.getByText('正在加载更早的提交…', { exact: true }).waitFor();
  for (let index = 0; index < 8; index++)
    await scroll.evaluate((el) => {
      el.scrollTop += 2;
    });
  assert.equal(pages.length, 1, 'Only one page request runs at a time.');
  assert.equal(await frame.locator('[data-file-scroll]').getAttribute('aria-busy'), 'false');
  await down();
  await capture('git-history-loading');
  const before = await scroll.evaluate((el) => el.scrollTop);
  const selected = await frame
    .locator('[data-commit-id][aria-pressed=true]')
    .getAttribute('data-commit-id');
  const details = await frame.locator('[data-commit-message]').innerText();
  release();
  mode = 'normal';
  await count(100);
  assert.equal(await scroll.evaluate((el) => el.scrollTop), before);
  assert.equal(
    await frame.locator(`[data-commit-id="${selected}"]`).getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(await frame.locator('[data-commit-message]').innerText(), details);
  await page.waitForTimeout(250);
  assert.equal(pages.length, 1, 'Appending does not start a chain of automatic requests.');

  // A failed automatic page waits for a deliberate retry and retains the loaded rows.
  mode = 'fail';
  await down();
  await frame.getByRole('button', { name: '重试', exact: true }).waitFor();
  await capture('git-history-page-error');
  await count(100);
  const failures = pages.length;
  await scroll.evaluate((el) => {
    el.scrollTop -= 20;
  });
  await down();
  await page.waitForTimeout(200);
  assert.equal(pages.length, failures, 'Scroll does not retry a failed page automatically.');
  mode = 'normal';
  await frame.getByRole('button', { name: '重试', exact: true }).press('Enter');
  await count(150);

  // A foreground selection completes while a background page is still delayed.
  mode = 'delay';
  requested = waitForPage();
  gate = new Promise((resolve) => {
    release = resolve;
  });
  await down();
  await requested;
  await scroll.evaluate((el) => {
    el.scrollTop = 0;
  });
  await frame.locator(`[data-commit-id="${tip}"]`).press('ArrowDown');
  await frame.getByText('Paging history 9998', { exact: true }).last().waitFor();
  const chosen = await frame
    .locator('[data-commit-id][aria-pressed=true]')
    .getAttribute('data-commit-id');
  release();
  mode = 'normal';
  await frame.locator('[data-history-pagination][aria-busy=false]').waitFor();
  await count(150);
  assert.equal(
    await frame.locator(`[data-commit-id="${chosen}"]`).getAttribute('aria-pressed'),
    'true',
  );

  // Grow to 1000 loaded commits in the 10k history; DOM remains viewport-sized.
  const timings = [];
  for (let size = 200; size <= 1000; size += 50) {
    const start = performance.now();
    await down();
    await count(size);
    timings.push(performance.now() - start);
  }
  assert.ok((await frame.locator('[data-commit-id]').count()) < 60, 'Virtual rows stay bounded.');
  await scroll.evaluate((el) => {
    el.scrollTop = 0;
  });
  await frame.locator(`[data-commit-id="${tip}"]`).waitFor();
  await more().evaluate((el) => el.focus({ preventScroll: true }));
  await page.keyboard.press('Enter');
  await count(1050);
  assert.equal(
    await more().evaluate((el) => document.activeElement === el),
    true,
    'Keyboard loading retains focus.',
  );
  assert.equal(
    await scroll.evaluate((el) => el.scrollTop),
    0,
    'Manual keyboard loading preserves the viewport.',
  );

  // Filters still page by the same 50-row contract in the full 10k-commit repository.
  const search = frame.getByRole('textbox', { name: '提交信息或哈希', exact: true });
  await search.fill('Paging history');
  await search.press('Enter');
  await count(50);
  const filteredTimings = [];
  for (const size of [100, 150, 200]) {
    const start = performance.now();
    await down();
    await count(size);
    filteredTimings.push(performance.now() - start);
  }
  const stable = pages.length;
  await page.waitForTimeout(250);
  assert.equal(pages.length, stable);
  await capture('git-history-pagination');

  // A failure in A must not disable pagination in an already-cached repository B.
  const switchRepository = async (name, size) => {
    await frame.getByRole('button', { name: '仓库', exact: true }).click();
    await frame.getByRole('button', { name: new RegExp(`^${name} · `) }).click();
    await count(size);
  };
  await switchRepository('server', 50);
  await switchRepository('web', 200);
  mode = 'fail';
  await more().evaluate((el) => el.click());
  await frame.getByRole('button', { name: '重试', exact: true }).waitFor();
  mode = 'normal';
  await switchRepository('server', 50);
  assert.equal(
    await frame.getByRole('button', { name: '重试', exact: true }).count(),
    0,
    'Cached navigation clears the previous repository pagination error.',
  );
  requested = waitForPage();
  await down();
  await requested;
  await count(100);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      repositoryCommits: 10002,
      loaded: 1050,
      maxMounted: 60,
      pageMs: timings.map(Math.round),
      filteredPageMs: filteredTimings.map(Math.round),
      errors,
    }),
  );
} finally {
  release?.();
  await browser?.close();
  await f.stop();
}
