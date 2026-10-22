import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startTableReviewFixture } from './table-review-fixture.mjs';
const f = await startTableReviewFixture();
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  await page.goto(f.url(f.table));
  const frame = page.frameLocator('iframe');
  await frame.locator('td').first().waitFor();
  const originalDuration = await frame
    .locator('th:nth-child(2) button')
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  const all = [];
  for (const theme of ['dark', 'light']) {
    await page.evaluate(
      (theme) =>
        fetch('/api/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ui: { theme } }),
        }),
      theme,
    );
    const samples = await frame.locator('body').evaluate(async (body) => {
      const result = [];
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      const rgb = (color) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      const lum = (values) =>
        values
          .map((x) => x / 255)
          .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const started = performance.now();
      for (let i = 0; i < 45; i++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const style = getComputedStyle(document.documentElement);
        const background = rgb(style.getPropertyValue('--background'));
        const cell = rgb(getComputedStyle(document.querySelector('td:nth-child(2)')).color);
        const head = rgb(getComputedStyle(document.querySelector('th:nth-child(2) button')).color);
        const contrast = (foreground) =>
          (Math.max(lum(foreground), lum(background)) + 0.05) /
          (Math.min(lum(foreground), lum(background)) + 0.05);
        result.push({
          ms: Math.round(performance.now() - started),
          theme: document.documentElement.dataset.theme,
          background,
          cell,
          head,
          cellContrast: contrast(cell),
          headContrast: contrast(head),
        });
      }
      return result;
    });
    assert.ok(samples.every((sample) => sample.cellContrast >= 4.5 && sample.headContrast >= 4.5));
    all.push({ theme, samples });
  }
  assert.equal(
    await frame
      .locator('th:nth-child(2) button')
      .evaluate((element) => getComputedStyle(element).transitionDuration),
    originalDuration,
  );
  assert.equal(await frame.locator('html').getAttribute('data-theme-changing'), null);
  const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-ui-preferences-evidence';
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, 'transition-after.json'), JSON.stringify(all, null, 2));
  console.log(
    JSON.stringify({
      ok: true,
      themeChanges: 2,
      minimumContrast: Math.min(
        ...all.flatMap((item) =>
          item.samples.flatMap((sample) => [sample.cellContrast, sample.headContrast]),
        ),
      ),
      transitionRestored: originalDuration,
      artifacts,
    }),
  );
} finally {
  await browser?.close();
  await f.stop();
}
