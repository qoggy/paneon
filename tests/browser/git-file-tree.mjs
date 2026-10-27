import { selectDiffLines } from './annotation-tools.mjs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { chromium } from 'playwright';
import { startGitReviewFixture } from './git-review-fixture.mjs';
import { annotationTools } from './annotation-tools.mjs';

const f = await startGitReviewFixture();
const execute = promisify(execFile);
let browser;
let page;
const prefix = 'marketplaces/x-one-cowork/plugins/paw-nextjs/skills';
const modified = `${prefix}/alpha/same.ts`;
const deleted = `${prefix}/deleted.ts`;
const added = `${prefix}/beta/same.ts`;
const renamed = `${prefix}/重命名 new\nname.ts`;
const special = ' 特殊目录 /文件\n🙂.ts ';
const long = `${'long-directory-'.repeat(14)}/leaf.ts`;
try {
  const repository = join(f.root, 'file-tree-repo');
  await mkdir(repository);
  const git = async (...args) => (await execute('git', ['-C', repository, ...args])).stdout.trim();
  const put = async (path, text) => {
    await mkdir(dirname(join(repository, path)), { recursive: true });
    await writeFile(join(repository, path), text);
  };
  await git('init', '-q', '-b', 'main');
  await git('config', 'user.name', 'File tree reviewer');
  await git('config', 'user.email', 'tree@example.test');
  await git('config', 'core.quotepath', 'false');
  for (const path of [modified, deleted, 'old 原名.ts', 'root.ts', special, long])
    await put(path, `// ${JSON.stringify(path)}\nexport const value = 1;\n`);
  await git('add', '.');
  await git('commit', '-qm', 'Create tree baseline');
  const base = await git('rev-parse', 'HEAD');
  for (const path of [modified, 'root.ts', special, long])
    await put(path, `// ${JSON.stringify(path)}\nexport const value = 2;\n`);
  await put(added, 'export const added = true;\n');
  await rm(join(repository, deleted));
  await rename(join(repository, 'old 原名.ts'), join(repository, renamed));
  await git('add', '.');
  await git('commit', '-qm', 'Change files across the tree');
  const tip = await git('rev-parse', 'HEAD');
  await git('branch', 'tree-tip');
  await git('reset', '--soft', base);
  await put(modified, '// staged and unstaged stay separate\nexport const value = 3;\n');
  await put('untracked/新文件.ts', 'export const untracked = true;\n');
  const params = {
    title: 'Compact file tree acceptance',
    repositories: [{ id: 'tree', path: repository }],
    initialView: { repositoryId: 'tree', type: 'changes', file: modified },
  };
  const panel = await f.run(params);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(f.url(panel));
  const frame = page.frameLocator('iframe');
  // Optional, repeatable extraction evidence: the same scenarios run before and after.
  async function capture(name) {
    const directory = process.env.PANEON_TREE_EVIDENCE_DIR;
    if (!directory) return;
    await mkdir(directory, { recursive: true });
    await page.mouse.move(0, 0);
    const tree = frame.locator('[data-file-tree]');
    await tree.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await tree.evaluate(async (root) => {
      await Promise.allSettled(
        root.getAnimations({ subtree: true }).map((animation) => animation.finished),
      );
    });
    const geometry = await tree.evaluate((root) => ({
      bounds: root.getBoundingClientRect().toJSON(),
      scroll: root.querySelector('[data-file-scroll]').scrollTop,
      rows: [...root.querySelectorAll('button')].map((row) => ({
        text: row.textContent,
        name: row.getAttribute('aria-label'),
        title: row.getAttribute('title'),
        pressed: row.getAttribute('aria-pressed'),
        expanded: row.getAttribute('aria-expanded'),
        status: row.getAttribute('data-file-status'),
        bounds: row.getBoundingClientRect().toJSON(),
        color: getComputedStyle(row).color,
        padding: getComputedStyle(row).paddingLeft,
        icons: [...row.querySelectorAll('path')].map((path) => path.getAttribute('d')),
      })),
    }));
    await writeFile(join(directory, `${name}.json`), JSON.stringify(geometry, null, 2));
    await tree.screenshot({ path: join(directory, `${name}.png`), animations: 'disabled' });
  }
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const files = frame.locator('[data-file-id]');
  const group = (area) => frame.locator(`[data-file-group="${area}"]`);
  const directory = (area, path) =>
    group(area)
      .locator('[data-file-directory]')
      .and(frame.locator(`[data-file-directory=${JSON.stringify(path)}]`));
  await frame.getByRole('heading', { name: params.title, exact: true }).waitFor();
  await button(`已暂存 · M ${modified}`).waitFor();
  assert.equal(await files.count(), 9, 'Each index/worktree snapshot keeps its own leaf');
  assert.equal(await group('staged').locator('[data-file-id]').count(), 7);
  assert.equal(await group('unstaged').locator('[data-file-id]').count(), 1);
  assert.equal(await group('untracked').locator('[data-file-id]').count(), 1);
  assert.equal(await button('按目录分组').getAttribute('aria-pressed'), 'false');
  await capture('changes-flat');
  await button('按目录分组').click();
  const stagedRoot = directory('staged', prefix);
  await stagedRoot.waitFor();
  assert.ok((await stagedRoot.textContent()).includes(`${prefix}4`));
  assert.equal(
    await group('staged')
      .locator(`[data-file-directory=${JSON.stringify(`${prefix}/alpha`)}]`)
      .count(),
    1,
  );
  assert.equal(await button('已暂存 · M root.ts').textContent(), 'root.tsM');
  const staged = button(`已暂存 · M ${modified}`);
  const unstaged = button(`未暂存 · M ${modified}`);
  assert.notEqual(
    await staged.getAttribute('data-file-id'),
    await unstaged.getAttribute('data-file-id'),
  );
  assert.equal(await staged.getAttribute('aria-pressed'), 'true');
  await capture('changes-tree');
  if (process.env.PANEON_TREE_EVIDENCE_DIR) {
    for (const theme of ['light', 'dark'])
      for (const language of ['en', 'zh-CN']) {
        await f.service.app.inject({
          method: 'POST',
          url: '/api/preferences',
          headers: {
            host: `127.0.0.1:${f.service.descriptor.port}`,
            authorization: `Bearer ${f.service.descriptor.controlToken}`,
          },
          payload: { ui: { theme, language } },
        });
        await frame.locator(`html[data-theme="${theme}"][data-language="${language}"]`).waitFor();
        await capture(`changes-${theme}-${language}`);
      }
    await f.service.app.inject({
      method: 'POST',
      url: '/api/preferences',
      headers: {
        host: `127.0.0.1:${f.service.descriptor.port}`,
        authorization: `Bearer ${f.service.descriptor.controlToken}`,
      },
      payload: { ui: { theme: 'light', language: 'zh-CN' } },
    });
    await frame.locator('html[data-theme="light"][data-language="zh-CN"]').waitFor();
    await page.setViewportSize({ width: 1100, height: 900 });
    await capture('changes-desktop-1100');
    await page.setViewportSize({ width: 1440, height: 960 });
  }
  for (const [name, color, status] of [
    [`已暂存 · M ${modified}`, 'text-blue', 'M'],
    [`已暂存 · A ${added}`, 'text-green', 'A'],
    [`已暂存 · D ${deleted}`, 'text-muted-foreground', 'D'],
    [`已暂存 · R100 ${renamed}`, 'text-blue', 'R100'],
    ['未跟踪 · ? untracked/新文件.ts', 'text-green', '?'],
  ]) {
    const leaf = button(name);
    assert.ok((await leaf.getAttribute('class')).includes(color));
    assert.equal(await leaf.getAttribute('data-file-status'), status);
    assert.ok((await leaf.textContent()).endsWith(status));
  }
  const colors = await Promise.all(
    [staged, button(`已暂存 · A ${added}`), button(`已暂存 · D ${deleted}`)].map((el) =>
      el.evaluate((node) => getComputedStyle(node).color),
    ),
  );
  assert.equal(new Set(colors).size, 3, 'Actual rendered colors differ');
  assert.ok(
    (await button(`已暂存 · R100 ${renamed}`).getAttribute('title')).includes(
      `old 原名.ts → ${renamed}`,
    ),
  );
  const rootFile = button('已暂存 · M root.ts');
  await rootFile.click();
  assert.equal(await rootFile.getAttribute('aria-pressed'), 'true');
  await rootFile.press('Tab');
  assert.equal(
    await rootFile.getAttribute('aria-pressed'),
    'true',
    'Tab does not change selection',
  );
  await rootFile.press('Enter');
  await frame
    .locator('[data-diff-source-headers]')
    .getByText('root.ts', { exact: true })
    .first()
    .waitFor();
  await stagedRoot.press('Enter');
  assert.equal(await stagedRoot.getAttribute('aria-expanded'), 'false');
  await stagedRoot.press('Enter');
  await staged.waitFor();
  await button(`已暂存 · D ${deleted}`).dblclick();
  await frame
    .locator('[data-code-side="old"][data-line="2"]')
    .filter({ hasText: 'value = 1' })
    .waitFor();
  assert.equal(await button(`已暂存 · D ${deleted}`).isEnabled(), true);
  await stagedRoot.click();
  assert.equal(await stagedRoot.getAttribute('aria-expanded'), 'false');
  assert.equal(await staged.count(), 0);
  assert.equal(await frame.getByRole('textbox', { name: '搜索文件', exact: true }).count(), 0);
  await stagedRoot.click();
  await staged.waitFor();
  await button(`已暂存 · R100 ${renamed}`).dblclick();
  assert.equal(await stagedRoot.getAttribute('aria-expanded'), 'true');
  await button(`已暂存 · M ${special}`).dblclick();
  assert.equal(
    await button(`已暂存 · M ${special}`).getAttribute('title'),
    `已暂存 · M ${special}`,
  );
  await staged.dblclick();
  const annotation = annotationTools(frame, page);
  // Hover can briefly open the directory. Explicit keyboard activation pins it,
  // so the helper does not mistake a pending hover-close for an open directory.
  async function pinDirectory() {
    await page.mouse.move(0, 0);
    const launcher = frame.getByRole('button', { name: /^批注 \(\d+\)$/ });
    await launcher.focus();
    await launcher.press('Escape');
    await launcher.press('Enter');
    await frame.getByRole('dialog', { name: '批注目录', exact: true }).waitFor();
  }
  const comments = {
    ...annotation,
    async locate(number) {
      await pinDirectory();
      await annotation.locate(number);
    },
    async text(number) {
      await pinDirectory();
      return annotation.text(number);
    },
  };

  await selectDiffLines(frame, 'new', 2);
  await comments.write('目录树切换保留批注');
  await comments.save();
  assert.equal(await comments.count(), 1);
  await unstaged.dblclick();
  await frame
    .locator('[data-code-side="new"][data-line="2"]')
    .filter({ hasText: 'value = 3' })
    .waitFor();
  await stagedRoot.click();
  assert.equal(await stagedRoot.getAttribute('aria-expanded'), 'false');
  await comments.locate(1);
  await staged.waitFor();
  assert.equal(await staged.getAttribute('aria-pressed'), 'true');
  assert.equal(await stagedRoot.getAttribute('aria-expanded'), 'true');
  assert.equal(await comments.count(), 1);
  assert.equal(await comments.text(1), '目录树切换保留批注');
  // Locating the same source again must reveal it even when selection did not change.
  await stagedRoot.click();
  assert.equal(await stagedRoot.getAttribute('aria-expanded'), 'false');
  await comments.locate(1);
  await staged.waitFor({ timeout: 3000 });
  assert.equal(await stagedRoot.getAttribute('aria-expanded'), 'true');
  await page.screenshot({ path: '/private/tmp/paneon-git-file-tree-desktop.png', fullPage: true });
  let geometry;
  if (process.env.PANEON_TEST_DESKTOP_ONLY !== '1') {
    await page.setViewportSize({ width: 390, height: 844 });
    await button(`已暂存 · M ${long}`).dblclick();
    const content = page.frames().find((candidate) => candidate.url().endsWith('/frame.html'));
    geometry = await content.evaluate(() => {
      const list = document.querySelector('[data-file-scroll]');
      const tree = document.querySelector('[data-file-tree]');
      return {
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        list: list.getBoundingClientRect().toJSON(),
        tree: tree.getBoundingClientRect().toJSON(),
        listClient: list.clientWidth,
        listScroll: list.scrollWidth,
        leaves: [...tree.querySelectorAll('[data-file-id]')].map((el) => ({
          width: el.getBoundingClientRect().width,
          scroll: el.scrollWidth,
          client: el.clientWidth,
        })),
      };
    });
    assert.ok(geometry.document <= geometry.viewport + 1, JSON.stringify(geometry));
    assert.ok(geometry.list.right <= geometry.viewport + 1, JSON.stringify(geometry));
    assert.ok(geometry.tree.width <= geometry.list.width, JSON.stringify(geometry));
    assert.ok(geometry.listScroll <= geometry.listClient + 1, JSON.stringify(geometry));
    assert.ok(
      geometry.leaves.every((leaf) => leaf.scroll <= leaf.client + 1),
      JSON.stringify(geometry),
    );
    await page.screenshot({ path: '/private/tmp/paneon-git-file-tree-mobile.png', fullPage: true });
    // Folding a different directory must preserve the user's scroll position.
    const unrelated = directory('untracked', 'untracked');
    await unrelated.scrollIntoViewIfNeeded();
    const scrollBefore = await frame.locator('[data-file-scroll]').evaluate((el) => el.scrollTop);
    assert.ok(scrollBefore > 100);
    await unrelated.click();
    await content.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const scrollAfter = await frame.locator('[data-file-scroll]').evaluate((el) => ({
      top: el.scrollTop,
      max: el.scrollHeight - el.clientHeight,
    }));
    assert.ok(
      scrollAfter.top >= Math.min(scrollBefore, scrollAfter.max) - 1,
      `Folding an unrelated folder stole scroll: ${JSON.stringify({ scrollBefore, scrollAfter })}`,
    );
  }
  // Same component in history and compare; these views have no working-area groups.
  for (const initialView of [
    { repositoryId: 'tree', type: 'history', commit: tip },
    { repositoryId: 'tree', type: 'compare', base, head: tip, mode: 'commits' },
  ]) {
    const view = await f.run({ ...params, initialView });
    await page.goto(f.url(view));
    await frame.locator(`[data-file-directory=${JSON.stringify(prefix)}]`).waitFor();
    assert.equal(await files.count(), 7);
    assert.equal(await frame.locator('[data-file-group="staged"]').count(), 0);
    await button(`D ${deleted}`).dblclick();
    await frame
      .locator('[data-code-side="old"][data-line="2"]')
      .filter({ hasText: 'value = 1' })
      .waitFor();
    await capture(initialView.type);
  }
  assert.deepEqual(errors, []);
  assert.equal((await f.events(panel)).length, 0);
  console.log(
    JSON.stringify({
      status: 'passed',
      geometry,
      screenshots: [
        '/private/tmp/paneon-git-file-tree-desktop.png',
        ...(process.env.PANEON_TEST_DESKTOP_ONLY === '1'
          ? []
          : ['/private/tmp/paneon-git-file-tree-mobile.png']),
      ],
    }),
  );
} catch (error) {
  await page?.screenshot({ path: '/private/tmp/paneon-git-file-tree-failure.png', fullPage: true });
  if (page && process.env.PANEON_TREE_EVIDENCE_DIR)
    await writeFile(
      join(process.env.PANEON_TREE_EVIDENCE_DIR, 'failure-dom.json'),
      JSON.stringify(
        await page
          .frameLocator('iframe')
          .locator('body')
          .evaluate((body) => ({
            popovers: [...body.querySelectorAll('[data-slot="popover-content"]')].map((node) => ({
              html: node.outerHTML,
              bounds: node.getBoundingClientRect().toJSON(),
              parent: node.parentElement.outerHTML.slice(0, 1500),
            })),
            controls: body.querySelector('[data-annotation-launcher]')?.outerHTML,
          })),
        null,
        2,
      ),
    );
  throw error;
} finally {
  await browser?.close();
  await f.stop();
}
