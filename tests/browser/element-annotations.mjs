import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { readPanelFixture } from '../panel-fixture.ts';
import { startServer } from '../runtime-fixture.ts';
import { submitAnnotations } from './annotation-tools.mjs';
import { ELEMENT_ANNOTATION_EXCERPT_LENGTH } from '../../src/ui/element-annotation.ts';

const root = await mkdtemp(join(tmpdir(), 'paneon-element-annotations-'));
let service, browser;
try {
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    await readPanelFixture(new URL('../fixtures/panels/element-annotations.tsx', import.meta.url)),
  );
  service = await startServer(join(root, 'runtime'));
  const panel = await service.runtime.run(
    entry,
    root,
    { excerpt: '😀'.repeat(ELEMENT_ANNOTATION_EXCERPT_LENGTH + 1) },
    false,
  );
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  const select = frame.getByRole('button', { name: /^(Select content to annotate|选取批注)$/ });
  const exit = frame.getByRole('button', { name: /^(Exit selection|退出选取)$/ });
  const review = frame.locator('[data-element-annotation-picker="review"]');
  const picking = frame.locator('[data-element-annotation-picker="pick"]');
  const outline = frame.locator('[data-element-annotation-outline]');
  const editor = frame.locator('[data-annotation-editor]');
  const card = frame.getByTestId('card');
  const draft = async () => JSON.parse(await frame.getByTestId('draft').textContent());
  const marker = (number) => frame.locator(`[data-annotation-number="${number}"]`);
  const boundary = (id) => frame.locator(`[data-annotation-outline="${id}"]`);
  const settleGeometry = () =>
    frame
      .locator('html')
      .evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
  const editorBounds = async () => {
    await editor.locator('textarea').waitFor();
    await editor.evaluate(async (element) => {
      await Promise.allSettled(element.getAnimations().map((animation) => animation.finished));
    });
    await settleGeometry();
    return editor.boundingBox();
  };
  const events = async () =>
    (await service.runtime.events(panel.instanceId, 'element-acceptance', 100, 0)).events;
  const save = async (comment) => {
    await editor.locator('textarea').fill(comment);
    await editor.locator('textarea').press('Enter');
    await editor.waitFor({ state: 'hidden' });
  };
  const settle = async () =>
    frame.locator('[data-element-annotation-picker="review"]').evaluate(async (popup) => {
      await Promise.allSettled(popup.getAnimations().map((animation) => animation.finished));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });

  await select.waitFor();
  assert.equal(await frame.locator('[data-annotation-launcher]').count(), 1);
  await select.hover();
  await frame
    .locator('[data-slot="tooltip-content"]')
    .filter({ hasText: /Select page content|选取页面内容/ })
    .waitFor();
  await card.getByRole('button', { name: 'Business action' }).click();
  assert.equal(await frame.getByTestId('clicks').textContent(), '1');
  await select.click();
  await card.getByRole('button', { name: 'Business action' }).click();
  assert.equal(await frame.getByTestId('clicks').textContent(), '1');
  await page.keyboard.press('Escape');
  await picking.waitFor();
  await card.locator('svg text').click();
  await review.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
  await picking.waitFor();
  await page.keyboard.press('Escape');
  await select.waitFor();
  assert.deepEqual((await draft()).annotations, []);

  await select.click();
  await card.locator('svg text').click();
  await page.keyboard.press('ArrowLeft');
  assert.match(await review.locator('button[aria-pressed="true"]').textContent(), /SVG/);
  await page.keyboard.press('ArrowRight');
  assert.match(
    await review.locator('button[aria-pressed="true"]').textContent(),
    /SVG text|图中文字/,
  );
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await editor.waitFor();
  assert.equal(await editor.locator('textarea').inputValue(), '');
  await save('Annotate the SVG');
  const svgTarget = (await draft()).annotations[0].targets[0];
  assert.equal(svgTarget.ref.element.tag, 'svg');
  assert.equal(svgTarget.ref.element.excerpt, '😀'.repeat(ELEMENT_ANNOTATION_EXCERPT_LENGTH) + '…');
  assert.equal('text' in svgTarget, false);
  assert.deepEqual(Object.keys(svgTarget.ref), ['element']);
  assert.deepEqual(await events(), [], 'Saving is local');

  await select.click();
  await card.click({ position: { x: 6, y: 6 } });
  await settle();
  const selectedBounds = await outline.boundingBox();
  const cardBounds = await card.boundingBox();
  assert.ok(
    Math.abs(selectedBounds.height - cardBounds.height) < 2,
    'Card geometry must not collapse to its descendant SVG',
  );
  const rangeBounds = await review.boundingBox();
  assert.ok(
    Math.abs(rangeBounds.y - (cardBounds.y + cardBounds.height)) < 24,
    'Range popup follows the selected card',
  );
  await page.keyboard.press('Enter');
  await save('Annotate the whole card');
  assert.equal((await draft()).annotations.length, 2);
  const [svgAnnotation, cardAnnotation] = (await draft()).annotations;
  const svgBoundary = boundary(svgAnnotation.id);
  const cardBoundary = boundary(cardAnnotation.id);
  await cardBoundary.waitFor();
  assert.equal(await frame.locator('[data-annotation-outline]').count(), 2);
  await frame.locator('h1').click();
  await settleGeometry();
  assert.equal(await frame.locator('[data-annotation-outline][data-emphasized="true"]').count(), 0);
  assert.equal(
    await cardBoundary.evaluate((element) => getComputedStyle(element).borderWidth),
    '1px',
  );
  assert.equal(
    await cardBoundary.evaluate((element) => getComputedStyle(element).borderRadius),
    await card.evaluate((element) => getComputedStyle(element).borderRadius),
  );
  const savedCardBounds = await cardBoundary.boundingBox();
  assert.ok(Math.abs(savedCardBounds.height - (await card.boundingBox()).height) < 2);
  assert.ok((await svgBoundary.boundingBox()).height < savedCardBounds.height);
  await marker(1).hover();
  assert.equal(await svgBoundary.getAttribute('data-emphasized'), 'true');
  assert.equal(await cardBoundary.getAttribute('data-emphasized'), 'false');
  assert.equal(
    await svgBoundary.evaluate((element) => getComputedStyle(element).borderWidth),
    '2px',
  );
  await marker(2).focus();
  await page.mouse.move(20, 20);
  assert.equal(await cardBoundary.getAttribute('data-emphasized'), 'true');
  await card.getByRole('button', { name: 'Business action' }).click();
  assert.equal(
    await frame.getByTestId('clicks').textContent(),
    '2',
    'Outlines do not intercept clicks',
  );

  const scroller = frame.getByTestId('scroll');
  await scroller.scrollIntoViewIfNeeded();
  await select.click();
  await frame.getByTestId('nested-target').click();
  await settle();
  const before = await review.boundingBox();
  await scroller.evaluate((element) => {
    element.scrollTop += 24;
  });
  await settle();
  const after = await review.boundingBox();
  assert.ok(before.y - after.y > 15, 'Range popup follows nested scrolling');
  await page.keyboard.press('Enter');
  await save('Nested scrolling annotation');
  const nestedAnnotation = (await draft()).annotations[2];
  const nestedBoundary = boundary(nestedAnnotation.id);
  await nestedBoundary.waitFor();
  const savedBeforeScroll = await nestedBoundary.boundingBox();
  await scroller.evaluate((element) => {
    element.scrollTop -= 16;
  });
  await settleGeometry();
  assert.ok((await nestedBoundary.boundingBox()).y - savedBeforeScroll.y > 10);
  await marker(3).click();
  await editorBounds();
  await page.mouse.move(20, 20);
  assert.equal(await nestedBoundary.getAttribute('data-emphasized'), 'true');
  await editor.getByRole('button', { name: /^(Delete annotation|删除批注)$/ }).click();
  await nestedBoundary.waitFor({ state: 'detached' });
  assert.equal(await frame.locator('[data-annotation-outline]').count(), 2);
  assert.equal(await marker(3).count(), 0);

  const launcher = frame.locator('[data-annotation-launcher]');
  const directory = launcher.getByRole('button', { name: /^(Annotations|批注) \(2\)$/ });
  const original = await launcher.boundingBox();
  const handle = await directory.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 140, handle.y + handle.height / 2 - 80, {
    steps: 10,
  });
  await page.mouse.up();
  assert.ok(original.x - (await launcher.boundingBox()).x > 100);
  await page.mouse.move(20, 20);
  await directory.click();
  const svgRow = frame.locator(`[data-annotation-id="${svgAnnotation.id}"]`);
  await svgRow.hover();
  assert.equal(await svgBoundary.getAttribute('data-emphasized'), 'true');
  assert.equal(await cardBoundary.getAttribute('data-emphasized'), 'false');
  await svgRow.getByRole('button', { name: /^(Edit annotation|编辑批注) 1$/ }).focus();
  await page.mouse.move(20, 20);
  assert.equal(await svgBoundary.getAttribute('data-emphasized'), 'true');
  await frame.getByRole('button', { name: /^(Edit annotation|编辑批注) 2$/ }).click();
  assert.equal(await editor.locator('textarea').inputValue(), 'Annotate the whole card');
  const fromDirectory = await editorBounds();
  assert.equal(await cardBoundary.getAttribute('data-emphasized'), 'true');
  await editor.locator('textarea').press('Escape');
  await editor.waitFor({ state: 'hidden' });
  await marker(2).click();
  const fromMarker = await editorBounds();
  assert.ok(
    Math.abs(fromDirectory.x - fromMarker.x) < 2 && Math.abs(fromDirectory.y - fromMarker.y) < 2,
    `Both editing entries use the same marker: ${JSON.stringify({ fromDirectory, fromMarker })}`,
  );
  await editor.locator('textarea').press('Escape');
  await editor.waitFor({ state: 'hidden' });
  await submitAnnotations(frame);
  const sent = await events();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.annotations.length, 2);
  assert.equal('id' in sent[0].payload.annotations[0], false);
  assert.deepEqual(sent[0].payload.annotations[0].targets, [svgTarget]);
  await frame.getByRole('button', { name: 'Expand image: Viewer drawing', exact: true }).click();
  const viewer = frame.locator('[data-slot="image-viewer"]');
  await viewer.waitFor();
  const viewerImage = viewer.locator('img');
  await viewerImage.evaluate((image) => image.decode());
  await select.click();
  const viewport = viewer.locator('[data-slot="image-viewport"]');
  await viewport.click();
  await settle();
  const imageBounds = await viewport.boundingBox();
  const viewerOutline = await outline.boundingBox();
  assert.ok(
    Math.abs(viewerOutline.x - imageBounds.x) < 2 && Math.abs(viewerOutline.y - imageBounds.y) < 2,
    'Element outline uses viewport coordinates inside a media viewer',
  );
  await page.keyboard.press('Escape');
  await picking.waitFor();
  await viewport.click();
  await page.keyboard.press('Enter');
  await save('Viewer element');
  const viewerTarget = (await draft()).annotations[2].targets[0];
  assert.equal(
    await frame
      .locator('html')
      .evaluate(
        (_, path) => document.body.querySelector(path)?.getAttribute('data-slot'),
        viewerTarget.ref.element.path,
      ),
    'image-viewport',
  );
  await viewer.getByRole('button', { name: /^(Close image|关闭图片)$/ }).click();
  await viewer.waitFor({ state: 'hidden' });

  const editCard = async () => {
    await frame.getByRole('button', { name: /^(Annotations|批注) \(3\)$/ }).click();
    await frame.getByRole('button', { name: /^(Edit annotation|编辑批注) 2$/ }).click();
    await editorBounds();
  };
  const assertCornerEditor = async () => {
    assert.equal(await editor.getAttribute('data-annotation-editor-placement'), 'bottom-right');
    const position = await editor.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight };
    });
    assert.ok(Math.abs(position.width - position.right - 16) < 2, JSON.stringify(position));
    assert.ok(Math.abs(position.height - position.bottom - 16) < 2, JSON.stringify(position));
  };
  const originalCardTargets = structuredClone(cardAnnotation.targets);
  await frame.getByRole('button', { name: 'Hide card', exact: true }).click();
  await cardBoundary.waitFor({ state: 'detached' });
  await editCard();
  await assertCornerEditor();
  assert.equal(await editor.locator('textarea').inputValue(), 'Annotate the whole card');
  await editor.locator('textarea').fill('Unsaved hidden-card correction');
  await editor.locator('textarea').press('Escape');
  await editor.waitFor({ state: 'hidden' });
  assert.equal((await draft()).annotations[1].comment, 'Annotate the whole card');
  await editCard();
  await assertCornerEditor();
  await save('Hidden card corrected');
  assert.deepEqual((await draft()).annotations[1].targets, originalCardTargets);
  assert.equal((await draft()).annotations[1].id, cardAnnotation.id);
  await frame.getByRole('button', { name: 'Show card', exact: true }).click();
  await cardBoundary.waitFor();
  await frame.locator('html').evaluate(() => scrollTo(0, document.body.scrollHeight));
  await settleGeometry();
  await editCard();
  assert.equal(
    await editor.getAttribute('data-annotation-editor-placement'),
    'target',
    'An offscreen target is scrolled into view, not treated as hidden',
  );
  assert.ok((await card.boundingBox()).y >= 0);
  await editor.locator('textarea').press('Escape');
  await editor.waitFor({ state: 'hidden' });
  await frame.getByRole('button', { name: 'Remove card', exact: true }).click();
  await card.waitFor({ state: 'detached' });
  await editCard();
  await assertCornerEditor();
  assert.equal(await editor.locator('textarea').inputValue(), 'Hidden card corrected');
  await save('Removed card corrected');
  assert.deepEqual((await draft()).annotations[1].targets, originalCardTargets);
  await editCard();
  await editor.getByRole('button', { name: /^(Delete annotation|删除批注)$/ }).click();
  await editor.waitFor({ state: 'hidden' });
  assert.equal(
    (await draft()).annotations.some((entry) => entry.id === cardAnnotation.id),
    false,
  );
  assert.equal((await events()).length, 1, 'Unavailable-target editing still saves locally');
  // Explicitly selecting a newly mounted node must replace its old detached registration.
  await frame.getByRole('button', { name: 'Show card', exact: true }).click();
  await select.click();
  await card.locator('svg text').click();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await editorBounds();
  await svgBoundary.waitFor();
  assert.equal(await editor.locator('textarea').inputValue(), 'Annotate the SVG');
  const selectedAgain = await svgBoundary.boundingBox();
  const mountedSvg = await card.locator('svg').boundingBox();
  assert.ok(Math.abs(selectedAgain.y - mountedSvg.y) < 2);
  await editor.locator('textarea').press('Escape');
  await editor.waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS element annotations: selection, nested outlines, emphasis, matching anchors, hidden/removed bottom-right editing, offscreen location, save/cancel/delete, explicit submission',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
