import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startMermaidFixture } from './mermaid-fixture.mjs';

const fixture = await startMermaidFixture();
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-mermaid-viewer';
await mkdir(artifacts, { recursive: true });
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(fixture.url);
  const frame = page.frameLocator('iframe');
  const flow = frame.locator('[data-testid="standalone-flow"]');
  const chart = flow.locator('[data-slot="mermaid-diagram"] > [role="button"]');
  await chart.locator('svg').waitFor();
  const geometry = await flow.locator('[data-slot="mermaid"]').evaluate((host) => {
    const content = host.querySelector('[data-slot="mermaid-diagram"] > [role="button"]');
    const toolbar = host.querySelector('[data-slot="media-toolbar"]');
    const contentBox = content.getBoundingClientRect();
    const toolbarBox = toolbar.getBoundingClientRect();
    const buttons = [...toolbar.querySelectorAll('button')].map((button) => {
      const box = button.getBoundingClientRect();
      return { left: box.left, top: box.top, height: box.height };
    });
    return {
      outerOverflowY: getComputedStyle(host).overflowY,
      contentHeight: content.clientHeight,
      scrollHeight: content.scrollHeight,
      toolbarInContent: content.contains(toolbar),
      toolbarOutsideContent: toolbarBox.left >= contentBox.right,
      toolbarTop: toolbarBox.top,
      contentTop: contentBox.top,
      buttons,
    };
  });
  assert.equal(geometry.outerOverflowY, 'visible');
  assert.equal(
    geometry.scrollHeight,
    geometry.contentHeight,
    'Hover controls must not add diagram scrolling.',
  );
  assert.equal(geometry.toolbarInContent, false);
  assert.equal(
    geometry.buttons[0].left,
    geometry.buttons[1].left,
    'Toolbar buttons share one vertical column.',
  );
  assert.ok(geometry.buttons[0].top < geometry.buttons[1].top);
  assert.equal(geometry.toolbarOutsideContent, true);
  assert.equal(geometry.toolbarTop, geometry.contentTop);
  await chart.hover();
  const more = flow.getByRole('button', { name: 'More diagram options', exact: true });
  await more.hover();
  await frame
    .locator('[data-slot=\"tooltip-content\"]')
    .filter({ hasText: 'More diagram options' })
    .waitFor();
  await more.click();
  await frame.getByRole('menuitem', { name: 'Copy Mermaid code', exact: true }).click();
  const codeToast = frame.locator('[data-slot="toast"]').filter({ hasText: 'Code copied' });
  await codeToast.waitFor();
  assert.equal(await flow.locator('p[role="status"]').count(), 0);
  await page.mouse.move(0, 0);
  await codeToast.waitFor({ state: 'detached', timeout: 8000 });
  await context.grantPermissions(['clipboard-read'], { origin: new URL(fixture.url).origin });
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    'flowchart LR\n  Start --> Finish',
  );

  await context.clearPermissions();
  await chart.click();
  const viewer = frame.getByRole('dialog', { name: 'Diagram viewer', exact: true });
  await viewer.waitFor();
  assert.equal(
    await viewer
      .locator('[data-slot="dialog-title"]')
      .evaluate((el) => el.classList.contains('sr-only')),
    true,
  );
  assert.equal(
    await viewer
      .locator('[data-slot="mermaid-viewer-toolbar"]')
      .textContent()
      .then((text) => /Start|Finish|请求/.test(text)),
    false,
    'No invented visible title.',
  );
  const image = viewer.locator('img');
  await image.evaluate((el) => el.decode());
  const before = await image.getAttribute('style');
  await viewer.getByRole('button', { name: 'Zoom in', exact: true }).click();
  assert.notEqual(await image.getAttribute('style'), before);
  const viewport = viewer.locator('[data-slot="mermaid-viewport"]');
  const box = await viewport.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40);
  await page.mouse.up();
  assert.match(await image.getAttribute('style'), /translate\(80px, 40px\)/);
  await viewer.getByRole('button', { name: 'Actual size', exact: true }).click();
  assert.match(await image.getAttribute('style'), /scale\(1\)/);
  await viewer.getByRole('button', { name: 'Fit to window', exact: true }).click();
  const ids = await frame.locator('[id]').evaluateAll((elements) => elements.map((el) => el.id));
  assert.equal(new Set(ids).size, ids.length, 'Expanded image must not duplicate SVG identifiers.');
  await page.screenshot({ path: join(artifacts, 'viewer-light.png') });

  async function download(button, name) {
    const pending = page.waitForEvent('download', { timeout: 15000 });
    await button.click();
    const result = await pending;
    assert.equal(result.suggestedFilename(), 'diagram.png');
    await result.saveAs(join(artifacts, name));
    const bytes = await readFile(await result.path());
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0);
    const pixels = await page.evaluate(async (base64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let changed = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i] !== data[0] || data[i + 1] !== data[1] || data[i + 2] !== data[2]) changed++;
      return {
        changed,
        alpha: data[3],
        width: img.width,
        height: img.height,
        background: [...data.slice(0, 4)],
      };
    }, bytes.toString('base64'));
    assert.equal(pixels.alpha, 255, 'Export background is opaque.');
    assert.ok(pixels.changed > 100, 'Export must contain diagram pixels, not an empty canvas.');
    return pixels;
  }
  const first = await download(
    viewer.getByRole('button', { name: 'Download PNG', exact: true }),
    'flow-light.png',
  );
  const downloadToast = frame.locator('[data-slot="toast"]').filter({ hasText: 'PNG downloaded' });
  await downloadToast.waitFor();
  await downloadToast.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished));
  });
  assert.equal(await viewer.getByText('Drag to pan', { exact: true }).count(), 1);
  assert.equal(await viewer.getByText('PNG downloaded', { exact: true }).count(), 0);
  assert.equal(
    await downloadToast.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    }),
    true,
    'Toast is visible above the open diagram dialog.',
  );
  await viewer.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const zoomed = await download(
    viewer.getByRole('button', { name: 'Download PNG', exact: true }),
    'flow-zoomed.png',
  );
  assert.deepEqual(zoomed, first, 'Export covers the full diagram independent of viewer zoom.');
  await viewer.getByRole('button', { name: 'Close diagram', exact: true }).click();
  await frame.locator('[data-slot="mermaid-viewer"]').waitFor({ state: 'detached' });
  assert.equal(await chart.evaluate((el) => document.activeElement === el), true);
  await chart.press('Enter');
  await viewer.waitFor();
  await page.keyboard.press('Escape');
  await viewer.waitFor({ state: 'hidden' });
  await flow.getByRole('button', { name: 'Expand diagram', exact: true }).last().click();
  await viewer.waitFor();
  await viewer.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished));
  });
  await frame.locator('[data-slot="dialog-overlay"]').click({ position: { x: 4, y: 4 } });
  await viewer.waitFor({ state: 'hidden' });

  await chart.hover();
  await more.click();
  await frame.getByRole('menuitem', { name: 'Copy image', exact: true }).click();
  await frame.locator('[data-slot="toast"]').filter({ hasText: 'Image copied' }).waitFor();
  await context.grantPermissions(['clipboard-read'], { origin: new URL(fixture.url).origin });
  assert.ok(
    await page.evaluate(async () =>
      (await navigator.clipboard.read()).some((item) => item.types.includes('image/png')),
    ),
  );

  // A failed host clipboard operation uses the same temporary toast surface.
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('Clipboard denied for test'));
  });
  await chart.hover();
  await more.click();
  await frame.getByRole('menuitem', { name: 'Copy Mermaid code', exact: true }).click();
  const errorToast = frame.locator('[data-slot="toast"]').filter({
    hasText: 'Unable to complete diagram action.',
  });
  await errorToast.waitFor();
  assert.equal(await flow.locator('p[role="alert"]').count(), 0);
  await page.mouse.move(0, 0);
  await errorToast.waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate(() => {
    Reflect.deleteProperty(navigator.clipboard, 'writeText');
  });

  await page.evaluate(async () => {
    const r = await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ui: { theme: 'dark', language: 'zh-CN' } }),
    });
    if (!r.ok) throw Error('Preference update failed');
  });
  await flow.getByRole('button', { name: '展开图表', exact: true }).first().waitFor();
  await chart.locator('svg').waitFor();
  await chart.click();
  const darkViewer = frame.getByRole('dialog', { name: '图表查看器', exact: true });
  await darkViewer.locator('img').evaluate((el) => el.decode());
  await darkViewer.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished));
  });
  await page.screenshot({ path: join(artifacts, 'viewer-dark.png') });
  const dark = await download(
    darkViewer.getByRole('button', { name: '下载 PNG', exact: true }),
    'flow-dark.png',
  );
  await frame.locator('[data-slot="toast"]').filter({ hasText: 'PNG 已下载' }).waitFor();
  assert.notDeepEqual(dark.background, first.background, 'PNG follows the diagram theme.');
  await darkViewer.getByRole('button', { name: '关闭大图', exact: true }).click();

  const sequence = frame.locator(
    '[data-testid="standalone-sequence"] [data-slot="mermaid-diagram"] > [role="button"]',
  );
  await sequence.click();
  await download(
    darkViewer.getByRole('button', { name: '下载 PNG', exact: true }),
    'sequence-dark.png',
  );
  await page.keyboard.press('Escape');
  await darkViewer.waitFor({ state: 'hidden' });
  await frame
    .getByRole('textbox', { name: 'Diagram source', exact: true })
    .fill('flowchart LR\n A["开始<br/>请求"] --> B["返回响应 🙂"]');
  const editable = frame.locator('[data-testid="editable"]');
  await editable.getByText('返回响应 🙂', { exact: true }).waitFor();
  await editable.getByRole('button', { name: '展开图表', exact: true }).first().click();
  await download(
    darkViewer.getByRole('button', { name: '下载 PNG', exact: true }),
    'unicode-multiline.png',
  );
  await page.keyboard.press('Escape');
  await darkViewer.waitFor({ state: 'hidden' });
  // Markdown uses the very same component, without panel-specific wiring.
  await frame
    .locator('[data-testid="markdown-diagrams"] [data-slot="mermaid-diagram"] > [role="button"]')
    .first()
    .click();
  await darkViewer.waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('iframe').getAttribute('sandbox'), 'allow-scripts');
  assert.deepEqual(errors, []);
  console.log(
    'Mermaid viewer: temporary success/error toasts, toast above dialog, real clipboard text/PNG, full PNG downloads, zoom/pan/fit, icon tooltips, three close paths, focus return, Markdown, light/en and dark/zh pass in the unchanged iframe sandbox.',
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
