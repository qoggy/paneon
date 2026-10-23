import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { git } from '../git-review-fixture.ts';
import { startGitReviewFixture } from './git-review-fixture.mjs';
const f = await startGitReviewFixture();
let browser;
try {
  const tree = await git(f.repo, 'rev-parse', 'HEAD^{tree}');
  let tip = f.feature;
  for (let index = 0; index < 53; index++)
    tip = await git(f.repo, 'commit-tree', tree, '-p', tip, '-m', `component page ${index}`);
  await git(f.repo, 'update-ref', 'refs/heads/main', tip);
  const panel = await f.service.runtime.run(
    join(f.root, 'agent-skills/paneon/assets/examples/git-components/panel.tsx'),
    f.root,
    { repositoryPath: f.repo },
    false,
  );
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors = [],
    requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/actions/')) requests.push(request.postDataJSON()?.input);
  });
  await page.goto(f.url(panel));
  const frame = page.frameLocator('iframe');
  await frame.locator('[data-history-ref]').first().waitFor();
  await frame.locator('[data-commit-id]').first().waitFor();
  await frame.locator('[data-file-id]').first().waitFor();
  await frame.locator('[data-diff-source]').waitFor();
  assert.equal(await frame.locator('[data-code-side="old"]').first().innerText(), 'old text\n');
  assert.equal(
    await frame.locator('[data-feedback-object]').count(),
    0,
    'String Diff needs no annotation provider.',
  );
  assert.ok(!requests.some((input) => input?.file), 'No file blobs before selection.');
  assert.equal(await frame.locator('[data-commit-id]').count(), 50);
  const newer = await git(f.repo, 'commit-tree', tree, '-p', tip, '-m', 'new branch tip');
  await git(f.repo, 'update-ref', 'refs/heads/main', newer);
  await frame.getByRole('button', { name: '加载更多（每批 50）', exact: true }).click();
  await frame.locator(`[data-commit-id="${f.feature}"]`).waitFor();
  assert.equal(await frame.locator('[data-commit-id]').count(), 55);
  assert.equal(await frame.locator(`[data-commit-id="${newer}"]`).count(), 0);
  assert.ok(
    requests.some(
      (input) => input?.request?.historyContext?.tip === tip && input?.request?.offset === 50,
    ),
  );
  await frame.locator('[data-file-id]').first().click();
  await frame.locator('[data-code-side="new"]').filter({ hasText: 'n = 4' }).waitFor();
  assert.ok(
    requests.some((input) => input?.file?.read?.entry),
    'Selected file uses its complete explicit descriptor.',
  );
  await frame.locator(`[data-commit-id="${f.feature}"]`).click();
  await frame.locator('[data-file-id]').first().click();
  await frame.locator('[data-code-side="new"]').filter({ hasText: 'n = 2' }).waitFor();
  await frame.getByRole('button', { name: '本地分支 base', exact: true }).click();
  await frame.locator(`[data-commit-id="${f.feature}"]`).waitFor({ state: 'hidden' });
  await frame.locator(`[data-commit-id="${f.rootCommit}"]`).waitFor();
  assert.equal(await frame.locator(`[data-commit-id="${f.feature}"]`).count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      standaloneBranches: true,
      standaloneGraph: true,
      fixedTipPaging: true,
      lazyFiles: true,
      stringDiffWithoutProvider: true,
      errors,
    }),
  );
} finally {
  await browser?.close();
  await f.stop();
}
