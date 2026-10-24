import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
const root = await mkdtemp(join(tmpdir(), 'paneon-pr-live-'));
let service, browser;
try {
  const { startServer } = await import(
    process.env.PANEON_TEST_RUNTIME_ENTRY ??
      new URL('../../dist/runtime/server.js', import.meta.url).href
  );
  const skill = join(root, 'agent-skills/paneon');
  await cp(
    process.env.PANEON_TEST_SKILL_SOURCE ?? new URL('../../skills/paneon', import.meta.url),
    skill,
    { recursive: true },
  );
  service = await startServer(join(root, '.paneon'));
  const repository = process.env.PANEON_LIVE_REPOSITORY ?? 'cli/cli',
    number = Number(process.env.PANEON_LIVE_PR ?? '14768');
  const panel = await service.runtime.run(
    join(skill, 'assets/examples/github-pr/panel.tsx'),
    root,
    { repository, initialPullRequest: number },
    false,
  );
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  await frame.locator('[data-pr-overview]').waitFor({ timeout: 60000 });
  await frame.getByRole('tab', { name: '文件改动', exact: true }).click();
  await frame.locator('[data-diff-source]').waitFor({ timeout: 60000 });
  const fixedSource = await frame.locator('[data-diff-source]').getAttribute('data-diff-source');
  assert.match(fixedSource, /^sha256:/);
  await frame.getByRole('tab', { name: '检查', exact: true }).click();
  await frame.locator('[data-pr-check]').first().waitFor({ timeout: 60000 });
  const checks = await frame.locator('[data-pr-check]').count();
  assert.equal(
    (await service.runtime.events(panel.instanceId, 'live-acceptance', 100, 0)).events.length,
    0,
  );
  if (process.env.PANEON_TEST_ARTIFACTS) {
    await mkdir(process.env.PANEON_TEST_ARTIFACTS, { recursive: true });
    await page.screenshot({
      path: join(process.env.PANEON_TEST_ARTIFACTS, 'github-pr-live.png'),
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    `Public gh Chrome passed: ${repository} #${number}, copied skill, real detail/fixed-object diff/${checks} check observations, zero browsing events.`,
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
