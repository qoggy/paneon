import { selectDiffLines } from './annotation-tools.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startGitReviewFixture } from './git-review-fixture.mjs';

const f = await startGitReviewFixture();
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-file-split-evidence';
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(f.url());
  const frame = page.frameLocator('iframe');
  const separator = frame.getByRole('separator', { name: '调整文件列表与差异宽度', exact: true });
  await separator.waitFor();
  const files = frame.getByRole('complementary', { name: '改动文件', exact: true });
  const diff = frame.locator('[data-git-diff-scroll]');
  const width = async () => (await files.boundingBox()).width;
  const styles = () =>
    frame.locator('[data-git-workspace]').evaluate(() => ({
      cursor: document.documentElement.style.cursor,
      selection: document.documentElement.style.userSelect,
    }));
  const originalStyles = await styles();
  const source = await frame.locator('[data-diff-source]').elementHandle();
  const sourceId = await source.getAttribute('data-diff-source');
  const selectedFile = await frame
    .locator('[data-file-id][aria-pressed="true"]')
    .getAttribute('data-file-id');
  const initial = await width();
  assert.equal((await separator.boundingBox()).width, 1);
  assert.equal(
    await frame.locator('[data-git-workspace]').evaluate((el) => getComputedStyle(el).columnGap),
    '0px',
  );
  const initialDiff = (await diff.boundingBox()).width;
  let requests = 0;
  const listener = (r) => {
    if (r.url().includes('/actions/')) requests++;
  };
  page.on('request', listener);
  async function start() {
    const box = await separator.boundingBox();
    const point = { x: box.x + 3, y: box.y + box.height / 2 };
    await separator.evaluate((el) =>
      el.addEventListener(
        'pointerdown',
        (e) => {
          el.dataset.pointer = String(e.pointerId);
        },
        { once: true },
      ),
    );
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    // The library captures the pointer on its first move, rather than on pointerdown.
    await page.mouse.move(point.x, point.y);
    assert.equal(
      await separator.evaluate((el) => el.hasPointerCapture(Number(el.dataset.pointer))),
      true,
    );
    return point;
  }
  async function drag(delta) {
    const p = await start();
    await page.mouse.move(p.x + delta, p.y, { steps: 8 });
    await page.mouse.up();
    assert.deepEqual(await styles(), originalStyles);
  }
  await drag(-90);
  const smaller = await width();
  assert.ok(
    Math.abs(initial - smaller - 90) < 2,
    'Dragging left shrinks the file list and gives space to Diff.',
  );
  assert.ok((await diff.boundingBox()).width > initialDiff + 80);
  await separator.press('ArrowRight');
  assert.ok(Math.abs((await width()) - smaller - 16) < 2);
  await separator.press('Home');
  assert.ok(Math.abs((await width()) - 144) < 2);
  assert.equal(
    await separator.getAttribute('aria-valuenow'),
    await separator.getAttribute('aria-valuemin'),
  );
  await separator.press('End');
  assert.ok((await diff.boundingBox()).width >= 320);
  await separator.press('Home');
  await drag(70);
  const beforeCancel = await width();
  const cancel = await start();
  await page.mouse.move(cancel.x + 80, cancel.y);
  await separator.press('Escape');
  await page.mouse.up();
  assert.ok(Math.abs((await width()) - beforeCancel) < 2);
  assert.deepEqual(await styles(), originalStyles);
  const lost = await start();
  await page.mouse.move(lost.x + 20, lost.y);
  await separator.evaluate((el) =>
    el.dispatchEvent(
      new PointerEvent('pointercancel', { pointerId: Number(el.dataset.pointer), bubbles: true }),
    ),
  );
  await page.mouse.up();
  assert.ok(Math.abs((await width()) - beforeCancel) < 2);
  await start();
  await frame
    .locator('[data-git-workspace]')
    .evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  assert.deepEqual(await styles(), originalStyles);
  await selectDiffLines(
    frame,
    'new',
    Number(await frame.locator('[data-code-side="new"]').first().getAttribute('data-line')),
  );
  await frame.getByRole('button', { name: '批注', exact: true }).click();
  const editor = frame.getByLabel('批注内容', { exact: true });
  await editor.fill('Keep this unsaved draft while resizing');
  await separator.press('ArrowRight');
  assert.equal(await editor.inputValue(), 'Keep this unsaved draft while resizing');
  assert.equal(await source.evaluate((el) => el.isConnected), true);
  assert.equal(await source.getAttribute('data-diff-source'), sourceId);
  assert.equal(requests, 0, 'Resizing neither queries Git nor submits annotations.');
  page.off('request', listener);
  await editor.press('Escape');
  const remembered = await width();
  await frame.getByRole('button', { name: '收起文件差异', exact: true }).click();
  assert.equal(await separator.count(), 0);
  await frame.locator(`[data-file-id="${selectedFile}"]`).dblclick();
  await separator.waitFor();
  assert.ok(Math.abs((await width()) - remembered) < 2);
  if (process.env.PANEON_TEST_DESKTOP_ONLY !== '1') {
    await start();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await separator.isVisible(), false);
    await page.mouse.up();
    assert.deepEqual(await styles(), originalStyles);
    assert.equal(
      await frame
        .locator('[data-git-workspace]')
        .evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  assert.ok(Math.abs((await width()) - remembered) < 2);
  await frame.getByRole('tab', { name: '提交记录', exact: true }).click();
  assert.equal(await separator.count(), 0);
  await frame.getByRole('tab', { name: '未提交改动', exact: true }).click();
  await separator.waitFor();
  assert.ok(Math.abs((await width()) - remembered) < 2);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: `${artifacts}/changes.png` });
  const comparison = await f.run({
    ...f.params,
    initialView: {
      repositoryId: 'web',
      type: 'compare',
      base: f.rootCommit,
      head: f.feature,
      mode: 'commits',
      file: 'a.ts',
    },
  });
  await page.goto(f.url(comparison));
  await separator.waitFor();
  const compareWidth = await width();
  await drag(-60);
  assert.ok((await width()) < compareWidth - 50);
  assert.equal((await f.events()).length, 0);
  assert.equal((await f.events(comparison)).length, 0);
  assert.deepEqual(errors, []);
  console.log(
    `PASS changes/compare file separator: real pointer and keyboard resize, bounds, cancel/blur, draft/source retention, no Git requests/events, collapse/view memory. Desktop only: ${process.env.PANEON_TEST_DESKTOP_ONLY === '1'}.`,
  );
} finally {
  await browser?.close();
  await f.stop();
}
