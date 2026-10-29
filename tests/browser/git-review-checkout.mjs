import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startGitReviewFixture, createGraphRepository } from './git-review-fixture.mjs';
import { git } from '../git-review-fixture.ts';
import { annotationTools, selectDiffLines, submitAnnotations } from './annotation-tools.mjs';

const f = await startGitReviewFixture();
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-git-review-checkout';
let browser, page;
try {
  await mkdir(artifacts, { recursive: true });
  const graph = await createGraphRepository(f.root);
  const repo = graph.repository;
  await git(repo, 'remote', 'add', 'origin', repo);
  await git(repo, 'update-ref', 'refs/remotes/origin/review/new', graph.tip);
  const otherStatus = await git(f.repo, 'status', '--porcelain');
  const panel = await f.run({
    repositories: [repo],
    initialView: { repositoryPath: repo, type: 'history', commit: graph.tip, file: 'history.ts' },
  });
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [],
    mutations = [],
    reads = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!request.url().includes('/actions/')) return;
    const input = request.postDataJSON()?.input;
    if (input?.target) mutations.push(input);
    if (input?.request) reads.push(input.request);
  });
  await page.goto(f.url(panel));
  const frame = page.frameLocator('iframe');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const tab = (name) => frame.getByRole('tab', { name, exact: true });
  const checkoutItem = () => frame.getByRole('menuitem', { name: 'Checkout', exact: true });
  const toast = (text) => frame.locator('[data-slot="toast"]').filter({ hasText: text });
  const ready = () => frame.locator('[data-file-scroll][aria-busy=false]').waitFor();
  const current = (name) => frame.locator('[data-current-branch=true]').filter({ hasText: name });
  async function checkout(name) {
    await ready();
    await button(name).click({ button: 'right' });
    await checkoutItem().click();
  }
  async function closeToasts() {
    while (await frame.locator('[data-slot="toast"]').count()) {
      // Freeze this toast's identity: a positional locator can start matching the next toast.
      const title = await frame
        .locator('[data-slot="toast"]')
        .first()
        .getAttribute('aria-labelledby');
      assert.ok(title);
      const current = frame.locator(
        `[data-slot="toast"][aria-labelledby=${JSON.stringify(title)}]`,
      );
      await current.locator('[data-slot="toast-close"]').click();
      await current.waitFor({ state: 'detached' });
    }
  }
  await frame.locator('[data-code-side="new"][data-line="1"]').waitFor();
  await button('本地分支 feature/history').click({ button: 'right' });
  await frame.getByRole('menuitem', { name: '与当前分支比较', exact: true }).waitFor();
  assert.equal(await checkoutItem().count(), 0, 'Current branch cannot checkout itself');
  await page.keyboard.press('Escape');
  await button('HEAD（当前分支）').click({ button: 'right' });
  await frame.getByRole('menu').waitFor();
  assert.equal(await checkoutItem().count(), 0, 'HEAD remains navigation only');
  await page.keyboard.press('Escape');

  // Save a real annotation, then warm the mutable tab caches before switching.
  await selectDiffLines(frame, 'new', 1);
  const annotations = annotationTools(frame, page);
  await annotations.write('Keep the original history snapshot');
  await annotations.save();
  await tab('未提交改动').click();
  await ready();
  const changesBefore = reads.filter((request) => request.type === 'changes').length;
  await tab('提交记录').click();
  await ready();
  await button('本地分支 main').click({ button: 'right' });
  await frame.getByRole('menuitem', { name: '与当前分支比较', exact: true }).click();
  await ready();
  await tab('提交记录').click();
  await ready();

  const dirty = join(repo, 'untracked.txt');
  await writeFile(dirty, 'Preserve this file\n');
  await checkout('本地分支 main');
  await toast('请先处理本地改动和未跟踪文件').waitFor();
  assert.equal(await git(repo, 'branch', '--show-current'), 'feature/history');
  assert.equal((await f.events(panel)).length, 0, 'Refusals never emit checkout events');
  await rm(dirty);
  await closeToasts();

  // Hold the mutation request to verify the UI blocks overlapping interactions.
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const actionsURL = `**/api/panels/${panel.instanceId}/actions/*`;
  await page.route(actionsURL, async (route) => {
    if (route.request().postDataJSON()?.input?.target) await gate;
    await route.continue();
  });
  await checkout('本地分支 main');
  try {
    await frame.locator('main[inert][aria-busy=true]').waitFor();
    await frame.getByText('正在切换…', { exact: true }).waitFor();
    assert.equal(mutations.length, 2, 'One mutation per explicit Checkout');
    assert.equal(await git(repo, 'branch', '--show-current'), 'feature/history');
  } finally {
    release();
  }
  await current('main').waitFor();
  await ready();
  await page.unroute(actionsURL);
  await toast('已切换到 main').waitFor();
  assert.equal(await git(repo, 'branch', '--show-current'), 'main');
  const [local] = await f.events(panel);
  assert.equal(local.type, 'git-checkout-completed');
  assert.equal('repositoryId' in local.payload, false);
  assert.equal(local.payload.before.branch, 'feature/history');
  assert.deepEqual(local.payload.after, { branch: 'main', commit: graph.merge });
  assert.equal(local.payload.target.ref, 'refs/heads/main');
  assert.equal(await annotations.count(), 1, 'Checkout preserves annotation drafts');
  await tab('未提交改动').click();
  await ready();
  assert.equal(
    reads.filter((request) => request.type === 'changes').length,
    changesBefore + 1,
    'Changes cache is invalidated',
  );
  await tab('分支/版本对比').click();
  await frame.getByText('选择版本以开始比较', { exact: true }).waitFor();
  assert.equal(
    await frame.locator('[data-file-id]').count(),
    0,
    'Old HEAD comparison is invalidated',
  );
  await tab('提交记录').click();
  await annotations.locate(1);
  await frame.locator('[data-code-side="new"][data-line="1"]').waitFor();
  assert.match(await frame.locator('[data-code-side="new"][data-line="1"]').textContent(), /28/);
  await submitAnnotations(frame);
  await toast('批注已提交').waitFor();
  const submitted = (await f.events(panel)).find((event) => event.type === 'git-review-submitted');
  const source = submitted.payload.files[0];
  assert.equal('repositoryId' in source, false);
  assert.equal(source.view.commit, graph.tip, 'Feedback keeps its original pre-checkout commit');
  await closeToasts();

  await checkout('标签 reviewed');
  await button('HEAD（游离状态）').waitFor();
  await ready();
  await toast('当前为游离 HEAD').waitFor();
  assert.equal(await frame.locator('[data-current-branch]').count(), 0);
  assert.equal(await git(repo, 'rev-parse', '--abbrev-ref', 'HEAD'), 'HEAD');
  const detached = (await f.events(panel))
    .filter((event) => event.type === 'git-checkout-completed')
    .at(-1);
  assert.equal(detached.payload.target.kind, 'tag');
  assert.deepEqual(detached.payload.after, { branch: null, commit: graph.merge });
  await page.screenshot({ path: join(artifacts, 'tag-detached.png') });
  await closeToasts();

  await checkout('远程分支 origin/review/new');
  await current('new').waitFor();
  await ready();
  await toast('已切换到 review/new').waitFor();
  assert.equal(
    await git(repo, 'rev-parse', '--symbolic-full-name', '@{upstream}'),
    'refs/remotes/origin/review/new',
  );
  const eventCount = (await f.events(panel)).length;
  await closeToasts();
  await checkout('远程分支 origin/main');
  await toast('已存在同名本地分支').waitFor();
  assert.equal((await f.events(panel)).length, eventCount);
  assert.equal(await git(repo, 'branch', '--show-current'), 'review/new');
  await closeToasts();

  // Persistence failure is a warning only. Neither the checkout nor event retries.
  let eventAttempts = 0;
  const eventsURL = `**/api/panels/${panel.instanceId}/events`;
  await page.route(eventsURL, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    eventAttempts++;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: { code: 'TEST_FAILURE', message: 'Intentional event failure' },
      }),
    });
  });
  const beforeFailure = mutations.length;
  await checkout('本地分支 main');
  await toast('切换已成功，但通知 agent 失败').waitFor();
  await current('main').waitFor();
  await ready();
  assert.equal(await git(repo, 'branch', '--show-current'), 'main');
  assert.equal((await f.events(panel)).length, eventCount);
  await page.waitForTimeout(300);
  assert.equal(eventAttempts, 1);
  assert.equal(mutations.length, beforeFailure + 1);
  await page.screenshot({ path: join(artifacts, 'notification-failed.png') });
  await page.unroute(eventsURL);
  await closeToasts();

  await git(repo, 'checkout', '-q', 'feature/history');
  await checkout('本地分支 feature/cache');
  await toast('HEAD 或目标引用已变化').waitFor();
  assert.equal(await git(repo, 'branch', '--show-current'), 'feature/history');
  assert.equal((await f.events(panel)).length, eventCount);
  assert.equal(
    await git(f.repo, 'status', '--porcelain'),
    otherStatus,
    'Other repositories are untouched',
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      mutations: mutations.length,
      completed: 3,
      eventAttempts,
      artifacts,
      checked:
        'branch/remote/tag, dirty/collision/stale refusal, current/HEAD menus, inert UI, cache invalidation, retained annotation evidence and toast-only event failure',
    }),
  );
} catch (error) {
  await page?.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await f.stop();
}
