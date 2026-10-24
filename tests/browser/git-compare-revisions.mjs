import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { git } from '../git-review-fixture.ts';
import { startGitReviewFixture } from './git-review-fixture.mjs';

const fixture = await startGitReviewFixture();
let browser;
try {
  await git(fixture.repo, 'tag', 'release-old', fixture.rootCommit);
  await git(fixture.repo, 'tag', '-a', 'release-new', fixture.feature, '-m', 'Latest release');
  await git(fixture.repo, 'update-ref', 'refs/remotes/origin/main', fixture.feature);
  await git(fixture.repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(fixture.url());
  const frame = page.frameLocator('iframe');
  await frame.getByRole('tab', { name: '分支/版本对比', exact: true }).click();
  const base = frame.getByRole('combobox', { name: '基线', exact: true });
  const head = frame.getByRole('combobox', { name: '当前版本', exact: true });
  const mode = frame.getByRole('combobox', { name: '比较方式', exact: true });
  const dialog = (label) => frame.getByRole('dialog', { name: `选择${label}`, exact: true });
  const search = (label) =>
    dialog(label).getByRole('combobox', { name: `${label}: 搜索分支或标签`, exact: true });
  async function open(trigger, label) {
    await trigger.click();
    await dialog(label).waitFor();
    await search(label).and(frame.locator(':focus')).waitFor();
    return search(label);
  }
  async function closed(label) {
    await dialog(label).waitFor({ state: 'hidden' });
  }
  assert.match(await mode.textContent(), /Two-dot diff/);
  assert.match(await head.textContent(), /compare:.*HEAD/);
  assert.equal(await frame.getByText('比较方式', { exact: true }).count(), 0);
  let input = await open(base, '基线');
  assert.equal(await input.getAttribute('placeholder'), '分支、标签或 commit ID');
  const branchTab = () => dialog('基线').getByRole('tab', { name: '分支', exact: true });
  const tagTab = () => dialog('基线').getByRole('tab', { name: '标签', exact: true });
  assert.equal(await branchTab().getAttribute('aria-selected'), 'true');
  const main = () => dialog('基线').getByRole('option', { name: 'main default', exact: true });
  await main().waitFor();
  assert.equal(await main().getByText('default', { exact: true }).count(), 1);
  assert.equal(await main().getAttribute('aria-selected'), 'false');
  assert.equal(await main().locator('svg').count(), 0);
  const refs = await dialog('基线')
    .getByRole('option')
    .evaluateAll((nodes) => nodes.map((node) => node.title));
  assert.ok(refs.every((ref) => /^refs\/(heads|remotes)\//.test(ref)));
  await main().click();
  await closed('基线');
  input = await open(base, '基线');
  assert.equal(await main().getAttribute('aria-selected'), 'true');
  assert.equal(await main().locator('svg').count(), 1);
  await page.screenshot({
    path: '/tmp/paneon-compare-picker-branches.png',
    animations: 'disabled',
  });
  await branchTab().focus();
  await branchTab().press('ArrowRight');
  assert.equal(await tagTab().getAttribute('aria-selected'), 'true');
  assert.equal(
    await frame
      .getByRole('tab', { name: '分支/版本对比', exact: true })
      .getAttribute('aria-selected'),
    'true',
  );
  const tags = await dialog('基线')
    .getByRole('option')
    .evaluateAll((nodes) => nodes.map((node) => node.title));
  assert.ok(tags.length === 2 && tags.every((ref) => ref.startsWith('refs/tags/')));
  await input.fill('RELEASE');
  assert.match(await base.textContent(), /base:.*main/);
  await branchTab().click();
  assert.equal(
    await dialog('基线').getByRole('option').count(),
    1,
    'Only the custom revision action remains in Branches for RELEASE',
  );
  assert.equal(await input.inputValue(), 'RELEASE');
  await tagTab().click();
  assert.equal(
    await dialog('基线')
      .getByRole('option')
      .filter({ hasText: /^release-/ })
      .count(),
    2,
  );
  await input.press('ArrowDown');
  await input.press('Enter');
  await closed('基线');
  assert.match(await base.textContent(), /base:.*release-new/);
  assert.equal(await base.and(frame.locator(':focus')).count(), 1);
  input = await open(base, '基线');
  assert.equal(await input.inputValue(), '');
  assert.equal(await tagTab().getAttribute('aria-selected'), 'true');
  await page.screenshot({ path: '/tmp/paneon-compare-picker-tags.png', animations: 'disabled' });
  assert.equal(
    await dialog('基线')
      .getByRole('option', { name: 'release-new', exact: true })
      .getAttribute('aria-selected'),
    'true',
  );
  await input.fill('unconfirmed-search');
  assert.match(await base.textContent(), /release-new/);
  await input.press('Escape');
  await closed('基线');
  assert.match(await base.textContent(), /release-new/);
  input = await open(base, '基线');
  await input.fill('discard-this');
  await dialog('基线').getByRole('button', { name: '关闭', exact: true }).click();
  await closed('基线');
  assert.match(await base.textContent(), /release-new/);
  input = await open(head, '当前版本');
  await input.fill('origin/');
  assert.match(await head.textContent(), /HEAD/);
  await dialog('当前版本')
    .getByRole('option', { name: 'origin/main default', exact: true })
    .click();
  await closed('当前版本');
  assert.match(await head.textContent(), /origin\/main/);
  input = await open(head, '当前版本');
  await dialog('当前版本').getByRole('tab', { name: '标签', exact: true }).click();
  await input.fill('release-old');
  await dialog('当前版本').getByRole('option', { name: 'release-old', exact: true }).click();
  await closed('当前版本');
  assert.match(await head.textContent(), /release-old/);
  input = await open(base, '基线');
  const short = fixture.feature.slice(0, 10);
  await input.fill(short);
  assert.match(await base.textContent(), /release-new/);
  await dialog('基线')
    .getByRole('option', { name: `使用版本 ${short}`, exact: true })
    .click();
  await closed('基线');
  assert.ok((await base.textContent()).includes(short));
  input = await open(head, '当前版本');
  await dialog('当前版本').getByRole('tab', { name: '分支', exact: true }).click();
  await input.fill(fixture.rootCommit);
  await input.press('Enter');
  await closed('当前版本');
  assert.ok((await head.textContent()).includes(fixture.rootCommit));
  await frame.getByRole('button', { name: '比较', exact: true }).click();
  await frame.locator('[data-file-id]').first().waitFor();
  assert.equal(await frame.getByRole('alert').count(), 0);
  await page.screenshot({ path: '/tmp/paneon-compare-picker-closed.png', animations: 'disabled' });
  input = await open(base, '基线');
  await page.screenshot({ path: '/tmp/paneon-compare-picker-open.png', animations: 'disabled' });
  await input.fill('ignored-outside-click');
  await frame.getByRole('heading', { name: 'Git review acceptance', exact: true }).click();
  await closed('基线');
  assert.ok((await base.textContent()).includes(short));
  assert.deepEqual(errors, []);
  console.log(
    'PASS desktop revision pickers: stable selected values, independent case-insensitive search, Branches/Tags tabs, recorded default badges, selected marker, keyboard and mouse selection, full/short commit confirmation, Escape/close/outside cancellation, focus restoration, real two-dot comparison.',
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
