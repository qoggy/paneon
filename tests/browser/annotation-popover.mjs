import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';
import { selectAnnotationText, submitAnnotations } from './annotation-tools.mjs';

const root = await mkdtemp(join(tmpdir(), 'paneon-annotation-popover-'));
let browser, service;
try {
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    await readFile(new URL('./annotation-editor-fixture.txt', import.meta.url)),
  );
  service = await startServer(join(root, 'data'));
  const panel = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  const target = frame.getByTestId('target');
  await target.waitFor();
  await target.evaluate((element) => {
    element.style.marginTop = '400px';
    document.body.style.minHeight = '1400px';
  });
  await selectAnnotationText(frame, '[data-testid=target] [data-annotation-text]', 0, 6);
  await frame.getByRole('button', { name: 'Annotation', exact: true }).click();
  const editor = frame.locator('[data-annotation-editor]');
  const input = frame.getByRole('textbox', { name: 'Annotation text', exact: true });
  const draft = async () => JSON.parse(await frame.getByTestId('draft').textContent());
  const marker = frame.locator('[data-annotation-marker]');
  const save = frame.getByRole('button', { name: 'Save', exact: true });
  await editor.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  const oneLine = await input.boundingBox();
  assert.ok(oneLine.height <= 34, `Single-line height: ${oneLine.height}`);
  assert.ok((await editor.boundingBox()).height <= 50);
  assert.equal(await input.getAttribute('rows'), '1');
  const cancel = frame.getByRole('button', { name: 'Cancel', exact: true });
  assert.equal(await cancel.count(), 1);
  assert.equal(await editor.getByRole('button').count(), 2);
  assert.equal((await save.textContent()).trim(), '');
  await marker.waitFor();
  const previewId = await marker.getAttribute('data-annotation-marker');
  const previewNumber = await marker.getAttribute('data-annotation-number');
  assert.equal(previewNumber, '1');
  assert.equal((await draft()).annotations.length, 0, 'Preview is not a saved annotation');
  assert.ok(await frame.locator('[data-annotation-highlight]').count());
  const editorBox = await editor.boundingBox();
  const markerBox = await marker.boundingBox();
  assert.ok(editorBox.y + editorBox.height <= markerBox.y, 'Editor leaves preview number visible');
  const targetBox = await target.boundingBox();
  await page.screenshot({
    path: '/tmp/paneon-annotation-editor-preview.png',
    clip: {
      x: 16,
      y: editorBox.y - 8,
      width: 450,
      height: targetBox.y + targetBox.height - editorBox.y + 16,
    },
  });
  await input.fill('First line');
  await input.press('Shift+Enter');
  await input.press('x');
  assert.equal(await input.inputValue(), 'First line\nx');
  assert.ok((await input.boundingBox()).height > oneLine.height);
  await input.fill('x'.repeat(160));
  assert.ok((await input.boundingBox()).height > oneLine.height, 'Soft wrapping grows input');
  await input.fill('Short again');
  assert.equal((await input.boundingBox()).height, oneLine.height, 'Shrinks back to one line');
  await input.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        isComposing: true,
      }),
    ),
  );
  assert.equal(await editor.isVisible(), true, 'IME confirmation must not save');
  await input.fill('Unsaved text survives scrolling');
  assert.equal(await editor.getAttribute('data-slot'), 'popover-content');
  await editor.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  const before = await editor.boundingBox();
  const content = page.frames().find((candidate) => candidate.url().endsWith('/frame.html'));
  await content.evaluate(() => window.scrollTo(0, 80));
  await content.waitForFunction(
    (top) =>
      Math.abs(
        document.querySelector('[data-annotation-editor]').getBoundingClientRect().top - top,
      ) < 3,
    before.y - 80,
  );
  assert.equal(await input.inputValue(), 'Unsaved text survives scrolling');
  await content.waitForFunction(() => {
    const text = document.querySelector('[data-annotation-text]');
    const range = document.createRange();
    range.setStart(text.firstChild, 0);
    range.setEnd(text.firstChild, 6);
    const highlight = document.querySelector('[data-annotation-highlight]');
    return Math.abs(highlight.getBoundingClientRect().top - range.getBoundingClientRect().top) < 2;
  });
  await page.screenshot({ path: '/tmp/paneon-annotation-popover-scroll.png', fullPage: true });
  const outside = await target.boundingBox();
  await page.mouse.click(outside.x + 500, outside.y + 20);
  assert.equal(await editor.isVisible(), true, 'Outside clicks must keep the editor open');
  assert.equal(await input.inputValue(), 'Unsaved text survives scrolling');
  assert.equal((await draft()).annotations.length, 0, 'Outside clicks must not save a draft');
  assert.equal(
    await editor.evaluate((element) =>
      element
        .getAnimations()
        .some((animation) =>
          animation.effect.getKeyframes().some((keyframe) => keyframe.translate === '-6px'),
        ),
    ),
    true,
    'Outside clicks shake the editor',
  );
  // Background controls must not run their handlers, even after repeated clicks.
  const rerender = frame.getByRole('button', {
    name: 'Rerender page 0',
    exact: true,
    includeHidden: true,
  });
  const rerenderBox = await rerender.boundingBox();
  for (let attempt = 0; attempt < 2; attempt++)
    await page.mouse.click(
      rerenderBox.x + rerenderBox.width / 2,
      rerenderBox.y + rerenderBox.height / 2,
    );
  assert.equal(await rerender.count(), 1);
  assert.equal(await input.inputValue(), 'Unsaved text survives scrolling');
  await cancel.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  // Base UI wraps focus from its guard on the next animation frame.
  await input.and(frame.locator(':focus')).waitFor();
  await save.click();
  await editor.waitFor({ state: 'hidden' });
  assert.equal((await draft()).annotations[0].id, previewId);
  assert.equal(await marker.getAttribute('data-annotation-number'), previewNumber);
  await marker.click();
  await input.fill('Saved with check');
  await editor.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  assert.equal(
    (await input.boundingBox()).height,
    oneLine.height,
    'Editing a single line must keep the one-line input height',
  );
  await input.fill('First line\nSecond line');
  assert.ok((await input.boundingBox()).height > oneLine.height, 'Editing grows for new lines');
  await input.fill('Saved with check');
  assert.equal((await input.boundingBox()).height, oneLine.height, 'Editing shrinks to one line');
  assert.equal((await cancel.textContent()).trim(), 'Cancel');
  assert.equal((await save.textContent()).trim(), 'Save');
  const deleteBox = await frame
    .getByRole('button', { name: 'Delete annotation', exact: true })
    .boundingBox();
  const cancelBox = await cancel.boundingBox();
  const editSaveBox = await save.boundingBox();
  const editInputBox = await input.boundingBox();
  assert.ok(deleteBox.y >= editInputBox.y + editInputBox.height, 'Actions are below the input');
  assert.equal(deleteBox.y, cancelBox.y);
  assert.equal(cancelBox.y, editSaveBox.y);
  assert.ok(cancelBox.x > deleteBox.x + deleteBox.width + 100, 'Delete stays on the left');
  assert.ok(editSaveBox.x >= cancelBox.x + cancelBox.width, 'Cancel and Save stay on the right');
  const scrollBeforeSave = await content.evaluate(() => scrollY);
  const saveBox = await save.boundingBox();
  await page.mouse.click(saveBox.x + saveBox.width / 2, saveBox.y + saveBox.height / 2);
  await editor.waitFor({ state: 'hidden' });
  assert.equal(await content.evaluate(() => scrollY), scrollBeforeSave);
  assert.equal((await draft()).annotations[0].comment, 'Saved with check');
  await marker.click();
  assert.equal(await editor.getByRole('button').count(), 3);
  await input.fill('Keep editing after outside click');
  const currentOutside = await target.boundingBox();
  await page.mouse.click(currentOutside.x + 500, currentOutside.y + 20);
  assert.equal(await editor.isVisible(), true);
  assert.equal(await input.inputValue(), 'Keep editing after outside click');
  assert.equal((await draft()).annotations[0].comment, 'Saved with check');
  await cancel.click();
  await editor.waitFor({ state: 'hidden' });
  assert.equal((await draft()).annotations[0].comment, 'Saved with check');
  await marker.click();
  await frame.getByRole('button', { name: 'Delete annotation', exact: true }).click();
  assert.equal((await draft()).annotations.length, 0);
  await selectAnnotationText(frame, '[data-testid=target] [data-annotation-text]', 0, 6);
  await frame.getByRole('button', { name: 'Annotation', exact: true }).click();
  await input.fill('Keep original source mapping');
  await input.press('Enter');
  await editor.waitFor({ state: 'hidden' });
  assert.equal(
    (await service.runtime.events(panel.instanceId, 'popover-acceptance', 100, 0)).events.length,
    0,
  );
  await submitAnnotations(frame);
  await frame.getByRole('button', { name: 'Annotations (1)', exact: true }).waitFor();
  const result = await service.runtime.events(panel.instanceId, 'popover-acceptance', 100, 0);
  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0].payload.annotations[0].targets[0].text, {
    start: 0,
    end: 6,
    quote: 'Shared',
  });
  // Visible numbers follow the current list, independently of event reads.
  for (const comment of ['Second annotation', 'Third annotation']) {
    await selectAnnotationText(frame, '[data-testid=target] [data-annotation-text]', 0, 6);
    await frame.getByRole('button', { name: 'Annotation', exact: true }).click();
    await input.fill(comment);
    await input.press('Enter');
    await editor.waitFor({ state: 'hidden' });
  }
  const [first, second, third] = (await draft()).annotations;
  await frame.getByRole('button', { name: 'Annotations (3)', exact: true }).click();
  await frame.getByRole('button', { name: 'Delete annotation 2', exact: true }).click();
  await frame
    .locator(`[data-annotation-marker="${third.id}"][data-annotation-number="2"]`)
    .waitFor();
  assert.deepEqual(
    (await draft()).annotations.map((entry) => entry.id),
    [first.id, third.id],
  );
  assert.equal(
    await frame.getByRole('button', { name: 'Edit annotation 2', exact: true }).count(),
    1,
  );
  assert.equal(
    await frame.getByRole('button', { name: 'Edit annotation 3', exact: true }).count(),
    0,
  );
  assert.equal(await frame.locator(`[data-annotation-marker="${second.id}"]`).count(), 0);
  await page.keyboard.press('Escape');
  const previewThree = frame.locator('[data-annotation-marker][data-annotation-number="3"]');
  for (let attempt = 0; attempt < 2; attempt++) {
    await selectAnnotationText(frame, '[data-testid=target] [data-annotation-text]', 0, 6);
    await frame.getByRole('button', { name: 'Annotation', exact: true }).click();
    await previewThree.waitFor();
    assert.equal((await draft()).annotations.length, 2);
    await input.fill('Cancel without consuming a number');
    await cancel.click();
    await previewThree.waitFor({ state: 'detached' });
  }
  await selectAnnotationText(frame, '[data-testid=target] [data-annotation-text]', 0, 6);
  await frame.getByRole('button', { name: 'Annotation', exact: true }).click();
  await previewThree.waitFor();
  const finalPreviewId = await previewThree.getAttribute('data-annotation-marker');
  await input.fill('Saved as annotation 3');
  await input.press('Enter');
  await editor.waitFor({ state: 'hidden' });
  assert.equal((await draft()).annotations[2].id, finalPreviewId);
  await frame
    .locator(`[data-annotation-marker="${finalPreviewId}"][data-annotation-number="3"]`)
    .waitFor();
  await submitAnnotations(frame);
  const resubmitted = await service.runtime.events(panel.instanceId, 'popover-acceptance', 100, 0);
  assert.equal(resubmitted.events.length, 2);
  assert.deepEqual(resubmitted.events[0].payload, result.events[0].payload);
  assert.deepEqual(
    resubmitted.events[1].payload.annotations.map((entry) => entry.id),
    [first.id, third.id, finalPreviewId],
  );
  assert.equal(
    resubmitted.events[1].payload.annotations.some((entry) => 'number' in entry),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS compact annotation editor: auto rows, check/Enter save, explicit cancel/delete, Shift+Enter, IME, preview highlight/number, outside click blocking/shake/draft retention, focus trap, scrolling, contiguous numbers after deletion/cancel, exact mapping and unchanged event history.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
