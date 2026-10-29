import assert from 'node:assert/strict';
import { mkdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { chromium } from 'playwright';
import { startGitReviewFixture, createGraphRepository } from './git-review-fixture.mjs';
import { git } from '../git-review-fixture.ts';
import { annotationTools, selectDiffLines, submitAnnotations } from './annotation-tools.mjs';

const f = await startGitReviewFixture();
const evidence = '/tmp/paneon-git-review-repositories';
let browser, page, release;
try {
  await mkdir(evidence, { recursive: true });
  await mkdir(join(f.repo, 'nested'));
  await mkdir(join(f.repo, 'nested', 'deep-only-match'));
  const alias = join(f.root, 'web-alias');
  await symlink(f.repo, alias);
  await symlink(f.empty, join(f.root, 'empty-alias'));
  const root = await realpath(f.root);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(f.url());
  const frame = page.frameLocator('iframe');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const addDialog = frame.getByRole('dialog', { name: '添加仓库', exact: true });
  const manage = frame.getByRole('dialog', { name: '仓库', exact: true });
  const browseDialog = frame.getByRole('dialog', { name: '选择目录', exact: true });
  const selector = button('仓库');
  const openMenu = () => selector.click();
  const openAdd = async () => {
    await openMenu();
    await manage.getByRole('button', { name: '添加仓库', exact: true }).click();
    await addDialog.waitFor();
  };
  const reason = async (entry, text) => {
    await entry.locator('[data-removal-control]').hover();
    await frame.locator('[data-slot="tooltip-content"]').filter({ hasText: text }).waitFor();
    await page.mouse.move(0, 0);
    await frame
      .locator('[data-slot="tooltip-content"]')
      .filter({ hasText: text })
      .waitFor({ state: 'hidden' });
  };
  const path = addDialog.getByRole('textbox', { name: '仓库目录', exact: true });
  const add = () => addDialog.getByRole('button', { name: '添加', exact: true }).click();
  const close = async (dialog) => {
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
  };
  const row = (key) =>
    ['web', 'server'].includes(key)
      ? manage.locator('[data-repository-id]').filter({ hasText: join(root, key) })
      : manage.locator(`[data-repository-id="${key}"]`);
  const remove = (entry) => entry.getByRole('button', { name: '移除仓库', exact: true });
  const switchTo = async (label) => {
    await frame.getByRole('button', { name: '仓库', exact: true }).click();
    await frame.getByRole('button', { name: new RegExp(`^${label} · `) }).click();
    await frame.locator('[data-file-scroll][aria-busy=false]').waitFor();
  };
  const comments = annotationTools(frame, page);
  await frame.locator('[data-diff-source]').waitFor();

  await openMenu();
  const originalWebId = await row('web').getAttribute('data-repository-id');
  assert.equal(await manage.locator('[data-slot="popover-title"]').count(), 0);
  assert.deepEqual(
    await row('web')
      .getByText('web', { exact: true })
      .evaluate((element) => ({
        size: getComputedStyle(element).fontSize,
        weight: getComputedStyle(element).fontWeight,
      })),
    { size: '12px', weight: '500' },
  );
  assert.equal(await manage.locator('[data-slot="badge"]').count(), 0);
  assert.equal(await remove(row('web')).isEnabled(), false);
  assert.equal(await manage.getByText('当前', { exact: true }).count(), 0);
  assert.equal(
    await row('web')
      .getByText(/切换|未提交/)
      .count(),
    0,
  );
  await reason(row('web'), '请先切换到其他仓库。');
  await page.screenshot({ path: join(evidence, 'repository-picker.png') });
  assert.equal(await remove(row('server')).isEnabled(), true);
  await close(manage);

  await openAdd();
  assert.equal(await path.getAttribute('placeholder'), '绝对路径');
  assert.equal(await addDialog.locator('label.sr-only').count(), 1);
  assert.equal(
    await addDialog
      .locator('[data-slot="dialog-footer"]')
      .evaluate((element) => getComputedStyle(element).borderTopWidth),
    '0px',
  );
  assert.equal(await addDialog.evaluate((element) => getComputedStyle(element).padding), '24px');
  assert.equal(await addDialog.evaluate((element) => getComputedStyle(element).width), '512px');
  for (const candidate of ['./empty', '~/empty']) {
    await path.fill(candidate);
    await add();
    await addDialog.getByText('请输入绝对路径。', { exact: true }).waitFor();
    assert.equal(await path.inputValue(), candidate);
  }
  for (const candidate of [f.repo, join(f.repo, 'nested'), alias]) {
    await path.fill(candidate);
    await add();
    await addDialog.getByText('该仓库已在列表中。', { exact: true }).waitFor();
    assert.equal(await path.inputValue(), candidate);
  }
  await path.fill(join(f.root, 'missing'));
  await add();
  await addDialog.getByText('目录不存在。', { exact: true }).waitFor();
  assert.equal(await path.getAttribute('aria-invalid'), 'true');
  assert.equal(await addDialog.locator('[data-slot="alert"]').count(), 0);
  assert.equal(await addDialog.getByText(/ENOENT|stat|realpath/).count(), 0);
  await page.screenshot({ path: join(evidence, 'invalid-path.png') });
  await path.fill(join(f.repo, 'a.ts'));
  await add();
  await addDialog.getByText('请选择目录，不能选择文件。', { exact: true }).waitFor();
  await path.fill(f.root);
  await add();
  await addDialog.getByText('无法打开此仓库。', { exact: true }).waitFor();
  await path.fill(join(f.root, 'missing'));
  await addDialog.getByRole('button', { name: '浏览…', exact: true }).click();
  await browseDialog.getByText('目录不存在。', { exact: true }).waitFor();
  assert.equal(await browseDialog.getByText(/ENOENT|stat|realpath/).count(), 0);
  await browseDialog.getByRole('button', { name: '返回', exact: true }).click();
  await close(addDialog);
  assert.match(await frame.getByRole('button', { name: '仓库', exact: true }).innerText(), /^web$/);

  // Hold validation, cancel through the visible button, then deliver the stale result.
  let intercepted;
  let continued;
  let held = false;
  const arrived = new Promise((resolve) => {
    intercepted = resolve;
  });
  const validationContinued = new Promise((resolve) => {
    continued = resolve;
  });
  await page.route(`**/api/panels/${f.panel.instanceId}/actions/*`, async (route) => {
    if (!held && route.request().postDataJSON()?.input?.path === f.empty) {
      held = true;
      intercepted();
      await new Promise((resolve) => {
        release = resolve;
      });
      await route.continue();
      continued();
      return;
    }
    await route.continue();
  });
  await openAdd();
  await path.fill(f.empty);
  await add();
  await arrived;
  await addDialog.getByRole('button', { name: '取消', exact: true }).click();
  await addDialog.waitFor({ state: 'hidden' });
  release();
  release = undefined;
  await validationContinued;
  await page.unroute(`**/api/panels/${f.panel.instanceId}/actions/*`);
  await openMenu();
  assert.equal(await manage.locator('[data-repository-id]').count(), 2);
  await close(manage);

  // Returning from an in-flight browse keeps the input and ignores its late directory result.
  await openAdd();
  await path.fill(f.repo);
  await addDialog.evaluate(async (element) => {
    await Promise.allSettled(element.getAnimations().map((animation) => animation.finished));
    window.__repositoryDialogTransitions = [];
    element.addEventListener('transitionrun', (event) => {
      if (event.target === element) window.__repositoryDialogTransitions.push(event.propertyName);
    });
  });
  let browseArrived;
  const browseStarted = new Promise((resolve) => {
    browseArrived = resolve;
  });
  await page.route(`**/api/panels/${f.panel.instanceId}/actions/*`, async (route) => {
    if (route.request().postDataJSON()?.input?.path === f.repo) {
      browseArrived();
      await new Promise((resolve) => {
        release = resolve;
      });
    }
    await route.continue();
  });
  await addDialog.getByRole('button', { name: '浏览…', exact: true }).click();
  await browseStarted;
  assert.equal(
    await browseDialog.evaluate((element) => getComputedStyle(element).transitionProperty),
    'none',
  );
  await browseDialog.getByRole('button', { name: '返回', exact: true }).click();
  const lateBrowse = page.waitForResponse(
    (response) => response.request().postDataJSON()?.input?.path === f.repo,
  );
  release();
  release = undefined;
  await (await lateBrowse).finished();
  await frame
    .locator('body')
    .evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  assert.equal(await addDialog.isVisible(), true);
  assert.equal(await browseDialog.count(), 0);
  assert.equal(await path.inputValue(), f.repo);
  assert.deepEqual(
    await addDialog.evaluate(() => window.__repositoryDialogTransitions),
    [],
    'Browse and Back must not animate the dialog layout.',
  );
  assert.equal(await addDialog.getByText('仅支持绝对路径', { exact: true }).count(), 0);
  await page.screenshot({ path: join(evidence, 'add-repository.png') });
  await close(addDialog);
  await page.unroute(`**/api/panels/${f.panel.instanceId}/actions/*`);

  // Browse starts at the current repository; choose its sibling without uploading files.
  await openAdd();
  await addDialog.getByRole('button', { name: '浏览…', exact: true }).click();
  const breadcrumb = browseDialog.getByRole('navigation', { name: '目录路径', exact: true });
  await breadcrumb.locator('[data-slot="breadcrumb-list"]').waitFor();
  const filter = browseDialog.getByRole('textbox', { name: '筛选本级目录', exact: true });
  const directories = browseDialog.getByLabel('子目录', { exact: true });
  await directories.getByRole('button', { name: 'nested', exact: true }).waitFor();
  const listHeight = await directories.evaluate((element) => element.clientHeight);
  await filter.fill('nEsTeD');
  assert.deepEqual(await directories.getByRole('button').allTextContents(), ['nested']);
  await filter.fill('deep-only-match');
  await directories.getByText('没有匹配的目录。', { exact: true }).waitFor();
  assert.equal(await directories.getByRole('button').count(), 0);
  assert.equal(await directories.evaluate((element) => element.clientHeight), listHeight);
  await browseDialog.getByRole('button', { name: '清除搜索', exact: true }).click();
  assert.equal(await filter.inputValue(), '');
  await directories.getByRole('button', { name: 'nested', exact: true }).waitFor();
  await filter.fill('nested');
  await directories.getByRole('button', { name: 'nested', exact: true }).dblclick();
  await breadcrumb.locator('[aria-current="page"]').filter({ hasText: 'nested' }).waitFor();
  assert.equal(await filter.inputValue(), '');
  await filter.fill('deep');
  await directories.getByRole('button', { name: 'deep-only-match', exact: true }).press('Enter');
  await directories.getByText('没有子目录。', { exact: true }).waitFor();
  assert.equal(await filter.inputValue(), '');
  await filter.fill('anything');
  await browseDialog.getByRole('button', { name: '上级目录', exact: true }).click();
  await directories.getByRole('button', { name: 'deep-only-match', exact: true }).waitFor();
  assert.equal(await filter.inputValue(), '');
  await filter.fill('not-found');
  await breadcrumb.getByRole('button', { name: basename(root), exact: true }).focus();
  await breadcrumb.getByRole('button', { name: basename(root), exact: true }).press('Enter');
  await browseDialog.getByRole('button', { name: 'empty-alias', exact: true }).waitFor();
  assert.equal(await filter.inputValue(), '');
  assert.equal(await breadcrumb.locator('[aria-current="page"]').getAttribute('title'), root);
  await browseDialog.getByRole('button', { name: 'web', exact: true }).dblclick();
  await breadcrumb.getByRole('button', { name: 'web', exact: true }).waitFor();
  await browseDialog.getByRole('button', { name: '上级目录', exact: true }).click();
  const directoryLink = browseDialog.getByRole('button', { name: 'empty-alias', exact: true });
  await directoryLink.click();
  assert.equal(await directoryLink.getAttribute('aria-pressed'), 'true');
  await browseDialog.getByText(join(root, 'empty-alias'), { exact: true }).waitFor();
  await page.screenshot({ path: join(evidence, 'browse-selection.png') });
  await directoryLink.press('Enter');
  await breadcrumb.getByRole('button', { name: 'empty', exact: true }).waitFor();
  assert.equal(
    await browseDialog.locator('p[aria-live="polite"]').innerText(),
    join(root, 'empty'),
  );
  await page.screenshot({ path: join(evidence, 'browse-directory.png') });
  await browseDialog.getByRole('button', { name: '选择此目录', exact: true }).click();
  assert.equal(await path.inputValue(), join(root, 'empty'));
  assert.equal((await f.events()).length, 0);
  await add();
  await addDialog.waitFor({ state: 'hidden' });
  await frame.getByText('工作区干净', { exact: true }).waitFor();
  await openMenu();
  const added = manage.locator('[data-repository-id]').filter({ hasText: join(root, 'empty') });
  const addedId = await added.getAttribute('data-repository-id');
  assert.equal(await remove(added).isEnabled(), false);
  await close(manage);
  await switchTo('web');
  await openMenu();
  await remove(row(addedId)).click();
  await row(addedId).waitFor({ state: 'detached' });
  await close(manage);

  // New and edited feedback block removal; only a successful explicit delivery releases it.
  await button('未暂存 · M a.ts').dblclick();
  await selectDiffLines(frame, 'new', 2);
  await comments.write('Web opinion');
  await comments.save();
  await switchTo('server');
  await openMenu();
  assert.equal(await remove(row('web')).isEnabled(), false);
  assert.equal(
    await row('web')
      .getByText(/未提交/)
      .count(),
    0,
  );
  await reason(row('web'), '请先提交批注更改。');
  await close(manage);
  await button('未跟踪 · ? a.ts').dblclick();
  await selectDiffLines(frame, 'new', 1);
  await comments.write('Server opinion');
  await comments.save();
  await submitAnnotations(frame);
  await frame.getByText('批注已提交。', { exact: true }).last().waitFor();
  let events = await f.events();
  assert.equal(events.length, 1);
  const first = events[0];
  const webFile = first.payload.files.find((file) =>
    file.annotations.some((entry) => entry.comment === 'Web opinion'),
  );
  const { annotations: _webAnnotations, ...webSource } = webFile;
  assert.equal(webSource.repositoryPath, await realpath(f.repo));

  await comments.edit(1);
  await comments.write('Web corrected');
  await comments.save();
  await switchTo('server');
  await openMenu();
  assert.equal(await remove(row('web')).isEnabled(), false);
  await close(manage);
  await submitAnnotations(frame);
  await frame.getByText('批注已提交。', { exact: true }).last().waitFor();
  await openMenu();
  assert.equal(await remove(row('web')).isEnabled(), true);
  await remove(row('web')).click();
  await row('web').waitFor({ state: 'detached' });
  assert.equal(await manage.locator('[data-repository-id]').count(), 1);
  assert.equal(
    await remove(row('server')).isEnabled(),
    false,
    'The sole current repository cannot be removed',
  );
  await page.screenshot({ path: join(evidence, 'sole-repository.png') });
  await close(manage);
  assert.equal(
    await comments.count(),
    1,
    'Removed completed opinions are not editable current drafts',
  );
  await comments.edit(1);
  await comments.write('Server corrected after Web removal');
  await comments.save();
  await submitAnnotations(frame);
  await frame.getByText('批注已提交。', { exact: true }).last().waitFor();
  await openMenu();
  await close(manage);
  events = await f.events();
  assert.equal(events.length, 3);
  assert.equal(events[2].payload.replacesEventId, events[1].id);
  assert.deepEqual(
    events[2].payload.files
      .flatMap((file) => file.annotations.map((entry) => entry.comment))
      .sort(),
    ['Server corrected after Web removal', 'Web corrected'],
  );
  const retainedWebFile = events[2].payload.files.find(
    (file) => file.repositoryPath === webSource.repositoryPath,
  );
  const { annotations: _retainedAnnotations, ...retainedSource } = retainedWebFile;
  assert.deepEqual(retainedSource, webSource);

  // Re-adding opens current data. Reload restores the original configuration and feedback session.
  await openAdd();
  await path.fill(f.repo);
  await add();
  await addDialog.waitFor({ state: 'hidden' });
  await frame.locator('[data-file-id]').first().waitFor();
  await openMenu();
  assert.equal(
    await manage.locator(`[data-repository-id="${originalWebId}"]`).count(),
    0,
    'Re-added repository has a fresh browsing identity',
  );
  await close(manage);
  await page.reload();
  await frame.locator('[data-diff-source]').waitFor();
  await openMenu();
  assert.equal(await manage.locator('[data-repository-id]').count(), 2);
  await row('web').waitFor();
  await row('server').waitFor();
  await page.screenshot({ path: join(evidence, 'repository-management.png') });
  await close(manage);

  // A read begun in Server must not restore it after switching away and removing it.
  let readArrived, readContinued;
  let readHeld = false;
  const readStarted = new Promise((resolve) => {
    readArrived = resolve;
  });
  const readReleased = new Promise((resolve) => {
    readContinued = resolve;
  });
  await page.route(`**/api/panels/${f.panel.instanceId}/actions/*`, async (route) => {
    const input = route.request().postDataJSON()?.input;
    const request = input?.request;
    const repository = input?.params?.repositories.find(
      (repo) => repo.id === request?.repositoryId,
    );
    if (!readHeld && repository?.path === join(root, 'server') && request.type === 'changes') {
      readHeld = true;
      readArrived();
      await new Promise((resolve) => {
        release = resolve;
      });
      await route.continue();
      readContinued();
      return;
    }
    await route.continue();
  });
  await frame.getByRole('button', { name: '仓库', exact: true }).click();
  await frame.getByRole('button', { name: /^server · / }).click();
  await readStarted;
  await switchTo('web');
  await openMenu();
  await remove(row('server')).click();
  await row('server').waitFor({ state: 'detached' });
  const readResponse = page.waitForResponse((response) => {
    const input = response.request().postDataJSON()?.input;
    return input?.params?.repositories.some(
      (repo) => repo.id === input.request?.repositoryId && repo.path === join(root, 'server'),
    );
  });
  release();
  release = undefined;
  await readReleased;
  await (await readResponse).finished();
  await frame
    .locator('body')
    .evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  assert.match(
    await frame.getByRole('button', { name: '仓库', exact: true, includeHidden: true }).innerText(),
    /^web$/,
  );
  assert.equal(await manage.locator('[data-repository-id]').count(), 1);
  await page.unroute(`**/api/panels/${f.panel.instanceId}/actions/*`);

  // Locating a retained working-tree snapshot starts a new listing after checkout.
  // Deliver that listing later and prove it cannot hide the explicitly located diff.
  const graph = await createGraphRepository(f.root);
  await writeFile(join(graph.repository, 'note.ts'), 'const note = 1;\n');
  const graphPanel = await f.run({
    repositories: [graph.repository],
    initialView: { repositoryPath: graph.repository, type: 'changes' },
  });
  await page.goto(f.url(graphPanel));
  await button('未跟踪 · ? note.ts').dblclick();
  await selectDiffLines(frame, 'new', 1);
  await comments.write('Retain the original note');
  await comments.save();
  await git(graph.repository, 'add', 'note.ts');
  await git(graph.repository, 'commit', '-qm', 'Commit the reviewed note');
  await frame.getByRole('tab', { name: '提交记录', exact: true }).click();
  await frame.locator('[data-file-scroll][aria-busy=false]').waitFor();
  await button('本地分支 main').click({ button: 'right' });
  await frame.getByRole('menuitem', { name: 'Checkout', exact: true }).click();
  await frame.locator('[data-current-branch=true]').filter({ hasText: 'main' }).first().waitFor();
  await frame.locator('[data-file-scroll][aria-busy=false]').waitFor();
  let locateReadArrived;
  const locateReadStarted = new Promise((resolve) => {
    locateReadArrived = resolve;
  });
  await page.route(`**/api/panels/${graphPanel.instanceId}/actions/*`, async (route) => {
    const request = route.request().postDataJSON()?.input?.request;
    if (request?.type === 'changes') {
      locateReadArrived();
      await new Promise((resolve) => {
        release = resolve;
      });
    }
    await route.continue();
  });
  await comments.locate(1);
  await locateReadStarted;
  const retained = frame.getByText('回看保留快照', { exact: true });
  await retained.waitFor();
  const locatedResponse = page.waitForResponse(
    (response) => response.request().postDataJSON()?.input?.request?.type === 'changes',
  );
  release();
  release = undefined;
  await (await locatedResponse).finished();
  await frame.locator('[data-file-scroll][aria-busy=false]').waitFor();
  await frame
    .locator('body')
    .evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  assert.equal(
    await retained.isVisible(),
    true,
    'A late listing must keep the located snapshot visible',
  );
  assert.equal(await frame.locator('[data-git-diff-scroll]').isVisible(), true);
  assert.equal(await frame.getByRole('tab', { name: '未提交改动', selected: true }).count(), 1);
  await button('返回当前浏览').click();
  await frame.getByText('工作区干净', { exact: true }).waitFor();
  assert.equal(await retained.count(), 0);
  await page.unroute(`**/api/panels/${graphPanel.instanceId}/actions/*`);
  assert.deepEqual(errors, []);
  console.log(
    'PASS absolute input, directory links, duplicate errors, canceled validation, removal guards, retained corrections, re-add, reload and annotation location after checkout.',
  );
} catch (error) {
  if (page) await page.screenshot({ path: join(evidence, 'failure.png'), fullPage: true });
  throw error;
} finally {
  release?.();
  await browser?.close();
  await f.stop();
}
