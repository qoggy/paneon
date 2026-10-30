import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startGitReviewFixture } from './git-review-fixture.mjs';
import {
  assertAnnotationEditorOpensAfterLocate,
  annotationTools,
  assertEditorBlocksAnnotationNavigation,
  selectDiffLines,
  waitForAnnotationScrollIdle,
} from './annotation-tools.mjs';

const fixture = await startGitReviewFixture();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(fixture.url());
  const frame = page.frameLocator('iframe');
  const comments = annotationTools(frame, page);
  const history = frame.getByRole('tab', { name: '提交记录', exact: true });
  const changes = frame.getByRole('tab', {
    name: '未提交改动',
    exact: true,
    includeHidden: true,
  });
  await frame.getByRole('button', { name: '未暂存 · M a.ts', exact: true }).dblclick();
  await frame.locator('[data-code-side="new"][data-line="2"]').waitFor();
  const content = page.frames().find((candidate) => candidate.url().endsWith('/frame.html'));
  await selectDiffLines(frame, 'new', 2);
  await comments.write('Keep the uncommitted snapshot across tabs');
  await comments.save();
  const launcher = frame.getByRole('button', { name: /^批注 \(\d+\)$/ });
  const directory = frame.getByRole('dialog', { name: '批注目录', exact: true });

  for (const scenario of ['history', 'commit', 'file']) {
    await history.click();
    await frame.locator('[data-commit-id]').first().waitFor();
    if (scenario !== 'history') {
      await frame.locator(`[data-commit-id="${fixture.rootCommit}"]`).click();
      await frame.locator('[data-file-id]').first().waitFor();
    }
    if (scenario === 'file') {
      await frame.getByRole('button', { name: 'A a.ts', exact: true }).dblclick();
      await frame.locator('[data-diff-source]').waitFor();
    }

    // Hover keeps the current tab focused. Closing must not restore that stale focus
    // after locating the annotation has switched to a different tab.
    await launcher.hover();
    await directory.waitFor();
    await frame.getByRole('button', { name: '定位批注 1', exact: true }).click();
    await directory.waitFor({ state: 'hidden' });
    await launcher.and(frame.locator(':focus')).waitFor();
    assert.equal(await changes.getAttribute('aria-selected'), 'true', scenario);
    await frame.getByRole('note').filter({ hasText: '回看保留快照' }).waitFor();
    assert.equal(
      await frame.locator('[data-code-side="new"][data-line="2"]').textContent(),
      'const n = 4;\r\n',
      scenario,
    );
    await content.waitForFunction(() => {
      const line = document
        .querySelector('[data-code-side="new"][data-line="2"]')
        .getBoundingClientRect();
      const viewport = document.querySelector('[data-diff-viewport]').getBoundingClientRect();
      return line.top >= viewport.top && line.bottom <= viewport.bottom;
    });
    await page.mouse.move(0, 0);
    await history.click();
    await assertAnnotationEditorOpensAfterLocate(
      frame,
      '[data-code-side="new"][data-line="2"]',
      () => comments.edit(1),
    );
    const input = frame.getByLabel('批注内容', { exact: true });
    await input.and(frame.locator(':focus')).waitFor();
    assert.equal(await input.inputValue(), 'Keep the uncommitted snapshot across tabs');
    assert.equal(await changes.getAttribute('aria-selected'), 'true', scenario);
    await input.press('Escape');
  }

  // Keep one annotation in each view, then try to switch while the first editor is open.
  await history.click();
  await frame.locator(`[data-commit-id="${fixture.rootCommit}"]`).click();
  await frame.getByRole('button', { name: 'A a.ts', exact: true }).dblclick();
  await selectDiffLines(frame, 'new', 2);
  await comments.write('History annotation 2');
  await comments.save();
  await comments.edit(1);
  const input = frame.getByLabel('批注内容', { exact: true });
  await input.fill('Unsaved uncommitted correction');
  await waitForAnnotationScrollIdle(frame);
  const source = await frame.locator('[data-diff-source]').getAttribute('data-diff-source');
  const scroll = await frame
    .locator('[data-diff-viewport]')
    .evaluate((element) => element.scrollTop);
  await assertEditorBlocksAnnotationNavigation(frame, 2, async (action) => {
    assert.equal(await changes.getAttribute('aria-selected'), 'true', action);
    assert.equal(await input.inputValue(), 'Unsaved uncommitted correction', action);
    assert.equal(
      await frame.locator('[data-diff-source]').getAttribute('data-diff-source'),
      source,
      action,
    );
    assert.equal(
      await frame.locator('[data-diff-viewport]').evaluate((element) => element.scrollTop),
      scroll,
      action,
    );
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await assertEditorBlocksAnnotationNavigation(frame, 2);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await input.press('Escape');
  await comments.edit(2);
  assert.equal(await input.inputValue(), 'History annotation 2');
  await input.press('Escape');
  await comments.edit(1);
  assert.equal(await input.inputValue(), 'Keep the uncommitted snapshot across tabs');
  await input.fill('Saved uncommitted correction');
  await comments.save();
  await comments.edit(2);
  assert.equal(await input.inputValue(), 'History annotation 2');
  await input.press('Escape');
  assert.equal((await fixture.events()).length, 0, 'Editor navigation never submits annotations.');
  assert.deepEqual(errors, []);
  console.log(
    'Git annotation navigation passed: hover locate and edit restore the uncommitted snapshot from history, selected commit and opened historical file without stale focus reactivating the history tab.',
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
