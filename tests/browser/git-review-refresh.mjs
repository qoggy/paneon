import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { git } from '../git-review-fixture.ts';
import { startGitReviewFixture } from './git-review-fixture.mjs';

const f = await startGitReviewFixture();
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-git-review-refresh';
let browser, page;
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(f.url());
  const frame = page.frameLocator('iframe');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const diff = frame.locator('[data-diff-source]');
  const ready = () => frame.locator('[data-file-scroll][aria-busy=false]').waitFor();
  const assertCleared = async () => {
    await ready();
    assert.equal(await frame.getByText('读取失败', { exact: true }).count(), 0);
    assert.equal(await diff.count(), 0, 'The vanished selection must not display its old diff');
  };
  await diff.waitFor();
  await button('未暂存 · M a.ts').dblclick();
  await frame
    .locator('[data-code-side="new"][data-line="2"]')
    .filter({ hasText: 'n = 4' })
    .waitFor();

  // A surviving selection still refreshes its contents.
  await writeFile(join(f.repo, 'a.ts'), 'const refreshed = true;\n');
  await button('刷新').click();
  await frame
    .locator('[data-code-side="new"][data-line="1"]')
    .filter({ hasText: 'refreshed' })
    .waitFor();

  // Moving to the index must not silently select a different area with the same path.
  await git(f.repo, 'add', '--', 'a.ts');
  await button('刷新').click();
  await assertCleared();
  await button('已暂存 · M a.ts').dblclick();
  await diff.waitFor();

  // Committing the selected file keeps other changes visible and clears the diff.
  await git(f.repo, 'commit', '-qm', 'Commit selected changes');
  await button('刷新').click();
  await assertCleared();
  assert.ok((await frame.locator('[data-file-id]').count()) > 0);
  assert.equal(await button('已暂存 · M a.ts').count(), 0);

  // Browser reload reuses initialView.file even though that file is no longer changed.
  await page.reload();
  await assertCleared();
  await button('未暂存 · M tracked.log').dblclick();
  await diff.waitFor();
  await git(f.repo, 'add', '-A');
  await git(f.repo, 'commit', '-qm', 'Commit remaining changes');
  await button('刷新').click();
  await assertCleared();
  await frame.getByText('没有未提交的文件改动', { exact: true }).waitFor();
  await page.reload();
  await frame.getByText('没有未提交的文件改动', { exact: true }).waitFor();
  await assertCleared();
  assert.deepEqual(errors, []);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, 'clean-after-commit.png') });
  console.log(
    'Git review refresh and browser reload clear vanished selections after staging and committing.',
  );
} catch (error) {
  if (page) {
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: join(artifacts, 'failure.png') });
  }
  throw error;
} finally {
  await browser?.close();
  await f.stop();
}
