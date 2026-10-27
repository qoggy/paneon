import { submitAnnotations } from './annotation-tools.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startTableReviewFixture } from './table-review-fixture.mjs';

const fixture = await startTableReviewFixture();
const artifacts = process.env.PANEON_TEST_ARTIFACTS;
let browser;
const results = [];
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  if (artifacts) await mkdir(artifacts, { recursive: true });
  for (const theme of ['light', 'dark'])
    for (const language of ['en', 'zh-CN'])
      for (const width of [1440]) {
        const response = await fixture.service.app.inject({
          method: 'POST',
          url: '/api/preferences',
          headers: {
            host: `127.0.0.1:${fixture.service.descriptor.port}`,
            authorization: `Bearer ${fixture.service.descriptor.controlToken}`,
          },
          payload: { ui: { theme, language } },
        });
        assert.equal(response.statusCode, 200);
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(fixture.url(fixture.table));
        const frame = page.frameLocator('iframe');
        await frame
          .getByRole('heading', { name: 'Table review acceptance', exact: true })
          .waitFor();
        const zh = language === 'zh-CN';
        assert.equal(
          await frame
            .getByRole('button', { name: zh ? '选择对象' : 'Select objects', exact: true })
            .count(),
          0,
        );
        assert.equal(await frame.getByRole('checkbox').count(), 0);
        assert.equal(
          await frame.locator('html').evaluate((el) => el.classList.contains('dark')),
          theme === 'dark',
        );
        const label = frame.locator('[data-column-key="name"] [data-annotation-text]');
        assert.equal(await label.textContent(), '说明');
        const box = await label.boundingBox();
        assert.ok(box);
        await page.mouse.move(box.x + 0.5, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width - 0.5, box.y + box.height / 2, { steps: 15 });
        await page.mouse.up();
        assert.equal(await label.evaluate(() => document.getSelection().toString()), '说明');
        await frame.getByRole('button', { name: zh ? '批注' : 'Annotation', exact: true }).click();
        await frame
          .getByLabel(zh ? '批注内容' : 'Annotation text', { exact: true })
          .fill(`header ${theme}/${language}/${width}`);
        await frame.getByRole('button', { name: zh ? '保存' : 'Save', exact: true }).click();
        await submitAnnotations(frame);
        await frame
          .locator('[data-slot="toast-title"]')
          .filter({ hasText: zh ? '批注已提交。' : 'Annotations submitted.' })
          .waitFor();
        const event = (await fixture.events(fixture.table)).at(-1);
        assert.deepEqual(event.payload.annotations[0].targets[0], {
          ref: { kind: 'header', columnKey: 'name' },
          text: { start: 0, end: 2, quote: '说明' },
        });
        const dimensions = await frame.locator('main').evaluate((main) => ({
          viewport: document.documentElement.clientWidth,
          document: document.documentElement.scrollWidth,
          width: main.getBoundingClientRect().width,
        }));
        assert.ok(dimensions.document <= dimensions.viewport + 1, JSON.stringify(dimensions));
        if (artifacts)
          await page.screenshot({
            path: join(artifacts, `header-${theme}-${language}-${width}.png`),
            fullPage: true,
          });
        assert.deepEqual(errors, []);
        results.push({ theme, language, width, dimensions, errors });
        await page.close();
      }
  if (artifacts)
    await writeFile(join(artifacts, 'header-theme-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  await fixture.stop();
}
