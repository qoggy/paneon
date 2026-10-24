import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startGitReviewFixture } from './git-review-fixture.mjs';
import { startGithubPRFixture } from './github-pr-fixture.mjs';
import { git } from '../git-review-fixture.ts';
import { annotationTools, selectAnnotationText, submitAnnotations } from './annotation-tools.mjs';

const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-git-shadcn-controls';
await mkdir(artifacts, { recursive: true });
let browser, fixture;
const errors = [];
async function tooltip(page, frame, control, label) {
  assert.equal(await control.getAttribute('title'), null);
  await control.hover();
  await frame.locator('[data-slot=\"tooltip-content\"]').filter({ hasText: label }).waitFor();
  await control.press('Escape');
  await frame
    .locator('[data-slot=\"tooltip-content\"]')
    .filter({ hasText: label })
    .waitFor({ state: 'hidden' });
}
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  fixture = await startGitReviewFixture();
  const original = Array.from({ length: 90 }, (_, i) => `const line${i + 1} = 'old';\n`).join('');
  await writeFile(join(fixture.repo, 'controls.ts'), original);
  await git(fixture.repo, 'add', 'controls.ts');
  await git(fixture.repo, 'commit', '-qm', 'Control fixture');
  await writeFile(
    join(fixture.repo, 'controls.ts'),
    original
      .replace('line10 =', 'change10 =')
      .replace('line45 =', 'change45 =')
      .replace('line80 =', 'change80 ='),
  );
  const panel = await fixture.run({
    ...fixture.params,
    initialView: { repositoryId: 'web', type: 'changes', file: 'controls.ts' },
  });
  await page.goto(fixture.url(panel));
  let frame = page.frameLocator('iframe');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const counter = button('定位当前差异');
  await counter.waitFor();
  assert.equal(await counter.textContent(), '1 / 3 处差异');
  await tooltip(page, frame, counter, '定位当前差异');
  await tooltip(page, frame, button('下一个差异'), '下一个差异');
  await button('下一个差异').click();
  assert.equal(await counter.textContent(), '2 / 3 处差异');
  await tooltip(page, frame, button('上一个差异'), '上一个差异');
  await button('上一个差异').focus();
  await page.keyboard.press('Enter');
  assert.equal(await counter.textContent(), '1 / 3 处差异');
  await page.screenshot({ path: join(artifacts, 'git-diff.png'), fullPage: true });
  const source = await frame.locator('[data-diff-source]').getAttribute('data-diff-source');
  const changes = frame.getByRole('tab', { name: '未提交改动', exact: true });
  await changes.focus();
  await page.keyboard.press('ArrowRight');
  await frame.locator('[data-commit-id]').first().waitFor();
  assert.equal(
    await frame.getByRole('tab', { name: '提交记录', exact: true }).getAttribute('aria-selected'),
    'true',
  );
  assert.equal(await frame.getByRole('tabpanel').count(), 1);
  await page.screenshot({ path: join(artifacts, 'git-history-tabs.png'), fullPage: true });
  await frame.getByRole('tab', { name: '提交记录', exact: true }).press('End');
  await frame.getByRole('combobox', { name: '基线', exact: true }).waitFor();
  await frame.getByRole('tab', { name: '分支/版本对比', exact: true }).press('Home');
  await frame.locator('[data-diff-source]').waitFor();
  assert.equal(await frame.locator('[data-diff-source]').getAttribute('data-diff-source'), source);
  await frame.getByRole('tab', { name: '分支/版本对比', exact: true }).click();
  const mode = frame.getByRole('combobox', { name: '比较方式', exact: true });
  await mode.click();
  await frame.getByRole('option', { name: 'Two-dot diff', exact: true }).click();
  assert.match(await mode.textContent(), /Two-dot diff/);
  await mode.press('Enter');
  await frame
    .getByRole('option', { name: 'Two-dot diff', exact: true })
    .and(frame.locator(':focus'))
    .waitFor();
  await page.keyboard.press('Home');
  await frame
    .getByRole('option', { name: 'Three-dot diff', exact: true })
    .and(frame.locator(':focus'))
    .waitFor();
  await page.keyboard.press('Enter');
  await mode.filter({ hasText: 'Three-dot diff' }).waitFor();
  assert.match(await mode.textContent(), /Three-dot diff/);
  await frame.getByRole('tab', { name: '未提交改动', exact: true }).click();
  await frame.getByRole('combobox', { name: '仓库', exact: true }).click();
  await frame.getByRole('option', { name: 'Server', exact: true }).click();
  await frame.getByRole('button', { name: '未跟踪 · ? a.ts', exact: true }).waitFor();
  assert.equal((await fixture.events(panel)).length, 0);
  await fixture.stop();
  fixture = undefined;

  fixture = await startGithubPRFixture();
  await page.goto(fixture.url());
  frame = page.frameLocator('iframe');
  await frame.locator('[data-markdown-annotation]').waitFor();
  const commits = frame.getByRole('button', { name: '提交版本', exact: true });
  assert.equal(await commits.getAttribute('aria-expanded'), 'false');
  await commits.click();
  await frame.locator(`code[title="${'a'.repeat(40)}"]`).waitFor();
  assert.equal(await commits.getAttribute('aria-expanded'), 'true');
  await commits.press('Space');
  assert.equal(await commits.getAttribute('aria-expanded'), 'false');
  const comments = annotationTools(frame, page);
  await selectAnnotationText(
    frame,
    '[data-pr-body-source] p > [data-source-leaf]:first-child',
    0,
    2,
  );
  await comments.write('Keep this annotation across tab changes');
  await comments.save();
  for (const name of ['刷新列表', '刷新 PR'])
    await tooltip(page, frame, frame.getByRole('button', { name, exact: true }), name);
  await tooltip(
    page,
    frame,
    frame.getByRole('link', { name: '在 GitHub 查看', exact: true }).first(),
    '在 GitHub 查看',
  );
  const state = frame.getByRole('combobox', { name: 'PR 状态', exact: true });
  await state.click();
  await frame.getByRole('option', { name: '已关闭', exact: true }).click();
  assert.match(await state.textContent(), /已关闭/);
  const overview = frame.getByRole('tab', { name: '概览', exact: true });
  await overview.focus();
  await page.keyboard.press('ArrowRight');
  await frame.locator('[data-diff-source]').waitFor();
  assert.equal(
    await frame.getByRole('tab', { name: '文件改动', exact: true }).getAttribute('aria-selected'),
    'true',
  );
  await tooltip(page, frame, button('定位当前差异'), '定位当前差异');
  assert.equal(await frame.getByRole('tabpanel').count(), 1);
  await page.screenshot({ path: join(artifacts, 'pr-files.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await fixture.state({ fail: 'checks' });
  await frame.getByRole('tab', { name: '文件改动', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await frame.getByRole('alert').filter({ hasText: 'checks failure' }).waitFor();
  await fixture.state({});
  await frame.getByRole('tab', { name: '检查', exact: true }).click();
  await frame.locator('[data-pr-check]').first().waitFor();
  await frame.getByRole('tab', { name: '检查', exact: true }).press('Home');
  await frame.locator('[data-markdown-annotation]').waitFor();
  assert.equal(await overview.getAttribute('aria-selected'), 'true');
  assert.equal(await comments.count(), 1);
  assert.equal(await comments.text(1), 'Keep this annotation across tab changes');
  assert.equal((await fixture.events()).length, 0);
  await page.screenshot({ path: join(artifacts, 'pr-overview.png'), fullPage: true });
  await submitAnnotations(frame);
  await frame.getByRole('status').filter({ hasText: '批注已发送给当前 AI。' }).waitFor();
  assert.equal(
    (await fixture.events()).filter((event) => event.type === 'pr-feedback-submitted').length,
    1,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS desktop shadcn controls: Git repository/mode Select, PR state Select, Tabs keyboard/content semantics and error retry, six Tooltip controls, Diff navigation, preserved annotation with explicit submission, no browsing events or browser errors.',
  );
} finally {
  await browser?.close();
  await fixture?.stop();
}
