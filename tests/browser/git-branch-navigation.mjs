import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startGitReviewFixture, createGraphRepository } from './git-review-fixture.mjs';
import { git } from '../git-review-fixture.ts';

const fixture = await startGitReviewFixture();
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-git-branch-navigation';
let browser;
const releases = [];
try {
  await mkdir(artifacts, { recursive: true });
  const graph = await createGraphRepository(fixture.root);
  for (let i = 0; i < 30; i++)
    await git(graph.repository, 'branch', `archive/branch-${String(i).padStart(2, '0')}`);
  for (let i = 0; i < 16; i++)
    await git(graph.repository, 'branch', `topic-${String(i).padStart(2, '0')}`);
  const panel = await fixture.run({
    repositories: [{ id: 'graph', path: graph.repository }],
    initialView: { repositoryId: 'graph', type: 'history' },
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
  const sidebar = frame.getByRole('complementary', { name: '历史分支', exact: true });
  const branch = (name) => sidebar.getByRole('button', { name, exact: true });
  const refs = sidebar.locator('[data-history-ref]');
  const nav = sidebar.getByRole('navigation');
  await frame.locator(`[data-commit-id="${graph.tip}"]`).waitFor();
  const featureOrder = await refs.evaluateAll((elements) =>
    elements
      .map((el) => el.getAttribute('data-history-ref'))
      .filter((ref) => ref.startsWith('refs/heads/feature/')),
  );
  assert.deepEqual(featureOrder, [
    'refs/heads/feature/history',
    'refs/heads/feature/cache',
    'refs/heads/feature/unmerged',
  ]);
  await branch('分支目录 archive').click();
  await nav.evaluate((el) => {
    el.scrollTop = 24;
  });
  const before = {
    refs: await refs.count(),
    scroll: await nav.evaluate((el) => el.scrollTop),
  };
  assert.ok(before.scroll > 0, 'The fixture exercises a scrolled branch tree.');
  const main = branch('本地分支 main');
  const retained = await main.elementHandle();
  const current = await sidebar.locator('[data-current-branch]').elementHandle();
  const url = `**/api/panels/${panel.instanceId}/actions/*`;
  let started;
  const requested = new Promise((resolve) => (started = resolve));
  await page.route(url, async (route) => {
    if (route.request().postDataJSON()?.input?.request?.branch === 'refs/heads/main') {
      started();
      await new Promise((resolve) => releases.push(resolve));
    }
    await route.continue();
  });
  await main.click();
  await requested;
  await frame.locator('[data-file-scroll][aria-busy=true]').waitFor();
  await page.screenshot({ path: `${artifacts}/pending.png` });
  const pending = {
    refs: await refs.count(),
    retained: await retained.evaluate((el) => el.isConnected),
    currentRetained: await current.evaluate((el) => el.isConnected),
    scroll: await nav.evaluate((el) => el.scrollTop),
    commits: await frame.locator('[data-commit-id]').count(),
    files: await frame.locator('[data-file-id]').count(),
  };
  console.log(JSON.stringify({ before, pending }));
  assert.equal(pending.refs, before.refs, 'Branch refs stay visible while a branch loads.');
  assert.equal(pending.retained, true, 'The clicked branch button is not removed.');
  assert.equal(pending.currentRetained, true, 'Current branch decorations stay mounted.');
  assert.equal(pending.scroll, before.scroll, 'Branch scrolling does not jump.');
  assert.equal(await main.getAttribute('aria-pressed'), 'true');
  assert.equal(await main.evaluate((el) => el === document.activeElement), true);
  assert.equal(pending.commits, 0, 'Old branch commits are cleared during navigation.');
  assert.equal(pending.files, 0, 'Old commit files are cleared during navigation.');
  releases.pop()();
  await frame.locator(`[data-commit-id="${graph.merge}"]`).waitFor();
  assert.equal(await retained.evaluate((el) => el.isConnected), true);
  assert.equal(await main.getAttribute('aria-pressed'), 'true');
  assert.equal(await frame.locator(`[data-commit-id="${graph.tip}"]`).count(), 0);
  assert.equal(await branch('分支目录 archive').getAttribute('aria-expanded'), 'false');
  await page.screenshot({ path: `${artifacts}/loaded.png` });

  // A delayed old branch cannot replace a newer branch, and search remains in place.
  await sidebar.getByRole('textbox', { name: '搜索分支或标签' }).fill('feature');
  await branch('HEAD（当前分支）').click();
  await frame.locator(`[data-commit-id="${graph.tip}"]`).waitFor();
  assert.equal(
    await sidebar.getByRole('textbox', { name: '搜索分支或标签' }).inputValue(),
    'feature',
  );
  await sidebar.getByRole('textbox', { name: '搜索分支或标签' }).fill('');
  await main.click();
  await frame.locator('[data-file-scroll][aria-busy=true]').waitFor();
  await branch('本地分支 feature/unmerged').click();
  await frame.locator(`[data-commit-id="${graph.unrelated}"]`).waitFor();
  const response = page.waitForResponse(
    (res) => res.request().postDataJSON()?.input?.request?.branch === 'refs/heads/main',
  );
  releases.pop()();
  await response;
  await page.unroute(url);
  await page.waitForTimeout(100);
  assert.equal(await branch('本地分支 feature/unmerged').getAttribute('aria-pressed'), 'true');
  assert.equal(await frame.locator(`[data-commit-id="${graph.unrelated}"]`).count(), 1);
  assert.equal(await frame.locator(`[data-commit-id="${graph.tip}"]`).count(), 0);

  // Selecting a commit in the same graph retains its rows; double-click still opens a diff.
  const commit = frame.locator('[data-commit-id]').last();
  const retainedCommit = await commit.elementHandle();
  const commitCount = await frame.locator('[data-commit-id]').count();
  await commit.click();
  await frame.locator('[data-file-scroll][aria-busy=false] [data-file-id]').first().waitFor();
  assert.equal(await retainedCommit.evaluate((el) => el.isConnected), true);
  assert.equal(await commit.getAttribute('aria-pressed'), 'true');
  assert.equal(await frame.locator('[data-commit-id]').count(), commitCount);
  await frame.locator('[data-file-id]').first().dblclick();
  await frame.locator('[data-diff-source]').waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'PASS Branch navigation retains refs, focus, scroll and folders; latest response wins.',
  );
} finally {
  for (const release of releases) release();
  await browser?.close();
  await fixture.stop();
}
