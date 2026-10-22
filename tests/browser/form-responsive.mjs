import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startSkillPagesFixture } from './skill-pages-fixture.mjs';

const token = 'UninterruptedDeploymentConfiguration'.repeat(8);
const input = {
  title: '项目配置 / Project configuration',
  description: `用于部署和资源识别的配置。 Long description ${token}`,
  fields: [
    {
      name: 'project',
      label: `用于部署和资源识别的项目名称 / Project name ${token}`,
      type: 'text',
      required: true,
      minLength: 200,
      description: `保留输入原文和说明 / Description ${token}`,
      defaultValue: token,
    },
    { name: 'notes', label: '补充说明 / Notes', type: 'textarea' },
    { name: 'count', label: '实例数 / Instances', type: 'number', required: true, defaultValue: 0 },
    {
      name: 'environment',
      label: '环境 / Environment',
      type: 'select',
      required: true,
      defaultValue: 'long',
      options: [
        { value: 'local', label: '开发 / Local' },
        { value: 'long', label: `生产部署环境 / Long environment ${token}` },
      ],
    },
    {
      name: 'region',
      label: '区域 / Region',
      type: 'radio',
      options: [
        { value: 'cn', label: '中国' },
        { value: 'global', label: 'Global' },
        { value: 'long', label: `长区域说明 ${token}` },
      ],
    },
    {
      name: 'features',
      label: '功能 / Features',
      type: 'multiselect',
      options: [
        { value: 'logs', label: '日志' },
        { value: 'metrics', label: 'Metrics' },
        { value: 'long', label: `Long feature ${token}` },
      ],
    },
    {
      name: 'notify',
      label: `完成通知 / Completion notification ${token}`,
      type: 'checkbox',
      required: true,
      description: `布尔字段说明 ${token}`,
    },
    { name: 'enabled', label: '启用 / Enabled', type: 'switch', required: true },
    {
      name: 'budget',
      label: '数值边界错误 / Decimal bound error',
      type: 'number',
      min: 0.0000012345678901234567,
    },
  ],
};

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
  const panel = await fixture.run('form', input);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(fixture.url(panel));
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: input.title, exact: true }).waitFor();
  const content = page.frames().find((candidate) => candidate.url().endsWith('/frame.html'));
  assert.ok(content);
  await frame.locator('#field-0').fill('demo');
  await frame.locator('#field-8').fill('0');
  await frame.getByRole('button', { name: 'Submit form', exact: true }).click();
  await frame.locator('#field-0-error').waitFor();
  const measurements = [];
  for (const scenario of [
    { name: 'desktop-1440', viewport: 1440 },
    { name: 'wide-2560', viewport: 2560 },
    { name: 'sidebar-360', viewport: 1440, container: 360 },
    { name: 'mobile-390', viewport: 390 },
    { name: 'mobile-320', viewport: 320 },
  ]) {
    await page.setViewportSize({ width: scenario.viewport, height: 1100 });
    // Older hosts cap the iframe; the current full-viewport host has no outer main.
    await page.evaluate((wide) => {
      const element = document.querySelector('main');
      if (element) element.style.maxWidth = wide ? 'none' : '';
    }, scenario.name === 'wide-2560');
    await page.locator('iframe').evaluate((element, width) => {
      element.style.width = width ? `${width}px` : '';
    }, scenario.container);
    await content.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const metric = await content.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      const main = rect('main');
      const form = rect('form');
      const number = rect('input[type="number"]');
      const text = rect('input[type="text"]');
      const textarea = rect('textarea');
      const select = rect('[role="combobox"]');
      const clear = rect('button[aria-label^="Clear"]');
      const submit = [...document.querySelectorAll('button')]
        .find((element) => element.textContent === 'Submit form')
        .getBoundingClientRect();
      const fields = [
        ...document.querySelectorAll('[data-slot="field-group"] > [data-slot="field"]'),
      ];
      const gaps = fields
        .slice(1)
        .map(
          (field, index) =>
            field.getBoundingClientRect().top - fields[index].getBoundingClientRect().bottom,
        );
      const overflows = [
        ...document.querySelectorAll(
          'main label, [data-slot="field-description"], [data-slot="field-error"], main input:not([aria-hidden="true"]), main textarea, main [role="checkbox"], main [role="switch"]',
        ),
      ]
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.left < form.left - 1 || bounds.right > form.right + 1;
        })
        .map((element) => element.outerHTML.slice(0, 120));
      const options = ['[role="radiogroup"]', '#field-5'].map((selector) => {
        const choices = [...document.querySelector(selector).children].slice(0, 2);
        return Math.abs(
          choices[0].getBoundingClientRect().top - choices[1].getBoundingClientRect().top,
        );
      });
      const label = rect('label[for="field-0"]');
      const description = rect('#field-0-description');
      const error = rect('#field-0-error');
      return {
        viewport: innerWidth,
        mainWidth: main.width,
        centerOffset: Math.abs(main.left * 2 + main.width - innerWidth),
        padding: form.left - main.left,
        contentWidth: form.width,
        textWidth: text.width,
        textareaWidth: textarea.width,
        numberWidth: number.width,
        selectWidth: select.width,
        clearWidth: clear.width,
        clearGap: clear.left - select.right,
        clearRowOffset: Math.abs(clear.top + clear.height / 2 - select.top - select.height / 2),
        submitWidth: submit.width,
        submitLeftOffset: submit.left - form.left,
        gaps,
        overflows,
        optionRowOffsets: options,
        labelAbove: label.bottom <= text.top,
        descriptionBelow: description.top >= text.bottom,
        errorBelow: error.top >= description.bottom,
        boundErrorWraps:
          rect('#field-8-error').height >
          parseFloat(getComputedStyle(document.querySelector('#field-8-error')).lineHeight),
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    measurements.push({ scenario: scenario.name, ...metric });
    console.log(JSON.stringify(measurements.at(-1)));
    assert.ok(metric.mainWidth <= 640 && metric.centerOffset <= 2, scenario.name);
    if (scenario.name === 'wide-2560') assert.ok(metric.viewport > 2000);
    assert.ok(metric.padding >= 16 && metric.padding <= 24, scenario.name);
    assert.equal(metric.textWidth, metric.contentWidth);
    assert.equal(metric.textareaWidth, metric.contentWidth);
    assert.equal(metric.numberWidth, 144);
    assert.ok(metric.selectWidth <= 288 && metric.selectWidth <= metric.contentWidth);
    if (metric.contentWidth >= 288) assert.ok(metric.selectWidth >= 224);
    assert.ok(metric.clearWidth <= 36 && metric.clearGap >= 0 && metric.clearGap <= 8);
    assert.ok(metric.clearRowOffset <= 2);
    assert.ok(metric.submitWidth < metric.contentWidth && Math.abs(metric.submitLeftOffset) <= 1);
    assert.ok(metric.gaps.every((gap) => gap >= 20 && gap <= 24));
    assert.deepEqual(metric.overflows, []);
    assert.deepEqual(metric.optionRowOffsets, [0, 0]);
    assert.equal(metric.labelAbove && metric.descriptionBelow && metric.errorBelow, true);
    assert.ok(metric.pageOverflow <= 1);
    if (scenario.viewport === 320) assert.equal(metric.boundErrorWraps, true);
    if (process.env.PANEON_TEST_ARTIFACTS) {
      await mkdir(process.env.PANEON_TEST_ARTIFACTS, { recursive: true });
      await content.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: join(process.env.PANEON_TEST_ARTIFACTS, `form-${scenario.name}.png`),
      });
      await frame
        .getByRole('button', { name: 'Submit form', exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: join(process.env.PANEON_TEST_ARTIFACTS, `form-${scenario.name}-actions.png`),
      });
    }
  }
  // The long selected option stays fully available in the existing option list.
  await frame.locator('#field-3').click();
  await frame
    .getByRole('option', { name: input.fields[3].options[1].label, exact: true })
    .waitFor();
  assert.ok(await content.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const popup = await frame.locator('[data-slot="select-content"]').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      fits: bounds.left >= 0 && bounds.right <= innerWidth,
      textFits: [...element.querySelectorAll('[role="option"]')].every(
        (option) => option.scrollWidth <= option.clientWidth,
      ),
    };
  });
  assert.deepEqual(popup, { fits: true, textFits: true });
  await content.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  if (process.env.PANEON_TEST_ARTIFACTS)
    await page.screenshot({
      path: join(process.env.PANEON_TEST_ARTIFACTS, 'form-mobile-320-select-options.png'),
    });
  await page.keyboard.press('Escape');
  await frame.getByRole('button', { name: 'Clear 环境 / Environment', exact: true }).click();
  assert.equal(await frame.locator('#field-0').inputValue(), 'demo');
  assert.equal(await frame.locator('#field-2').inputValue(), '0');
  await frame.getByRole('button', { name: 'Submit form', exact: true }).click();
  assert.equal(await frame.locator('#field-3').getAttribute('aria-invalid'), 'true');
  assert.equal((await fixture.events(panel)).length, 0);
  await frame.locator('#field-0').fill('  原文 '.repeat(60));
  await frame.locator('#field-1').fill('Keep draft 中文🙂');
  await frame.locator('#field-8').fill('');
  await frame.locator('#field-3').click();
  await frame.getByRole('option', { name: '开发 / Local', exact: true }).click();
  const eventUrl = `**/api/panels/${panel.instanceId}/events`;
  const fail = (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'TEST_FAILURE', message: 'Intentional responsive form failure.' },
      }),
    });
  await page.route(eventUrl, fail);
  await frame.getByRole('button', { name: 'Submit form', exact: true }).click();
  await frame.getByText(/Not saved/).waitFor();
  assert.equal(await frame.locator('#field-1').inputValue(), 'Keep draft 中文🙂');
  await page.unroute(eventUrl, fail);
  await frame.getByRole('button', { name: 'Submit form', exact: true }).click();
  await until(async () => (await fixture.events(panel)).length === 1, 'Initial submission saved.');
  const first = (await fixture.events(panel))[0];
  assert.equal(first.payload.values.count, 0);
  assert.equal(first.payload.values.notify, false);
  assert.equal(first.payload.values.enabled, false);
  assert.equal(first.payload.values.project, '  原文 '.repeat(60));
  await frame.locator('#field-1').fill('Correction draft');
  await page.route(eventUrl, fail);
  await frame.getByRole('button', { name: 'Submit corrected form', exact: true }).click();
  await frame.getByText(/Not saved/).waitFor();
  assert.equal(await frame.locator('#field-1').inputValue(), 'Correction draft');
  assert.equal((await fixture.events(panel)).length, 1);
  await page.unroute(eventUrl, fail);
  await frame.getByRole('button', { name: 'Submit corrected form', exact: true }).click();
  await until(async () => (await fixture.events(panel)).length === 2, 'Correction saved.');
  const corrected = (await fixture.events(panel))[1];
  assert.deepEqual(corrected.payload, {
    values: { ...first.payload.values, notes: 'Correction draft' },
    replacesEventId: first.id,
  });
  assert.deepEqual(errors, []);
  if (process.env.PANEON_TEST_ARTIFACTS)
    await writeFile(
      join(process.env.PANEON_TEST_ARTIFACTS, 'form-responsive-measurements.json'),
      JSON.stringify(measurements, null, 2),
    );
  console.log(JSON.stringify(measurements, null, 2));
  console.log(
    'Chrome responsive form: centered bounded column at 1440/2560px, 360px iframe in desktop host, 390/320px viewports; wrapped labels/descriptions/options/errors, compact number/select, adjacent clear, no overflow; required clear, false/zero, failed drafts and complete corrections passed.',
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
