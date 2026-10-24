import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { startGitReviewFixture } from './git-review-fixture.mjs';
import { git } from '../git-review-fixture.ts';
import { annotationTools, selectDiffLines } from './annotation-tools.mjs';

const f = await startGitReviewFixture();
let browser;
try {
  // A real multiline comparison and 1082 branch refs exercise the same density as the reported repo.
  const lines = Array.from(
    { length: 320 },
    (_, i) => `export const line${i} = "${'long '.repeat(40)}${i}";\n`,
  );
  await writeFile(join(f.repo, 'long.ts'), lines.join(''));
  await git(f.repo, 'add', 'long.ts');
  await git(f.repo, 'commit', '-qm', 'Create long source');
  const before = await git(f.repo, 'rev-parse', 'HEAD');
  lines[250] = 'export const changed = true;\n';
  await writeFile(join(f.repo, 'long.ts'), lines.join(''));
  await git(f.repo, 'commit', '-qam', 'Change long source');
  const tip = await git(f.repo, 'rev-parse', 'HEAD');
  const refs = spawnSync('git', ['-C', f.repo, 'update-ref', '--stdin'], {
    input: Array.from(
      { length: 1080 },
      (_, i) => `create refs/heads/load/branch-${String(i).padStart(4, '0')} ${f.feature}\n`,
    ).join(''),
    encoding: 'utf8',
  });
  assert.equal(refs.status, 0, refs.stderr);
  const params = {
    ...f.params,
    initialView: { repositoryId: 'web', type: 'history', commit: tip },
  };
  const panel = await f.run(params);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(f.url(panel));
  const frame = page.frameLocator('iframe');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  await frame.locator('[data-file-id]').first().waitFor();
  assert.equal(await frame.locator('[data-diff-source]').count(), 0);
  assert.equal(await frame.locator('[data-history-ref]').count(), 1082);
  const content = page.frames().find((candidate) => candidate.url().endsWith('/frame.html'));
  const calls = [];
  page.on('request', (request) => {
    if (request.url().includes('/actions/')) calls.push(request.postDataJSON()?.input);
  });
  await frame.getByRole('button', { name: 'M long.ts', exact: true }).click();
  await frame.locator('[data-diff-source]').waitFor();
  const source = await frame.locator('[data-diff-source]').getAttribute('data-diff-source');
  const retained = await frame.locator('[data-diff-source]').elementHandle();
  const fileId = await frame
    .locator('[data-file-id][aria-pressed=true]')
    .getAttribute('data-file-id');
  await button('单列对比').click();
  assert.equal(await button('收起上下文').getAttribute('aria-expanded'), 'true');
  await frame.locator('[data-code-side="new"][data-line="320"]').waitFor();
  const separator = frame.getByRole('separator', { name: '调整提交历史与文件差异高度' });
  await separator.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const split = await separator.getAttribute('aria-valuenow');
  const upper = frame.locator('[data-history-workspace]');
  const upperBefore = (await upper.boundingBox()).height;
  const comments = annotationTools(frame, page);
  await selectDiffLines(frame, 'new', 320);
  await comments.write('Preserved across collapse');
  await comments.save();
  await frame.locator('[data-diff-viewport]').evaluate((el) => {
    el.scrollTop = 300;
  });
  await frame.locator('[data-diff-scroll="unified"]').evaluate((el) => {
    el.scrollLeft = 140;
  });
  assert.equal(await frame.locator('[data-diff-viewport]').evaluate((el) => el.scrollTop), 300);
  const scroll = await content.evaluate(() => ({
    y: document.querySelector('[data-diff-viewport]').scrollTop,
    x: document.querySelector('[data-diff-scroll="unified"]').scrollLeft,
  }));
  const queriesBefore = calls.length;
  await button('收起文件差异').focus();
  await page.keyboard.press('Enter');
  assert.equal(await frame.locator('[data-git-diff-scroll]').isVisible(), false);
  assert.equal(await retained.evaluate((el) => el.isConnected), true);
  assert.equal(await separator.count(), 0);
  assert.ok((await upper.boundingBox()).height > upperBefore + 200);
  assert.equal(
    await content.evaluate(() => document.activeElement?.getAttribute('data-file-id')),
    fileId,
  );
  assert.equal(await frame.locator('[data-git-diff-scroll]').getAttribute('inert'), '');
  await frame.locator('[data-file-id][aria-pressed=true]').dblclick();
  await frame.locator('[data-git-diff-scroll]').waitFor({ state: 'visible' });
  assert.equal(await retained.evaluate((el) => el.isConnected), true);
  assert.equal(await frame.locator('[data-diff-source]').getAttribute('data-diff-source'), source);
  assert.equal(await button('单列对比').getAttribute('aria-pressed'), 'true');
  assert.equal(await button('收起上下文').getAttribute('aria-expanded'), 'true');
  assert.equal(await separator.getAttribute('aria-valuenow'), split);
  assert.deepEqual(
    await content.evaluate(() => ({
      y: document.querySelector('[data-diff-viewport]').scrollTop,
      x: document.querySelector('[data-diff-scroll="unified"]').scrollLeft,
    })),
    scroll,
  );
  assert.equal(calls.length, queriesBefore, 'Collapse and reopen do not read blobs again.');
  assert.equal(await comments.count(), 1);
  await comments.edit(1);
  assert.equal(
    await frame.getByLabel('批注内容', { exact: true }).inputValue(),
    'Preserved across collapse',
  );
  await button('取消').click();
  // Delay an older response, then request another commit. Intent/highlight/loading paint first.
  const queryUrl = `**/api/panels/${panel.instanceId}/actions/*`;
  let release, started;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const requested = new Promise((resolve) => {
    started = resolve;
  });
  await page.route(queryUrl, async (route) => {
    if (route.request().postDataJSON()?.input?.request?.commit === before) {
      started();
      await gate;
      await route.continue();
    } else await route.continue();
  });
  await content.evaluate((oid) => {
    const row = document.querySelector(`[data-commit-id="${oid}"]`);
    window.clickMetrics = { start: performance.now() };
    const observer = new MutationObserver(() => {
      if (row.getAttribute('aria-pressed') === 'true') {
        window.clickMetrics.selected = performance.now() - window.clickMetrics.start;
        requestAnimationFrame(() => {
          window.clickMetrics.paint = performance.now() - window.clickMetrics.start;
        });
        observer.disconnect();
      }
    });
    observer.observe(row, { attributes: true });
    row.click();
  }, before);
  await requested;
  assert.equal(
    await frame.locator(`[data-commit-id="${before}"]`).getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(await frame.locator('[data-file-id]').count(), 0);
  assert.equal(await frame.locator('[data-file-scroll]').getAttribute('aria-busy'), 'true');
  assert.equal(await frame.locator('[data-git-diff-scroll]').count(), 0);
  const immediate = await content.evaluate(() => window.clickMetrics);
  assert.ok(immediate.selected < 250, JSON.stringify(immediate));
  await content.evaluate((oid) => {
    window.directoryMetrics = { start: performance.now() };
    const observer = new MutationObserver(() => {
      if (
        document.querySelector('[data-file-id]') &&
        document.querySelector('[data-file-scroll]').getAttribute('aria-busy') === 'false'
      ) {
        window.directoryMetrics.ready = performance.now() - window.directoryMetrics.start;
        observer.disconnect();
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    document.querySelector(`[data-commit-id="${oid}"]`).click();
  }, tip);
  await frame.getByRole('button', { name: 'M long.ts', exact: true }).waitFor();
  const oldResponse = page.waitForResponse(
    (response) => response.request().postDataJSON()?.input?.request?.commit === before,
  );
  release();
  await oldResponse;
  await page.unroute(queryUrl);
  await page.waitForTimeout(200);
  const directory = await content.evaluate(() => window.directoryMetrics);
  assert.equal(
    await frame.locator(`[data-commit-id="${tip}"]`).getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(await frame.getByRole('button', { name: 'M long.ts', exact: true }).count(), 1);
  assert.equal(await frame.locator('[data-diff-source]').count(), 0);
  // Label/style follow preferences without accent callouts; binary diffs also collapse.
  await frame.getByRole('button', { name: 'M long.ts', exact: true }).click();
  await button('收起文件差异').waitFor();
  const style = await button('收起文件差异').evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    border: getComputedStyle(el).borderWidth,
  }));
  assert.equal(style.border, '0px');
  for (const [theme, language] of [
    ['dark', 'en'],
    ['light', 'zh-CN'],
  ]) {
    await page.evaluate(
      async (ui) => {
        await fetch('/api/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ui }),
        });
      },
      { theme, language },
    );
    await frame.locator(`html[data-theme="${theme}"][lang="${language}"]`).waitFor();
    const label = language === 'en' ? 'Collapse file diff' : '收起文件差异';
    assert.equal(await button(label).getAttribute('title'), label);
  }
  for (const type of ['changes', 'compare']) {
    const initialView = {
      repositoryId: 'web',
      type,
      ...(type === 'compare' ? { base: f.rootCommit, head: tip } : {}),
    };
    const other = await f.run({ ...params, initialView });
    await page.goto(f.url(other));
    await frame.locator('[data-file-id]').first().waitFor();
    assert.equal(
      await frame.locator('[data-diff-source]').count(),
      0,
      `${type} omits default diff`,
    );
    if (type === 'changes') {
      await frame.getByRole('button', { name: '未跟踪 · ? binary.bin', exact: true }).click();
      await button('收起文件差异').click();
      assert.equal(await frame.locator('[data-git-diff-scroll]').isVisible(), false);
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      refs: 1082,
      immediate,
      directory,
      collapsePreservesDOM: true,
      retainedModeContextScrollSplit: true,
      noReopenQuery: true,
      latestResponseWins: true,
      omittedViews: 3,
      binaryCollapse: true,
      errors,
    }),
  );
} finally {
  await browser?.close();
  await f.stop();
}
