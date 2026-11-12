import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { SKILL_ROOT } from '../skill-paths.ts';
import { startServer } from '../runtime-fixture.ts';

const root = await mkdtemp(join(tmpdir(), 'paneon-test-file-highlights-'));
const evidence = join(tmpdir(), 'paneon-test-file-evidence');
const files = [
  ['src/feature.ts', false],
  ['src/feature.test.ts', true],
  ['src/feature.spec.ts', true],
  ['tests/helpers.ts', false],
  ['tests/fixtures/example.test.ts', false],
  ['tests/fixtures/added.test.ts', false],
  ['tests/fixtures/deleted.test.ts', false],
  ['pkg/cache_test.go', true],
  ['python/test_cache.py', true],
  ['src/CacheTest.java', false],
  ['module/src/test/java/CacheTest.java', true],
  ['module/src/test/kotlin/CacheTest.kt', true],
  ['src/lib.rs', false],
  ['test.sh', false],
];
const execute = promisify(execFile);
let service, browser;
try {
  const skill = join(root, 'skill');
  const repository = join(root, 'repository');
  await cp(process.env.PANEON_TEST_SKILL_SOURCE ?? SKILL_ROOT, skill, { recursive: true });
  await mkdir(repository);
  await mkdir(evidence, { recursive: true });
  const git = async (...args) => execute('git', ['-C', repository, ...args]);
  await git('init', '-q');
  await git('config', 'user.name', 'File highlight test');
  await git('config', 'user.email', 'test@example.invalid');
  for (const [path] of files) {
    await mkdir(dirname(join(repository, path)), { recursive: true });
    await writeFile(join(repository, path), 'const value = 1;\n');
  }
  await git('add', '.');
  await git('commit', '-qm', 'Create sample files');
  for (const [path] of files)
    await writeFile(
      join(repository, path),
      path.endsWith('.rs')
        ? 'pub fn value() -> u32 { 2 }\n#[cfg(test)] mod tests {}\n'
        : 'const value = 2;\n',
    );
  await writeFile(join(root, 'old.ts'), 'const value = 1;\n');
  service = await startServer(join(root, 'runtime'));
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const preferences = (theme) =>
    service.app.inject({
      method: 'POST',
      url: '/api/preferences',
      headers: {
        host: `127.0.0.1:${service.descriptor.port}`,
        authorization: `Bearer ${service.descriptor.controlToken}`,
      },
      payload: { ui: { theme, language: 'zh-CN' } },
    });
  await preferences('light');
  async function background(row) {
    await row.evaluate(async (element) => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    return row.evaluate((element) => getComputedStyle(element).backgroundColor);
  }
  for (const panel of ['file-review', 'diff-review', 'git-review']) {
    const params =
      panel === 'file-review'
        ? { files: files.map(([path]) => path) }
        : panel === 'diff-review'
          ? {
              files: files.map(([path]) => {
                if (path === 'tests/fixtures/added.test.ts')
                  return { oldPath: null, newPath: path };
                if (path === 'tests/fixtures/deleted.test.ts')
                  return { oldPath: path, newPath: null };
                if (path.startsWith('tests/fixtures/') || path.includes('/src/test/'))
                  return { oldPath: path, newPath: path };
                return {
                  displayPath: path,
                  oldPath: join(root, 'old.ts'),
                  newPath: path,
                };
              }),
            }
          : {
              repositories: [repository],
              initialView: { repositoryPath: repository, type: 'changes', file: files[0][0] },
            };
    const instance = await service.runtime.run(
      join(skill, `assets/panels/${panel}/panel.tsx`),
      repository,
      params,
      false,
    );
    await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${instance.instanceId}`);
    const frame = page.frameLocator('iframe');
    const row = (index) =>
      panel === 'git-review'
        ? frame.locator(`[data-file-id][title=${JSON.stringify(`未暂存 · M ${files[index][0]}`)}]`)
        : frame.locator(`[data-tree-item="file:${index}"]`);
    await row(files.length - 1).waitFor();
    let lightBackground;
    for (const theme of ['light', 'dark']) {
      await preferences(theme);
      await frame.locator(`html[data-theme="${theme}"]`).waitFor();
      for (const [index, [path, test]] of files.entries())
        assert.equal(
          await row(index).getAttribute('data-test-file'),
          test ? 'true' : null,
          `${panel} ${theme}: ${path}`,
        );
      assert.equal(
        await frame.locator('[data-tree-item^="directory:"][data-test-file]').count(),
        0,
      );
      await row(0).click();
      await page.mouse.move(0, 0);
      const testBackground = await background(row(1));
      if (theme === 'light') lightBackground = testBackground;
      else
        assert.notEqual(
          testBackground,
          lightBackground,
          `${panel}: dark tint must follow the panel theme, independently of the system theme.`,
        );
      const normalBackground = await background(row(3));
      assert.notEqual(testBackground, normalBackground, `${panel} ${theme}: test tint is visible`);
      const normalSelected = await background(row(0));
      if (panel === 'git-review') {
        assert.equal(await row(1).getAttribute('data-file-status'), 'M');
        assert.equal(
          await row(1).evaluate((element) => getComputedStyle(element).color),
          await row(0).evaluate((element) => getComputedStyle(element).color),
          'Git status text colors stay independent of test highlighting.',
        );
      }
      await row(1).hover();
      assert.notEqual(await background(row(1)), testBackground, 'Hover remains visible.');
      await row(1).click();
      await page.mouse.move(0, 0);
      assert.equal(await row(1).getAttribute('aria-pressed'), 'true');
      assert.equal(await background(row(1)), normalSelected, 'Selection takes precedence.');
      assert.ok(!(await row(1).getAttribute('class')).includes('bg-green-50'));
      await row(0).click();
      await page.mouse.move(0, 0);
      await background(row(1));
      await page.screenshot({ path: join(evidence, `${panel}-${theme}.png`), fullPage: true });
    }
    console.log(`${panel}: conservative test names, fixtures, themes, hover and selection passed.`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
