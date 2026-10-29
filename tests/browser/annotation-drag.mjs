import { readPanelFixture } from '../panel-fixture.ts';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';
import { selectAnnotationText, submitAnnotations } from './annotation-tools.mjs';

const root = await mkdtemp(join(tmpdir(), 'paneon-annotation-drag-'));
let service, browser;
try {
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    await readPanelFixture(new URL('./annotation-editor-fixture.txt', import.meta.url)),
  );
  service = await startServer(join(root, 'data'));
  const panel = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  const launcher = frame.locator('[data-annotation-launcher]');
  const trigger = launcher.getByRole('button');
  const directory = frame.getByRole('dialog', { name: /^(批注目录|Annotation directory)$/ });
  await trigger.waitFor();
  const bounds = () =>
    launcher.evaluate((element) => {
      const { left, top, width, height } = element.getBoundingClientRect();
      return { left, top, width, height, vw: innerWidth, vh: innerHeight };
    });
  const settle = () =>
    launcher.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  const near = (actual, expected) =>
    assert.ok(Math.abs(actual - expected) < 1, `Expected ${expected}, received ${actual}`);
  const checkBounds = async () => {
    await settle();
    const box = await bounds();
    assert.ok(box.left >= 16 && box.top >= 16, 'Entry stays inside the top/left edges');
    assert.ok(box.left + box.width <= box.vw - 15, 'Entry stays inside the right edge');
    assert.ok(box.top + box.height <= box.vh - 15, 'Entry stays inside the bottom edge');
    return box;
  };
  const startDrag = async () => {
    const box = await trigger.boundingBox();
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    return point;
  };
  const move = async (dx, dy) => {
    const point = await startDrag();
    await page.mouse.move(point.x + dx, point.y + dy, { steps: 8 });
    await page.mouse.up();
    await settle();
  };
  const moveTo = async (x, y) => {
    await startDrag();
    await page.mouse.move(x, y, { steps: 8 });
    await page.mouse.up();
    await settle();
  };
  const initial = await checkBounds();
  near(initial.left + initial.width, initial.vw - 16);
  near(initial.top + initial.height, initial.vh - 16);

  // Existing hover, click and keyboard interactions remain available.
  await trigger.hover();
  await directory.waitFor();
  await page.mouse.move(0, 0);
  await directory.waitFor({ state: 'hidden' });
  await trigger.click();
  await directory.waitFor();
  await trigger.click();
  await directory.waitFor({ state: 'hidden' });
  await trigger.focus();
  await trigger.press('Enter');
  await directory.waitFor();
  await page.keyboard.press('Escape');
  await directory.waitFor({ state: 'hidden' });

  await move(2, 1);
  await directory.waitFor();
  assert.deepEqual(await bounds(), initial, 'Small pointer jitter still counts as a click');
  await page.keyboard.press('Escape');

  await move(-230, -170);
  const moved = await checkBounds();
  near(moved.left, initial.left - 230);
  near(moved.top, initial.top - 170);
  await directory.waitFor({ state: 'hidden' });
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false', 'Dragging never clicks');
  const dropped = await trigger.boundingBox();
  await page.mouse.move(dropped.x + dropped.width / 2 + 1, dropped.y + dropped.height / 2);
  await settle();
  assert.equal(
    await trigger.getAttribute('aria-expanded'),
    'false',
    'Moving within the entry after dropping does not reopen the directory',
  );
  await page.mouse.move(0, 0);
  await trigger.hover();
  await directory.waitFor();
  await page.keyboard.press('Escape');
  await directory.waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate((element) => getComputedStyle(element).cursor), 'grab');

  await trigger.click();
  await directory.waitFor();
  await directory.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  const menuBox = await directory.boundingBox();
  const entryBox = await launcher.boundingBox();
  assert.ok(
    menuBox.y + menuBox.height <= entryBox.y,
    `Directory follows the moved entry: ${JSON.stringify({ menuBox, entryBox })}`,
  );
  await page.keyboard.press('Escape');
  await frame.getByRole('button', { name: 'Rerender page 0', exact: true }).click();
  assert.deepEqual(await bounds(), moved, 'Page rerenders retain the chosen position');
  await launcher.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await settle();
  assert.deepEqual(await bounds(), moved, 'Scrolling retains the chosen position');

  const viewport = await page.locator('iframe').boundingBox();
  await moveTo(viewport.x + 1, viewport.y + 1);
  const topLeft = await checkBounds();
  near(topLeft.left, 16);
  near(topLeft.top, 16);
  await moveTo(viewport.x + viewport.width - 1, viewport.y + viewport.height - 1);
  const bottomRight = await checkBounds();
  near(bottomRight.left + bottomRight.width, bottomRight.vw - 16);
  near(bottomRight.top + bottomRight.height, bottomRight.vh - 16);
  await page.setViewportSize({ width: 850, height: 600 });
  await checkBounds();

  // In Chromium, releasing outside ends capture without delivering pointerup to the frame.
  const outside = await startDrag();
  await page.mouse.move(outside.x - 50, outside.y - 50);
  await page.mouse.move(-1000, -1000);
  await page.mouse.up();
  const released = await bounds();
  await page.mouse.move(400, 300);
  await settle();
  assert.deepEqual(await bounds(), released, 'Re-entering after an outside release stops dragging');

  // A synthetic pointercancel verifies handler cleanup, not the browser's capture-release behavior.
  const point = await startDrag();
  await page.mouse.move(point.x - 100, point.y - 100, { steps: 4 });
  await trigger.dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true });
  await settle();
  const cancelled = await bounds();
  await page.mouse.move(point.x - 150, point.y - 150);
  await page.mouse.up();
  assert.deepEqual(await bounds(), cancelled);
  assert.equal(await trigger.evaluate((element) => getComputedStyle(element).cursor), 'grab');

  await page.reload();
  await trigger.waitFor();
  const refreshed = await checkBounds();
  near(refreshed.left + refreshed.width, refreshed.vw - 16);
  near(refreshed.top + refreshed.height, refreshed.vh - 16);

  // A moved entry still supports the original save, locate and submit flow.
  await move(-180, -100);
  await selectAnnotationText(frame, '[data-testid=target] [data-annotation-text]', 0, 6);
  await frame.getByRole('button', { name: /^(Annotation|批注)$/, exact: true }).click();
  await frame.getByRole('textbox', { name: /^(Annotation text|批注内容)$/ }).fill('After dragging');
  await frame.getByRole('button', { name: /^(Save|保存)$/, exact: true }).click();
  await trigger.click();
  await frame.getByRole('button', { name: /^(Locate annotation|定位批注) 1$/ }).click();
  await frame.locator('[data-locate-count="1"]').waitFor();
  await submitAnnotations(frame);
  const events = (await service.runtime.events(panel.instanceId, 'drag-acceptance', 100, 0)).events;
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.annotations[0].comment, 'After dragging');
  assert.deepEqual(errors, []);
  console.log(
    'PASS annotation drag: movement, bounds, cancellation, reload and existing interactions',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
