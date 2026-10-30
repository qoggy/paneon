import { readPanelFixture } from '../panel-fixture.ts';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';
import {
  assertAnnotationEditorOpensAfterLocate,
  annotationTools,
  assertEditorBlocksAnnotationNavigation,
  openAnnotationDirectory,
  selectAnnotationText,
  submitAnnotations,
  waitForAnnotationScrollIdle,
} from './annotation-tools.mjs';

const root = await mkdtemp(join(tmpdir(), 'paneon-diff-annotations-'));
let service, browser;
try {
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    await readPanelFixture(new URL('./diff-annotations-fixture.txt', import.meta.url)),
  );
  service = await startServer(join(root, 'data'));
  await service.app.inject({
    method: 'POST',
    url: '/api/preferences',
    headers: {
      host: `127.0.0.1:${service.descriptor.port}`,
      authorization: `Bearer ${service.descriptor.controlToken}`,
    },
    payload: { ui: { language: 'zh-CN' } },
  });
  const panel = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'Diff annotation API', exact: true }).waitFor();
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const plain = frame.getByTestId('plain');
  const diff = frame.getByTestId('annotated');
  await diff.locator('[data-diff-column-layout]').waitFor();
  const panelIds = await frame
    .locator('[data-diff-column-layout] [data-panel]')
    .evaluateAll((panels) => panels.map((panel) => panel.id));
  assert.equal(
    new Set(panelIds).size,
    panelIds.length,
    'Multiple diff controllers have distinct panel IDs.',
  );
  const draft = async () => JSON.parse(await frame.locator('[data-diff-draft]').textContent());
  const annotations = annotationTools(frame, page);
  assert.match(await frame.locator('[data-expected-error]').textContent(), /must be different/);

  // Both diffs contain identical text: reveal and DOM ranges must stay within their own instance.
  assert.equal(await diff.locator('[data-line="12"]').count(), 0);
  await button('Reveal hidden text').click();
  await diff.locator('[data-code-side="new"][data-line="12"]').waitFor();
  assert.deepEqual(JSON.parse(await frame.locator('[data-geometry]').textContent()), {
    count: 1,
    quote: '重复',
    scoped: true,
    stale: 0,
  });
  assert.equal(await plain.locator('[data-line="12"]').count(), 0);
  await diff.locator('[data-code-side="new"][data-line="12"] [data-shiki-token]').first().waitFor();
  assert.equal(
    await diff.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return [...(CSS.highlights.get('paneon-diff-location') ?? [])]
        .map((range) => range.toString())
        .join('');
    }),
    '重复',
    'highlight survives asynchronous syntax-token DOM replacement',
  );
  await button('Reveal plain text').click();
  await plain.locator('[data-code-side="new"][data-line="12"]').waitFor();
  await button('Reveal hunk').click();
  await diff.locator('[data-diff-hunk="0"]').waitFor();
  assert.equal(await diff.locator('[data-line="12"]').count(), 0);
  await button('Reveal hidden text').click();
  await diff.locator('[data-code-side="new"][data-line="12"]').waitFor();

  const original = Array.from({ length: 120 }, (_, i) => `line ${i + 1} 重复 é🙂\r\n`).join('');
  const modified = original.replace('line 80', 'changed 80');
  async function save(selector, comment) {
    await selectAnnotationText(frame, selector, 0, 8);
    await annotations.write(comment);
    await annotations.save();
  }
  for (const side of ['old', 'new']) {
    await save(`[data-testid="annotated"] [data-code-side="${side}"][data-line="12"]`, side);
    const target = (await draft()).annotations.at(-1).targets[0];
    assert.deepEqual(target.ref, {
      documentId: 'plan-a',
      version: side === 'old' ? 'before' : 'after',
    });
    const source = side === 'old' ? original : modified;
    assert.equal(target.text.start, source.indexOf('line 12'));
    assert.equal(source.slice(target.text.start, target.text.end), target.text.quote);
  }
  const beforeMode = await draft();
  await button('Reveal hunk').click();
  assert.equal(await diff.locator('[data-code-side="old"][data-line="12"]').count(), 0);
  await annotations.locate(1);
  await waitForAnnotationScrollIdle(frame);
  assert.equal(
    await diff.evaluate(() => document.getSelection().isCollapsed),
    true,
    'Diff location uses scoped CSS highlights without leaving a native cross-column selection',
  );
  await button('Reveal hunk').click();
  await assertAnnotationEditorOpensAfterLocate(
    frame,
    '[data-testid="annotated"] [data-code-side="old"][data-line="12"]',
    async () => {
      await openAnnotationDirectory(frame);
      await button('编辑批注 1').click();
    },
  );
  await diff.locator('[data-code-side="old"][data-line="12"]').waitFor();
  const editInput = frame.getByLabel('批注内容', { exact: true });
  await editInput.and(frame.locator(':focus')).waitFor();
  assert.equal(await editInput.inputValue(), 'old');
  const sourceBox = await diff.locator('[data-code-side="old"][data-line="12"]').boundingBox();
  const editBox = await frame.locator('[data-annotation-editor]').boundingBox();
  assert.ok(Math.abs(editBox.y - sourceBox.y) < editBox.height + 60);
  await editInput.fill('Unsaved old-side correction');
  await waitForAnnotationScrollIdle(frame);
  const scroll = await diff
    .locator('[data-diff-viewport]')
    .evaluate((element) => element.scrollTop);
  await assertEditorBlocksAnnotationNavigation(frame, 2, async () => {
    assert.deepEqual(await draft(), beforeMode, 'Blocked navigation never saves an editor buffer');
    assert.equal(
      await diff.locator('[data-diff-viewport]').evaluate((element) => element.scrollTop),
      scroll,
    );
  });
  await editInput.press('Escape');
  await diff.getByRole('button', { name: '单列对比', exact: true }).click();
  await save('[data-testid="annotated"] [data-code-side="new"][data-line="12"]', 'unified');
  assert.deepEqual((await draft()).annotations[2].targets, beforeMode.annotations[1].targets);
  await button('Reveal hidden text').click();
  assert.equal(
    await diff.getByRole('button', { name: '左右对比', exact: true }).getAttribute('aria-pressed'),
    'true',
  );
  await submitAnnotations(frame);
  const events = (await service.runtime.events(panel.instanceId, 'diff-annotations', 100, 0))
    .events;
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].payload, await draft());

  await button('Refresh source').click();
  await submitAnnotations(frame);
  await frame.locator('[data-submit-error]').filter({ hasText: /stale/ }).waitFor();
  assert.equal(
    (await service.runtime.events(panel.instanceId, 'diff-annotations', 100, 0)).events.length,
    1,
  );
  assert.equal((await draft()).annotations.length, 3, 'stale submission preserves every draft');
  await button('Restore source').click();
  await button('Reveal hidden text').click();
  await button('Only new').click();
  await diff.locator('[data-code-side="old"][data-line="12"]').evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  assert.equal(await frame.getByRole('button', { name: '批注', exact: true }).count(), 0);
  await save('[data-testid="annotated"] [data-code-side="new"][data-line="12"]', 'only-new');

  for (const side of ['old', 'new']) {
    await selectAnnotationText(frame, `[data-testid="falsy"] [data-code-side="${side}"]`, 0, 4);
    await annotations.save();
    assert.equal((await draft()).annotations.at(-1).targets[0].ref, side === 'old' ? false : null);
  }
  assert.equal((await draft()).annotations.length, 6);
  assert.deepEqual(errors, []);
  console.log(
    'Diff annotation API passed: generic and falsy refs, optional sides, instance-scoped reveal, hidden context, unified offsets, explicit submit and stale-source rejection.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
