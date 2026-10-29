import { readPanelFixture } from '../panel-fixture.ts';
import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { annotationTools, selectDiffLines } from './annotation-tools.mjs';

const root = await mkdtemp(join(tmpdir(), 'paneon-diff-boundaries-'));
const evidence = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-diff-boundaries';
let service, browser;
try {
  const { startServer } = await import(new URL('../runtime-fixture.ts', import.meta.url));
  await cp(new URL('../../skills/paneon/assets/shared/', import.meta.url), join(root, 'shared'), {
    recursive: true,
  });
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    await readPanelFixture(new URL('./diff-boundaries-fixture.txt', import.meta.url)),
  );
  service = await startServer(join(root, 'data'));
  const prefs = async (theme, language) =>
    service.app.inject({
      method: 'POST',
      url: '/api/preferences',
      headers: {
        host: `127.0.0.1:${service.descriptor.port}`,
        authorization: `Bearer ${service.descriptor.controlToken}`,
      },
      payload: { ui: { theme, language } },
    });
  await prefs('light', 'zh-CN');
  const panel = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const viewport = frame.locator('[data-boundary-viewport]');
  const counter = button('定位当前差异');
  await counter.waitFor();
  assert.equal(await counter.textContent(), '1 / 2 处差异');
  await button('下一个差异').click();
  assert.equal(await counter.textContent(), '2 / 2 处差异');
  async function assertLineVisible(number) {
    const line = await frame.locator(`[data-code-side="new"][data-line="${number}"]`).boundingBox();
    const header = await frame.locator('[data-diff-header]').boundingBox();
    const clip = await viewport.boundingBox();
    assert.ok(
      line.y >= header.y + header.height - 1 && line.y < clip.y + clip.height,
      `change line ${number} must be visible below the sticky header`,
    );
  }
  await assertLineVisible(115);
  for (const mode of ['单列对比', '左右对比']) {
    await button(mode).click();
    await assertLineVisible(115);
    await button('收起上下文').click();
    await counter.click();
    await assertLineVisible(115);
    assert.equal(await counter.textContent(), '2 / 2 处差异');
    await button('展开全部上下文').click();
  }
  await button('上一个差异').click();

  // A continuous registered text range spans the scrolling edges.
  await selectDiffLines(frame, 'new', 33, 40);
  const annotations = annotationTools(frame, page);
  await annotations.write('Several targets must remain inside their code viewport');
  await annotations.save();

  await mkdir(evidence, { recursive: true });
  async function assertClippedMarkers() {
    await viewport.evaluate(async (element) => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      return element.scrollTop;
    });
    const geometry = await frame.locator('[data-annotation-surface]').evaluate((surface) => {
      const viewport = document.querySelector('[data-boundary-viewport]').getBoundingClientRect();
      const header = document.querySelector('[data-diff-header]').getBoundingClientRect();
      const pane =
        document.querySelector('[data-diff-scroll="new"]')?.getBoundingClientRect() ??
        document.querySelector('[data-diff-scroll="unified"]').getBoundingClientRect();
      return {
        top: Math.max(viewport.top, header.bottom),
        bottom: Math.min(innerHeight, viewport.bottom),
        left: Math.max(0, pane.left),
        right: Math.min(innerWidth, pane.right),
        markers: [...surface.querySelectorAll('[data-annotation-marker]')].map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        }),
      };
    });
    for (const marker of geometry.markers) {
      assert.ok(
        marker.top >= geometry.top - 0.5 && marker.bottom <= geometry.bottom + 0.5,
        JSON.stringify(geometry),
      );
      assert.ok(
        marker.left >= geometry.left - 0.5 && marker.right <= geometry.right + 0.5,
        JSON.stringify(geometry),
      );
    }
    return geometry.markers.length;
  }
  // Move the source through the sticky header, both viewport edges and offscreen.
  for (const line of [33, 36, 40, 42, 47, 80]) {
    await viewport.evaluate((element, number) => {
      const line = element.querySelector(`[data-code-side="new"][data-line="${number}"]`);
      const header = element.querySelector('[data-diff-header]').getBoundingClientRect();
      element.scrollTo({
        top: element.scrollTop + line.getBoundingClientRect().top - header.bottom - 2,
        behavior: 'instant',
      });
    }, line);
    const count = await assertClippedMarkers();
    if (line === 33 || line === 36)
      assert.ok(count > 0, 'partly visible target groups retain markers');
  }
  assert.equal(
    await frame.locator('[data-annotation-marker]').count(),
    0,
    'fully scrolled-out targets leave no badges in history or toolbar',
  );
  await annotations.locate(1, 1);
  assert.ok((await assertClippedMarkers()) > 0);
  await page.screenshot({ path: join(evidence, 'markers-light.png') });
  await prefs('dark', 'zh-CN');
  await frame.locator('html[data-theme="dark"]').waitFor();
  await assertClippedMarkers();
  await page.screenshot({ path: join(evidence, 'markers-dark.png') });
  if (!process.env.PANEON_TEST_DESKTOP_ONLY) {
    await page.setViewportSize({ width: 390, height: 844 });
    await counter.click();
    await assertClippedMarkers();
    await page.screenshot({ path: join(evidence, 'markers-narrow.png') });
  }
  assert.equal(await annotations.count(), 1);
  assert.deepEqual(errors, []);
  console.log(
    'PASS distinct edits inside one contextual hunk, mode/context navigation, text-range annotation marker clipping under sticky header and scroll edges, dark theme.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
