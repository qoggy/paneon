import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startSkillPagesFixture } from './skill-pages-fixture.mjs';
import { startGitReviewFixture } from './git-review-fixture.mjs';
import { startGithubPRFixture } from './github-pr-fixture.mjs';
import {
  openAnnotationDirectory,
  selectAnnotationText,
  submitAnnotations,
} from './annotation-tools.mjs';

const fixtures = [];
let browser;
const errors = [];
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  async function checkAnnotations(fixture, panel, selector, language, replacesEvent) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(fixture.url(panel));
    const frame = page.frameLocator('iframe');
    const toasts = frame.locator('[data-slot="toast"]');
    await frame.locator(selector).first().waitFor();
    await openAnnotationDirectory(frame);
    await frame.locator('[data-slot="empty"]').waitFor();
    assert.equal(await frame.locator('[data-annotation-submit]').count(), 0);
    assert.equal(await toasts.count(), 0, 'Initial empty state cannot submit');
    await page.keyboard.press('Escape');
    await selectAnnotationText(frame, selector, 0, 3);
    await frame.locator('[data-annotation-action]').click();
    await frame.locator('[data-annotation-editor] textarea').fill('Review this text');
    await frame.locator('[data-annotation-editor] textarea').press('Enter');
    await frame.locator('[data-annotation-editor]').waitFor({ state: 'hidden' });
    const eventURL = `**/api/panels/${panel.instanceId}/events`;
    await page.route(eventURL, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: false,
              error: { code: 'TEST_FAILURE', message: 'Intentional submission failure' },
            }),
          })
        : route.continue(),
    );
    await submitAnnotations(frame);
    await frame.getByRole('alert').filter({ hasText: 'Intentional submission failure' }).waitFor();
    assert.equal(await toasts.count(), 0, 'Failed persistence cannot show success');
    assert.equal((await fixture.events(panel)).length, 0);
    assert.equal(
      await frame.getByRole('button', { name: /^(Annotations|批注) \(1\)$/ }).count(),
      1,
      'Failed submission retains the draft',
    );
    await page.unroute(eventURL);

    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route(eventURL, async (route) => {
      if (route.request().method() === 'POST') await gate;
      await route.continue();
    });
    const eventRequest = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().endsWith('/events'),
    );
    await submitAnnotations(frame);
    await eventRequest;
    try {
      assert.equal(await toasts.count(), 0, 'No success before receipt');
      assert.ok(await frame.locator('[data-annotation-marker]').count());
      assert.equal(await frame.locator('[data-annotation-marker]:not(:disabled)').count(), 0);
    } finally {
      release();
    }
    const title = language === 'en' ? 'Annotations submitted.' : '批注已提交。';
    const toast = toasts.filter({ hasText: title });
    await toast.waitFor();
    assert.equal(await toasts.count(), 1, 'One success notification');
    await toast.evaluate((element) =>
      Promise.allSettled(element.getAnimations().map((animation) => animation.finished)),
    );
    // CSS transitions can be replaced while the toast measures itself; wait for painted stability.
    await toast.locator('[data-slot="toast-close"]').click({ trial: true });
    const toastBox = await toast.boundingBox();
    const launcherBox = await frame.locator('[data-annotation-launcher]').boundingBox();
    assert.ok(
      toastBox.y + toastBox.height <= launcherBox.y - 8,
      'Toast stays above the floating entry',
    );
    assert.equal(await frame.getByText(/Saved as event|已保存为事件/).count(), 0);
    const [first] = await fixture.events(panel);
    const annotations = (event) =>
      event.type === 'git-review-submitted' || event.type === 'file-review-submitted'
        ? event.payload.files.flatMap((file) => file.annotations)
        : event.type === 'pr-feedback-submitted'
          ? event.payload.sources.flatMap((source) => source.annotations)
          : event.payload.annotations;
    assert.equal(annotations(first)[0].comment, 'Review this text');
    await page.unroute(eventURL);
    await toast.locator('[data-slot="toast-close"]').click();
    await toasts.waitFor({ state: 'detached' });
    const unlock = frame.getByRole('button', { name: /^(Correct feedback|修改反馈)$/ });
    await openAnnotationDirectory(frame);
    if (await unlock.count()) await unlock.click();
    await submitAnnotations(frame);
    await toast.waitFor();
    const events = await fixture.events(panel);
    assert.equal(events.length, 2);
    if (
      first.type === 'git-review-submitted' ||
      first.type === 'file-review-submitted' ||
      first.type === 'table-submitted' ||
      first.type === 'pr-feedback-submitted'
    )
      assert.equal('id' in annotations(events[1])[0], false);
    else assert.equal(annotations(events[1])[0].id, annotations(first)[0].id);
    assert.equal(events[1].payload.replacesEventId, replacesEvent ? first.id : undefined);
    assert.equal(await frame.getByText(/Saved as event|已保存为事件/).count(), 0);
    console.log(`PASS ${first.type}: failure, receipt-only toast, retained draft and correction`);
    if (replacesEvent) {
      await toast.locator('[data-slot="toast-close"]').click();
      await toasts.waitFor({ state: 'detached' });
      await openAnnotationDirectory(frame);
      if (await unlock.count()) await unlock.click();
      await openAnnotationDirectory(frame);
      await frame
        .getByRole('button', { name: /^(Delete annotation|删除批注) 1$/, exact: true })
        .click();
      await frame.locator('[data-slot="empty"]').waitFor();
      assert.equal(
        await frame.locator('[data-annotation-submit] button').isVisible(),
        true,
        'Successful receipt allows an empty correction',
      );
      await submitAnnotations(frame);
      await toast.waitFor();
      const cleared = await fixture.events(panel);
      assert.equal(cleared.length, 3);
      assert.deepEqual(annotations(cleared[2]), []);
      assert.equal(cleared[2].payload.replacesEventId, events[1].id);
      console.log(`PASS ${first.type}: clear-all correction remains available`);
    }
    if (!replacesEvent) {
      await toast.locator('[data-slot="toast-close"]').click();
      await toasts.waitFor({ state: 'detached' });
      await frame.getByRole('button', { name: '请 AI 审阅', exact: true }).click();
      await frame.getByRole('status').filter({ hasText: '审阅请求已发送给当前 AI。' }).waitFor();
      assert.equal(await toasts.count(), 0, 'PR review request keeps its existing feedback');
    }
    await page.close();
  }

  const standard = await startSkillPagesFixture();
  fixtures.push(standard);
  const markdownFilePath = join(standard.root, 'review.md');
  await writeFile(markdownFilePath, 'Review this paragraph.');
  const review = await standard.run('file-review', {
    title: 'Submission toast review',
    files: [markdownFilePath],
  });
  const table = await standard.run('table', {
    title: 'Submission toast table',
    columns: [{ key: 'text', label: 'Text' }],
    rows: [{ text: 'Review this cell.' }],
  });
  await checkAnnotations(standard, review, '[data-source-leaf]', 'en', true);
  await checkAnnotations(
    standard,
    table,
    '[data-row-index="0"] [data-annotation-text]',
    'en',
    true,
  );

  // Choice and form keep their existing inline success feedback.
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(standard.url(standard.choose));
  let frame = page.frameLocator('iframe');
  for (const name of ['SQLite', 'Feature A', 'npm']) {
    await frame
      .getByRole(name === 'Feature A' ? 'checkbox' : 'radio', { name, exact: true })
      .check();
    await frame.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await frame.getByRole('button', { name: 'Submit all answers', exact: true }).click();
  await frame.getByRole('status').filter({ hasText: 'Saved as event' }).waitFor();
  assert.equal(await frame.locator('[data-slot="toast"]').count(), 0);
  assert.equal(
    await frame.locator('[data-annotation-launcher]').count(),
    0,
    'Unconfigured pages have no annotation entry',
  );
  await page.goto(standard.url(standard.form));
  frame = page.frameLocator('iframe');
  await frame.getByLabel('Project name', { exact: false }).fill('Toast scope');
  await frame.getByRole('radio', { name: 'Normal', exact: true }).check();
  await frame.getByRole('button', { name: 'Submit form', exact: true }).click();
  await frame.getByRole('status').filter({ hasText: 'Saved as event' }).waitFor();
  assert.equal(await frame.locator('[data-slot="toast"]').count(), 0);
  assert.equal(
    await frame.locator('[data-annotation-launcher]').count(),
    0,
    'Unconfigured pages have no annotation entry',
  );
  await page.close();
  console.log('PASS choose/form: inline success unchanged');

  const git = await startGitReviewFixture();
  fixtures.push(git);
  await checkAnnotations(git, git.panel, '[data-code-side="new"][data-line="1"]', 'zh-CN', true);
  const pr = await startGithubPRFixture();
  fixtures.push(pr);
  await checkAnnotations(pr, pr.panel, '[data-source-leaf]', 'zh-CN', false);
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  for (const fixture of fixtures.reverse()) await fixture.stop();
}
