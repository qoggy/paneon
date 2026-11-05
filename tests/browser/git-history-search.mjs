import assert from 'node:assert/strict';
import { mkdir, realpath } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startGitReviewFixture } from './git-review-fixture.mjs';
import { git } from '../git-review-fixture.ts';

const f = await startGitReviewFixture();
let browser;
let releaseSearch;
try {
  const tree = await git(f.repo, 'rev-parse', 'HEAD^{tree}');
  const body = await git(
    f.repo,
    'commit-tree',
    tree,
    '-p',
    f.feature,
    '-m',
    'Old subject\n\nbody-only-token',
  );
  let tip = body;
  const ids = [];
  for (let i = 0; i < 56; i++) {
    const authored = await git(
      f.repo,
      '-c',
      'user.name=Alex',
      '-c',
      `user.email=${i % 2 ? 'a' : 'b'}@example.test`,
      'commit-tree',
      tree,
      '-p',
      tip,
      '-m',
      `Needle ${i}`,
    );
    ids.unshift(authored);
    tip = await git(
      f.repo,
      '-c',
      'user.name=Merger',
      '-c',
      'user.email=merger@example.test',
      'commit-tree',
      tree,
      '-p',
      authored,
      '-p',
      tip,
      '-m',
      `Merge history ${i}`,
    );
  }
  await git(f.repo, 'update-ref', 'refs/heads/main', tip);
  const panel = await f.run({
    ...f.params,
    initialView: { repositoryPath: f.repo, type: 'history' },
  });
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(f.url(panel));
  const frame = page.frameLocator('iframe');
  const search = frame.getByRole('textbox', { name: '提交信息或哈希', exact: true });
  const count = (size) => frame.locator(`[data-history-count="${size}"]`).waitFor();
  const settle = () =>
    frame
      .locator('span[role="status"]')
      .filter({ hasText: '读取 Git' })
      .waitFor({ state: 'hidden' });
  async function find(text) {
    await search.fill(text);
    await search.press('Enter');
    await settle();
  }
  await count(50);
  const alignment = await frame.locator('[data-history-text-filter]').evaluate((element) => {
    const input = element.querySelector('input').getBoundingClientRect();
    return [...element.querySelectorAll('button')].map((button) => {
      const rect = button.getBoundingClientRect();
      return rect.y + rect.height / 2 - input.y - input.height / 2;
    });
  });
  assert.ok(
    alignment.every((offset) => Math.abs(offset) < 0.5),
    'Search toggles share the input vertical center.',
  );
  await search.fill('missing-commit');
  assert.equal(
    await frame.locator('[data-history-count]').getAttribute('data-history-count'),
    '50',
    'Typing alone does not apply the filter',
  );
  await search.press('Enter');
  await frame.getByText('没有匹配的提交。', { exact: true }).waitFor();
  await frame.getByRole('button', { name: '清除筛选', exact: true }).click();
  await count(50);
  assert.equal(await search.inputValue(), '');
  await find('Needle');
  await count(50);
  const subjectBox = await frame.locator('[data-commit-subject]').first().boundingBox();
  const scrollBox = await frame.locator('[data-commit-scroll]').boundingBox();
  assert.ok(
    subjectBox.x - scrollBox.x < 100,
    'Hidden merge ladders must not push commit text across dozens of graph lanes.',
  );
  await frame.getByText('选择提交查看改动文件。', { exact: true }).waitFor();
  await frame.getByRole('button', { name: '加载更多（每批 50）', exact: true }).click();
  await count(56);
  await frame.locator(`[data-commit-id="${ids[0]}"]`).click();
  await count(56);
  await search.fill('body-only-token');
  await frame.getByRole('button', { name: '按作者筛选', exact: true }).click();
  await frame.getByRole('textbox', { name: '搜索作者', exact: true }).press('Escape');
  await settle();
  await count(1);
  assert.equal(await frame.locator('[data-commit-id]').getAttribute('data-commit-id'), body);
  assert.match(await frame.locator('[data-commit-id]').getAttribute('title'), /body-only-token/);
  assert.equal(await frame.locator('[data-commit-graph] path[stroke-dasharray]').count(), 0);
  await find('needle');
  await count(50);
  await frame.getByRole('button', { name: '区分大小写', exact: true }).click();
  await frame.getByText('没有匹配的提交。', { exact: true }).waitFor();
  await frame.getByRole('button', { name: '区分大小写', exact: true }).click();
  await count(50);
  await find('^Needle (1|3)$');
  await frame.getByRole('button', { name: '正则表达式', exact: true }).click();
  await count(2);
  assert.ok((await frame.locator('[data-commit-graph] path[stroke-dasharray]').count()) > 0);
  await find('[');
  await frame.locator('[data-history-filters]').getByRole('alert').waitFor();
  assert.equal(
    await frame.locator('[data-commit-id]').count(),
    0,
    'Failed query does not display old results',
  );
  await frame.getByRole('button', { name: '清除提交搜索', exact: true }).click();
  await count(50);
  await frame.getByRole('button', { name: '正则表达式', exact: true }).click();
  await settle();
  await find(tip.slice(0, 8));
  await count(1);
  assert.equal(await frame.locator('[data-commit-id]').getAttribute('data-commit-id'), tip);
  await frame.getByRole('button', { name: '清除提交搜索', exact: true }).click();
  await count(50);
  await frame.getByRole('button', { name: '按作者筛选', exact: true }).click();
  await frame.getByRole('radio', { name: 'Alex b@example.test', exact: true }).waitFor();
  const authorSearch = frame.getByRole('textbox', { name: '搜索作者', exact: true });
  const authorPopover = frame.locator('[data-slot="popover-content"]');
  assert.equal(
    await authorSearch.evaluate((element) => getComputedStyle(element).height),
    await search.evaluate((element) => getComputedStyle(element).height),
    'Author search uses the same compact height as commit search.',
  );
  assert.equal(
    await authorPopover
      .getByRole('radiogroup')
      .evaluate((element) => getComputedStyle(element).rowGap),
    '2px',
    'Author options use compact spacing.',
  );
  assert.equal(await authorPopover.getByText('fixture@example.test', { exact: true }).count(), 1);
  assert.equal(
    await frame.getByRole('radio', { name: 'Fixture fixture@example.test', exact: true }).count(),
    0,
    'The current email appears only under me.',
  );
  await authorSearch.fill('fixture@example.test');
  assert.equal(await authorPopover.getByRole('radio').count(), 2);
  assert.equal(await authorPopover.getByText('没有匹配的作者。', { exact: true }).count(), 0);
  await authorSearch.fill('b@example.test');
  assert.equal(
    await frame.getByRole('radio', { name: 'Alex a@example.test', exact: true }).count(),
    0,
  );
  await frame.getByRole('radio', { name: 'Alex b@example.test', exact: true }).check();
  await count(28);
  await find('Needle 55');
  await frame.getByText('没有匹配的提交。', { exact: true }).waitFor();
  await frame.getByRole('button', { name: '清除作者筛选', exact: true }).click();
  await count(1);
  assert.equal(await search.inputValue(), 'Needle 55');
  await frame.getByRole('button', { name: '本地分支 base', exact: true }).dblclick();
  await frame.getByText('没有匹配的提交。', { exact: true }).waitFor();
  assert.equal(await search.inputValue(), 'Needle 55');
  await frame.getByRole('button', { name: '本地分支 main', exact: true }).dblclick();
  await count(1);
  await frame.getByRole('button', { name: '清除提交搜索', exact: true }).click();
  await count(50);
  await frame.getByRole('button', { name: '按作者筛选', exact: true }).click();
  await frame.getByRole('radio', { name: 'me fixture@example.test', exact: true }).check();
  await count(3);
  assert.match(
    await frame.getByRole('button', { name: '按作者筛选', exact: true }).textContent(),
    /User: me/,
  );
  await frame.getByRole('button', { name: '清除作者筛选', exact: true }).click();
  await count(50);
  const heldSearch = new Promise((resolve) => {
    releaseSearch = resolve;
  });
  const oldSearch = (request) =>
    request.postDataJSON()?.input?.request?.historyFilter?.text === 'Needle 55';
  const actionURL = `**/api/panels/${panel.instanceId}/actions/*`;
  await page.route(actionURL, async (route) => {
    if (oldSearch(route.request())) await heldSearch;
    await route.continue();
  });
  const requested = page.waitForRequest(
    (request) => request.url().includes('/actions/') && oldSearch(request),
  );
  await search.fill('Needle 55');
  await search.press('Enter');
  await requested;
  await find('Needle 54');
  await count(1);
  assert.equal(await frame.locator('[data-commit-id]').getAttribute('data-commit-id'), ids[1]);
  const oldResponse = page.waitForResponse(
    (response) => response.url().includes('/actions/') && oldSearch(response.request()),
  );
  releaseSearch();
  await (await oldResponse).finished();
  await frame
    .locator('body')
    .evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  assert.equal(
    await frame.locator('[data-commit-id]').getAttribute('data-commit-id'),
    ids[1],
    'Late old search must not replace newer results',
  );
  await page.unroute(actionURL);
  await frame.getByRole('button', { name: '仓库', exact: true }).click();
  await frame
    .getByRole('button', { name: `server · ${await realpath(f.second)}`, exact: true })
    .click();
  await frame.getByText('没有提交记录。', { exact: true }).waitFor();
  assert.equal(await search.inputValue(), '', 'Another repository has its own filter state');
  await frame.getByRole('button', { name: '仓库', exact: true }).click();
  await frame.getByRole('button', { name: `web · ${await realpath(f.repo)}`, exact: true }).click();
  await count(1);
  assert.equal(await search.inputValue(), 'Needle 54', 'Returning restores this repository filter');
  await find('Needle');
  await count(50);
  await search.blur();
  await frame.getByRole('button', { name: '按作者筛选', exact: true }).click();
  await frame.getByRole('radio', { name: 'Alex b@example.test', exact: true }).waitFor();
  const artifacts = '/tmp/paneon-history-search-evidence';
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: `${artifacts}/light.png`, animations: 'disabled' });
  await f.service.app.inject({
    method: 'POST',
    url: '/api/preferences',
    headers: {
      host: `127.0.0.1:${f.service.descriptor.port}`,
      authorization: `Bearer ${f.service.descriptor.controlToken}`,
    },
    payload: { ui: { theme: 'dark', language: 'en' } },
  });
  await frame.getByRole('textbox', { name: 'Text or hash', exact: true }).waitFor();
  await page.locator('html.dark[data-language="en"]:not([data-theme-changing])').waitFor();
  await frame.locator('html.dark[data-language="en"]:not([data-theme-changing])').waitFor();
  await frame.getByRole('textbox', { name: 'Search authors', exact: true }).waitFor();
  await page.screenshot({ path: `${artifacts}/dark.png`, animations: 'disabled' });
  assert.deepEqual(errors, []);
  assert.equal((await f.events(panel)).length, 0);
  console.log(
    'PASS Enter/clear, complete-history/body/hash/ERE/case search, filtered pagination/graph, author email search and AND, me, branch persistence, light/dark/en/zh.',
  );
} finally {
  releaseSearch?.();
  await browser?.close();
  await f.stop();
}
