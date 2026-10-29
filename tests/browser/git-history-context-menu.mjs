import assert from 'node:assert/strict';
import { mkdir, realpath } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startGitReviewFixture, createGraphRepository } from './git-review-fixture.mjs';
import { git } from '../git-review-fixture.ts';

const fixture = await startGitReviewFixture();
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-git-history-context-menu';
let browser;
try {
  await mkdir(artifacts, { recursive: true });
  const graph = await createGraphRepository(fixture.root);
  // A branch and a tag with the same name must remain distinct comparison targets.
  await git(graph.repository, 'tag', 'main', graph.tip);
  const panel = await fixture.run({
    repositories: [graph.repository, fixture.repo],
    initialView: { repositoryPath: graph.repository, type: 'history' },
  });
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const comparisons = [];
  const repositoryIds = new Map();
  const historyRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!request.url().includes('/actions/')) return;
    const body = request.postDataJSON()?.input;
    for (const repository of body?.params?.repositories ?? [])
      repositoryIds.set(repository.path, repository.id);
    const input = body?.request;
    if (input?.type === 'compare') comparisons.push(input);
    if (input?.type === 'history') historyRequests.push(input);
  });
  await page.goto(fixture.url(panel));
  const frame = page.frameLocator('iframe');
  const tab = (name) => frame.getByRole('tab', { name, exact: true, includeHidden: true });
  const button = (name) => frame.getByRole('button', { name, exact: true, includeHidden: true });
  const item = () => frame.getByRole('menuitem', { name: '与当前分支比较', exact: true });
  const row = (oid) => frame.locator(`[data-commit-id="${oid}"]`);
  const selected = () => frame.locator('[data-commit-id][aria-pressed=true]');
  await row(graph.tip).waitFor();
  const before = await selected().getAttribute('data-commit-id');
  const beforeHistoryRequests = historyRequests.length;
  await button('本地分支 main').click({ button: 'right' });
  await item().waitFor();
  assert.equal(await button('本地分支 main').getAttribute('aria-pressed'), 'true');
  assert.equal(await button('本地分支 main').getAttribute('data-variant'), 'secondary');
  assert.equal(historyRequests.length, beforeHistoryRequests, 'Right-click only selects the row.');
  assert.equal(await selected().getAttribute('data-commit-id'), before);
  assert.equal(await tab('提交记录').getAttribute('aria-selected'), 'true');
  assert.equal(comparisons.length, 0, 'Opening the menu does not perform a comparison.');
  await page.screenshot({ path: `${artifacts}/branch-menu.png` });
  await page.keyboard.press('Escape');
  await item().waitFor({ state: 'hidden' });
  assert.equal(await button('本地分支 main').getAttribute('aria-pressed'), 'true');
  assert.equal(await selected().getAttribute('data-commit-id'), before);
  assert.equal(comparisons.length, 0);

  async function compare(
    target,
    base,
    { empty = false, repositoryPath = graph.repository, keyboard = false } = {},
  ) {
    const calls = comparisons.length;
    const selection = await selected().getAttribute('data-commit-id');
    await target.click({ button: 'right' });
    await item().waitFor();
    if (await target.getAttribute('data-history-ref')) {
      assert.equal(await target.getAttribute('aria-pressed'), 'true');
      assert.equal(await target.getAttribute('data-variant'), 'secondary');
    }
    assert.equal(await frame.getByRole('menu').count(), 1, 'Nested ref menus open only once.');
    assert.equal(await selected().getAttribute('data-commit-id'), selection);
    if (keyboard) {
      await item().focus();
      await page.keyboard.press('Enter');
    } else await item().click();
    await frame.getByRole('combobox', { name: '基线', exact: true }).waitFor();
    await frame.locator('[data-file-scroll][aria-busy=false]').waitFor();
    await item().waitFor({ state: 'hidden' });
    assert.equal(await tab('分支/版本对比').getAttribute('aria-selected'), 'true');
    assert.equal(comparisons.length, calls + 1, 'Selecting the action runs one comparison.');
    assert.deepEqual(comparisons.at(-1), {
      repositoryId: repositoryIds.get(await realpath(repositoryPath)),
      type: 'compare',
      base,
      head: 'HEAD',
      mode: 'commits',
    });
    assert.ok(
      (await frame.getByRole('combobox', { name: '基线', exact: true }).textContent()).includes(
        base,
      ),
    );
    assert.match(
      await frame.getByRole('combobox', { name: '当前版本', exact: true }).textContent(),
      /HEAD/,
    );
    assert.match(
      await frame.getByRole('combobox', { name: '比较方式', exact: true }).textContent(),
      /Two-dot diff/,
    );
    assert.equal(await frame.getByRole('alert').count(), 0);
    if (empty) assert.equal(await frame.locator('[data-file-id]').count(), 0);
    else await frame.locator('[data-file-id]').first().waitFor();
    assert.equal(await git(graph.repository, 'symbolic-ref', '--short', 'HEAD'), 'feature/history');
  }
  async function history() {
    await tab('提交记录').click();
    await frame.locator('[data-commit-id]').first().waitFor();
  }

  await compare(button('本地分支 main'), 'refs/heads/main');
  await button('M history.ts').dblclick();
  await frame.locator('[data-diff-source]').waitFor();
  assert.match((await frame.locator('[data-code-side="old"]').allTextContents()).join(''), /36/);
  assert.match((await frame.locator('[data-code-side="new"]').allTextContents()).join(''), /28/);
  await page.screenshot({ path: `${artifacts}/comparison.png` });

  await history();
  await button('本地分支 feature/cache').dblclick();
  await frame.locator('[data-file-scroll][aria-busy=false]').waitFor();
  await compare(button('远程分支 origin/main'), 'refs/remotes/origin/main', { keyboard: true });
  await history();
  await button('HEAD（当前分支）').dblclick();
  await row(graph.tip).waitFor();
  await frame.locator('[data-file-scroll][aria-busy=false]').waitFor();
  await compare(button('标签 reviewed'), 'refs/tags/reviewed');
  await history();
  await compare(row(graph.merge).locator('[data-commit-subject]'), graph.merge);
  await history();
  await compare(
    row(graph.merge).locator('[data-commit-ref="tag"]').filter({ hasText: 'reviewed' }),
    'refs/tags/reviewed',
  );
  await history();
  await compare(
    row(graph.merge)
      .locator('[data-commit-ref="branch"]')
      .filter({ hasText: /^main$/ }),
    'refs/heads/main',
  );
  await history();
  await compare(button('标签 main'), 'refs/tags/main', { empty: true });
  await history();
  await compare(button('HEAD（当前分支）'), 'HEAD', { empty: true });

  await history();
  await frame.getByRole('button', { name: '仓库', exact: true }).click();
  await frame.getByRole('button', { name: /^web · / }).click();
  await row(fixture.feature).waitFor();
  await compare(button('本地分支 base'), 'refs/heads/base', { repositoryPath: fixture.repo });
  await button('M a.ts').dblclick();
  await frame.locator('[data-diff-source]').waitFor();
  assert.match((await frame.locator('[data-code-side="new"]').allTextContents()).join(''), /n = 2/);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      comparisons: comparisons.length,
      checked:
        'refs, tags, commits, decorations, HEAD, repository scope, diff direction, Escape and keyboard',
      errors,
    }),
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
