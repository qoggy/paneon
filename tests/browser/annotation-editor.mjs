import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../dist/runtime/server.js';

const root = await mkdtemp(join(tmpdir(), 'paneon-annotation-editor-'));
const evidence = process.env.PANEON_TEST_SCREENSHOTS ?? '/tmp/paneon-annotation-editor-evidence';
let service, browser;
try {
  await mkdir(evidence, { recursive: true });
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
  await frame.getByRole('heading', { name: 'Annotation editor acceptance' }).waitFor();
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const editor = frame.getByRole('dialog');
  const draft = async () => JSON.parse(await frame.getByTestId('draft').textContent());
  const events = async () => {
    const response = await service.app.inject({
      method: 'GET',
      url: `/api/panels/${panel.instanceId}/events?consumer=editor-acceptance`,
      headers: {
        host: `127.0.0.1:${service.descriptor.port}`,
        authorization: `Bearer ${service.descriptor.controlToken}`,
      },
    });
    assert.equal(response.statusCode, 200);
    return response.json().data;
  };
  const terms = {
    en: {
      overall: 'Overall annotation',
      input: 'Annotation text',
      del: 'Delete annotation',
      save: 'Save',
      cancel: 'Cancel',
      submit: 'Submit annotations',
      select: 'Select objects',
      finish: 'Finish selecting',
      annotate: 'Annotation',
    },
    'zh-CN': {
      overall: '整体批注',
      input: '批注内容',
      del: '删除批注',
      save: '保存',
      cancel: '取消',
      submit: '提交批注',
      select: '选择对象',
      finish: '结束选择',
      annotate: '批注',
    },
  };
  const combinations = [];
  for (const [theme, language] of [
    ['light', 'en'],
    ['dark', 'en'],
    ['dark', 'zh-CN'],
    ['light', 'zh-CN'],
  ]) {
    await page.evaluate(
      async (ui) => {
        const result = await fetch('/api/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ui }),
        });
        if (!result.ok) throw new Error(`Preferences returned ${result.status}`);
      },
      { theme, language },
    );
    await frame.locator(`html[lang="${language}"][data-theme="${theme}"]`).waitFor();
    const t = terms[language];
    const input = frame.getByRole('textbox', { name: t.input, exact: true });
    assert.equal(await button(t.select).count(), 0);
    assert.equal(await button(t.finish).count(), 0);
    const text = frame.locator('[data-testid=target] [data-feedback-text]');
    const rect = await text.boundingBox();
    assert.ok(rect);
    await page.mouse.move(rect.x, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width, rect.y + rect.height / 2, { steps: 12 });
    await page.mouse.up();
    await button(t.annotate).click();
    assert.equal(await editor.locator(':scope > div.text-sm').count(), 0);
    assert.equal(
      await editor.getByText(/Selected .* locations|已选.*位置|已选择.*位置/).count(),
      0,
    );
    assert.equal(await editor.getByRole('button', { name: t.del, exact: true }).count(), 0);
    await input.fill('whole paragraph');
    await button(t.save).click();
    await editor.waitFor({ state: 'hidden' });
    const paragraph = (await draft()).annotations[0];
    assert.deepEqual(paragraph.targets[0].text, {
      start: 0,
      end: 'Shared annotation target'.length,
      quote: 'Shared annotation target',
    });
    assert.equal((await events()).events.length, 0);
    const marker = frame.locator(`[data-feedback-marker="${paragraph.id}"]`);
    await marker.click();
    await input.fill('discard this edit');
    await button(t.cancel).click();
    assert.equal((await draft()).annotations[0].comment, 'whole paragraph');
    await marker.click();
    await input.fill('');
    await button(t.save).click();
    assert.equal((await draft()).annotations[0].comment, '');
    assert.equal((await draft()).annotations[0].id, paragraph.id);
    await marker.click();
    if (theme === 'light' && language === 'zh-CN') {
      await page.setViewportSize({ width: 360, height: 640 });
      const bounds = await editor.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 360);
      await page.screenshot({ path: join(evidence, 'narrow-zh-CN.png') });
      await page.setViewportSize({ width: 1100, height: 760 });
    }
    await page.screenshot({ path: join(evidence, `paragraph-${theme}-${language}.png`) });
    await button(t.del).click();
    assert.equal((await draft()).annotations.length, 0);
    await button(t.overall).click();
    assert.equal(await editor.getAttribute('aria-label'), t.overall);
    assert.equal(await editor.getByText(t.overall, { exact: true }).count(), 0);
    assert.equal(await button(t.overall).count(), 1);
    const del = editor.getByRole('button', { name: t.del, exact: true });
    assert.equal(await del.getAttribute('title'), t.del);
    assert.equal((await del.textContent()).trim(), '');
    assert.equal(await del.locator('svg[aria-hidden=true]').count(), 1);
    assert.equal(await del.getAttribute('data-size'), 'icon-sm');
    assert.equal(await del.getAttribute('data-variant'), 'ghost');
    await input.fill(`draft-${theme}-${language}`);
    await button(t.cancel).click();
    await editor.waitFor({ state: 'hidden' });
    assert.equal(
      await button(t.overall).evaluate((element) => element === document.activeElement),
      true,
    );
    assert.equal((await draft()).comment ?? '', '');
    await button(t.overall).click();
    await input.fill('discard using Escape');
    await page.keyboard.press('Escape');
    assert.equal(
      await button(t.overall).evaluate((element) => element === document.activeElement),
      true,
    );
    assert.equal((await draft()).comment ?? '', '');
    await button(t.overall).click();
    await input.fill(`saved-${theme}-${language}`);
    await page.keyboard.press('ControlOrMeta+Enter');
    await editor.waitFor({ state: 'hidden' });
    assert.equal((await draft()).comment, `saved-${theme}-${language}`);
    assert.equal((await events()).events.length, 0);
    await button(t.overall).click();
    await button('Disabled no').focus();
    await page.keyboard.press('Enter');
    assert.equal(await del.isDisabled(), true);
    assert.equal(await button(t.save).isDisabled(), true);
    assert.equal(await button(t.cancel).isDisabled(), true);
    assert.equal(await input.isDisabled(), true);
    await button('Disabled yes').focus();
    await page.keyboard.press('Enter');
    await page.screenshot({ path: join(evidence, `${theme}-${language}.png`) });
    await del.focus();
    await page.keyboard.press('Enter');
    await editor.waitFor({ state: 'hidden' });
    assert.equal((await draft()).comment ?? '', '');
    await button(t.overall).click();
    await del.click();
    await editor.waitFor({ state: 'hidden' });
    assert.equal((await draft()).comment ?? '', '');
    assert.equal((await events()).events.length, 0);
    combinations.push({
      theme,
      language,
      compactAccessibleEditor: true,
      cancelEscapeSaveDelete: true,
    });
  }
  const t = terms['zh-CN'];
  // Explicit opt-in retains object mode and its pending action.
  await button('Object controls off').click();
  await button(t.select).click();
  await frame.getByTestId('target').click();
  await button(t.annotate).waitFor();
  await button('Object controls on').click();
  assert.equal(await button(t.finish).count(), 0);
  assert.equal(await button(t.annotate).count(), 0);
  await button('Object controls off').click();
  await button(t.annotate).click();
  assert.equal(await editor.getByText('添加批注', { exact: true }).count(), 0);
  await frame.getByRole('textbox', { name: t.input, exact: true }).fill('object annotation');
  await button(t.save).click();
  await editor.waitFor({ state: 'hidden' });
  await button(t.finish).click();
  const first = (await draft()).annotations[0];
  assert.equal(first.comment, 'object annotation');
  await button('Object controls on').click();
  assert.equal(await button(t.select).count(), 0);
  assert.equal(await button(t.finish).count(), 0);
  assert.equal(await button('Toolbar child').count(), 1);
  const catalog = button('批注 (1)');
  const objectNumber = await frame
    .locator(`[data-feedback-marker="${first.id}"]`)
    .getAttribute('data-feedback-number');
  await catalog.click();
  await button(`定位批注 ${objectNumber} 的位置 1`).click();
  assert.equal(await frame.getByTestId('located').textContent(), 'shared');
  await catalog.click();
  await button(`编辑批注 ${objectNumber}`).click();
  assert.equal(await editor.getByText(/^批注 \d+$/).count(), 0);
  assert.equal((await draft()).annotations[0].id, first.id);
  await button(t.del).click();
  await editor.waitFor({ state: 'hidden' });
  assert.equal((await draft()).annotations.length, 0);
  // Native text selection remains available while no object controls are shown.
  const text = frame.locator('[data-testid=target] [data-feedback-text]');
  const rect = await text.boundingBox();
  assert.ok(rect);
  await page.mouse.move(rect.x + 1, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + 60, rect.y + rect.height / 2, { steps: 8 });
  await page.mouse.up();
  await button(t.annotate).click();
  await frame.getByRole('textbox', { name: t.input, exact: true }).fill('text annotation');
  await button(t.save).click();
  assert.equal((await draft()).annotations.length, 1);
  assert.equal((await draft()).annotations[0].targets[0].text.quote.length > 0, true);
  await button(t.overall).click();
  await frame
    .getByRole('textbox', { name: t.input, exact: true })
    .fill('overall saved independently');
  await button(t.submit).click();
  await frame.getByRole('alert').waitFor();
  assert.equal((await events()).events.length, 0);
  await button(t.save).click();
  assert.equal((await events()).events.length, 0);
  const submitted = page.waitForResponse(
    (response) => response.url().includes('/events') && response.request().method() === 'POST',
  );
  await button(t.submit).click();
  await submitted;
  assert.equal((await events()).events.length, 1);
  assert.deepEqual(errors, []);
  const result = {
    ok: true,
    combinations,
    defaultObjectSelection: false,
    explicitObjectOptIn: true,
    wholeParagraphExactOffsets: true,
    emptyAnnotationRetainsId: true,
    narrowEditorFits: true,
    disabledObjectControlsRetainCatalog: true,
    stableAnnotationNumber: true,
    nativeTextSelection: true,
    saveSubmitIsolation: true,
    errors,
  };
  await writeFile(join(evidence, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
