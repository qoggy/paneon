import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { readPanelFixture } from '../panel-fixture.ts';
import { startServer } from '../runtime-fixture.ts';
import {
  assertToastUndoExitsUp,
  selectAnnotationText,
  submitAnnotations,
} from './annotation-tools.mjs';

const root = await mkdtemp(join(tmpdir(), 'paneon-toast-avoidance-'));
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-toast-avoidance';
let service, browser, page;
try {
  await mkdir(artifacts, { recursive: true });
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    await readPanelFixture(new URL('./toast-avoidance-fixture.txt', import.meta.url)),
  );
  service = await startServer(join(root, 'data'));
  const panel = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${message.text()} (${message.location().url})`);
  });
  // This isolated fixture has no favicon; keep console assertions focused on its panel resources.
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const directory = frame.getByRole('dialog', { name: 'Annotation directory', exact: true });
  const trigger = frame.getByRole('button', { name: /^Annotations \(\d+\)$/ });
  async function openDirectory() {
    await trigger.press('Escape');
    await directory.waitFor({ state: 'hidden' });
    await trigger.press('Enter');
    await directory.waitFor();
  }
  const draft = async () => JSON.parse(await frame.locator('[data-draft]').textContent());
  const toasts = frame.locator('[data-slot="toast"]:not([data-limited])');
  const undo = toasts.filter({ hasText: 'Annotation deleted' });
  // Observe actual painted rectangles and pointer targets, not just the launcher gap.
  const clearGeometry = () =>
    frame.locator('html').evaluate(() => {
      const obstacles = [
        ...document.querySelectorAll(
          '[data-annotation-launcher], [data-slot="popover-content"][aria-label="Annotation directory"]',
        ),
      ].map((element) => element.getBoundingClientRect());
      const toasts = [...document.querySelectorAll('[data-slot="toast"]:not([data-limited])')];
      return (
        toasts.length > 0 &&
        toasts.every((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.left >= 15 &&
            rect.right <= innerWidth - 15 &&
            rect.top >= 15 &&
            rect.bottom <= innerHeight - 15 &&
            obstacles.every(
              (obstacle) =>
                rect.right <= obstacle.left - 7 ||
                rect.left >= obstacle.right + 7 ||
                rect.bottom <= obstacle.top - 7 ||
                rect.top >= obstacle.bottom + 7,
            )
          );
        })
      );
    });
  async function waitClear() {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      if (await clearGeometry()) return;
      await page.waitForTimeout(50);
    }
    assert.fail(
      'All visible notifications must stay inside the viewport and clear the directory/launcher',
    );
  }
  for (const [start, end, comment] of [
    [0, 6, 'first'],
    [7, 17, 'second'],
  ]) {
    await selectAnnotationText(frame, '[data-annotation-text]', start, end);
    await frame.locator('[data-annotation-action]').click();
    await frame.locator('[data-annotation-editor] textarea').fill(comment);
    await button('Save').click();
  }
  const original = await draft();
  await button('Add notifications').click();
  await toasts.first().waitFor();
  await trigger.click();
  await directory.waitFor();
  await button('Delete annotation 1').click();
  await undo.waitFor();
  await waitClear();
  assert.equal(await toasts.count(), 3);
  assert.equal(await directory.isVisible(), true, 'Deleting keeps the directory open');
  // Expanding multiple unrelated notifications must not reintroduce the overlap.
  await undo.hover();
  await frame.locator('[data-slot="toast-viewport"][data-expanded]').waitFor({ state: 'attached' });
  await waitClear();
  await undo.getByRole('button', { name: 'Undo', exact: true }).click({ trial: true });
  const topDirectory = await directory.boundingBox();
  const topToast = await undo.boundingBox();
  assert.ok(
    topToast.y + topToast.height <= topDirectory.y - 7,
    'Notifications prefer the space above the directory',
  );
  assert.ok(
    Math.abs(topToast.x + topToast.width - topDirectory.x - topDirectory.width) < 2,
    'Notifications align with the directory right edge',
  );
  await page.screenshot({ path: join(artifacts, 'directory-notifications-top.png') });
  await assertToastUndoExitsUp(
    frame,
    undo,
    undo.getByRole('button', { name: 'Undo', exact: true }),
  );
  assert.deepEqual(await draft(), original);

  // The reserved stack size keeps its action still when the pointer enters it.
  const notification = toasts.filter({ hasText: 'Another notification' });
  await notification.hover();
  await waitClear();
  await notification.locator('[data-slot="toast-close"]').click();
  await notification.waitFor({ state: 'detached' });
  await openDirectory();
  await button('Delete annotation 1').click();
  await undo.waitFor();
  await waitClear();
  await submitAnnotations(frame); // Real pointer click while the deletion toast is present.
  const events = (await service.runtime.events(panel.instanceId, 'toast-avoidance', 100, 1000))
    .events;
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.annotations.length, 1);
  await undo.getByRole('button', { name: 'Undo', exact: true }).click();
  await undo.waitFor({ state: 'detached' });
  assert.deepEqual(await draft(), original);

  // A tall directory and a full notification stack need the side placement.
  for (const [start, end] of [
    [18, 24],
    [25, 28],
    [29, 32],
    [33, 36],
  ]) {
    await selectAnnotationText(frame, '[data-annotation-text]', start, end);
    await frame.locator('[data-annotation-action]').click();
    await frame.locator('[data-annotation-editor] textarea').fill(`Additional opinion ${start}`);
    await button('Save').click();
  }
  await button('Add notifications').click();
  await openDirectory();
  await waitClear();
  assert.equal(await toasts.count(), 3);
  const sideDirectory = await directory.boundingBox();
  const sideToasts = await toasts.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().right),
  );
  assert.ok(
    sideToasts.every((right) => right <= sideDirectory.x - 7),
    'A full stack moves left when the space above is insufficient',
  );
  await page.screenshot({ path: join(artifacts, 'directory-notifications-left.png') });

  await openDirectory();
  // Moving the entry changes the shared obstacle, rather than relying on bottom: 4rem.
  const box = await trigger.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 180, box.y - 140, { steps: 8 });
  await page.mouse.up();
  await page.mouse.move(0, 0);
  const moved = await trigger.boundingBox();
  assert.ok(
    moved.x < box.x - 100 && moved.y < box.y - 100,
    'The entry actually moves before checking notification avoidance',
  );
  await openDirectory();
  await waitClear();

  for (const viewport of [
    { width: 1000, height: 700 },
    { width: 850, height: 600 },
  ]) {
    await page.setViewportSize(viewport);
    // Chrome can drop iframe mouse events after viewport resize. Real submission,
    // Undo, closing and dragging are checked above before resizing; here verify
    // the actual geometry and hit target after keyboard setup.
    await openDirectory();
    await waitClear();
    assert.equal(
      await frame.locator('[data-annotation-submit] button').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(
          element.ownerDocument.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
        );
      }),
      true,
      'Submit remains the actual pointer target after resize',
    );
  }
  await page.keyboard.press('F6');
  assert.equal(
    await frame
      .locator('[data-slot="toast-viewport"]')
      .evaluate((element) => element.contains(element.ownerDocument.activeElement)),
    true,
    'Keyboard notification focus remains visible beside the directory',
  );
  await trigger.press('Escape');
  await directory.waitFor({ state: 'hidden' });
  await button('Annotations on').press('Enter');
  await frame.locator('[data-annotation-launcher]').waitFor({ state: 'detached' });
  await waitClear();
  const toastBox = await toasts.first().boundingBox();
  const viewportWidth = await frame.locator('html').evaluate(() => innerWidth);
  assert.ok(
    Math.abs(toastBox.x + toastBox.width - (viewportWidth - 16)) < 1,
    'Unregistering annotations restores the normal toast position',
  );
  const viewportHeight = await frame.locator('html').evaluate(() => innerHeight);
  assert.ok(
    Math.abs(toastBox.y + toastBox.height - (viewportHeight - 16)) < 1,
    'Disabling annotations restores the normal bottom inset',
  );
  await button('Dismiss notifications').press('Enter');
  await toasts.first().waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS toast avoidance: top-first right alignment, left placement for a full stack and tall directory, submit/undo, resize, drag and unregister cleanup',
  );
} catch (error) {
  await page?.screenshot({ path: join(artifacts, 'failure.png') });
  console.error(await page?.frameLocator('iframe').locator('body').innerText());
  throw error;
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
