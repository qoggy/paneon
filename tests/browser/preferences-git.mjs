import { selectDiffLines } from './annotation-tools.mjs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startGitReviewFixture } from './git-review-fixture.mjs';
const f = await startGitReviewFixture();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const requests = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/actions/')) requests.push(r.url());
  });
  await page.goto(f.url());
  const frame = page.frameLocator('iframe');
  await frame.locator('[data-diff-source]').waitFor();
  await frame.getByRole('tab', { name: '提交记录', exact: true }).click();
  await frame.locator('[data-commit-id]').first().waitFor();
  await frame.locator('[data-commit-id]').first().click();
  await frame.locator('[data-file-id]').first().waitFor();
  await frame.locator('[data-file-id]').first().click();
  await frame.locator('[data-diff-source]').waitFor();
  const selectedFile = await frame
    .locator('[data-file-id][aria-pressed=true]')
    .getAttribute('data-file-id');
  const selectedCommit = await frame
    .locator('[data-commit-id][aria-pressed=true]')
    .getAttribute('data-commit-id');
  await selectDiffLines(
    frame,
    'new',
    Number(await frame.locator('[data-code-side="new"]').first().getAttribute('data-line')),
  );
  await frame.getByRole('button', { name: '批注', exact: true }).click();
  await frame.getByLabel('批注内容', { exact: true }).fill('Git 原文缓冲 🙂');
  const calls = requests.length;
  const src = await page.locator('iframe').getAttribute('src');
  for (const [theme, language] of [
    ['dark', 'en'],
    ['dark', 'zh-CN'],
    ['light', 'en'],
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
    await frame.locator(`html[lang="${language}"][data-theme="${theme}"]`).waitFor();
    assert.equal(
      await frame.locator('[data-file-id][aria-pressed=true]').getAttribute('data-file-id'),
      selectedFile,
    );
    assert.equal(
      await frame.locator('[data-commit-id][aria-pressed=true]').getAttribute('data-commit-id'),
      selectedCommit,
    );
    assert.equal(
      await frame
        .getByLabel(language === 'en' ? 'Annotation text' : '批注内容', { exact: true })
        .inputValue(),
      'Git 原文缓冲 🙂',
    );
    assert.equal(await page.locator('iframe').getAttribute('src'), src);
  }
  assert.equal(requests.length, calls);
  assert.equal((await f.events()).length, 0);
  console.log(
    JSON.stringify({
      ok: true,
      combinations: 4,
      gitFilePreserved: true,
      gitCommitPreserved: true,
      commentEditorPreserved: true,
      queryCount: calls,
      eventCount: 0,
    }),
  );
} finally {
  await browser?.close();
  await f.stop();
}
