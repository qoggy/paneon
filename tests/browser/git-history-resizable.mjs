import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createLayoutRepository, startGitReviewFixture } from './git-review-fixture.mjs';
import { verifyHistoryColumns, verifyHistorySplit } from './git-review-layout.mjs';
import { annotationTools, selectDiffLines } from './annotation-tools.mjs';

const f = await startGitReviewFixture();
let browser, page, panel;
try {
  const layout = await createLayoutRepository(f.root);
  panel = await f.run({
    repositories: [{ id: 'layout', path: layout.repository }],
    initialView: {
      repositoryId: 'layout',
      type: 'history',
      commit: layout.tip,
      file: layout.filename,
    },
  });
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(f.url(panel));
  const frame = page.frameLocator('iframe');
  await frame.locator('[data-diff-source]').waitFor();
  assert.equal(
    await frame.locator('[data-history-split][data-slot="resizable-panel-group"]').count(),
    1,
  );
  assert.equal(
    await frame.locator('[data-history-workspace][data-slot="resizable-panel-group"]').count(),
    1,
  );
  const content = page.frames().find((frame) => frame.url().endsWith('/frame.html'));
  const until = async (test, message) => {
    const deadline = Date.now() + 15000;
    while (!(await test())) {
      if (Date.now() > deadline) throw new Error(message);
      await delay(30);
    }
  };
  await verifyHistoryColumns(frame, page, content, until);
  await verifyHistorySplit(frame, page, content, until);

  // Saved annotations survive actual pointer gestures and can still locate and submit.
  const tools = annotationTools(frame, page);
  const line = Number(
    await frame.locator('[data-code-side="new"]').first().getAttribute('data-line'),
  );
  await selectDiffLines(frame, 'new', line);
  await tools.write('保留历史分栏中的批注');
  await tools.save();
  const source = await frame.locator('[data-diff-source]').elementHandle();
  const separator = frame.getByRole('separator', { name: '调整分支栏宽度', exact: true });
  const box = await separator.boundingBox();
  await page.mouse.move(box.x + 0.5, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 30.5, box.y + 40, { steps: 5 });
  await page.mouse.up();
  assert.equal(await tools.count(), 1);
  assert.equal(await source.evaluate((element) => element.isConnected), true);
  const directory = frame.getByRole('button', { name: /^批注 \(\d+\)$/ });
  if ((await directory.getAttribute('aria-expanded')) !== 'true') await directory.press('Enter');
  await tools.locate(1);
  if ((await directory.getAttribute('aria-expanded')) !== 'true') await directory.press('Enter');
  await frame.getByRole('button', { name: '提交批注', exact: true }).press('Enter');
  let events = [];
  await until(async () => {
    events = await f.events(panel);
    return events.length > 0;
  }, 'Submission did not produce a feedback event.');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'git-review-submitted');
  assert.equal(events[0].payload.annotations[0].comment, '保留历史分栏中的批注');
  assert.deepEqual(errors, []);
  const artifacts =
    process.env.PANEON_TEST_ARTIFACTS ?? '/private/tmp/paneon-history-resizable-evidence';
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: `${artifacts}/history.png` });
  console.log(
    JSON.stringify({
      status: 'passed',
      historyColumns: true,
      historyRows: true,
      savedAnnotations: true,
      location: true,
      submission: true,
    }),
  );
} catch (error) {
  if (panel) console.error('Feedback events', await f.events(panel));
  if (page)
    console.error(
      'Visible errors',
      await page.frameLocator('iframe').getByRole('alert').allTextContents(),
    );
  if (page)
    await page.screenshot({ path: '/private/tmp/paneon-history-resizable-evidence/failure.png' });
  throw error;
} finally {
  await browser?.close();
  await f.stop();
}
