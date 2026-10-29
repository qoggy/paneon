import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startGitReviewFixture } from './git-review-fixture.mjs';

const f = await startGitReviewFixture();
const execute = promisify(execFile);
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-git-file-toolbar';
let browser, page;
const errors = [];
try {
  await mkdir(artifacts, { recursive: true });
  const repository = join(f.root, 'toolbar-repo');
  await mkdir(join(repository, 'src', 'nested'), { recursive: true });
  await mkdir(join(repository, 'tests'), { recursive: true });
  const git = async (...args) => (await execute('git', ['-C', repository, ...args])).stdout.trim();
  await git('init', '-q', '-b', 'main');
  await git('config', 'user.name', 'Toolbar reviewer');
  await git('config', 'user.email', 'toolbar@example.test');
  const paths = ['src/nested/first.ts', 'tests/first.ts', 'root.ts'];
  for (const path of paths) await writeFile(join(repository, path), 'export const value = 1;\n');
  await git('add', '.');
  await git('commit', '-qm', 'Create files');
  const base = await git('rev-parse', 'HEAD');
  for (const path of paths) await writeFile(join(repository, path), 'export const value = 2;\n');
  await git('commit', '-qam', 'Update files');
  const tip = await git('rev-parse', 'HEAD');
  await writeFile(join(repository, paths[0]), 'export const value = 3;\n');
  await git('add', paths[0]);
  await writeFile(join(repository, paths[0]), 'export const value = 4;\n');
  await writeFile(join(repository, 'tests/new.ts'), 'export const added = true;\n');
  const params = { repositories: [repository] };
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const calls = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/actions/')) calls.push(request.postDataJSON()?.input);
  });
  const frame = page.frameLocator('iframe');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const files = frame.locator('[data-file-id]');
  const groupToggle = button('按目录分组');
  const expand = button('全部展开'),
    collapse = button('全部折叠');
  const openDiff = button('查看文件差异');
  const toolbar = frame.getByRole('toolbar', { name: '文件操作', exact: true });
  async function waitForFiles(count) {
    await files.first().waitFor();
    assert.equal(await files.count(), count);
  }
  // Working changes default to flat; Git-area groups can still be folded.
  const changes = await f.run({
    ...params,
    initialView: { repositoryPath: repository, type: 'changes' },
  });
  await page.goto(f.url(changes));
  await waitForFiles(3);
  assert.equal(await groupToggle.getAttribute('aria-pressed'), 'false');
  assert.equal(await frame.locator('[data-file-directory]').count(), 0);
  assert.equal(await files.first().locator('[data-file-parent]').textContent(), 'src/nested');
  assert.equal(await frame.locator('[data-git-diff-scroll]').count(), 0);
  async function checkFileActivation() {
    const target = files.last();
    const id = await target.getAttribute('data-file-id');
    const before = calls.length;
    await target.click();
    assert.equal(await target.getAttribute('aria-pressed'), 'true');
    await page.waitForTimeout(200);
    assert.equal(calls.length, before, 'Single-click only selects and does not read Git');
    assert.equal(await frame.locator('[data-git-diff-scroll]').count(), 0);
    await target.dblclick();
    await frame.locator('[data-diff-source]').waitFor();
    assert.equal(await target.getAttribute('aria-pressed'), 'true');
    const openedSource = await frame.locator('[data-diff-source]').getAttribute('data-diff-source');
    await files.first().click();
    assert.equal(await files.first().getAttribute('aria-pressed'), 'true');
    assert.equal(
      await frame.locator('[data-diff-source]').getAttribute('data-diff-source'),
      openedSource,
      'Single-click preserves the open diff',
    );
    await openDiff.click();
    await frame
      .locator(`[data-diff-source]:not([data-diff-source=${JSON.stringify(openedSource)}])`)
      .waitFor();
    await button('收起文件差异').click();
    await target.focus();
    await target.press('Enter');
    await frame.locator('[data-git-diff-scroll]').waitFor({ state: 'visible' });
    assert.equal(await target.getAttribute('data-file-id'), id);
    await button('收起文件差异').click();
  }
  await checkFileActivation();
  // Restore no selection to exercise the toolbar's first-file fallback.
  await page.goto(f.url(changes));
  await waitForFiles(3);
  // Working-change descriptors belong to this fresh listing, not the earlier page load.
  const firstId = await files.first().getAttribute('data-file-id');
  assert.equal(await openDiff.isEnabled(), true);
  assert.equal(await toolbar.getByRole('button').count(), 4);
  for (const label of ['查看文件差异', '按目录分组', '全部展开', '全部折叠']) {
    const control = button(label);
    assert.equal((await control.innerText()).trim(), '');
    const box = await control.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
    await frame
      .locator('[data-slot=\"tooltip-content\"]')
      .filter({ hasText: label })
      .waitFor({ timeout: 5000 });
    await page.mouse.move(500, 500, { steps: 10 });
    await frame
      .locator('[data-slot=\"tooltip-content\"]')
      .filter({ hasText: label })
      .waitFor({ state: 'hidden', timeout: 5000 });
  }
  const boxes = await toolbar
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().toJSON()));
  assert.ok(
    boxes[2].left - boxes[1].right > boxes[1].left - boxes[0].right,
    'Toolbar has two left and two right actions',
  );
  const beforePresentation = calls.length;
  assert.equal(await frame.locator('[data-file-id][aria-pressed=true]').count(), 0);
  async function keyboardFold(trigger) {
    const id = await trigger.getAttribute('aria-controls');
    assert.ok(id, 'The fold trigger identifies its controlled content');
    const content = frame.locator(`[id=${JSON.stringify(id)}]`);
    await trigger.focus();
    await trigger.press('Enter');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(await content.isVisible(), false);
    assert.equal(await trigger.evaluate((el) => el.ownerDocument.activeElement === el), true);
    await trigger.press('Space');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    await content.waitFor({ state: 'visible' });
  }
  await keyboardFold(frame.locator('[data-file-area="staged"]'));
  await collapse.click();
  assert.equal(await files.count(), 0);
  assert.equal(await frame.locator('[data-file-area][aria-expanded=false]').count(), 3);
  await expand.click();
  await waitForFiles(3);
  await groupToggle.click();
  await frame.locator('[data-file-directory]').first().waitFor();
  await keyboardFold(frame.locator('[data-file-directory]').first());
  await collapse.click();
  assert.equal(await files.count(), 0);
  await expand.click();
  await waitForFiles(3);
  await groupToggle.click();
  assert.equal(calls.length, beforePresentation, 'Grouping and folding do not query Git');
  await openDiff.click();
  await frame.locator('[data-diff-source]').waitFor();
  assert.equal(await files.first().getAttribute('data-file-id'), firstId);
  assert.equal(
    await frame.locator('[data-file-id][aria-pressed=true]').getAttribute('data-file-id'),
    firstId,
  );
  const source = await frame.locator('[data-diff-source]').getAttribute('data-diff-source');
  await button('收起文件差异').click();
  await openDiff.click();
  await frame.locator('[data-git-diff-scroll]').waitFor({ state: 'visible' });
  assert.equal(await frame.locator('[data-diff-source]').getAttribute('data-diff-source'), source);
  const beforeToggle = calls.length;
  await groupToggle.click();
  assert.equal(await frame.locator('[data-diff-source]').getAttribute('data-diff-source'), source);
  assert.equal(calls.length, beforeToggle);
  await page.screenshot({ path: join(artifacts, 'changes-grouped.png'), fullPage: true });
  await groupToggle.click();
  await page.screenshot({ path: join(artifacts, 'changes-flat.png'), fullPage: true });
  // Preferences survive tab remounts; history has its own default and preference.
  await groupToggle.click();
  await frame.getByText('提交记录', { exact: true }).click();
  await waitForFiles(3);
  assert.equal(await groupToggle.getAttribute('aria-pressed'), 'true');
  await groupToggle.click();
  assert.equal(await collapse.isDisabled(), true);
  assert.equal(await expand.isDisabled(), true);
  const duplicateNames = files.filter({ hasText: 'first.ts' });
  assert.equal(await duplicateNames.count(), 2);
  assert.deepEqual(await duplicateNames.locator('[data-file-parent]').allTextContents(), [
    'src/nested',
    'tests',
  ]);
  await frame.getByText('未提交改动', { exact: true }).click();
  await files.first().waitFor();
  assert.equal(await groupToggle.getAttribute('aria-pressed'), 'true');
  await frame.getByText('提交记录', { exact: true }).click();
  await files.first().waitFor();
  assert.equal(await groupToggle.getAttribute('aria-pressed'), 'false');
  // History and comparison start grouped and open a first file only on explicit request.
  for (const initialView of [
    { repositoryPath: repository, type: 'history', commit: tip },
    { repositoryPath: repository, type: 'compare', mode: 'commits', base, head: tip },
  ]) {
    const panel = await f.run({ ...params, initialView });
    await page.goto(f.url(panel));
    await waitForFiles(3);
    assert.equal(await groupToggle.getAttribute('aria-pressed'), 'true');
    assert.equal(await frame.locator('[data-git-diff-scroll]').count(), 0);
    await checkFileActivation();
    await page.goto(f.url(panel));
    await waitForFiles(3);
    await collapse.click();
    assert.equal(await files.count(), 1, 'Root files remain visible when directories collapse');
    await expand.click();
    await waitForFiles(3);
    const first = await files.first().getAttribute('data-file-id');
    await openDiff.click();
    await frame.locator('[data-diff-source]').waitFor();
    assert.equal(
      await frame.locator('[data-file-id][aria-pressed=true]').getAttribute('data-file-id'),
      first,
    );
    await page.screenshot({ path: join(artifacts, `${initialView.type}.png`), fullPage: true });
    await groupToggle.click();
    assert.equal(await collapse.isDisabled(), true);
  }
  // A single changed file still has a usable action, while an empty comparison does not.
  await git('restore', '--staged', '--worktree', '--', paths[0]);
  const single = await f.run({
    ...params,
    initialView: { repositoryPath: repository, type: 'changes' },
  });
  await page.goto(f.url(single));
  await waitForFiles(1);
  await openDiff.click();
  await frame.locator('[data-diff-source]').waitFor();
  const empty = await f.run({
    ...params,
    initialView: {
      repositoryPath: repository,
      type: 'compare',
      mode: 'commits',
      base: tip,
      head: tip,
    },
  });
  await page.goto(f.url(empty));
  await frame.getByText('两个版本之间没有文件差异', { exact: true }).waitFor();
  assert.equal(await toolbar.count(), 0, 'Empty comparisons hide the file toolbar.');
  await git('clean', '-fd');
  const emptyChanges = await f.run({
    ...params,
    initialView: { repositoryPath: repository, type: 'changes' },
  });
  await page.goto(f.url(emptyChanges));
  const emptyMessage = frame.getByText('工作区干净', { exact: true });
  await emptyMessage.waitFor();
  assert.equal(await toolbar.count(), 0, 'A clean working tree hides the file toolbar.');
  assert.deepEqual(errors, []);
  assert.equal((await f.events(changes)).length, 0);
  console.log(JSON.stringify({ status: 'passed', artifacts, errors }));
} catch (error) {
  console.error(error, { errors });
  await page?.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true });
  for (const content of page?.frames() ?? []) {
    if (content.url().endsWith('/frame.html'))
      console.error(await content.locator('body').innerText());
  }
  throw error;
} finally {
  await browser?.close();
  await f.stop();
}
