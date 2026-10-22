import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { choices, startSkillPagesFixture } from './skill-pages-fixture.mjs';

async function until(check, message) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(30);
  }
  throw new Error(message);
}
const fixture = await startSkillPagesFixture();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage();
  const errors = [];
  const blockedSubmissions = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.text().includes('Blocked form submission')) blockedSubmissions.push(message.text());
  });
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(fixture.url(fixture.choose));
  const frame = page.frameLocator('iframe');
  const note = (name) =>
    frame.getByLabel(`Additional explanation for ${name} (optional)`, { exact: true });
  const mine = () => frame.getByLabel('My answer', { exact: true });
  const radio = (name) => frame.getByRole('radio', { name, exact: true });
  const checkbox = (name) => frame.getByRole('checkbox', { name, exact: true });
  const next = () => frame.getByRole('button', { name: 'Next', exact: true }).click();
  const previous = () => frame.getByRole('button', { name: 'Previous', exact: true }).click();
  async function screenshot(name) {
    if (!process.env.PANEON_TEST_ARTIFACTS) return;
    await mkdir(process.env.PANEON_TEST_ARTIFACTS, { recursive: true });
    await frame
      .locator('main')
      .evaluate((element) => element.ownerDocument.defaultView.scrollTo(0, 0));
    await page.evaluate(() => window.scrollTo(0, 0));
    // Capture the finished UI, rather than Radix's initial transparent animation frame.
    await frame.locator('body').evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    await page.screenshot({ path: join(process.env.PANEON_TEST_ARTIFACTS, name) });
  }
  await frame.getByRole('heading', { name: choices.title, exact: true }).waitFor();
  assert.equal(
    await mine().isVisible(),
    true,
    'Custom answer is visible before any mode selection.',
  );
  assert.equal(
    await frame.getByRole('button', { name: 'Write my own answer', exact: true }).count(),
    0,
  );
  assert.equal(await frame.getByRole('button', { name: 'Choose options', exact: true }).count(), 0);
  assert.equal(
    await frame.getByRole('radio', { checked: true }).count(),
    0,
    'Recommendation must not preselect.',
  );
  const descriptionButton = frame.getByRole('button', { name: 'Description', exact: true });
  const descriptionPopover = frame.getByRole('dialog', { name: 'Questionnaire description' });
  assert.equal(await frame.getByText(choices.description, { exact: true }).count(), 0);
  assert.equal(await frame.getByText('Question 1 / 3', { exact: true }).count(), 0);
  assert.equal(await frame.getByText('Select one answer or write your own.').count(), 0);
  const contextBox = await frame
    .getByRole('heading', { name: choices.title, exact: true })
    .boundingBox();
  const progressBox = await frame.getByText('Single choice · 1 / 3', { exact: true }).boundingBox();
  const headingBox = await frame
    .getByRole('heading', { name: 'Storage', exact: true })
    .boundingBox();
  assert.ok(contextBox && progressBox && headingBox);
  assert.ok(
    Math.abs(contextBox.y - progressBox.y) <= 2,
    'Short context and progress share one row.',
  );
  assert.ok(
    headingBox.y - progressBox.y - progressBox.height <= 12,
    'Question follows the compact context row.',
  );
  await descriptionButton.focus();
  await descriptionButton.press('Enter');
  await descriptionPopover.getByText(choices.description, { exact: true }).waitFor();
  await screenshot('choose-description-desktop.png');
  await page.keyboard.press('Escape');
  await descriptionPopover.waitFor({ state: 'hidden' });
  await until(
    () => descriptionButton.evaluate((element) => element === document.activeElement),
    'Escape returns focus to Description.',
  );
  await descriptionButton.press('Space');
  await descriptionPopover.waitFor();
  await page.keyboard.press('Escape');
  await descriptionPopover.waitFor({ state: 'hidden' });
  const choiceLayout = await frame.locator('main').evaluate((element) => {
    const main = element.getBoundingClientRect();
    const row = element.querySelector('[data-choice-option] > label').getBoundingClientRect();
    const custom = element.querySelector('[data-custom-answer] textarea').getBoundingClientRect();
    const actions = element.querySelector('[data-choice-actions]');
    const [previous, next] = [...actions.querySelectorAll('button')].map((button) =>
      button.getBoundingClientRect(),
    );
    return {
      width: main.width,
      centered: Math.abs(main.left * 2 + main.width - innerWidth),
      rowHeight: row.height,
      customHeight: custom.height,
      actionsAligned:
        Math.abs(previous.left - main.left - 16) <= 2 &&
        Math.abs(next.right - main.right + 16) <= 2,
    };
  });
  assert.ok(
    choiceLayout.width >= 480 && choiceLayout.width <= 640,
    'Desktop uses a narrow column.',
  );
  assert.ok(choiceLayout.centered <= 2, 'Questionnaire is centered inside its own iframe.');
  assert.ok(choiceLayout.rowHeight <= 80, 'A short choice stays a compact row.');
  assert.ok(choiceLayout.customHeight <= 44, 'An empty custom answer is a compact input.');
  assert.equal(choiceLayout.actionsAligned, true, 'Previous and Next align to opposite edges.');
  await screenshot('choose-desktop.png');
  await next();
  await frame.getByRole('heading', { name: 'Features', exact: true }).waitFor();
  await frame.getByText('Multiple choice · 2 / 3', { exact: true }).waitFor();
  assert.equal(await frame.getByRole('alert').count(), 0, 'Unanswered questions allow browsing.');
  await next();
  await frame.getByRole('heading', { name: 'Delivery', exact: true }).waitFor();
  await next();
  await frame.getByRole('heading', { name: 'Review all answers', exact: true }).waitFor();
  await frame.getByText('Answer summary', { exact: true }).waitFor();
  assert.equal(await frame.getByText(/4 \/ 3/).count(), 0);
  const emptySummary = frame.getByRole('region', { name: 'Answer summary' });
  await emptySummary.getByText('0 / 3 answered', { exact: true }).waitFor();
  assert.equal(await emptySummary.getByText('No answer', { exact: true }).count(), 3);
  await screenshot('choose-unanswered-review-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot('choose-unanswered-review-mobile.png');
  await page.setViewportSize({ width: 1280, height: 1100 });
  await frame.getByRole('button', { name: 'Submit all answers', exact: true }).click();
  assert.equal(
    await frame.getByRole('alert').innerText(),
    'Select an option or enter your own answer.',
  );
  const storageHeading = frame.getByRole('heading', { name: 'Storage', exact: true });
  await until(
    () => storageHeading.evaluate((element) => element === document.activeElement),
    'Final validation focuses the first unanswered question.',
  );
  assert.equal((await fixture.events(fixture.choose)).length, 0);
  await next();
  assert.equal(
    await frame.getByRole('alert').count(),
    0,
    'Leaving an invalid question clears its error.',
  );
  await previous();
  assert.equal(await frame.getByRole('alert').count(), 0);
  await frame.getByRole('button', { name: 'View details: SQLite', exact: true }).click();
  const details = frame.getByRole('complementary', { name: 'SQLite', exact: true });
  await details.getByRole('heading', { name: 'Details', exact: true }).waitFor();
  assert.equal(await frame.getByRole('radio', { checked: true }).count(), 0);
  const columns = await frame.locator('main').evaluate((element) => {
    const main = element.getBoundingClientRect();
    const aside = document.querySelector('aside').getBoundingClientRect();
    return { separated: aside.left >= main.right, fits: aside.right <= innerWidth };
  });
  assert.deepEqual(columns, { separated: true, fits: true });
  assert.equal(await frame.locator('[data-choice-option] .markdown-body').count(), 0);
  assert.equal(
    await details
      .getByRole('heading', { name: 'Details', exact: true })
      .evaluate((element) => getComputedStyle(element).fontSize),
    '14px',
    'Detail Markdown headings obey the reading pane typography.',
  );
  await screenshot('choose-details-desktop.png');
  const sqlite = frame.locator('[data-choice-option="sqlite"]');
  const unselectedStyle = await sqlite.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    border: getComputedStyle(element).borderColor,
  }));
  const sqliteRow = sqlite.locator(':scope > label');
  const rowBounds = await sqliteRow.boundingBox();
  assert.ok(rowBounds);
  await sqliteRow.click({ position: { x: rowBounds.width - 12, y: 12 } });
  assert.equal(await radio('SQLite').isChecked(), true, 'The full choice row selects its option.');
  await until(
    async () =>
      (await sqlite.evaluate((element) => getComputedStyle(element).backgroundColor)) !==
      unselectedStyle.background,
    'Selected choice background changes after the transition begins.',
  );
  const selectedStyle = await sqlite.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    border: getComputedStyle(element).borderColor,
  }));
  assert.notDeepEqual(selectedStyle, unselectedStyle, 'A selected choice has a visible state.');
  await note('SQLite').fill('  Keep backups 中文🙂  ');
  assert.equal(await radio('SQLite').isChecked(), true, 'Typing a note preserves its selection.');
  await page.setViewportSize({ width: 390, height: 844 });
  const detailDialog = frame.getByRole('dialog', { name: 'SQLite', exact: true });
  await detailDialog.waitFor();
  await detailDialog.getByRole('heading', { name: 'Details', exact: true }).waitFor();
  await until(
    () => detailDialog.evaluate((element) => getComputedStyle(element).opacity === '1'),
    'The detail dialog finishes opening before visual checks, including without screenshots.',
  );
  await screenshot('choose-details-mobile.png');
  assert.equal(await detailDialog.evaluate((element) => getComputedStyle(element).opacity), '1');
  await page.keyboard.press('Escape');
  await detailDialog.waitFor({ state: 'hidden' });
  assert.equal(await radio('SQLite').isChecked(), true);
  assert.equal(await note('SQLite').inputValue(), '  Keep backups 中文🙂  ');
  const detailButton = frame.getByRole('button', { name: 'View details: SQLite', exact: true });
  assert.equal(await detailButton.evaluate((element) => element === document.activeElement), true);
  await detailButton.click();
  await frame
    .getByRole('dialog', { name: 'SQLite', exact: true })
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await detailDialog.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1280, height: 1100 });
  await detailButton.click();
  await details.waitFor();
  assert.equal((await fixture.events(fixture.choose)).length, 0);

  await radio('PostgreSQL').check();
  assert.equal(
    await note('PostgreSQL').inputValue(),
    '',
    'Comments never move to a different option.',
  );
  await note('PostgreSQL').fill('PostgreSQL note');
  await radio('SQLite').check();
  assert.equal(await note('SQLite').inputValue(), '  Keep backups 中文🙂  ');
  await mine().fill('Temporary custom draft');
  assert.equal(await radio('Other').isChecked(), true);
  assert.equal(await radio('SQLite').isChecked(), false, 'Single answers remain exclusive.');
  assert.equal(await note('SQLite').count(), 0);
  await radio('SQLite').check();
  assert.equal(await mine().inputValue(), 'Temporary custom draft');
  await frame.getByText('Draft kept. Select Other to include it.', { exact: true }).waitFor();
  assert.equal(await note('SQLite').inputValue(), '  Keep backups 中文🙂  ');
  const nestedComment = await note('SQLite').evaluate((element) =>
    element.closest('[data-slot="card"]').textContent.includes('SQLite'),
  );
  assert.equal(nestedComment, true, 'Explanation stays inside its selected option card.');
  await next();
  assert.equal(
    await frame.getByRole('complementary').count(),
    0,
    'Changing questions closes the previous details.',
  );
  assert.equal(await mine().isVisible(), true);
  const narrowChoiceWidth = await frame.locator('main').evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    viewport: innerWidth,
  }));
  assert.ok(narrowChoiceWidth.width <= narrowChoiceWidth.viewport);
  await checkbox('Feature B').check();
  await note('Feature B').fill('B note');
  await checkbox('Feature A').check();
  await note('Feature A').fill('A note');
  await checkbox('Feature B').uncheck();
  await checkbox('Feature B').check();
  assert.equal(await note('Feature B').inputValue(), 'B note');
  await mine().fill('  Extra feature  ');
  assert.equal(await checkbox('Other').isChecked(), true);
  assert.equal(await checkbox('Feature A').isChecked(), true);
  assert.equal(await checkbox('Feature B').isChecked(), true);
  await checkbox('Feature A').uncheck();
  await checkbox('Feature A').check();
  assert.equal(
    await checkbox('Other').isChecked(),
    true,
    'Supplied choices do not deselect custom in multiple mode.',
  );
  assert.equal(await note('Feature A').inputValue(), 'A note');
  await mine().fill('');
  await next();
  await frame.getByRole('heading', { name: 'Delivery', exact: true }).waitFor();
  assert.equal(
    await frame.getByRole('alert').count(),
    0,
    'An empty selected custom answer does not block Next.',
  );
  await next();
  await frame
    .getByRole('region', { name: 'Answer summary' })
    .getByText('1 / 3 answered', { exact: true })
    .waitFor();
  await frame.getByRole('button', { name: 'Submit all answers', exact: true }).click();
  assert.equal(
    await frame.getByRole('alert').innerText(),
    'Enter your own answer or deselect Other.',
  );
  await until(
    () =>
      frame
        .getByRole('heading', { name: 'Features', exact: true })
        .evaluate((element) => element === document.activeElement),
    'Submission returns to the first invalid custom answer.',
  );
  assert.equal((await fixture.events(fixture.choose)).length, 0);
  assert.equal(await checkbox('Feature A').isChecked(), true);
  assert.equal(await note('Feature A').inputValue(), 'A note');
  assert.equal(await note('Feature B').inputValue(), 'B note');
  await next();
  assert.equal(await frame.getByRole('alert').count(), 0);
  await previous();
  assert.equal(await frame.getByRole('alert').count(), 0);
  assert.equal(await mine().inputValue(), '');
  assert.equal(await checkbox('Other').isChecked(), true);
  await mine().fill('  Extra feature  ');
  await checkbox('Other').uncheck();
  assert.equal(await mine().inputValue(), '  Extra feature  ');
  await frame.getByText('Draft kept. Select Other to include it.', { exact: true }).waitFor();
  await checkbox('Other').check();
  await previous();
  assert.equal(await note('SQLite').inputValue(), '  Keep backups 中文🙂  ');
  await radio('PostgreSQL').check();
  assert.equal(await note('PostgreSQL').inputValue(), 'PostgreSQL note');
  await next();
  assert.equal(await note('Feature A').inputValue(), 'A note');
  assert.equal(await note('Feature B').inputValue(), 'B note');
  assert.equal(await mine().inputValue(), '  Extra feature  ');
  await screenshot('choose-multiple-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  const contentFrame = page.frames().find((candidate) => candidate.url().endsWith('/frame.html'));
  assert.ok(contentFrame);
  assert.equal(
    await contentFrame.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    true,
    'Narrow choice page has no horizontal overflow.',
  );
  assert.equal(await mine().isVisible(), true);
  await screenshot('choose-mobile.png');
  await page.setViewportSize({ width: 1280, height: 1100 });
  await next();
  assert.equal(await frame.getByRole('region', { name: 'Answer summary' }).count(), 0);
  assert.equal(
    await frame.getByRole('button', { name: 'Submit all answers', exact: true }).count(),
    0,
  );
  await mine().fill('   ');
  await next();
  await frame
    .getByRole('region', { name: 'Answer summary' })
    .getByText('2 / 3 answered', { exact: true })
    .waitFor();
  assert.equal(await frame.getByRole('alert').count(), 0);
  await frame.getByRole('button', { name: 'Submit all answers', exact: true }).click();
  await frame.getByRole('alert').waitFor();
  assert.equal(await mine().inputValue(), '   ');
  // Typing and then clearing an active custom answer must not restore an old supplied selection.
  await mine().fill('Temporary');
  await mine().fill('');
  assert.equal(await radio('Other').isChecked(), true);
  await next();
  await frame.getByRole('heading', { name: 'Review all answers', exact: true }).waitFor();
  await frame
    .getByRole('region', { name: 'Answer summary' })
    .getByText('No answer', { exact: true })
    .waitFor();
  await frame.getByRole('button', { name: 'Submit all answers', exact: true }).click();
  assert.equal(
    await frame.getByRole('alert').innerText(),
    'Enter your own answer or select a different answer.',
  );
  assert.equal(
    (await fixture.events(fixture.choose)).length,
    0,
    'Navigation, edits and validation failures emit nothing.',
  );
  await mine().fill('  Internal center  ');
  await next();
  await frame.getByRole('heading', { name: 'Review all answers', exact: true }).waitFor();
  assert.equal(
    await frame.getByRole('radio').count(),
    0,
    'Review is a separate step without choices.',
  );
  assert.equal(await mine().count(), 0, 'Review does not repeat the last answer input.');
  assert.equal(
    (await fixture.events(fixture.choose)).length,
    0,
    'Entering review does not submit.',
  );
  await screenshot('choose-review-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot('choose-review-mobile.png');
  await page.setViewportSize({ width: 1280, height: 1100 });
  await previous();
  assert.equal(await mine().inputValue(), '  Internal center  ');
  assert.equal(await frame.getByRole('region', { name: 'Answer summary' }).count(), 0);
  await next();
  const summary = frame.getByRole('region', { name: 'Answer summary' });
  await summary.getByText('A note', { exact: true }).waitFor();
  await summary.getByText('B note', { exact: true }).waitFor();
  await summary.getByText('Other:   Extra feature', { exact: false }).waitFor();
  let release;
  let started;
  const requested = new Promise((resolve) => {
    started = resolve;
  });
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let requests = 0;
  const eventUrl = `**/api/panels/${fixture.choose.instanceId}/events`;
  await page.route(eventUrl, async (route) => {
    if (route.request().method() === 'POST') {
      requests++;
      started();
      await held;
    }
    await route.continue();
  });
  await frame.getByRole('button', { name: 'Submit all answers', exact: true }).click();
  await requested;
  assert.equal(
    await frame.getByRole('button', { name: 'Saving…', exact: true }).isDisabled(),
    true,
  );
  await frame
    .getByRole('button', { name: 'Saving…', exact: true })
    .evaluate((button) => button.click());
  assert.equal(await frame.getByRole('status').count(), 0, 'No success before persistence.');
  release();
  await frame.getByRole('status').waitFor();
  assert.equal(requests, 1);
  await page.unroute(eventUrl);
  const initial = (await fixture.events(fixture.choose))[0];
  assert.equal(initial.type, 'answers-submitted');
  assert.deepEqual(initial.payload, {
    answers: [
      {
        questionId: 'storage',
        selections: [{ kind: 'option', optionId: 'postgres', comment: 'PostgreSQL note' }],
      },
      {
        questionId: 'features',
        selections: [
          { kind: 'option', optionId: 'a', comment: 'A note' },
          { kind: 'option', optionId: 'b', comment: 'B note' },
          { kind: 'custom', text: '  Extra feature  ' },
        ],
      },
      { questionId: 'delivery', selections: [{ kind: 'custom', text: '  Internal center  ' }] },
    ],
  });
  await previous();
  await mine().fill('');
  await next();
  await frame.getByRole('button', { name: 'Submit corrected answers', exact: true }).click();
  assert.equal(
    await frame.getByRole('alert').innerText(),
    'Enter your own answer or select a different answer.',
  );
  assert.equal(
    (await fixture.events(fixture.choose)).length,
    1,
    'Invalid correction retains the saved receipt and emits nothing.',
  );
  await mine().fill('Corrected delivery');
  await next();
  assert.equal((await fixture.events(fixture.choose)).length, 1);
  await page.route(eventUrl, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: { code: 'TEST_FAILURE', message: 'Intentional save failure.' },
      }),
    }),
  );
  await frame.getByRole('button', { name: 'Submit corrected answers', exact: true }).click();
  await frame.getByRole('alert').filter({ hasText: 'Not saved.' }).waitFor();
  await summary.getByText('Other: Corrected delivery', { exact: true }).waitFor();
  assert.equal((await fixture.events(fixture.choose)).length, 1);
  await page.unroute(eventUrl);
  await frame.getByRole('button', { name: 'Submit corrected answers', exact: true }).click();
  await frame.getByRole('status').waitFor();
  const revisions = await fixture.events(fixture.choose);
  assert.equal(revisions.length, 2);
  assert.deepEqual(revisions[1].payload, {
    answers: [
      ...initial.payload.answers.slice(0, 2),
      { questionId: 'delivery', selections: [{ kind: 'custom', text: 'Corrected delivery' }] },
    ],
    replacesEventId: initial.id,
  });
  const secondRound = await fixture.run('choose', {
    title: 'New round',
    questions: [choices.questions[0]],
  });
  assert.notEqual(secondRound.instanceId, fixture.choose.instanceId);
  assert.equal((await fixture.events(secondRound)).length, 0);
  const secondPage = await browser.newPage();
  await secondPage.goto(fixture.url(secondRound));
  const secondFrame = secondPage.frameLocator('iframe');
  await secondFrame.getByRole('heading', { name: 'New round', exact: true }).waitFor();
  assert.equal(
    await secondFrame.getByRole('button', { name: 'Description', exact: true }).count(),
    0,
  );
  await secondFrame.getByRole('radio', { name: 'SQLite', exact: true }).check();
  await secondFrame.getByRole('button', { name: 'Next', exact: true }).click();
  await secondFrame.getByRole('button', { name: 'Submit all answers', exact: true }).click();
  await secondFrame.getByRole('status').waitFor();
  assert.equal((await fixture.events(fixture.choose)).length, 2);
  assert.deepEqual((await fixture.events(secondRound))[0].payload, {
    answers: [
      { questionId: 'storage', selections: [{ kind: 'option', optionId: 'sqlite', comment: '' }] },
    ],
  });
  // A multiple-choice custom answer also works alone; cancelled custom text is not emitted.
  const customRound = await fixture.run('choose', {
    title: 'Multiple custom',
    questions: [choices.questions[1]],
  });
  await secondPage.goto(fixture.url(customRound));
  await secondFrame.getByLabel('My answer', { exact: true }).fill('Custom only');
  await secondFrame.getByRole('button', { name: 'Next', exact: true }).click();
  await secondFrame.getByRole('button', { name: 'Submit all answers', exact: true }).click();
  await secondFrame.getByRole('status').waitFor();
  assert.deepEqual((await fixture.events(customRound))[0].payload, {
    answers: [{ questionId: 'features', selections: [{ kind: 'custom', text: 'Custom only' }] }],
  });
  await secondFrame.getByRole('button', { name: 'Previous', exact: true }).click();
  await secondFrame.getByRole('checkbox', { name: 'Other', exact: true }).uncheck();
  await secondFrame.getByRole('checkbox', { name: 'Feature A', exact: true }).check();
  await secondFrame.getByRole('button', { name: 'Next', exact: true }).click();
  await secondFrame.getByRole('button', { name: 'Submit corrected answers', exact: true }).click();
  await until(
    async () => (await fixture.events(customRound)).length === 2,
    'Custom deselection must persist.',
  );
  const customRevisions = await fixture.events(customRound);
  assert.deepEqual(customRevisions[1].payload, {
    answers: [
      { questionId: 'features', selections: [{ kind: 'option', optionId: 'a', comment: '' }] },
    ],
    replacesEventId: customRevisions[0].id,
  });
  await secondFrame.getByRole('button', { name: 'Previous', exact: true }).click();
  assert.equal(
    await secondFrame.getByLabel('My answer', { exact: true }).inputValue(),
    'Custom only',
  );
  await secondPage.close();

  // Header-only long-content case uses the existing fixture's public run helper.
  const longQuestionTitle =
    'Choose the storage strategy for the current deployment and future expansion: ' +
    'uninterrupted'.repeat(12);
  const questionDescription =
    'Question-specific context remains visible and wraps naturally. '.repeat(5);
  const longDescriptionEnd = 'End of the complete questionnaire description.';
  const longRound = await fixture.run('choose', {
    title:
      'A long questionnaire title with deployment context and ownership ' +
      'uninterrupted'.repeat(8),
    description:
      '# Questionnaire background\n\n' +
      'Full Markdown context with **important details**.\n\n'.repeat(25) +
      longDescriptionEnd,
    questions: [
      { ...choices.questions[0], title: longQuestionTitle, description: questionDescription },
    ],
  });
  await page.goto(fixture.url(longRound));
  await frame.getByRole('heading', { name: longQuestionTitle, exact: true }).waitFor();
  await frame.getByText(questionDescription.trim(), { exact: true }).waitFor();
  await screenshot('choose-long-header-desktop.png');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await frame.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth),
      true,
      'Long header content does not overflow.',
    );
    await descriptionButton.click();
    await descriptionPopover.getByText(longDescriptionEnd, { exact: true }).waitFor();
    const popoverBounds = await descriptionPopover.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        fits:
          rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        scrolls: element.scrollHeight > element.clientHeight,
      };
    });
    assert.equal(popoverBounds.fits, true, 'Description stays within the viewport.');
    assert.equal(popoverBounds.scrolls, true, 'Long questionnaire description remains scrollable.');
    await descriptionPopover
      .getByText(longDescriptionEnd, { exact: true })
      .scrollIntoViewIfNeeded();
    await screenshot(`choose-long-description-${width}.png`);
    await page.keyboard.press('Escape');
    await descriptionPopover.waitFor({ state: 'hidden' });
    assert.equal(
      await descriptionButton.evaluate((element) => element === document.activeElement),
      true,
    );
  }
  await screenshot('choose-long-header-mobile.png');
  // Touch uses the same disclosure, with no hover-only dependency.
  const touchPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  await touchPage.goto(fixture.url(longRound));
  const touchFrame = touchPage.frameLocator('iframe');
  const touchDescription = touchFrame.getByRole('button', { name: 'Description', exact: true });
  await touchDescription.tap();
  const touchPopover = touchFrame.getByRole('dialog', { name: 'Questionnaire description' });
  await touchPopover.waitFor();
  await touchDescription.tap();
  await touchPopover.waitFor({ state: 'hidden' });
  assert.equal((await fixture.events(longRound)).length, 0);
  await touchPage.close();

  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto(fixture.url(fixture.form));
  await frame.getByRole('heading', { name: 'Standard form acceptance', exact: true }).waitFor();
  const checkboxBox = await frame
    .getByRole('checkbox', { name: 'Required boolean *', exact: true })
    .boundingBox();
  assert.ok(
    checkboxBox && checkboxBox.width <= checkboxBox.height * 1.5,
    'A checkbox must retain its default square shape inside a Field.',
  );
  const box = async (locator) => {
    const bounds = await locator.boundingBox();
    assert.ok(bounds);
    return bounds;
  };
  const sameRow = async (first, second, message) => {
    const a = await box(first);
    const b = await box(second);
    assert.ok(Math.abs(a.y + a.height / 2 - b.y - b.height / 2) <= 6, message);
  };
  const environment = frame.getByRole('combobox', { name: 'Environment', exact: true });
  const clearEnvironment = frame.getByRole('button', { name: 'Clear Environment', exact: true });
  const clearBox = await box(clearEnvironment);
  const selectBox = await box(environment);
  assert.ok(clearBox.width <= 36 && clearBox.x >= selectBox.x + selectBox.width);
  assert.ok(clearBox.x - selectBox.x - selectBox.width <= 8);
  await sameRow(environment, clearEnvironment, 'Clear is beside the select, not a full row.');
  await sameRow(
    frame.getByRole('radio', { name: 'Normal', exact: true }),
    frame.getByRole('radio', { name: 'High', exact: true }),
    'Short radio options share a row.',
  );
  await sameRow(
    frame.getByRole('checkbox', { name: 'Extra A', exact: true }),
    frame.getByRole('checkbox', { name: 'Extra B', exact: true }),
    'Short multiselect options share a row.',
  );
  for (const [role, name] of [
    ['checkbox', 'Required boolean *'],
    ['switch', 'Optional switch'],
  ]) {
    const control = frame.getByRole(role, { name, exact: true });
    const label = frame.locator(`label[for="${await control.getAttribute('id')}"]`);
    await sameRow(control, label, 'Boolean control and label share a row.');
    await label.click();
    assert.equal(await control.isChecked(), true);
    await label.click();
    assert.equal(await control.isChecked(), false);
  }
  const submitBox = await box(frame.getByRole('button', { name: 'Submit form', exact: true }));
  const formBox = await box(frame.locator('form'));
  assert.ok(submitBox.width < formBox.width / 2, 'Submit uses content width.');
  await screenshot('form-desktop.png');
  await clearEnvironment.click();
  assert.equal(await clearEnvironment.count(), 0, 'Empty select hides its clear action.');
  assert.equal(await environment.innerText(), 'Select an option');
  assert.equal(
    await frame.getByRole('spinbutton', { name: 'Replicas *', exact: true }).inputValue(),
    '0',
  );
  await until(
    async () => environment.evaluate((element) => document.activeElement === element),
    'Clearing returns focus to the select.',
  );
  await environment.click();
  await frame.getByRole('option', { name: 'Local', exact: true }).click();
  await frame.getByRole('textbox', { name: 'Project name *', exact: true }).press('Enter');
  await frame.getByText('This field is required.', { exact: true }).first().waitFor();
  assert.equal(
    await frame
      .getByRole('textbox', { name: 'Project name *', exact: true })
      .evaluate((element) => document.activeElement === element),
    true,
  );
  await frame.getByRole('textbox', { name: 'Project name *', exact: true }).fill('  demo  ');
  const normal = frame.getByRole('radio', { name: 'Normal', exact: true });
  await normal.focus();
  // Radix moves focus asynchronously while the arrow key is held.
  await normal.press('ArrowRight', { delay: 80 });
  await until(
    async () => frame.getByRole('radio', { name: 'High', exact: true }).isChecked(),
    'ArrowRight selects the next radio.',
  );
  const clearPriority = frame.getByRole('button', { name: 'Clear Priority', exact: true });
  assert.ok((await box(clearPriority)).width <= 36);
  await clearPriority.click();
  assert.equal(await clearPriority.count(), 0);
  await frame.getByRole('button', { name: 'Submit form', exact: true }).click();
  const priorityGroup = frame.getByRole('radiogroup', { name: 'Priority', exact: true });
  assert.equal(await priorityGroup.getAttribute('aria-invalid'), 'true');
  await until(
    async () => priorityGroup.evaluate((element) => element.contains(document.activeElement)),
    'Required radio error receives focus.',
  );
  assert.equal(
    await frame.getByRole('textbox', { name: 'Project name *', exact: true }).inputValue(),
    '  demo  ',
  );
  await frame.getByRole('spinbutton', { name: 'Replicas *', exact: true }).fill('6');
  await frame.getByRole('radio', { name: 'High', exact: true }).check();
  await frame.getByRole('button', { name: 'Submit form', exact: true }).click();
  await frame.getByText('Use a number at most 5.', { exact: true }).waitFor();
  assert.equal((await fixture.events(fixture.form)).length, 0);
  await frame.getByRole('spinbutton', { name: 'Replicas *', exact: true }).fill('0');
  await frame.getByRole('combobox', { name: 'Environment', exact: true }).click();
  await frame.getByRole('option', { name: 'Cloud', exact: true }).click();
  await frame.getByRole('checkbox', { name: 'Extra B', exact: true }).check();
  await frame.getByRole('checkbox', { name: 'Extra A', exact: true }).check();
  await frame.getByRole('switch', { name: 'Optional switch', exact: true }).check();
  assert.equal((await fixture.events(fixture.form)).length, 0);
  const formEventUrl = `**/api/panels/${fixture.form.instanceId}/events`;
  await page.route(formEventUrl, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: { code: 'TEST_FAILURE', message: 'Intentional form failure.' },
      }),
    }),
  );
  await frame.getByRole('button', { name: 'Submit form', exact: true }).click();
  await frame.getByRole('alert').filter({ hasText: 'Not saved.' }).waitFor();
  assert.equal(
    await frame.getByRole('textbox', { name: 'Project name *', exact: true }).inputValue(),
    '  demo  ',
  );
  await page.unroute(formEventUrl);
  let releaseForm;
  let startForm;
  let formRequests = 0;
  const formRequested = new Promise((resolve) => {
    startForm = resolve;
  });
  const formHeld = new Promise((resolve) => {
    releaseForm = resolve;
  });
  await page.route(formEventUrl, async (route) => {
    formRequests++;
    startForm();
    await formHeld;
    await route.continue();
  });
  await frame.getByRole('button', { name: 'Submit form', exact: true }).click();
  await formRequested;
  assert.equal(
    await frame.getByRole('textbox', { name: 'Project name *', exact: true }).isDisabled(),
    true,
  );
  assert.equal(await environment.isDisabled(), true);
  assert.equal(
    await frame.getByRole('button', { name: 'Clear Environment', exact: true }).isDisabled(),
    true,
  );
  const savingForm = frame.getByRole('button', { name: 'Saving…', exact: true });
  assert.equal(await savingForm.isDisabled(), true);
  await savingForm.evaluate((button) => button.click());
  assert.equal(await frame.getByRole('status').count(), 0);
  releaseForm();
  await frame.getByRole('status').waitFor();
  assert.equal(formRequests, 1);
  await page.unroute(formEventUrl);
  const firstForm = (await fixture.events(fixture.form))[0];
  assert.deepEqual(firstForm.payload, {
    values: {
      name: '  demo  ',
      replicas: 0,
      environment: 'cloud',
      priority: 'high',
      features: ['b', 'a'],
      check: false,
      switch: true,
    },
  });
  await frame.getByRole('textbox', { name: 'Notes', exact: true }).fill('Corrected notes');
  assert.equal((await fixture.events(fixture.form)).length, 1);
  await page.route(formEventUrl, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: { code: 'TEST_FAILURE', message: 'Intentional revision failure.' },
      }),
    }),
  );
  await frame.getByRole('button', { name: 'Submit corrected form', exact: true }).click();
  await frame.getByRole('alert').filter({ hasText: 'Not saved.' }).waitFor();
  assert.equal(
    await frame.getByRole('textbox', { name: 'Notes', exact: true }).inputValue(),
    'Corrected notes',
  );
  assert.equal((await fixture.events(fixture.form)).length, 1);
  await page.unroute(formEventUrl);
  await frame.getByRole('button', { name: 'Submit corrected form', exact: true }).click();
  await until(
    async () => (await fixture.events(fixture.form)).length === 2,
    'Form correction must persist.',
  );
  const correctedForm = (await fixture.events(fixture.form))[1];
  assert.deepEqual(correctedForm.payload, {
    values: { ...firstForm.payload.values, notes: 'Corrected notes' },
    replacesEventId: firstForm.id,
  });

  const layoutInput = {
    title: 'Wrapping form layout',
    fields: [
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'local', label: 'Local' },
          { value: 'cloud', label: 'Cloud' },
        ],
        defaultValue: 'local',
      },
      {
        name: 'region',
        label: 'Region',
        type: 'radio',
        options: [
          { value: 'cn', label: 'China' },
          { value: 'global', label: 'Global' },
          {
            value: 'long',
            label:
              'A much longer region label that must wrap naturally when the viewport is narrow, without pushing controls outside the page.',
          },
        ],
      },
      {
        name: 'features',
        label: 'Features',
        type: 'multiselect',
        options: [
          { value: 'logs', label: 'Logs' },
          { value: 'metrics', label: 'Metrics' },
          {
            value: 'long',
            label:
              'A long feature label with additional explanation and ' + 'uninterrupted'.repeat(15),
          },
        ],
      },
      {
        name: 'notify',
        label: 'Notify on completion',
        type: 'checkbox',
        description: 'Send a notification when the task completes.',
      },
      {
        name: 'enabled',
        label: 'Enabled',
        type: 'switch',
        defaultValue: true,
        description: 'Keep this configuration active.',
      },
    ],
  };
  const layoutRound = await fixture.run('form', layoutInput);
  const layoutPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const layoutFrame = layoutPage.frameLocator('iframe');
  await layoutPage.goto(fixture.url(layoutRound));
  await layoutFrame.getByRole('heading', { name: layoutInput.title, exact: true }).waitFor();
  const layoutContentFrame = layoutPage
    .frames()
    .find((candidate) => candidate.url().endsWith('/frame.html'));
  assert.ok(layoutContentFrame);
  await layoutContentFrame.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.equal(
    await layoutContentFrame.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    true,
  );
  const longLabel = layoutFrame.getByText(layoutInput.fields[1].options[2].label, { exact: true });
  const labelMetrics = await longLabel.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    line: parseFloat(getComputedStyle(element).lineHeight),
  }));
  assert.ok(labelMetrics.height > labelMetrics.line, 'Long option labels wrap on narrow screens.');
  for (const [role, a, b] of [
    ['radio', 'China', 'Global'],
    ['checkbox', 'Logs', 'Metrics'],
  ]) {
    const aBox = await box(layoutFrame.getByRole(role, { name: a, exact: true }));
    const bBox = await box(layoutFrame.getByRole(role, { name: b, exact: true }));
    assert.ok(Math.abs(aBox.y - bBox.y) < 2, 'Short options remain on one row at 390px.');
  }
  const mobileSubmit = await box(
    layoutFrame.getByRole('button', { name: 'Submit form', exact: true }),
  );
  assert.ok(mobileSubmit.width < (await box(layoutFrame.locator('form'))).width / 2);
  if (process.env.PANEON_TEST_ARTIFACTS) {
    await layoutPage.screenshot({
      path: join(process.env.PANEON_TEST_ARTIFACTS, 'form-mobile.png'),
    });
    await layoutFrame
      .getByRole('button', { name: 'Submit form', exact: true })
      .scrollIntoViewIfNeeded();
    await layoutPage.screenshot({
      path: join(process.env.PANEON_TEST_ARTIFACTS, 'form-mobile-actions.png'),
    });
  }
  await layoutFrame.getByRole('button', { name: 'Clear Environment', exact: true }).click();
  await layoutFrame.getByRole('button', { name: 'Submit form', exact: true }).click();
  await layoutFrame.getByText('This field is required.', { exact: true }).waitFor();
  const requiredSelect = layoutFrame.getByRole('combobox', { name: 'Environment *', exact: true });
  assert.equal(await requiredSelect.getAttribute('aria-invalid'), 'true');
  await until(
    async () => requiredSelect.evaluate((element) => document.activeElement === element),
    'Required select error receives focus.',
  );
  assert.equal(
    await layoutFrame.getByRole('switch', { name: 'Enabled', exact: true }).isChecked(),
    true,
  );
  assert.equal((await fixture.events(layoutRound)).length, 0);
  await layoutPage.close();

  const cli = async (...args) => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        process.env.PANEON_TEST_CLI_ENTRY ??
          new URL('../../dist/cli/index.js', import.meta.url).pathname,
        'panel',
        ...args,
        '--json',
      ],
      { env: { ...process.env, HOME: fixture.root }, cwd: fixture.root },
    );
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    return result.data;
  };
  const cliEvents = await cli('events', fixture.choose.instanceId, '--consumer', 'cli-acceptance');
  assert.equal(cliEvents.events.length, 2);
  await cli(
    'ack',
    fixture.choose.instanceId,
    '--consumer',
    'cli-acceptance',
    '--through',
    String(revisions[1].id),
  );
  assert.equal(
    (await cli('events', fixture.choose.instanceId, '--consumer', 'cli-acceptance')).events.length,
    0,
  );
  const formCliEvents = await cli('events', fixture.form.instanceId, '--consumer', 'form-cli');
  assert.equal(formCliEvents.events.length, 2);
  assert.deepEqual(formCliEvents.events[1].payload, correctedForm.payload);
  await cli(
    'ack',
    fixture.form.instanceId,
    '--consumer',
    'form-cli',
    '--through',
    String(correctedForm.id),
  );
  assert.equal(
    (await cli('events', fixture.form.instanceId, '--consumer', 'form-cli')).events.length,
    0,
  );
  const longChoiceLabel =
    '支持很长的方案名称与部署路径 ' + 'very-long-unbroken-choice-label'.repeat(5);
  const choiceLayoutRound = await fixture.run('choose', {
    title: 'Questionnaire layout acceptance',
    questions: [
      {
        id: 'layout',
        title: 'Which direction should the agent take?',
        description: 'Read the choices, add a note if needed, or write another answer.',
        options: [
          {
            id: 'long',
            label: longChoiceLabel,
            description: 'Long descriptions wrap naturally. '.repeat(5),
            details:
              '# Reading details\n\n' +
              'Explanation.\n\n'.repeat(60) +
              '```ts\n' +
              'const longLine = '.repeat(60) +
              '\n```',
          },
          {
            id: 'short',
            label: 'Keep the change focused',
            description: 'Preserve the current API.',
            details: '## Focused change\n\nNo new API.',
          },
        ],
      },
    ],
  });
  const choiceLayoutPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  choiceLayoutPage.on('pageerror', (error) => errors.push(error.message));
  await choiceLayoutPage.goto(fixture.url(choiceLayoutRound));
  const choiceLayoutFrame = choiceLayoutPage.frameLocator('iframe');
  await choiceLayoutFrame
    .getByRole('heading', { name: 'Questionnaire layout acceptance' })
    .waitFor();
  const longChoice = choiceLayoutFrame.locator('[data-choice-option="long"]');
  const longChoiceMetrics = await longChoice.evaluate((element) => {
    const label = element.querySelector('[id$="-label"]');
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
      labelHeight: label.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(label).lineHeight),
    };
  });
  assert.ok(longChoiceMetrics.documentWidth <= longChoiceMetrics.viewport);
  assert.ok(longChoiceMetrics.labelHeight > longChoiceMetrics.lineHeight);
  await choiceLayoutFrame.getByRole('radio', { name: longChoiceLabel, exact: true }).focus();
  await choiceLayoutPage.keyboard.press('Space');
  // Radix defers focus to a task and selects on focus while the arrow key is held.
  await choiceLayoutPage.keyboard.down('ArrowDown');
  try {
    await until(
      () =>
        choiceLayoutFrame
          .getByRole('radio', { name: 'Keep the change focused', exact: true })
          .isChecked(),
      'ArrowDown focuses and selects the next radio.',
    );
  } finally {
    await choiceLayoutPage.keyboard.up('ArrowDown');
  }
  assert.equal(
    await choiceLayoutFrame
      .getByRole('radio', { name: 'Keep the change focused', exact: true })
      .isChecked(),
    true,
    'Keyboard selection still uses the existing radio group.',
  );
  const narrowNote = choiceLayoutFrame.getByLabel(
    'Additional explanation for Keep the change focused (optional)',
    { exact: true },
  );
  await narrowNote.fill('说明仍属于这个选项');
  await choiceLayoutPage.keyboard.press('ArrowRight');
  assert.equal(
    await choiceLayoutFrame
      .getByRole('radio', { name: 'Keep the change focused', exact: true })
      .isChecked(),
    true,
  );
  if (process.env.PANEON_TEST_ARTIFACTS)
    await choiceLayoutPage.screenshot({
      path: join(process.env.PANEON_TEST_ARTIFACTS, 'choose-long-mobile.png'),
      fullPage: true,
    });
  await choiceLayoutFrame
    .getByRole('button', { name: `View details: ${longChoiceLabel}`, exact: true })
    .click();
  const longDialog = choiceLayoutFrame.getByRole('dialog');
  await longDialog.waitFor();
  const paneMetrics = await longDialog.evaluate((element) => {
    const body = element.querySelector('.overflow-y-auto');
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewport: innerWidth,
      height: rect.height,
      screenHeight: innerHeight,
      scrollable: body.scrollHeight > body.clientHeight,
      documentFits: document.documentElement.scrollWidth <= innerWidth,
    };
  });
  assert.ok(paneMetrics.left >= 0 && paneMetrics.right <= paneMetrics.viewport);
  assert.ok(paneMetrics.height <= paneMetrics.screenHeight);
  assert.equal(paneMetrics.scrollable, true);
  assert.equal(paneMetrics.documentFits, true);
  await choiceLayoutPage.setViewportSize({ width: 1280, height: 900 });
  const longPane = choiceLayoutFrame.getByRole('complementary');
  await longPane.waitFor();
  await choiceLayoutFrame
    .getByRole('button', { name: 'View details: Keep the change focused', exact: true })
    .click();
  assert.equal(await choiceLayoutFrame.getByRole('complementary').count(), 1);
  await longPane.getByRole('heading', { name: 'Focused change', exact: true }).waitFor();
  assert.equal(await narrowNote.inputValue(), '说明仍属于这个选项');
  await choiceLayoutPage.keyboard.press('Escape');
  await longPane.waitFor({ state: 'hidden' });
  assert.equal((await fixture.events(choiceLayoutRound)).length, 0);
  await choiceLayoutPage.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(
    blockedSubmissions,
    [],
    'Form controls must use the supported iframe event path.',
  );
  if (process.env.PANEON_TEST_ARTIFACTS) {
    await mkdir(process.env.PANEON_TEST_ARTIFACTS, { recursive: true });
    await page.screenshot({
      path: join(process.env.PANEON_TEST_ARTIFACTS, 'form.png'),
      fullPage: true,
    });
  }
  console.log(
    'Copied skill: choose compact header, optional full-description Popover with keyboard/touch/Escape focus restoration, single/multiple/review progress, long header desktop/390px wrapping and scrollable description; choose compact desktop/mobile layout, independent responsive detail pane with focus/scroll/draft checks, always-visible custom answer, per-option explanation drafts, single exclusivity, multiple option/custom combinations, validation, durable complete answers, failed corrections and new-round isolation; form compact clear actions, wrapping options, inline boolean labels, desktop/mobile geometry, keyboard and required-clear validation, pending freeze, failure drafts and complete corrections; CLI events/ack passed.',
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
