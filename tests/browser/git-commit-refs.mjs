import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGraphRepository, startGitReviewFixture } from './git-review-fixture.mjs';
import { git } from '../git-review-fixture.ts';

const fixture = await startGitReviewFixture();
let browser;
try {
  const graph = await createGraphRepository(fixture.root);
  await git(graph.repository, 'branch', '0.3.x', graph.merge);
  const longBranch = `feature/${'long-reference-'.repeat(12)}中文`;
  await git(graph.repository, 'branch', longBranch, graph.merge);
  for (const name of ['origin/0.3.x', 'origin/develop'])
    await git(graph.repository, 'update-ref', `refs/remotes/${name}`, graph.merge);
  for (const name of ['main', 'v0.3.0']) await git(graph.repository, 'tag', name, graph.merge);
  const panel = await fixture.run({
    repositories: [graph.repository],
    initialView: { repositoryPath: graph.repository, type: 'history', commit: graph.merge },
  });
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  const comparisons = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/actions/')) {
      const input = request.postDataJSON()?.input?.request;
      if (input?.type === 'compare') comparisons.push(input);
    }
  });
  await page.goto(fixture.url(panel));
  const frame = page.frameLocator('iframe');
  const row = frame.locator(`[data-commit-id="${graph.merge}"]`);
  const summary = row.locator('[data-commit-ref-summary]');
  const details = frame.locator('[data-commit-ref-details]');
  await summary.waitFor();
  await details.waitFor();
  assert.equal(await summary.textContent(), 'origin & main');
  assert.equal(
    await row.locator('[data-commit-ref]').count(),
    3,
    'The stack represents local branches, remotes and tags.',
  );
  const full = details.locator('[data-commit-detail-ref]');
  for (const name of [
    'main',
    '0.3.x',
    longBranch,
    'origin/main',
    'origin/0.3.x',
    'origin/develop',
    'reviewed',
    'v0.1.0',
    'v0.3.0',
  ]) {
    assert.ok((await full.allTextContents()).includes(name), `Full details retain ${name}`);
  }
  assert.equal(
    await details.locator('[data-commit-detail-ref="branch"][data-ref-name="main"]').count(),
    1,
  );
  assert.equal(
    await details.locator('[data-commit-detail-ref="tag"][data-ref-name="main"]').count(),
    1,
  );
  const totalRefs = await full.count();
  for (const width of [1280, 1512]) {
    await page.setViewportSize({ width, height: 800 });
    const metrics = await summary.evaluate((el) => ({
      width: el.clientWidth,
      content: el.scrollWidth,
      fontSize: getComputedStyle(el).fontSize,
    }));
    assert.equal(metrics.fontSize, '12px');
    assert.ok(metrics.width >= metrics.content, 'One representative label remains readable.');
    assert.ok(
      await details.evaluate((el) => el.scrollWidth <= el.clientWidth),
      'Long full names wrap inside details.',
    );
  }
  const artifacts = '/tmp/paneon-commit-refs-evidence';
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: `${artifacts}/light.png`, animations: 'disabled' });
  await row.locator('[data-commit-refs]').click({ button: 'right' });
  await frame
    .getByRole('menuitem', { name: '与当前分支比较: refs/tags/main', exact: true })
    .waitFor();
  assert.equal(await frame.getByRole('menu').count(), 1);
  assert.equal(
    await frame.getByRole('menuitem').count(),
    totalRefs,
    'Every full reference remains an available comparison target.',
  );
  await frame
    .getByRole('menuitem', { name: '与当前分支比较: refs/tags/main', exact: true })
    .click();
  await frame.getByRole('combobox', { name: '基线', exact: true }).waitFor();
  assert.equal(comparisons.at(-1).base, 'refs/tags/main');
  await frame.getByRole('tab', { name: '提交记录', exact: true }).click();
  await details.waitFor();
  await details
    .locator('[data-commit-detail-ref="branch"][data-ref-name="main"]')
    .click({ button: 'right' });
  await frame.getByRole('menuitem', { name: '与当前分支比较', exact: true }).click();
  await frame.getByRole('combobox', { name: '基线', exact: true }).waitFor();
  assert.equal(comparisons.at(-1).base, 'refs/heads/main');
  await frame.getByRole('tab', { name: '提交记录', exact: true }).click();
  await details.waitFor();
  await fixture.service.app.inject({
    method: 'POST',
    url: '/api/preferences',
    headers: {
      host: `127.0.0.1:${fixture.service.descriptor.port}`,
      authorization: `Bearer ${fixture.service.descriptor.controlToken}`,
    },
    payload: { ui: { theme: 'dark', language: 'en' } },
  });
  await page.locator('html.dark[data-language="en"]:not([data-theme-changing])').waitFor();
  await frame.locator('html.dark[data-language="en"]:not([data-theme-changing])').waitFor();
  await page.screenshot({ path: `${artifacts}/dark.png`, animations: 'disabled' });
  assert.deepEqual(errors, []);
  assert.equal((await fixture.events(panel)).length, 0);
  console.log(
    'PASS compact multi-ref summary, grouped complete names, long-name wrapping, same-name branch/tag comparison, two desktop widths, light/dark and en/zh.',
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
