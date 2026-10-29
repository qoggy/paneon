import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startMarkdownImageFixture } from './markdown-image-fixture.mjs';
import { selectAnnotationText } from './annotation-tools.mjs';

const fixture = await startMarkdownImageFixture();
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-markdown-images';
await mkdir(artifacts, { recursive: true });
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => {
    if (entry.type() === 'error') consoleErrors.push(entry.text());
  });
  const remoteRequests = [];
  const remoteImage = await readFile(new URL('../../docs/readme/git-review.png', import.meta.url));
  await page.route(/^https?:\/\/images\.paneon\.test\/example\.png$/, async (route) => {
    remoteRequests.push(route.request().url());
    await route.fulfill({
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: remoteImage,
    });
  });
  let releaseRemote;
  const remoteGate = new Promise((resolve) => {
    releaseRemote = resolve;
  });
  await page.route('https://images.paneon.test/slow.png', async (route) => {
    await remoteGate;
    await route.fulfill({ contentType: 'image/png', body: remoteImage });
  });
  const policies = [];
  page.on('response', (response) => {
    if (response.url().endsWith('/frame.html'))
      policies.push(response.headers()['content-security-policy']);
  });
  await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
  const frame = page.frameLocator('iframe');
  for (const testId of ['slow-image', 'slow-markdown']) {
    const pending = frame.getByTestId(testId);
    await pending.getByRole('status').filter({ hasText: 'Loading image…' }).waitFor();
    assert.equal(await pending.locator('svg.animate-spin').count(), 1);
    assert.equal(await pending.locator('img').count(), 1);
    assert.equal(await pending.locator('img').getAttribute('hidden'), '');
    assert.equal(await pending.locator('img').isVisible(), false);
  }
  releaseRemote();
  for (const testId of ['slow-image', 'slow-markdown']) {
    const loaded = frame.getByTestId(testId);
    await loaded.locator('img[role="button"]').waitFor();
    assert.equal(await loaded.getByRole('status').count(), 0);
    assert.equal(await loaded.locator('img').evaluate((element) => element.naturalWidth > 0), true);
  }
  await frame.getByTestId('slow-image').locator('img[role="button"]').click();
  await frame.getByRole('dialog', { name: 'Image viewer', exact: true }).waitFor();
  assert.equal(await frame.locator('[data-slot="image-viewer"]').count(), 1);
  await page.keyboard.press('Escape');
  await frame
    .getByRole('dialog', { name: 'Image viewer', exact: true })
    .waitFor({ state: 'hidden' });
  const plain = frame.locator('[data-testid="plain"]');
  const image = plain.getByRole('button', { name: 'Expand image: Git 评审界面', exact: true });
  await image.waitFor();
  assert.equal(await image.evaluate((el) => getComputedStyle(el).cursor), 'zoom-in');
  const source = await image.getAttribute('src');
  const parseCount = await plain.locator('[data-parse-count]').textContent();
  const addressTooltip = frame.locator('[data-slot="tooltip-content"]').filter({ hasText: source });
  const toolbar = plain.locator('[data-slot="media-toolbar"]');
  assert.equal(await toolbar.evaluate((element) => getComputedStyle(element).opacity), '0');
  await image.hover();
  await toolbar.waitFor();
  const toolbarButtons = await toolbar.locator('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { top: rect.top, left: rect.left };
    }),
  );
  assert.equal(toolbarButtons[0].left, toolbarButtons[1].left);
  assert.ok(toolbarButtons[0].top < toolbarButtons[1].top);
  const imageBox = await image.boundingBox();
  const toolbarBox = await toolbar.boundingBox();
  assert.ok(toolbarBox.x >= imageBox.x + imageBox.width, 'Toolbar stays outside the image.');
  assert.equal(toolbarBox.y, imageBox.y, 'Toolbar aligns with the top of the image.');
  const more = plain.getByRole('button', { name: 'More image options', exact: true });
  await more.hover();
  await frame
    .locator('[data-slot="tooltip-content"]')
    .filter({ hasText: 'More image options' })
    .waitFor();
  assert.equal(
    await addressTooltip.count(),
    0,
    'Image sources no longer appear in hover tooltips.',
  );
  await more.click();
  await frame.getByRole('menuitem', { name: 'Copy path', exact: true }).waitFor();
  assert.deepEqual(await frame.getByRole('menuitem').allTextContents(), [
    'Copy path',
    'Copy image',
    'Download original',
  ]);
  await page.screenshot({ path: join(artifacts, 'image-menu-light.png') });
  await frame.getByRole('menuitem', { name: 'Copy path', exact: true }).click();
  await frame.locator('[data-slot="toast"]').filter({ hasText: 'Path copied' }).waitFor();
  await page
    .context()
    .grantPermissions(['clipboard-read'], { origin: new URL(fixture.url).origin });
  await page.waitForFunction(
    (expected) => navigator.clipboard.readText().then((text) => text === expected),
    source,
  );
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), source);
  await page.context().clearPermissions();
  await image.hover();
  await more.click();
  const downloading = page.waitForEvent('download');
  await frame.getByRole('menuitem', { name: 'Download original', exact: true }).click();
  const downloaded = await downloading;
  assert.deepEqual(await readFile(await downloaded.path()), remoteImage);
  await frame.locator('[data-slot="toast"]').filter({ hasText: 'Image downloaded' }).waitFor();
  await page.evaluate(() => {
    navigator.clipboard.writeText = () =>
      new Promise((_resolve, reject) => {
        window.__denyImageClipboard = () => reject(new Error('Clipboard denied for test'));
      });
  });
  await image.hover();
  await more.click();
  await frame.getByRole('menuitem', { name: 'Copy path', exact: true }).click();
  await toolbar.locator('svg.animate-spin').waitFor();
  assert.equal(await more.isDisabled(), true);
  await image.click();
  const busyViewer = frame.getByRole('dialog', { name: 'Image viewer', exact: true });
  await busyViewer.waitFor();
  const busyDownload = busyViewer.getByRole('button', { name: 'Download original', exact: true });
  assert.equal(await busyDownload.isDisabled(), true);
  assert.equal(await busyDownload.locator('svg.animate-spin').count(), 1);
  await page.evaluate(() => window.__denyImageClipboard());
  await frame
    .locator('[data-slot="toast"]')
    .filter({ hasText: 'Unable to complete image action.' })
    .waitFor();
  assert.equal(await busyDownload.isEnabled(), true);
  const [afterBusyDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }),
    busyDownload.click(),
  ]);
  assert.deepEqual(await readFile(await afterBusyDownload.path()), remoteImage);
  await page.keyboard.press('Escape');
  await busyViewer.waitFor({ state: 'hidden' });
  assert.equal(await more.isDisabled(), false);
  await page.evaluate(() => {
    Reflect.deleteProperty(navigator.clipboard, 'writeText');
  });
  await page.mouse.move(0, 0);
  await image.focus();
  const expand = plain.getByRole('button', { name: 'Expand image', exact: true });
  const diagramToolbar = frame
    .locator('[data-slot="mermaid-diagram"] [data-slot="media-toolbar"]')
    .last();
  assert.equal(await toolbar.getAttribute('class'), await diagramToolbar.getAttribute('class'));
  await expand.click();
  const viewer = frame.getByRole('dialog', { name: 'Image viewer', exact: true });
  await viewer.waitFor();
  assert.equal(await frame.locator('[data-slot="image-viewer"]').count(), 1);
  await addressTooltip.waitFor({ state: 'hidden' });
  const [viewerDownloaded] = await Promise.all([
    page.waitForEvent('download'),
    viewer.getByRole('button', { name: 'Download original', exact: true }).click(),
  ]);
  assert.deepEqual(await readFile(await viewerDownloaded.path()), remoteImage);
  const expanded = viewer.getByRole('img', { name: 'Git 评审界面', exact: true });
  await expanded.evaluate((el) => el.decode());
  assert.equal(await expanded.evaluate((el) => el.naturalWidth > 0), true);
  assert.equal(await expanded.evaluate((el) => el.closest('.markdown-body')), null);
  const initial = await expanded.getAttribute('style');
  await viewer.getByRole('button', { name: 'Zoom in', exact: true }).click();
  assert.notEqual(await expanded.getAttribute('style'), initial);
  await viewer.getByRole('button', { name: 'Actual size', exact: true }).click();
  assert.match(await expanded.getAttribute('style'), /scale\(1\)/);
  const box = await viewer.locator('[data-slot="image-viewport"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40);
  await page.mouse.up();
  assert.match(await expanded.getAttribute('style'), /translate\(80px, 40px\)/);
  await viewer.getByRole('button', { name: 'Fit to window', exact: true }).click();
  assert.match(await expanded.getAttribute('style'), /translate\(0px, 0px\)/);
  await page.screenshot({ path: join(artifacts, 'viewer-light.png') });
  await viewer.getByRole('button', { name: 'Close image', exact: true }).click();
  await viewer.waitFor({ state: 'hidden' });
  assert.equal(await expand.evaluate((el) => document.activeElement === el), true);
  assert.equal(
    await plain.locator('[data-parse-count]').textContent(),
    parseCount,
    'Opening and closing the image viewer must not reparse Markdown.',
  );

  const labelImage = frame.locator('[data-testid="markdown-mermaid-image"] foreignObject img');
  await labelImage.evaluate((el) => el.decode());
  await labelImage.click();
  const diagramViewer = frame.getByRole('dialog', { name: 'Diagram viewer', exact: true });
  await diagramViewer.waitFor();
  assert.equal(
    await frame.locator('[data-slot="image-viewer"]').count(),
    0,
    'Mermaid label images belong to the diagram viewer.',
  );
  await page.keyboard.press('Escape');
  await diagramViewer.waitFor({ state: 'hidden' });

  for (const protocol of ['HTTPS', 'HTTP']) {
    const remote = frame.locator(`[data-testid="remote-${protocol.toLowerCase()}"]`);
    const trigger = remote.getByRole('button', {
      name: `Expand image: ${protocol} 网络图片`,
      exact: true,
    });
    await trigger.hover();
    const remoteTooltip = frame
      .locator('[data-slot="tooltip-content"]')
      .filter({ hasText: `${protocol.toLowerCase()}://images.paneon.test/example.png` });
    const remoteMore = remote.getByRole('button', { name: 'More image options', exact: true });
    await remoteMore.click();
    assert.equal(await remoteTooltip.count(), 0);
    await frame.getByRole('menuitem', { name: 'Copy path', exact: true }).click();
    await page
      .context()
      .grantPermissions(['clipboard-read'], { origin: new URL(fixture.url).origin });
    await page.waitForFunction(
      (expected) => navigator.clipboard.readText().then((text) => text === expected),
      `${protocol.toLowerCase()}://images.paneon.test/example.png`,
    );
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      `${protocol.toLowerCase()}://images.paneon.test/example.png`,
    );
    await page.context().clearPermissions();
    await remote
      .getByRole('button', { name: `Expand image: ${protocol} 网络图片`, exact: true })
      .click();
    await viewer.waitFor();
    const preview = viewer.getByRole('img', { name: `${protocol} 网络图片`, exact: true });
    await preview.evaluate((el) => el.decode());
    assert.equal(
      await preview.getAttribute('src'),
      `${protocol.toLowerCase()}://images.paneon.test/example.png`,
    );
    assert.equal(await preview.evaluate((el) => el.naturalWidth > 0), true);
    await page.keyboard.press('Escape');
    await viewer.waitFor({ state: 'hidden' });
  }
  const remoteExport = frame.getByTestId('export-remote');
  assert.notEqual(new URL(fixture.remoteSource).origin, new URL(fixture.url).origin);
  await remoteExport.locator('img').hover();
  const exportMore = remoteExport.getByRole('button', { name: 'More image options', exact: true });
  await exportMore.click();
  await frame.getByRole('menuitem', { name: 'Copy image', exact: true }).click();
  await frame
    .locator('[data-slot="toast"]')
    .filter({ hasText: 'Image copied' })
    .waitFor()
    .catch((error) => {
      console.error('Image clipboard diagnostics:', consoleErrors);
      throw error;
    });
  await page
    .context()
    .grantPermissions(['clipboard-read'], { origin: new URL(fixture.url).origin });
  assert.equal(
    await page.evaluate(async () =>
      (await navigator.clipboard.read()).some((item) => item.types.includes('image/png')),
    ),
    true,
  );
  await page.context().clearPermissions();
  await remoteExport.locator('img').hover();
  await exportMore.click();
  const remoteDownloading = page.waitForEvent('download');
  await frame.getByRole('menuitem', { name: 'Download original', exact: true }).click();
  const remoteDownloaded = await remoteDownloading;
  assert.equal(remoteDownloaded.suggestedFilename(), 'original.png');
  assert.deepEqual(await readFile(await remoteDownloaded.path()), remoteImage);
  assert.deepEqual([...new Set(remoteRequests)].sort(), [
    'http://images.paneon.test/example.png',
    'https://images.paneon.test/example.png',
  ]);
  assert.ok(policies.length > 0);
  for (const policy of policies) {
    assert.match(policy, /img-src 'self' data: https: http:;/);
    assert.match(policy, /script-src 'self' 'unsafe-inline';/);
    assert.match(policy, /connect-src 'none';/);
  }
  await image.press('Enter');
  await viewer.waitFor();
  await viewer.getByRole('button', { name: 'Zoom in', exact: true }).focus();
  await page.keyboard.press('Escape');
  await viewer.waitFor({ state: 'hidden' });
  await image.press('Space');
  await viewer.waitFor();
  await viewer.evaluate(async (el) =>
    Promise.all(el.getAnimations().map((animation) => animation.finished)),
  );
  await frame.locator('[data-slot="dialog-overlay"]').click({ position: { x: 4, y: 4 } });
  await viewer.waitFor({ state: 'hidden' });

  const linked = frame.locator('[data-testid="linked"]');
  assert.equal(await linked.getByRole('button').count(), 0);
  await linked.getByRole('link').click();
  assert.equal(await viewer.count(), 0);
  const broken = frame.locator('[data-testid="broken"]').getByRole('status');
  await broken.filter({ hasText: 'Unable to load image.' }).waitFor();
  await broken.click();
  assert.equal(await viewer.count(), 0);
  assert.equal(await frame.locator('[data-testid="broken"]').getByRole('button').count(), 0);
  const focusAnchor = frame.getByRole('button', { name: '切换图片', exact: true });
  await focusAnchor.focus();
  await frame.locator('[data-testid="custom"] img').click();
  await viewer.waitFor();
  await page.keyboard.press('Escape');
  await viewer.waitFor({ state: 'hidden' });
  assert.equal(
    await focusAnchor.evaluate((element) => document.activeElement === element),
    true,
    'Non-focusable custom images restore the control focused before the click.',
  );
  await frame.getByRole('button', { name: 'Expand image: 引用图片', exact: true }).click();
  await viewer.waitFor();
  await page.keyboard.press('Escape');
  await viewer.waitFor({ state: 'hidden' });
  await frame.getByRole('button', { name: '切换图片', exact: true }).click();
  await frame.getByRole('button', { name: 'Expand image: 第二张图片', exact: true }).click();
  await viewer.waitFor();
  assert.equal(
    await viewer.locator('img').getAttribute('src'),
    new URL(source + '?second', fixture.url).href,
  );
  await page.keyboard.press('Escape');
  await viewer.waitFor({ state: 'hidden' });

  // Preview interaction must leave the original Markdown text annotation mapping intact.
  await selectAnnotationText(frame, '[data-testid="plain"] p', 0, 4);
  await frame.locator('[data-annotation-action]').click();
  await frame.locator('[data-annotation-editor] textarea').fill('图片前的批注');
  await frame.locator('[data-annotation-editor] textarea').press('Enter');
  await frame.locator('[data-annotation-editor]').waitFor({ state: 'hidden' });
  assert.equal(
    await frame.getByRole('button', { name: 'Annotations (1)', exact: true }).count(),
    1,
  );

  await page.evaluate(async () => {
    const response = await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ui: { theme: 'dark', language: 'zh-CN' } }),
    });
    if (!response.ok) throw new Error('Preference update failed');
  });
  await plain.getByRole('button', { name: '查看大图: Git 评审界面', exact: true }).click();
  const darkViewer = frame.getByRole('dialog', { name: '图片查看器', exact: true });
  await darkViewer.waitFor();
  await darkViewer.getByRole('button', { name: '原始大小', exact: true }).click();
  await darkViewer.getByRole('button', { name: '适应窗口', exact: true }).click();
  await page.screenshot({ path: join(artifacts, 'viewer-dark.png') });
  await darkViewer.getByRole('button', { name: '关闭大图', exact: true }).click();
  await darkViewer.waitFor({ state: 'hidden' });
  await frame.locator('[data-slot="mermaid-diagram"] > [role="button"]').last().click();
  await frame.getByRole('dialog', { name: '图表查看器', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('iframe').getAttribute('sandbox'), 'allow-scripts');
  assert.deepEqual(errors, []);
  console.log(
    'Markdown images: HTTP/HTTPS remote thumbnails and expanded images, unchanged script/connect policy, zoom, pan, actual size, fit, keyboard, close paths, focus return, links, broken images, custom renderers, nesting, source changes, annotations, themes and shared Mermaid viewer pass.',
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
