import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startGitReviewFixture, createGraphRepository } from './git-review-fixture.mjs';
import { git } from '../git-review-fixture.ts';

const fixture = await startGitReviewFixture();
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-git-history-view-changes';
let browser;
try {
  await mkdir(artifacts, { recursive: true });
  const graph = await createGraphRepository(fixture.root);
  const root = await git(graph.repository, 'rev-list', '--max-parents=0', graph.tip);
  const firstParent = await git(graph.repository, 'rev-parse', `${graph.merge}^1`);
  const tree = await git(graph.repository, 'rev-parse', `${graph.tip}^{tree}`);
  let tip = graph.tip;
  for (let i = 0; i < 35; i++)
    tip = await git(graph.repository, 'commit-tree', tree, '-p', tip, '-m', `Empty commit ${i}`);
  await git(graph.repository, 'update-ref', 'refs/heads/feature/history', tip);
  const panel = await fixture.run({
    repositories: [graph.repository, fixture.repo],
    initialView: { repositoryPath: graph.repository, type: 'history', commit: graph.merge },
  });
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const comparisons = [];
  const historyRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!request.url().includes('/actions/')) return;
    const input = request.postDataJSON()?.input?.request;
    if (input?.type === 'compare') comparisons.push(input);
    if (input?.type === 'history') historyRequests.push(input);
  });
  await page.goto(fixture.url(panel));
  const frame = page.frameLocator('iframe');
  const row = (oid) => frame.locator(`[data-commit-id="${oid}"]`);
  const action = () => frame.getByRole('menuitem', { name: '查看改动', exact: true });
  const tab = (name) => frame.getByRole('tab', { name, exact: true });
  await row(graph.merge).waitFor();
  await frame.locator('[data-file-scroll][aria-busy=false]').waitFor();
  await frame
    .getByRole('button', { name: '本地分支 main', exact: true })
    .click({ button: 'right' });
  assert.equal(await action().count(), 0, 'View Changes belongs to commit rows, not branch refs.');
  await page.keyboard.press('Escape');

  async function viewChanges(commit, parent, paths, { keyboard = false } = {}) {
    const requestsBefore = historyRequests.length;
    await row(commit).locator('[data-commit-subject]').click({ button: 'right' });
    await action().waitFor();
    assert.deepEqual(await frame.getByRole('menuitem').allTextContents(), [
      '查看改动',
      '与当前分支比较',
    ]);
    const scrollBefore = await frame
      .locator('[data-commit-scroll]')
      .evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft }));
    const selectionBefore = await frame
      .locator('[data-commit-id][aria-pressed=true]')
      .getAttribute('data-commit-id');
    const callsBefore = comparisons.length;
    if (keyboard) {
      await action().focus();
      await page.keyboard.press('Enter');
    } else await action().click();
    await frame.locator('[data-file-scroll][aria-busy=false]').waitFor();
    assert.equal(await tab('分支/版本对比').getAttribute('aria-selected'), 'true');
    assert.equal(comparisons.length, callsBefore + 1);
    assert.equal(comparisons.at(-1).base, parent);
    assert.equal(comparisons.at(-1).head, commit);
    assert.equal(comparisons.at(-1).mode, 'commits');
    assert.equal(historyRequests.length, requestsBefore);
    assert.match(
      await frame.getByRole('combobox', { name: '基线', exact: true }).textContent(),
      new RegExp(parent ?? '空树'),
    );
    assert.match(
      await frame.getByRole('combobox', { name: '当前版本', exact: true }).textContent(),
      new RegExp(commit),
    );
    const files = frame.locator('[data-file-id]');
    assert.deepEqual((await files.allTextContents()).map((value) => value.trim()).sort(), paths);
    if (paths.length) {
      await frame.locator('[data-diff-source]').waitFor();
      assert.ok(
        (await frame.locator('[data-git-diff-scroll]').boundingBox()).height > 500,
        'Compare gives the diff the full workspace height.',
      );
    } else assert.equal(await frame.locator('[data-diff-source]').count(), 0);
    assert.equal(await frame.getByRole('alert').count(), 0);
    if (commit === graph.merge)
      assert.match(await frame.locator('main').textContent(), /合并提交，只展示第一父差异/);
    await page.screenshot({
      path: `${artifacts}/${parent === null ? 'root' : paths.length ? 'commit' : 'empty'}.png`,
    });
    await tab('提交记录').click();
    await row(graph.merge).waitFor();
    assert.equal(
      await frame.locator('[data-commit-id][aria-pressed=true]').getAttribute('data-commit-id'),
      selectionBefore,
    );
    assert.deepEqual(
      await frame
        .locator('[data-commit-scroll]')
        .evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft })),
      scrollBefore,
    );
    assert.equal(
      historyRequests.length,
      requestsBefore,
      'Returning to History restores the saved view without reloading.',
    );
  }

  await viewChanges(graph.tip, graph.merge, ['history.tsM']);
  await viewChanges(graph.merge, firstParent, ['cache.test.tsA', 'cache.tsA'], { keyboard: true });
  await viewChanges(root, null, ['README.mdA']);
  await viewChanges(tip, await git(graph.repository, 'rev-parse', `${tip}^1`), []);

  await frame.getByRole('button', { name: '仓库', exact: true }).click();
  await frame.getByRole('button', { name: /^web · / }).click();
  await row(fixture.rootCommit).waitFor();
  await row(fixture.rootCommit).locator('[data-commit-subject]').click({ button: 'right' });
  await action().click();
  await frame.locator('[data-diff-source]').waitFor();
  assert.equal(comparisons.at(-1).head, fixture.rootCommit);
  assert.equal(comparisons.at(-1).base, null);
  assert.equal(await git(graph.repository, 'rev-parse', 'HEAD'), tip);
  assert.equal(await git(fixture.repo, 'rev-parse', 'HEAD'), fixture.feature);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      checked:
        'normal/merge/root/empty commits, keyboard, large diff, History restoration, repository scope, unchanged HEAD',
      comparisons: comparisons.length,
    }),
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
