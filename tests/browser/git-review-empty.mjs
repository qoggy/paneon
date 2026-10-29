import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { git } from '../git-review-fixture.ts';
import { startGitReviewFixture } from './git-review-fixture.mjs';

const fixture = await startGitReviewFixture();
const evidence = '/tmp/paneon-git-review-empty';
let browser;
try {
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(fixture.url());
  const frame = page.frameLocator('iframe');
  const empty = frame.locator('[data-slot="empty"]');
  const toolbar = frame.getByRole('toolbar', { name: '文件操作', exact: true });
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const prefs = async (language, theme) => {
    await page.evaluate(
      async (ui) => {
        const response = await fetch('/api/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ui }),
        });
        if (!response.ok) throw new Error(`Preferences: ${response.status}`);
      },
      { language, theme },
    );
    await frame.locator(`html[lang="${language}"][data-theme="${theme}"]`).waitFor();
  };
  const chooseBase = async (revision) => {
    await frame.getByRole('combobox', { name: '基线', exact: true }).click();
    const dialog = frame.getByRole('dialog', { name: '选择基线', exact: true });
    await dialog.getByRole('combobox').fill(revision);
    await dialog.getByRole('option', { name: `使用版本 ${revision}`, exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  };
  await toolbar.waitFor();
  await frame.getByRole('tab', { name: '分支/版本对比', exact: true }).click();
  await empty.getByText('选择版本以开始比较', { exact: true }).waitFor();
  assert.equal(await toolbar.count(), 0);
  assert.equal(await button('比较').isDisabled(), true);
  assert.equal(await frame.getByText('该范围没有文件改动。', { exact: true }).count(), 0);
  for (const [language, theme, width] of [
    ['zh-CN', 'light', 1440],
    ['en', 'light', 1440],
    ['zh-CN', 'dark', 1024],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await prefs(language, theme);
    const box = await empty.boundingBox();
    const workspace = await frame.locator('[data-git-workspace]').boundingBox();
    const title = await empty.locator('[data-slot="empty-title"]').boundingBox();
    assert.ok(Math.abs(title.x + title.width / 2 - workspace.x - workspace.width / 2) < 2);
    assert.ok(title.y - box.y >= 78 && title.y - box.y <= 82, '80px top padding');
    assert.equal(await empty.locator('button, svg').count(), 0);
    await page.screenshot({ path: `${evidence}/initial-${language}-${theme}-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await prefs('zh-CN', 'light');
  await chooseBase('HEAD');
  // Pause the actual comparison request to check that loading does not claim an empty result.
  let release;
  let entered;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const intercepted = new Promise((resolve) => {
    entered = resolve;
  });
  await page.route('**/actions/**', async (route) => {
    entered();
    await gate;
    await route.continue();
  });
  await button('比较').click();
  await intercepted;
  assert.equal(await empty.count(), 0);
  assert.equal(await toolbar.count(), 0);
  release();
  await empty.getByText('两个版本之间没有文件差异', { exact: true }).waitFor();
  await page.unroute('**/actions/**');
  assert.equal(await toolbar.count(), 0);
  await page.screenshot({ path: `${evidence}/no-differences.png` });
  await chooseBase(fixture.rootCommit);
  await button('比较').click();
  await frame.locator('[data-file-id]').first().waitFor();
  await toolbar.waitFor();
  assert.equal(await empty.count(), 0, 'Real differences restore the file toolbar');
  await chooseBase('missing-revision-for-empty-state-test');
  await button('比较').click();
  await frame.getByRole('alert').waitFor();
  assert.equal(await empty.count(), 0, 'A failed comparison is not an empty result');
  assert.equal(await toolbar.count(), 0);
  const unborn = await fixture.run({
    repositories: [fixture.empty],
    initialView: { repositoryPath: fixture.empty, type: 'history' },
  });
  await page.goto(fixture.url(unborn));
  await frame
    .getByRole('region', { name: '提交历史', exact: true })
    .locator('[data-slot="empty"]')
    .getByText('没有提交记录。', { exact: true })
    .waitFor();
  await git(fixture.empty, 'commit', '--allow-empty', '-qm', 'Empty commit');
  const params = {
    repositories: [fixture.empty],
  };
  const clean = await fixture.run(params);
  await page.goto(fixture.url(clean));
  await empty.getByText('工作区干净', { exact: true }).waitFor();
  assert.equal(await toolbar.count(), 0);
  await page.screenshot({ path: `${evidence}/clean.png` });
  await frame.getByRole('tab', { name: '提交记录', exact: true }).click();
  await empty.getByText('此提交没有文件改动', { exact: true }).waitFor();
  assert.equal(await toolbar.count(), 0);
  await page.screenshot({ path: `${evidence}/empty-commit.png` });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      evidence,
      states: [
        'initial',
        'loading',
        'no differences',
        'differences',
        'error',
        'clean',
        'no commits',
        'empty commit',
      ],
      initialVariants: 3,
    }),
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
