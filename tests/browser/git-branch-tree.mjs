import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startGitReviewFixture, createGraphRepository } from './git-review-fixture.mjs';
import { git } from '../git-review-fixture.ts';

const f = await startGitReviewFixture();
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-git-branch-tree';
let browser, page;
try {
  await mkdir(artifacts, { recursive: true });
  const graph = await createGraphRepository(f.root);
  await git(graph.repository, 'branch', 'feature/review/nested');
  await git(graph.repository, 'tag', 'releases/v1');
  await git(graph.repository, 'update-ref', 'refs/remotes/backup/feature/topic', graph.tip);
  await mkdir(join(graph.repository, 'lib/services'), { recursive: true });
  for (let i = 0; i < 12; i++)
    await writeFile(
      join(graph.repository, `lib/services/file-${i}.ts`),
      `export const n = ${i};\n`,
    );
  await git(graph.repository, 'add', '.');
  await git(
    graph.repository,
    'commit',
    '-qm',
    'Add service files\n\n' + 'A longer commit message.\n'.repeat(24),
  );
  const many = await git(graph.repository, 'rev-parse', 'HEAD');
  const params = { repositories: [{ id: 'graph', path: graph.repository }] };
  const panel = await f.run({
    ...params,
    initialView: { repositoryId: 'graph', type: 'history', commit: many },
  });
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(f.url(panel));
  const frame = page.frameLocator('iframe');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const sidebar = frame.getByRole('complementary', { name: '历史分支', exact: true });
  const feature = sidebar.getByRole('button', { name: '分支目录 feature', exact: true });
  const files = frame.getByRole('complementary', { name: '改动文件', exact: true });
  await feature.waitFor();
  await frame.locator('[data-file-directory]').first().waitFor();
  const before = {
    branchArrowIsSvg: (await feature.locator('svg').count()) === 1,
    fileListHeight: (await files.boundingBox()).height,
  };
  console.log(JSON.stringify({ before }));
  // Both explorers use the same SVG, centred against the adjacent label.
  assert.equal(
    before.branchArrowIsSvg,
    true,
    'Branch directories use a vector chevron, not a font glyph',
  );
  const arrow = feature.locator('svg');
  assert.equal(
    await arrow.locator('path').getAttribute('d'),
    await frame
      .locator('[data-file-directory]')
      .first()
      .locator('svg')
      .first()
      .locator('path')
      .getAttribute('d'),
  );
  const alignment = await feature.evaluate((el) => {
    const icon = el.querySelector('svg').getBoundingClientRect();
    const label = el.querySelector('span').getBoundingClientRect();
    return Math.abs(icon.top + icon.height / 2 - label.top - label.height / 2);
  });
  assert.ok(alignment <= 1, `Chevron and label centres differ by ${alignment}px`);
  async function fold(trigger) {
    const id = await trigger.getAttribute('aria-controls');
    assert.ok(id);
    const content = frame.locator(`[id=${JSON.stringify(id)}]`);
    await trigger.press('Enter');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(await content.isVisible(), false);
    assert.equal(await trigger.evaluate((el) => el.ownerDocument.activeElement === el), true);
    await trigger.press('Space');
    await content.waitFor({ state: 'visible' });
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
  }
  await fold(feature);
  await fold(sidebar.getByRole('button', { name: '分支目录 feature/review', exact: true }));
  await fold(sidebar.getByRole('button', { name: '分支目录 origin', exact: true }));
  await fold(sidebar.getByRole('button', { name: '分支目录 releases', exact: true }));
  const search = sidebar.getByLabel('搜索分支或标签', { exact: true });
  await feature.click();
  await search.fill('feature/review/nested');
  await button('本地分支 feature/review/nested').waitFor();
  assert.equal(await feature.getAttribute('aria-expanded'), 'true');
  await search.fill('');
  assert.equal(
    await feature.getAttribute('aria-expanded'),
    'false',
    'Searching does not overwrite the saved fold state',
  );
  await feature.click();
  for (const [label, selectedTip] of [
    ['本地分支 main', graph.merge],
    ['远程分支 origin/main', graph.merge],
    ['标签 releases/v1', graph.tip],
  ]) {
    await button(label).dblclick();
    await frame
      .locator(`[data-commit-id=${JSON.stringify(selectedTip)}][aria-pressed=true]`)
      .waitFor();
    assert.equal(
      await git(graph.repository, 'symbolic-ref', '--short', 'HEAD'),
      'feature/history',
      'Browsing references never checks out a branch',
    );
  }
  await button('HEAD（当前分支）').dblclick();
  await frame.locator(`[data-commit-id=${JSON.stringify(many)}][aria-pressed=true]`).waitFor();
  await page.screenshot({ path: join(artifacts, 'branches.png'), fullPage: true });
  // A one-file commit still reserves a small reading area above the message.
  const single = await f.run({
    ...params,
    initialView: { repositoryId: 'graph', type: 'history', commit: graph.tip, file: 'history.ts' },
  });
  await page.goto(f.url(single));
  await frame.locator('[data-diff-source]').waitFor();
  for (const height of [1000, 700]) {
    await page.setViewportSize({ width: 1440, height });
    const geometry = await files.evaluate((el) => {
      const workspace = el.closest('[data-history-workspace]');
      const details = workspace.querySelector('[data-commit-details]');
      const row = el.querySelector('[data-file-id]');
      const toolbar = el.querySelector('[role=toolbar]');
      const scroll = el.querySelector('[data-file-scroll]');
      const rect = (node) => {
        const r = node.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height };
      };
      return {
        listClass: el.className,
        minHeight: getComputedStyle(el).minHeight,
        maxHeight: getComputedStyle(el).maxHeight,
        list: rect(el),
        workspace: rect(workspace),
        details: details && rect(details),
        row: rect(row),
        toolbar: rect(toolbar),
        scroll: rect(scroll),
        rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      };
    });
    console.log(JSON.stringify({ height, geometry }));
    assert.ok(
      geometry.list.height >= 8 * geometry.rem - 1,
      'The file list retains an 8rem minimum height',
    );
    assert.ok(
      geometry.row.top >= geometry.scroll.top && geometry.row.bottom <= geometry.scroll.bottom + 1,
    );
    assert.ok(geometry.list.bottom <= geometry.workspace.bottom + 1);
    assert.ok(
      geometry.details && geometry.details.height > 0,
      'Commit details retain visible space',
    );
    assert.ok(
      geometry.details.top >= geometry.list.bottom - 1,
      'File list and details do not overlap',
    );
    assert.ok(geometry.details.bottom <= geometry.workspace.bottom + 1);
    await page.screenshot({ path: join(artifacts, `single-${height}.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
  assert.equal((await f.events(panel)).length, 0);
  console.log(JSON.stringify({ status: 'passed', artifacts, errors }));
} catch (error) {
  await page?.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true });
  throw error;
} finally {
  await browser?.close();
  await f.stop();
}
