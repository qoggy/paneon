import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { choices, startSkillPagesFixture } from './skill-pages-fixture.mjs';

const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-choose-directory';
await mkdir(artifacts, { recursive: true });
const fixture = await startSkillPagesFixture();
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(fixture.url(fixture.choose));
  const frame = page.frameLocator('iframe');
  const nav = frame.getByRole('navigation', { name: 'Question directory', exact: true });
  const item = (at) => nav.locator('ol button').nth(at);
  const action = (name) => frame.getByRole('button', { name, exact: true });
  const heading = (name) => frame.getByRole('heading', { name, exact: true });
  const mine = () => frame.getByLabel('My answer', { exact: true });
  const status = (at) => item(at).locator('[id^="directory-status-"] .sr-only');
  async function expectFocused(locator) {
    assert.equal(
      await locator.evaluate(async (element) => {
        for (let i = 0; i < 120 && document.activeElement !== element; i++)
          await new Promise(requestAnimationFrame);
        return document.activeElement === element;
      }),
      true,
      'Navigation focuses the question or summary heading.',
    );
  }

  await heading('Storage').waitFor();
  assert.equal(await nav.locator('ol button').count(), 3);
  assert.deepEqual(await nav.locator('[id^="directory-status-"] .sr-only').allTextContents(), [
    'Unanswered',
    'Unanswered',
    'Unanswered',
  ]);
  assert.equal(await item(0).getAttribute('aria-current'), 'step');
  await item(0).hover();
  assert.equal(await frame.getByRole('tooltip').count(), 0, 'A short title has no tooltip.');
  const sqlite = frame.getByRole('radio', { name: 'SQLite', exact: true });
  const customRadio = frame.getByRole('radio', { name: 'Other', exact: true });
  await sqlite.check();
  await mine().fill(' ');
  assert.equal(await customRadio.isChecked(), true, 'Any typed content selects the custom answer.');
  assert.equal(
    await sqlite.isChecked(),
    false,
    'Editing custom text switches away from fixed choices in single mode.',
  );
  await mine().fill('Custom text');
  await sqlite.check();
  await mine().fill('');
  assert.equal(
    await customRadio.isChecked(),
    true,
    'Clearing custom text also selects the edited answer.',
  );
  assert.equal(await status(0).textContent(), 'Unanswered');
  await item(2).focus();
  await item(2).press('Enter');
  await heading('Delivery').waitFor();
  await expectFocused(heading('Delivery'));
  assert.equal(await item(2).getAttribute('aria-current'), 'step');
  assert.equal(await frame.getByRole('alert').count(), 0);
  await mine().fill('Delivery draft');
  assert.equal(await status(2).textContent(), 'Answered');
  await item(0).click();
  await frame.getByRole('radio', { name: 'SQLite', exact: true }).check();
  await frame
    .getByLabel('Additional explanation for SQLite (optional)', { exact: true })
    .fill('Keep backups');
  await mine().fill('Custom draft retained');
  await frame.getByRole('radio', { name: 'SQLite', exact: true }).check();
  await action('View details: SQLite').click();
  await frame.getByRole('dialog', { name: 'SQLite', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await frame.getByRole('dialog', { name: 'SQLite', exact: true }).waitFor({ state: 'hidden' });

  await item(1).focus();
  await item(1).press('Space');
  await heading('Features').waitFor();
  await expectFocused(heading('Features'));
  await frame.getByRole('checkbox', { name: 'Feature A', exact: true }).check();
  const customCheckbox = frame.getByRole('checkbox', { name: 'Other', exact: true });
  await mine().fill(' ');
  assert.equal(await customCheckbox.isChecked(), true);
  assert.equal(
    await frame.getByRole('checkbox', { name: 'Feature A', exact: true }).isChecked(),
    true,
    'Editing custom text keeps supplied selections in multiple mode.',
  );
  await customCheckbox.uncheck();
  await mine().fill('');
  assert.equal(
    await customCheckbox.isChecked(),
    true,
    'Editing after deselection selects custom again.',
  );
  assert.equal(
    await status(1).textContent(),
    'Unanswered',
    'Blank selected custom text reuses existing completeness.',
  );
  assert.equal(await nav.getByText('Enter your own answer', { exact: true }).count(), 0);
  await nav.getByRole('button', { name: 'Answer summary', exact: true }).click();
  await heading('Answer summary').waitFor();
  await expectFocused(heading('Answer summary'));
  assert.equal(await nav.locator('[aria-current="step"]').count(), 1);
  assert.equal(
    await nav
      .getByRole('button', { name: 'Answer summary', exact: true })
      .getAttribute('aria-current'),
    'step',
  );
  assert.equal(await frame.getByRole('alert').count(), 0, 'Opening summary does not validate.');
  assert.equal((await fixture.events(fixture.choose)).length, 0);
  await action('Submit all answers').click();
  await frame.getByRole('alert').waitFor();
  await heading('Answer summary').waitFor();
  assert.equal((await fixture.events(fixture.choose)).length, 0);

  await item(0).click();
  assert.equal(await frame.getByRole('radio', { name: 'SQLite', exact: true }).isChecked(), true);
  assert.equal(await mine().inputValue(), 'Custom draft retained');
  assert.equal(
    await frame
      .getByLabel('Additional explanation for SQLite (optional)', { exact: true })
      .inputValue(),
    'Keep backups',
  );
  assert.equal(await frame.getByRole('dialog').count(), 0);
  await item(1).click();
  await mine().fill('Additional feature');
  assert.deepEqual(await nav.locator('[id^="directory-status-"] .sr-only').allTextContents(), [
    'Answered',
    'Answered',
    'Answered',
  ]);
  await item(2).click();
  assert.equal(await mine().inputValue(), 'Delivery draft');
  await item(1).click();
  await page.screenshot({ path: join(artifacts, 'directory-desktop-en.png') });

  await page.evaluate(async () => {
    const response = await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ui: { language: 'zh-CN', theme: 'light' } }),
    });
    if (!response.ok) throw new Error('Preferences failed.');
  });
  const chineseNav = frame.getByRole('navigation', { name: '问题目录', exact: true });
  await chineseNav.waitFor();
  assert.deepEqual(
    await chineseNav.locator('[id^="directory-status-"] .sr-only').allTextContents(),
    ['已答', '已答', '已答'],
  );
  await frame.getByLabel('我的答案', { exact: true }).fill('');
  await chineseNav.getByText('未答', { exact: true }).waitFor();
  assert.equal(await chineseNav.getByText('待补全', { exact: true }).count(), 0);
  await frame.getByLabel('我的答案', { exact: true }).fill('Additional feature');
  await page.screenshot({ path: join(artifacts, 'directory-desktop-zh.png') });
  await chineseNav.getByRole('button', { name: '答案汇总', exact: true }).click();
  await frame.getByRole('button', { name: '提交全部答案', exact: true }).click();
  await frame.getByRole('status').waitFor();
  const events = await fixture.events(fixture.choose);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].payload, {
    answers: [
      {
        questionId: 'storage',
        selections: [{ kind: 'option', optionId: 'sqlite', comment: 'Keep backups' }],
      },
      {
        questionId: 'features',
        selections: [
          { kind: 'option', optionId: 'a', comment: '' },
          { kind: 'custom', text: 'Additional feature' },
        ],
      },
      { questionId: 'delivery', selections: [{ kind: 'custom', text: 'Delivery draft' }] },
    ],
  });

  const longTitle =
    'A long question title that remains readable in the directory ' + '连续文字'.repeat(12);
  const mediumTitle = 'A moderately long question title';
  const longRound = await fixture.run('choose', {
    questions: Array.from({ length: 35 }, (_, at) => ({
      id: `question-${at}`,
      title: at === 0 ? longTitle : at === 1 ? mediumTitle : `Question ${at + 1}`,
      description: at === 0 ? 'Question content.\n\n'.repeat(80) : undefined,
      options: [{ id: 'a', label: 'Answer A' }],
    })),
  });
  await page.goto(fixture.url(longRound));
  const longNav = frame.getByRole('navigation', { name: '问题目录', exact: true });
  await longNav.waitFor();
  const list = longNav.locator('ol');
  const summaryButton = longNav.getByRole('button', { name: '答案汇总', exact: true });
  assert.equal(await list.locator('button').count(), 35);
  const metrics = await list.evaluate((element) => {
    const title = element.querySelector('button > span:nth-child(2)');
    return {
      scrollable: element.scrollHeight > element.clientHeight,
      titleHeight: title.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(title).lineHeight),
      truncated: title.scrollWidth > title.clientWidth,
      textOverflow: getComputedStyle(title).textOverflow,
    };
  });
  assert.equal(metrics.scrollable, true);
  assert.ok(
    Math.abs(metrics.titleHeight - metrics.lineHeight) < 1,
    'Long titles stay on one line.',
  );
  assert.equal(metrics.truncated, true);
  assert.equal(metrics.textOverflow, 'ellipsis');
  const firstItem = list.locator('button').first();
  const mediumItem = list.locator('button').nth(1);
  const titleTooltip = frame.getByRole('tooltip');
  await firstItem.hover();
  await titleTooltip.filter({ hasText: longTitle }).waitFor();
  assert.equal(await titleTooltip.innerText(), longTitle);
  await titleTooltip.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
  await page.screenshot({ path: join(artifacts, 'directory-long-title-hover.png') });
  await page.mouse.move(0, 0);
  await titleTooltip.filter({ hasText: longTitle }).waitFor({ state: 'hidden' });
  await mediumItem.focus();
  await page.keyboard.press('Shift+Tab');
  await titleTooltip.filter({ hasText: longTitle }).waitFor();
  assert.equal(
    await firstItem.getAttribute('aria-current'),
    'step',
    'Reading a title does not navigate.',
  );
  await page.keyboard.press('Escape');
  await titleTooltip.filter({ hasText: longTitle }).waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 760, height: 900 });
  await mediumItem.hover();
  assert.equal(
    await mediumItem
      .locator(':scope > span:nth-child(2)')
      .evaluate((element) => element.scrollWidth > element.clientWidth),
    false,
  );
  assert.equal(await titleTooltip.count(), 0, 'A title that fits after resizing has no tooltip.');
  await page.mouse.move(0, 0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await mediumItem.hover();
  await titleTooltip.filter({ hasText: mediumTitle }).waitFor();
  await page.mouse.move(0, 0);
  await titleTooltip.filter({ hasText: mediumTitle }).waitFor({ state: 'hidden' });
  await frame.locator('html').evaluate(() => window.scrollTo(0, 320));
  const stickyTop = await longNav.evaluate((element) => element.getBoundingClientRect().top);
  assert.ok(Math.abs(stickyTop - 48) < 2);
  const windowScrollBefore = await list.evaluate(() => scrollY);
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  assert.equal(
    await list.evaluate(() => scrollY),
    windowScrollBefore,
    'Directory scrolling does not scroll the document.',
  );
  await list.locator('button').last().click();
  await heading('Question 35').waitFor();
  await frame.getByRole('button', { name: '上一题', exact: true }).click();
  await heading('Question 34').waitFor();
  await list.evaluate((element) => {
    element.scrollTop = 0;
  });
  await frame.getByRole('button', { name: '下一题', exact: true }).click();
  await heading('Question 35').waitFor();
  const visible = await list.evaluate((element) => {
    const current = element.querySelector('[aria-current="step"]').getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return current.top >= bounds.top - 1 && current.bottom <= bounds.bottom + 1;
  });
  assert.equal(visible, true, 'Sequential navigation reveals the current directory item.');
  assert.equal(await summaryButton.isVisible(), true);
  const summaryBox = await summaryButton.boundingBox();
  assert.ok(
    summaryBox.y + summaryBox.height < 900,
    'Summary stays outside the scrolling question list.',
  );
  assert.equal(
    await frame.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth),
    true,
  );
  await page.screenshot({ path: join(artifacts, 'directory-long-desktop.png') });
  assert.equal((await fixture.events(longRound)).length, 0);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      artifacts,
      checks: [
        'direct pointer/keyboard navigation',
        'two answer statuses',
        'draft preservation',
        'unchanged submission payload',
        'Chinese labels',
        'sticky independently scrolling directory',
        'single-line title ellipsis with hover and keyboard full text',
        'resize-sensitive title disclosure',
        'current item visibility',
      ],
    }),
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
