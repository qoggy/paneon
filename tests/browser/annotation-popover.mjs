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
  await input.fill('Unsaved text survives outside interaction and scrolling');
  assert.equal(await editor.getAttribute('data-slot'), 'popover-content');
  assert.notEqual(await editor.getAttribute('aria-modal'), 'true');
  await frame.getByRole('button', { name: 'Toolbar child', exact: true }).click();
  assert.equal(await editor.isVisible(), true);
  assert.equal(await input.inputValue(), 'Unsaved text survives outside interaction and scrolling');
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
  assert.equal(await input.inputValue(), 'Unsaved text survives outside interaction and scrolling');
  await page.screenshot({ path: '/tmp/paneon-annotation-popover-scroll.png', fullPage: true });
  await input.press('Escape');
  await editor.waitFor({ state: 'hidden' });
  await selectAnnotationText(frame, '[data-testid=target] [data-annotation-text]', 0, 6);
  await frame.getByRole('button', { name: 'Annotation', exact: true }).click();
  await input.fill('Keep original source mapping');
  await input.press('ControlOrMeta+Enter');
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
  assert.deepEqual(errors, []);
  console.log(
    'PASS annotation Popover: nonmodal, outside interaction preserves edits, scrolling follows source, Escape/save, exact text mapping and explicit submit.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
