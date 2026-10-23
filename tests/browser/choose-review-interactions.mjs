import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { choices, startSkillPagesFixture } from './skill-pages-fixture.mjs';

const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-choose-review-interactions';
await mkdir(artifacts, { recursive: true });
const fixture = await startSkillPagesFixture();
let browser;
try {
  const round = await fixture.run('choose', {
    ...choices,
    questions: [
      {
        ...choices.questions[0],
        options: [
          choices.questions[0].options[0],
          {
            ...choices.questions[0].options[1],
            details: '## PostgreSQL details\n\nSeparate details.',
          },
        ],
      },
      ...choices.questions.slice(1),
    ],
  });
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(fixture.url(round));
  const frame = page.frameLocator('iframe');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const mine = () => frame.getByLabel('My answer', { exact: true });
  const note = (label) =>
    frame.getByLabel(`Additional explanation for ${label} (optional)`, { exact: true });
  await frame.getByRole('heading', { name: 'Storage', exact: true }).waitFor();
  await frame
    .getByLabel('Questionnaire description', { exact: true })
    .getByText(choices.description, { exact: true })
    .waitFor();
  assert.equal(await button('Return to summary').count(), 0);
  await frame.getByRole('radio', { name: 'SQLite', exact: true }).check();
  await note('SQLite').fill('Independent explanation 中文🙂');
  await mine().fill('Kept custom draft');
  await frame.getByRole('radio', { name: 'SQLite', exact: true }).check();
  await button('View details: SQLite').click();
  const aside = (name) => frame.getByRole('complementary', { name, exact: true });
  await aside('SQLite').waitFor();
  assert.equal(await button('Close details: SQLite').getAttribute('aria-expanded'), 'true');
  assert.equal(
    await button('Close details: SQLite').getAttribute('aria-controls'),
    'option-details',
  );
  await button('Close details: SQLite').click();
  await aside('SQLite').waitFor({ state: 'hidden' });
  assert.equal(await button('View details: SQLite').getAttribute('aria-expanded'), 'false');
  assert.equal(await button('View details: SQLite').getAttribute('aria-controls'), null);
  await button('View details: SQLite').click();
  await button('View details: PostgreSQL').click();
  await aside('PostgreSQL')
    .getByRole('heading', { name: 'PostgreSQL details', exact: true })
    .waitFor();
  assert.equal(await button('View details: SQLite').getAttribute('aria-expanded'), 'false');
  await button('Close details').click();
  await aside('PostgreSQL').waitFor({ state: 'hidden' });
  await button('View details: SQLite').click();
  await page.keyboard.press('Escape');
  await aside('SQLite').waitFor({ state: 'hidden' });
  assert.equal(await note('SQLite').inputValue(), 'Independent explanation 中文🙂');
  assert.equal(await mine().inputValue(), 'Kept custom draft');
  await page.setViewportSize({ width: 390, height: 844 });
  await button('View details: SQLite').click();
  const dialog = frame.getByRole('dialog', { name: 'SQLite', exact: true });
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await button('View details: SQLite').click();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await note('SQLite').inputValue(), 'Independent explanation 中文🙂');
  assert.equal(await mine().inputValue(), 'Kept custom draft');
  await button('Next').click();
  await frame.getByRole('checkbox', { name: 'Feature A', exact: true }).check();
  await note('Feature A').fill('Keep this explanation too');
  await frame.getByRole('checkbox', { name: 'Other', exact: true }).check();
  await button('Next').click();
  await button('Next').click();
  const summary = frame.getByRole('region', { name: 'Answer summary', exact: true });
  await summary.getByText('1 / 3 answered', { exact: true }).waitFor();
  await frame
    .getByLabel('Questionnaire description', { exact: true })
    .getByText(choices.description, { exact: true })
    .waitFor();
  assert.equal(await summary.locator('[data-answer-incomplete="true"]').count(), 2);
  await summary.getByText('Feature A', { exact: true }).waitFor();
  await summary.getByText('Keep this explanation too', { exact: true }).waitFor();
  await button('Submit all answers').click();
  await frame
    .getByRole('alert')
    .getByText('Complete all answers before submitting (2 incomplete).', { exact: true })
    .waitFor();
  await frame.getByRole('heading', { name: 'Review all answers', exact: true }).waitFor();
  assert.equal(await mine().count(), 0);
  assert.equal((await fixture.events(round)).length, 0);

  for (const [theme, language] of [
    ['light', 'en'],
    ['light', 'zh-CN'],
    ['dark', 'en'],
    ['dark', 'zh-CN'],
  ]) {
    await page.evaluate(
      async (ui) => {
        const response = await fetch('/api/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ui }),
        });
        if (!response.ok) throw new Error('Could not set test preferences.');
      },
      { theme, language },
    );
    await frame.locator(`html[lang="${language}"][data-theme="${theme}"]`).waitFor();
    await frame
      .getByRole('heading', {
        name: language === 'en' ? 'Review all answers' : '检查全部答案',
        exact: true,
      })
      .waitFor();
    assert.equal(
      await frame
        .getByText(language === 'en' ? 'Incomplete answer' : '待完善', { exact: true })
        .count(),
      2,
    );
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      assert.equal(
        await frame
          .locator('html')
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
        true,
      );
      await page.screenshot({
        path: join(artifacts, `summary-${theme}-${language}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.evaluate(async () => {
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ui: { theme: 'light', language: 'en' } }),
    });
  });
  await button('Edit answer: Storage').waitFor();
  // Every row is a native keyboard control, including the first, middle and last rows.
  for (const title of ['Storage', 'Features', 'Delivery']) {
    await button(`Edit answer: ${title}`).focus();
    await button(`Edit answer: ${title}`).press(title === 'Features' ? 'Space' : 'Enter');
    await frame.getByRole('heading', { name: title, exact: true }).waitFor();
    assert.equal(
      await frame.getByRole('heading', { name: title, exact: true }).evaluate(async (element) => {
        // Navigation focuses the mounted heading on the next animation frame.
        await new Promise(requestAnimationFrame);
        return element === document.activeElement;
      }),
      true,
    );
    if (title === 'Storage') {
      await page.screenshot({
        path: join(artifacts, 'return-to-summary-en-390.png'),
        fullPage: true,
      });
      assert.equal(await mine().inputValue(), 'Kept custom draft');
      assert.equal(await note('SQLite').inputValue(), 'Independent explanation 中文🙂');
    }
    if (title === 'Features') {
      assert.equal(
        await frame.getByRole('checkbox', { name: 'Other', exact: true }).isChecked(),
        true,
      );
      assert.equal(await mine().inputValue(), '');
      assert.equal(await note('Feature A').inputValue(), 'Keep this explanation too');
      await mine().fill('Additional feature');
    }
    if (title === 'Delivery') await mine().fill('Custom delivery');
    await button('Return to summary').click();
    await frame.getByRole('heading', { name: 'Review all answers', exact: true }).waitFor();
    assert.equal((await fixture.events(round)).length, 0);
  }
  await summary.getByText('3 / 3 answered', { exact: true }).waitFor();
  assert.equal(await summary.locator('[data-answer-incomplete="true"]').count(), 0);
  await button('Submit all answers').click();
  await frame.getByRole('status').waitFor();
  const events = await fixture.events(round);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].payload, {
    answers: [
      {
        questionId: 'storage',
        selections: [
          { kind: 'option', optionId: 'sqlite', comment: 'Independent explanation 中文🙂' },
        ],
      },
      {
        questionId: 'features',
        selections: [
          { kind: 'option', optionId: 'a', comment: 'Keep this explanation too' },
          { kind: 'custom', text: 'Additional feature' },
        ],
      },
      { questionId: 'delivery', selections: [{ kind: 'custom', text: 'Custom delivery' }] },
    ],
  });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      artifacts,
      checks: [
        'detail toggle/switch/close/Escape',
        'responsive dialog',
        'schema-derived invalid rows',
        'no invalid-submit navigation/event',
        'all-row keyboard navigation',
        'draft preservation',
        'direct return',
        'theme/language/viewport matrix',
        'complete explicit event',
      ],
    }),
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
