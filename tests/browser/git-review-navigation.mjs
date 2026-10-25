import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startGitReviewFixture } from './git-review-fixture.mjs';

const fixture = await startGitReviewFixture();
let browser;
let release;
try {
  const panel = await fixture.run({
    ...fixture.params,
    repositories: [
      ...fixture.params.repositories,
      { id: 'empty', path: './empty', label: 'Empty' },
    ],
    initialView: { repositoryId: 'web', type: 'history' },
  });
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(fixture.url(panel));
  const frame = page.frameLocator('iframe');
  const tab = (name) => frame.getByRole('tab', { name, exact: true });
  await frame.locator('[data-commit-id]').first().waitFor();

  // Real mouse activation calls both focus and mouse-down handlers in Radix Tabs.
  await tab('未提交改动').click();
  await frame.locator('[data-file-id]').first().waitFor();
  assert.equal(await frame.locator('[data-diff-source]').count(), 0);

  await tab('提交记录').click();
  await frame.locator('[data-commit-id]').first().waitFor();
  const calls = [];
  await page.route(`**/api/panels/${panel.instanceId}/actions/*`, async (route) => {
    const request = route.request().postDataJSON()?.input?.request;
    if (request?.repositoryId === 'empty' && request.type === 'changes') {
      calls.push(request);
      if (calls.length === 1) await new Promise((resolve) => (release = resolve));
    }
    await route.continue();
  });
  await frame.getByRole('combobox', { name: '仓库', exact: true }).click();
  await frame.getByRole('option', { name: 'Empty', exact: true }).click();
  await frame.getByText('没有提交记录。', { exact: true }).waitFor();
  await tab('未提交改动').click();
  await frame.locator('[data-file-scroll][aria-busy=true]').waitFor();
  await tab('分支/版本对比').click();
  await tab('未提交改动').click();
  await frame.getByText('工作区干净', { exact: true }).waitFor();
  assert.equal(calls.length, 2, 'An interrupted listing must be loaded again on return.');
  release();
  await frame.getByRole('button', { name: '刷新', exact: true }).waitFor();
  await tab('提交记录').click();
  await tab('未提交改动').click();
  await frame.getByText('工作区干净', { exact: true }).waitFor();
  assert.equal(calls.length, 2, 'A completed empty listing is reusable.');
  assert.deepEqual(errors, []);
  assert.equal((await fixture.events(panel)).length, 0);
  console.log(
    'PASS Git mouse tab activation, interrupted navigation, empty and completed listings.',
  );
} finally {
  release?.();
  await browser?.close();
  await fixture.stop();
}
