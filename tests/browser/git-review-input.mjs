import assert from 'node:assert/strict';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startGitReviewFixture } from './git-review-fixture.mjs';
import { git } from '../git-review-fixture.ts';
import { annotationTools, selectDiffLines, submitAnnotations } from './annotation-tools.mjs';

const f = await startGitReviewFixture();
let browser;
try {
  const a = join(f.root, 'project-a', 'web');
  const b = join(f.root, 'project-b', 'web');
  for (const path of [a, b]) {
    await mkdir(path, { recursive: true });
    await git(f.root, 'clone', '-q', f.repo, path);
    await writeFile(join(path, 'a.ts'), `const project = '${path === a ? 'A' : 'B'}';\n`);
  }
  const panel = await f.run({
    repositories: [a, b],
    initialView: { repositoryPath: b, type: 'changes', file: 'a.ts' },
  });
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(f.url(panel));
  const frame = page.frameLocator('iframe');
  const picker = frame.getByRole('button', { name: '仓库', exact: true });
  const menu = frame.getByRole('dialog', { name: '仓库', exact: true });
  await frame.locator('[data-diff-source]').waitFor();
  assert.equal(
    await frame.locator('header h1').count(),
    0,
    'The toolbar no longer repeats a title.',
  );
  assert.equal((await picker.innerText()).trim(), 'project-b/web');
  assert.match(await frame.locator('[data-code-side="new"]').innerText(), /project = 'B'/);
  const comments = annotationTools(frame, page);
  await selectDiffLines(frame, 'new', 1);
  await comments.write('Review the second same-name repository');
  await comments.save();
  await submitAnnotations(frame, page);
  const event = (await f.events(panel)).find((event) => event.type === 'git-review-submitted');
  const source = event.payload.files[0];
  assert.equal(source.repositoryPath, await realpath(b));
  assert.equal('repositoryId' in source, false);
  await picker.click();
  const rows = menu.locator('[data-repository-id]');
  const aRow = rows.filter({ hasText: await realpath(a) });
  const bRow = rows.filter({ hasText: await realpath(b) });
  const originalBId = await bRow.getAttribute('data-repository-id');
  await aRow.getByRole('button', { name: '移除仓库', exact: true }).click();
  await aRow.waitFor({ state: 'detached' });
  assert.equal(await bRow.getAttribute('data-repository-id'), originalBId);
  assert.equal(await bRow.getByText('web', { exact: true }).count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(
    (await picker.innerText()).trim(),
    'web',
    'Removing a name collision shortens the displayed name.',
  );
  assert.match(await frame.locator('[data-code-side="new"]').innerText(), /project = 'B'/);
  await picker.click();
  await menu.getByRole('button', { name: '添加仓库', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '添加仓库', exact: true });
  await dialog.getByRole('textbox', { name: '仓库目录', exact: true }).fill(a);
  await dialog.getByRole('button', { name: '添加', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await frame.locator('[data-file-id]').first().waitFor();
  assert.equal((await picker.innerText()).trim(), 'project-a/web');
  await picker.click();
  assert.equal(await bRow.getAttribute('data-repository-id'), originalBId);
  await bRow.getByRole('button').first().click();
  await frame.locator('[data-diff-source]').waitFor();
  assert.match(await frame.locator('[data-code-side="new"]').innerText(), /project = 'B'/);
  assert.deepEqual(errors, []);
  console.log(
    'PASS path-only input, explicit second repository, same-name add/remove, stable annotation identities and title removal.',
  );
} finally {
  await browser?.close();
  await f.stop();
}
