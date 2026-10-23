import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startTableReviewFixture } from './table-review-fixture.mjs';
import { startGithubPRFixture } from './github-pr-fixture.mjs';
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-ui-preferences-evidence';
await mkdir(artifacts, { recursive: true });
const table = await startTableReviewFixture();
let pr, browser;
try {
  const review = await table.runReview();
  pr = await startGithubPRFixture();
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const tablePage = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await tablePage.goto(table.url(table.table));
  const tf = tablePage.frameLocator('iframe');
  await tf.getByLabel('搜索全表', { exact: true }).fill('same');
  const reviewPage = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await reviewPage.goto(table.url(review));
  const rf = reviewPage.frameLocator('iframe');
  await rf.locator('.markdown-body h1').waitFor();
  await rf.locator('.markdown-body h1').evaluate((element) => {
    window.__originalArticleText = element.firstChild;
  });
  const prPage = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const queries = [];
  prPage.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/actions/')) queries.push(r.url());
  });
  await prPage.goto(pr.url());
  const pf = prPage.frameLocator('iframe');
  await pf.locator('[data-pr-overview]').waitFor();
  const originalTitle = await pf.locator('[data-pr-overview] h2').textContent();
  await pf.getByLabel('搜索 PR', { exact: true }).fill('Unsaved search 原文');
  const calls = queries.length;
  const panels = [
    ['table', tablePage, tf],
    ['review', reviewPage, rf],
    ['pr', prPage, pf],
  ];
  for (const [theme, language] of [
    ['light', 'en'],
    ['light', 'zh-CN'],
    ['dark', 'en'],
    ['dark', 'zh-CN'],
  ]) {
    for (const page of [tablePage, prPage])
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
    for (const [name, page, frame] of panels) {
      await frame.locator(`html[lang="${language}"][data-theme="${theme}"]`).waitFor();
      await frame
        .getByRole('button', {
          name: language === 'en' ? 'Submit annotations' : '提交批注',
          exact: true,
        })
        .waitFor();
      await frame.locator('body').evaluate(async (element) => {
        await Promise.all(
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
            .map((animation) => animation.finished.catch(() => {})),
        );
      });
      await page.screenshot({
        path: join(artifacts, `${name}-${theme}-${language}.png`),
        fullPage: true,
      });
    }
    assert.equal(
      await tf
        .getByLabel(language === 'en' ? 'Search all cells' : '搜索全表', { exact: true })
        .inputValue(),
      'same',
    );
    assert.equal(
      await pf
        .getByLabel(language === 'en' ? 'Search PRs' : '搜索 PR', { exact: true })
        .inputValue(),
      'Unsaved search 原文',
    );
    assert.equal(await pf.locator('[data-pr-overview] h2').textContent(), originalTitle);
    assert.equal(
      await rf
        .locator('.markdown-body h1')
        .evaluate((element) => element.firstChild === window.__originalArticleText),
      true,
    );
  }
  assert.equal(queries.length, calls);
  assert.equal((await table.events(table.table)).length, 0);
  assert.equal((await table.events(review)).length, 0);
  assert.equal((await pr.events()).length, 0);
  for (const [name, page, frame] of panels) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: join(artifacts, `${name}-dark-zh-CN-narrow.png`),
      fullPage: true,
    });
    assert.equal(
      await frame.locator('body').evaluate((element) => element.scrollWidth <= innerWidth),
      true,
    );
  }
  console.log(
    JSON.stringify({
      ok: true,
      pages: ['table', 'review', 'pr'],
      combinations: 4,
      narrow: true,
      tableFilterPreserved: true,
      prSearchPreserved: true,
      reviewTextNodeStable: true,
      prQueryCount: calls,
      events: 0,
      artifacts,
    }),
  );
} finally {
  await browser?.close();
  await pr?.stop();
  await table.stop();
}
