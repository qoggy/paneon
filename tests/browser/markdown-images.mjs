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
  page.on('pageerror', (error) => errors.push(error.message));
  const remoteRequests = [];
  const remoteImage = await readFile(new URL('../../docs/readme/git-review.png', import.meta.url));
  await page.route(/^https?:\/\/images\.paneon\.test\/example\.png$/, async (route) => {
    remoteRequests.push(route.request().url());
    await route.fulfill({ contentType: 'image/png', body: remoteImage });
  });
  const policies = [];
  page.on('response', (response) => {
    if (response.url().endsWith('/frame.html'))
      policies.push(response.headers()['content-security-policy']);
  });
  await page.goto(fixture.url);
  const frame = page.frameLocator('iframe');
  const plain = frame.locator('[data-testid="plain"]');
  const image = plain.getByRole('button', { name: 'Expand image: Git 评审界面', exact: true });
  await image.waitFor();
  assert.equal(await image.evaluate((el) => getComputedStyle(el).cursor), 'zoom-in');
  const source = await image.getAttribute('src');
  const parseCount = await plain.locator('[data-parse-count]').textContent();
  const addressTooltip = frame.locator('[data-slot="tooltip-content"]').filter({ hasText: source });
  await image.hover();
  await addressTooltip.waitFor();
  assert.equal(await addressTooltip.textContent(), source);
  await page.mouse.move(0, 0);
  await addressTooltip.waitFor({ state: 'hidden' });
  await image.focus();
  await addressTooltip.waitFor();
  await image.click();
  const viewer = frame.getByRole('dialog', { name: 'Image viewer', exact: true });
  await viewer.waitFor();
  await addressTooltip.waitFor({ state: 'hidden' });
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
  assert.equal(await image.evaluate((el) => document.activeElement === el), true);
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
    await remoteTooltip.waitFor();
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
  const broken = frame.locator('[data-testid="broken"] img');
  await broken.click();
  assert.equal(await viewer.count(), 0);
  assert.equal(await broken.getAttribute('tabindex'), null);
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
