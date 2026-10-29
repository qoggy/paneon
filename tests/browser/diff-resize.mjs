import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startGitReviewFixture } from './git-review-fixture.mjs';

const fixture = await startGitReviewFixture();
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-diff-resize';
let browser;
try {
  await mkdir(artifacts, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const frame = page.frameLocator('iframe');
  const sidebar = frame.getByRole('separator', { name: '调整文件列表与差异宽度', exact: true });
  const divider = frame.getByRole('separator', { name: '调整差异两侧宽度', exact: true });

  async function assertAlignment() {
    const geometry = await frame.locator('[data-diff-source]').evaluate(async (element) => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const divider = element.querySelector('[data-diff-divider]');
      const track = element.querySelector('[data-diff-column-layout]').getBoundingClientRect();
      const line = divider.getBoundingClientRect();
      return {
        line: line.left + line.width / 2,
        expected:
          track.left +
          ((track.width - 1) * Number(divider.getAttribute('aria-valuenow'))) / 100 +
          0.5,
        boundaries: [
          ...element.querySelectorAll('[data-diff-source-header="old"], [data-diff-scroll="old"]'),
        ].map((pane) => pane.getBoundingClientRect().right),
      };
    });
    assert.ok(geometry.boundaries.length >= 2);
    assert.ok(
      Math.abs(geometry.line - geometry.expected) <= 1 &&
        geometry.boundaries.every((boundary) => Math.abs(boundary - geometry.line) <= 1),
      `Divider, headers and all code hunks must align: ${JSON.stringify(geometry)}`,
    );
  }

  async function checkPanel(panel, name) {
    await page.goto(fixture.url(panel));
    await divider.waitFor();
    await assertAlignment();
    const source = await frame.locator('[data-code-side="new"]').first().elementHandle();
    let requests = 0;
    const observe = (request) => {
      if (request.url().includes('/actions/')) requests++;
    };
    page.on('request', observe);
    async function dragSidebar(delta) {
      const before = await frame.locator('[data-diff-column-layout]').boundingBox();
      const handle = await sidebar.boundingBox();
      const y = handle.y + handle.height / 2;
      await page.mouse.move(handle.x + handle.width / 2, y);
      await page.mouse.down();
      await page.mouse.move(handle.x + handle.width / 2 + delta, y, { steps: 8 });
      await page.mouse.up();
      const after = await frame.locator('[data-diff-column-layout]').boundingBox();
      assert.ok(Math.abs(after.width - before.width + delta) < 2);
      await assertAlignment();
    }
    // Reproduce the reported gesture with the default 50:50 split, in both directions.
    await dragSidebar(-90);
    await page.screenshot({ path: join(artifacts, `${name}-narrow-tree.png`) });
    await dragSidebar(60);
    // Keep a custom split aligned across outer panel and browser resizing.
    for (let i = 0; i < 6; i++) await divider.press('ArrowRight');
    const ratio = Number(await divider.getAttribute('aria-valuenow'));
    assert.ok(ratio > 55);
    await dragSidebar(-60);
    await dragSidebar(60);
    for (const width of [1200, 1600, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await assertAlignment();
      assert.ok(Math.abs(Number(await divider.getAttribute('aria-valuenow')) - ratio) < 0.01);
    }
    // Recalculate minimum constraints when the outer pane reaches its limits.
    for (const key of ['Home', 'End', 'Home']) {
      await sidebar.press(key);
      await assertAlignment();
    }
    assert.equal(await source.evaluate((element) => element.isConnected), true);
    await frame.getByRole('button', { name: '收起上下文', exact: true }).click();
    await assertAlignment();
    await dragSidebar(60);
    await frame.getByRole('button', { name: '展开全部上下文', exact: true }).click();
    await assertAlignment();
    assert.equal(requests, 0, 'Resizing retains source DOM and does not read files or Git.');
    page.off('request', observe);
    console.log(
      `PASS ${name}: sidebar drag, window resize, custom ratio, limits and all hunk boundaries`,
    );
  }

  await checkPanel(fixture.panel, 'git-review-changes');
  const comparison = await fixture.run({
    ...fixture.params,
    initialView: {
      repositoryPath: fixture.repo,
      type: 'compare',
      base: fixture.rootCommit,
      head: fixture.feature,
      mode: 'commits',
      file: 'a.ts',
    },
  });
  await checkPanel(comparison, 'git-review-compare');
  const original = Array.from({ length: 80 }, (_, i) => `export const line${i} = ${i};\n`).join('');
  const proposed = original
    .replace('line20 = 20', 'line20 = 200')
    .replace('line60 = 60', 'line60 = 600');
  await writeFile(join(fixture.root, 'original.ts'), original);
  await writeFile(join(fixture.root, 'proposed.ts'), proposed);
  const diffReview = await fixture.service.runtime.run(
    join(fixture.root, 'agent-skills/paneon/assets/panels/diff-review/panel.tsx'),
    fixture.root,
    { files: [{ displayPath: 'sample.ts', oldPath: 'original.ts', newPath: 'proposed.ts' }] },
    false,
  );
  await checkPanel(diffReview, 'diff-review');
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await fixture.stop();
}
