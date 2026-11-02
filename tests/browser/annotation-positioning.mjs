import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { readPanelFixture } from '../panel-fixture.ts';
import { startServer } from '../runtime-fixture.ts';

const root = await mkdtemp(join(tmpdir(), 'paneon-annotation-positioning-'));
const evidence = process.env.PANEON_TEST_SCREENSHOTS ?? '/tmp/paneon-annotation-positioning';
let service, browser;
try {
  await mkdir(evidence, { recursive: true });
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    await readPanelFixture(
      new URL('../fixtures/panels/annotation-positioning.tsx', import.meta.url),
    ),
  );
  service = await startServer(join(root, 'runtime'));
  const panel = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  const target = frame.getByTestId('positioning-target');
  const editor = frame.locator('[data-annotation-editor]');
  const marker = frame.locator('[data-annotation-marker]');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const settle = () =>
    frame
      .locator('html')
      .evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
  const read = () =>
    frame.locator('html').evaluate(() => {
      const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
      return {
        height: innerHeight,
        bar: rect('[data-testid="top-bar"]'),
        target: rect('[data-testid="positioning-target"]'),
        marker: rect('[data-annotation-marker]'),
        editor: rect('[data-annotation-editor]'),
      };
    });
  const edit = async () => {
    await frame.getByRole('button', { name: /^(Annotations|批注) \(1\)$/ }).click();
    await frame.getByRole('button', { name: /^(Edit annotation|编辑批注) 1$/ }).click();
    await editor.locator('textarea').waitFor();
    await editor.evaluate((element) =>
      Promise.allSettled(element.getAnimations().map((animation) => animation.finished)),
    );
    await settle();
  };
  const close = async () => {
    await editor.locator('textarea').press('Escape');
    await editor.waitFor({ state: 'hidden' });
  };
  const assertPlacement = async (topBarHeight, tall) => {
    const geometry = await read();
    const top = topBarHeight ? topBarHeight + 12 : 12;
    const height = geometry.height - top - 12;
    const expected = tall ? top + height / 4 : top + (height - geometry.target.height) / 2;
    assert.ok(Math.abs(geometry.target.top - expected) < 2, JSON.stringify({ expected, geometry }));
    assert.ok(
      geometry.marker.top >= (topBarHeight ? topBarHeight + 12 : 0),
      JSON.stringify(geometry),
    );
    assert.ok(
      geometry.editor.top >= (topBarHeight ? topBarHeight + 12 : 8),
      JSON.stringify(geometry),
    );
    assert.equal(await target.evaluate((element) => element.style.scrollMarginTop), '5px');
    assert.equal(await target.evaluate((element) => element.style.scrollMarginBottom), '7px');
    return geometry;
  };

  await target.evaluate((element) => {
    element.scrollIntoView({ block: 'start' });
    scrollBy(0, -200);
  });
  await frame.getByRole('button', { name: /^(Select content to annotate|选取批注)$/ }).click();
  await target.click({ position: { x: 6, y: 6 } });
  await page.keyboard.press('Enter');
  await editor.locator('textarea').fill('Review the whole flow');
  await editor.locator('textarea').press('Enter');
  await editor.waitFor({ state: 'hidden' });
  await edit();
  const tall = await assertPlacement(72, true);
  await page.screenshot({ path: join(evidence, 'tall-fixed.png') });
  await close();

  // Manual scrolling can put the target behind the bar; the marker/editor still stay below it.
  await target.evaluate((element) => scrollBy(0, element.getBoundingClientRect().top + 100));
  await settle();
  assert.ok((await read()).marker.top >= 84);
  await marker.click();
  await editor.locator('textarea').waitFor();
  await settle();
  assert.ok((await read()).editor.top >= 84);
  await close();

  await button('Short target').click();
  await edit();
  const short = await assertPlacement(72, false);
  await page.screenshot({ path: join(evidence, 'short-fixed.png') });
  await close();
  await button('104px bar').click();
  await edit();
  await assertPlacement(104, false);
  await close();

  await button('72px bar').click();
  await button('Tall target').click();
  await button('sticky bar').click();
  await frame.locator('html').evaluate(() => scrollTo(0, 0));
  await settle();
  assert.ok((await read()).bar.top > 16, 'Sticky bar starts below the viewport edge');
  await edit();
  const sticky = await assertPlacement(72, true);
  await close();

  await button('Short target').click();
  for (const mode of ['static', 'hidden']) {
    await button(`${mode} bar`).click();
    await edit();
    await assertPlacement(0, false);
    await close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    join(evidence, 'result.json'),
    JSON.stringify({ tall, short, sticky, errors }, null, 2),
  );
  console.log(
    'PASS annotation positioning: tall upper portion, short center, automatic fixed/sticky avoidance, manual scroll, resized bar, normal/hidden headers, corner button exclusion, restored author margins',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
