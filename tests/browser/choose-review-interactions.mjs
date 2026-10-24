import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { choices, startSkillPagesFixture } from './skill-pages-fixture.mjs';

const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-choose-review-interactions';
await mkdir(artifacts, { recursive: true });
const widths = process.env.PANEON_TEST_DESKTOP_ONLY === '1' ? [1280] : [1280, 390];
const fixture = await startSkillPagesFixture();
let browser;
try {
  const round = await fixture.run('choose', {
    ...choices,
    questions: [
      {
        ...choices.questions[0],
        options: [
          {
            ...choices.questions[0].options[0],
            details: '## SQLite\n\n' + 'Long Markdown detail paragraph.\n\n'.repeat(80),
          },
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
  const dialog = (name) => frame.getByRole('dialog', { name, exact: true });
  const mainGeometry = () =>
    frame.locator('main').evaluate((element) => {
      const { x, y, width } = element.getBoundingClientRect();
      return { x, y, width };
    });
  const focusReturned = (locator) =>
    locator.evaluate(async (element) => {
      // Base UI restores focus after its closing transition, on an animation frame.
      for (let i = 0; i < 120 && element !== document.activeElement; i++)
        await new Promise(requestAnimationFrame);
      return element === document.activeElement;
    });
  async function checkDetails(width, language = 'en') {
    await page.setViewportSize({ width, height: 500 });
    const before = await mainGeometry();
    const trigger = button(language === 'en' ? 'View details: SQLite' : '查看详情：SQLite');
    await trigger.click();
    await dialog('SQLite').waitFor();
    await dialog('SQLite').evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    assert.deepEqual(await mainGeometry(), before, 'Opening details preserves question geometry.');
    const metrics = await dialog('SQLite').evaluate((element) => {
      const body = element.querySelector('.overflow-y-auto');
      const rect = element.getBoundingClientRect();
      body.scrollTop = 100;
      return {
        width: rect.width,
        left: rect.left,
        right: rect.right,
        viewport: innerWidth,
        scrollable: body.scrollHeight > body.clientHeight,
        scrollTop: body.scrollTop,
        trapped: element.contains(document.activeElement),
      };
    });
    assert.ok(metrics.left >= 0 && metrics.right <= metrics.viewport);
    assert.ok(Math.abs(metrics.width - Math.min(1024, metrics.viewport * 0.85)) < 2);
    assert.deepEqual(
      await dialog('SQLite')
        .locator('[data-slot="sheet-title"]')
        .evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            clipPath: getComputedStyle(element).clipPath,
            position: getComputedStyle(element).position,
          };
        }),
      { width: 1, height: 1, clipPath: 'inset(50%)', position: 'absolute' },
    );
    assert.equal(
      await dialog('SQLite')
        .locator('.markdown-body')
        .getByRole('heading', { name: 'SQLite', exact: true })
        .count(),
      1,
    );
    const close = dialog('SQLite').getByRole('button', {
      name: language === 'en' ? 'Close' : '关闭',
      exact: true,
    });
    assert.equal(await close.evaluate((element) => element === document.activeElement), false);
    assert.equal(await close.evaluate((element) => getComputedStyle(element).boxShadow), 'none');
    await dialog('SQLite')
      .locator('.overflow-y-auto')
      .evaluate((element) => {
        element.scrollTop = 0;
      });
    await page.screenshot({ path: join(artifacts, `details-${language}-${width}.png`) });
    assert.equal(metrics.scrollable, true);
    assert.ok(metrics.scrollTop > 0);
    assert.equal(metrics.trapped, true);
    await page.keyboard.press('Tab');
    assert.equal(
      await dialog('SQLite').evaluate((element) => element.contains(document.activeElement)),
      true,
    );
    // Chrome also puts the scrollable details body in the keyboard tab order.
    if (!(await close.evaluate((element) => element === document.activeElement))) {
      await page.keyboard.press('Tab');
    }
    assert.equal(await close.evaluate((element) => element === document.activeElement), true);
    assert.notEqual(await close.evaluate((element) => getComputedStyle(element).boxShadow), 'none');
    await page.keyboard.press('Escape');
    await dialog('SQLite').waitFor({ state: 'hidden' });
    assert.equal(await focusReturned(trigger), true);
    assert.deepEqual(await mainGeometry(), before);
    await trigger.click();
    await dialog('SQLite')
      .getByRole('button', { name: language === 'en' ? 'Close' : '关闭', exact: true })
      .click();
    await dialog('SQLite').waitFor({ state: 'hidden' });
    assert.equal(await focusReturned(trigger), true);
    if (width > 600) {
      await trigger.click();
      await dialog('SQLite').waitFor();
      await frame.locator('[data-slot="sheet-overlay"]').click({ position: { x: 10, y: 10 } });
      await dialog('SQLite').waitFor({ state: 'hidden' });
      assert.equal(await focusReturned(trigger), true);
    }
    assert.equal(
      await frame
        .getByLabel(
          language === 'en'
            ? 'Additional explanation for SQLite (optional)'
            : '补充说明： SQLite （可选）',
          { exact: true },
        )
        .inputValue(),
      'Independent explanation 中文🙂',
    );
    assert.equal(
      await frame
        .getByLabel(language === 'en' ? 'My answer' : '我的答案', { exact: true })
        .inputValue(),
      'Kept custom draft',
    );
  }
  for (const width of widths) await checkDetails(width);
  await button('View details: PostgreSQL').click();
  await dialog('PostgreSQL')
    .getByRole('heading', { name: 'PostgreSQL details', exact: true })
    .waitFor();
  await page.keyboard.press('Escape');
  await dialog('PostgreSQL').waitFor({ state: 'hidden' });
  assert.equal(await focusReturned(button('View details: PostgreSQL')), true);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await button('Next').click();
  await frame.getByRole('checkbox', { name: 'Feature A', exact: true }).check();
  await note('Feature A').fill('Keep this explanation too');
  await frame.getByRole('checkbox', { name: 'Other', exact: true }).check();
  await button('Next').click();
  await button('Next').click();
  const summary = frame.getByRole('region', { name: 'Answer summary', exact: true });
  assert.equal(
    await frame.locator('main header').getByText('Answer summary', { exact: true }).count(),
    0,
  );
  await summary.getByText('1 / 3 answered', { exact: true }).waitFor();
  await frame
    .getByLabel('Questionnaire description', { exact: true })
    .getByText(choices.description, { exact: true })
    .waitFor();
  assert.equal(await summary.locator('[data-answer-incomplete="true"]').count(), 2);
  await summary.getByText('Feature A', { exact: true }).waitFor();
  await summary.getByText('Keep this explanation too', { exact: true }).waitFor();
  assert.equal(await summary.getByText('Not answered', { exact: true }).count(), 1);
  assert.equal(await summary.getByText('Enter your own answer', { exact: true }).count(), 1);
  assert.equal(await summary.getByText('No answer', { exact: true }).count(), 0);
  assert.equal(await summary.getByText('Incomplete answer', { exact: true }).count(), 0);
  assert.equal(
    await frame.getByText('Check your answers before submitting.', { exact: true }).count(),
    0,
  );

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
      await frame.getByText(language === 'en' ? 'Not answered' : '未回答', { exact: true }).count(),
      1,
    );
    assert.equal(
      await frame
        .getByText(language === 'en' ? 'Enter your own answer' : '请填写自填答案', { exact: true })
        .count(),
      1,
    );
    const editStorage = language === 'en' ? 'Edit answer: Storage' : '编辑答案：Storage';
    await button(editStorage).click();
    assert.equal(await frame.getByText(/^(Single choice|Multiple choice|单选|多选)/).count(), 0);
    for (const width of widths) await checkDetails(width, language);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await button(language === 'en' ? 'Return to summary' : '返回汇总').click();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 });
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
        path: join(artifacts, 'return-to-summary-en-1280.png'),
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
        'overlay Sheet preserves desktop geometry and drafts',
        'Sheet focus trap, dismissal, return and long-content scrolling',
        'schema-derived invalid rows',
        'no invalid-submit navigation/event',
        'all-row keyboard navigation',
        'draft preservation',
        'direct return',
        'desktop theme/language matrix',
        'complete explicit event',
      ],
    }),
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
