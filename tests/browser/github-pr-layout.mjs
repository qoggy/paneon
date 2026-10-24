import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startGithubPRFixture } from './github-pr-fixture.mjs';

const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-pr-redesign';
await mkdir(artifacts, { recursive: true });
const fixture = await startGithubPRFixture();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(fixture.url());
  const frame = page.frameLocator('iframe');
  const content = () => page.frames().find((item) => item.url().endsWith('/frame.html'));
  await frame.locator('[data-markdown-annotation]').waitFor();
  await frame.getByRole('button', { name: '#101 Review cache behavior', exact: true }).waitFor();
  const results = [];
  assert.equal(
    await frame
      .getByRole('button', { name: /^(Select objects|选择对象|Finish selecting|结束选择)$/ })
      .count(),
    0,
  );
  for (const [theme, language] of [
    ['light', 'zh-CN'],
    ['dark', 'en'],
  ]) {
    await page.evaluate(
      async (ui) => {
        const result = await fetch('/api/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ui }),
        });
        if (!result.ok) throw new Error('Preference update failed');
      },
      { theme, language },
    );
    await frame.locator(`html[lang="${language}"][data-theme="${theme}"]`).waitFor();
    assert.equal(
      await frame
        .getByRole('button', { name: /^(整体批注|Overall annotation)$/, exact: true })
        .count(),
      0,
    );
    assert.equal(
      await frame
        .getByText(/^(批注仅发送给当前 AI|Annotations go to your AI, not GitHub)$/)
        .count(),
      0,
    );
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [tab, label] of [
        ['overview', language === 'en' ? 'Overview' : '概览'],
        ['files', language === 'en' ? 'Files changed' : '文件改动'],
        ['checks', language === 'en' ? 'Checks' : '检查'],
      ]) {
        await frame.getByRole('tab', { name: label, exact: true }).click();
        if (tab === 'overview') await frame.locator('[data-markdown-annotation]').waitFor();
        if (tab === 'files') await frame.locator('[data-diff-source]').waitFor();
        if (tab === 'checks') await frame.locator('[data-pr-check]').first().waitFor();
        await frame.locator('[aria-busy="true"]').waitFor({ state: 'hidden' });
        const geometry = await content().evaluate(() => {
          const main = document.querySelector('main');
          const bounds = main.getBoundingClientRect();
          return {
            viewport: innerWidth,
            document: document.documentElement.scrollWidth,
            contentWidth: bounds.width,
            contentRight: bounds.right,
            background: getComputedStyle(document.body).backgroundColor,
          };
        });
        assert.ok(
          geometry.document <= geometry.viewport + 1,
          `${theme} ${width} ${tab}: page overflow`,
        );
        assert.ok(geometry.contentRight <= geometry.viewport + 1, `${tab}: content escapes page`);
        assert.ok(geometry.contentWidth >= 600, `${width}: PR content is too narrow`);
        const text = await frame.locator('[data-pr-page]').innerText();
        for (const implementation of [
          'statusCheckRollup',
          'initialPullRequest',
          'compare API',
          'CR_NODE_1',
          '固定比较：merge-base',
        ]) {
          assert.ok(
            !text.includes(implementation),
            `Implementation detail leaked: ${implementation}`,
          );
        }
        await page.screenshot({
          path: join(artifacts, `pr-${tab}-${width}-${theme}.png`),
          fullPage: true,
        });
        results.push({ theme, language, width, tab, ...geometry });
      }
    }
  }
  // The sandbox does not permit native form submission. Both click and Enter must query.
  const search = frame.getByRole('textbox', { name: 'Search PRs', exact: true });
  await search.fill('第二个');
  await search.press('Enter');
  await frame.getByText('1 loaded', { exact: true }).waitFor();
  assert.ok(
    (await fixture.calls()).some((args) => args.includes('--search') && args.includes('第二个')),
  );
  await search.fill('');
  await frame.getByRole('button', { name: 'Search', exact: true }).click();
  await frame.getByText('30 loaded', { exact: true }).waitFor();
  assert.equal((await fixture.events()).length, 0, 'Browsing must not send annotations');
  assert.deepEqual(errors, []);
  await writeFile(join(artifacts, 'layout-results.json'), JSON.stringify(results, null, 2));
  console.log(
    'PR desktop layout passed: 1024/1440, overview/files/checks, light Chinese/dark English, search click/Enter, no page overflow or browsing events.',
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
