import {
  openAnnotationDirectory,
  selectAnnotationText,
  submitAnnotations,
} from './annotation-tools.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';

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
    headless: process.env.PANEON_TEST_HEADLESS !== '0',
    executablePath: process.env.PANEON_TEST_BROWSER,
    channel: process.env.PANEON_TEST_BROWSER
      ? undefined
      : (process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome'),
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'Annotation editor acceptance' }).waitFor();
  // Rerendering a configured page keeps exactly one built-in surface and entry.
  assert.equal(await frame.locator('[data-annotation-surface]').count(), 1);
  const button = (name) => frame.getByRole('button', { name, exact: true });
  for (let i = 0; i < 3; i++) {
    await button(`Rerender page ${i}`).click();
    assert.equal(await frame.locator('[data-annotation-launcher]').count(), 1);
    assert.equal(await frame.locator('[data-annotation-surface]').count(), 1);
  }
  const editor = frame.locator('[data-annotation-editor]');
  const draft = async () => JSON.parse(await frame.getByTestId('draft').textContent());
  const locateCount = async () =>
    Number(await frame.getByTestId('located').getAttribute('data-locate-count'));
  const waitForLocate = async (count) =>
    frame.locator(`[data-testid="located"][data-locate-count="${count}"]`).waitFor();
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
    assert.equal(
      await frame
        .getByRole('button', { name: /^(Overall annotation|整体批注)$/, exact: true })
        .count(),
      0,
    );
    assert.equal('comment' in (await draft()), false);
    const input = frame.getByRole('textbox', { name: t.input, exact: true });
    assert.equal(await button(t.select).count(), 0);
    assert.equal(await button(t.finish).count(), 0);
    const menu = frame.getByRole('dialog', {
      name: language === 'en' ? 'Annotation directory' : '批注目录',
    });
    const menuTrigger = frame.getByRole('button', {
      name: language === 'en' ? 'Annotations (0)' : '批注 (0)',
      exact: true,
    });
    assert.equal(await button(t.submit).isVisible(), false);
    await menuTrigger.hover();
    await menu.waitFor();
    assert.equal(await button(t.submit).count(), 0);
    await menu.locator('[data-slot="empty"]').waitFor();
    assert.equal(
      await menu
        .getByText(language === 'en' ? 'No annotations yet' : '暂无批注', { exact: true })
        .isVisible(),
      true,
    );
    await menu.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );
    const emptyBox = await menu.boundingBox();
    assert.equal(emptyBox.width, 336);
    assert.ok(emptyBox.height < 120, `Compact empty state height: ${emptyBox.height}`);
    await menu.screenshot({ path: join(evidence, `empty-${theme}-${language}.png`) });
    assert.equal((await events()).events.length, 0);
    await menu.hover();
    assert.equal(await menu.isVisible(), true);
    await page.mouse.move(1050, 700);
    await menu.waitFor({ state: 'hidden' });
    await menuTrigger.focus();
    await page.keyboard.press('Enter');
    await menu.waitFor();
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'hidden' });
    const text = frame.locator('[data-testid=target] [data-annotation-text]');
    const rect = await text.boundingBox();
    assert.ok(rect);
    await page.mouse.move(rect.x, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width, rect.y + rect.height / 2, { steps: 12 });
    await page.mouse.up();
    const scrollBeforeEditor = await text.evaluate(() => window.scrollY);
    await button(t.annotate).click();
    await input.and(frame.locator(':focus')).waitFor();
    assert.equal(
      await text.evaluate(() => window.scrollY),
      scrollBeforeEditor,
      'Focusing the editor does not scroll away from the selected source',
    );
    assert.equal(await editor.locator(':scope > div.text-sm').count(), 0);
    assert.equal(
      await editor.getByText(/Selected .* locations|已选.*位置|已选择.*位置/).count(),
      0,
    );
    assert.equal(await editor.getByRole('button', { name: t.del, exact: true }).count(), 0);
    assert.equal(await editor.getByRole('button', { name: t.cancel, exact: true }).count(), 1);
    const saveTooltip = frame.locator('[data-slot="tooltip-content"]').filter({
      has: frame.locator('kbd[aria-label="Shift+Enter"]'),
    });
    await input.and(frame.locator(':focus')).waitFor();
    await button(t.save).hover();
    await saveTooltip.and(frame.locator('[data-open]')).waitFor();
    assert.equal(await saveTooltip.getByText(t.save, { exact: true }).count(), 1);
    assert.equal(
      await saveTooltip.getByText(language === 'en' ? 'New line' : '换行', { exact: true }).count(),
      1,
    );
    assert.equal(await saveTooltip.locator('kbd[aria-label="Enter"]').count(), 1);
    await saveTooltip.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );
    await page.screenshot({ path: join(evidence, `save-tooltip-${theme}-${language}.png`) });
    await input.click();
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
    const directoryButton = frame.getByRole('button', {
      name: language === 'en' ? 'Annotations (1)' : '批注 (1)',
      exact: true,
    });
    const directory = frame.getByLabel(language === 'en' ? 'Annotation directory' : '批注目录', {
      exact: true,
    });
    const number = await frame
      .locator(`[data-annotation-marker="${paragraph.id}"]`)
      .getAttribute('data-annotation-number');
    await directoryButton.click();
    const item = directory.locator(`[data-annotation-id="${paragraph.id}"]`);
    assert.ok((await item.textContent()).includes('Shared annotation target'));
    assert.ok((await item.textContent()).includes('whole paragraph'));
    assert.equal(await item.getByRole('button').count(), 3);
    const row = item.getByRole('button', {
      name: language === 'en' ? `Locate annotation ${number}` : `定位批注 ${number}`,
      exact: true,
    });
    await directory.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );
    const submitAction = directory.locator('[data-annotation-submit] button');
    assert.equal(await submitAction.getAttribute('data-variant'), 'ghost');
    assert.equal(
      await submitAction
        .getByText(language === 'en' ? '1 annotation' : '1 条批注', { exact: true })
        .count(),
      1,
    );
    const actionBox = await submitAction.boundingBox();
    const rowBox = await row.boundingBox();
    assert.ok(actionBox.y >= rowBox.y + rowBox.height, 'Submit action is below the list');
    assert.ok(
      actionBox.width >= (await directory.boundingBox()).width - 12,
      'The whole footer row is clickable',
    );
    const idleBackground = await submitAction.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await submitAction.hover();
    await submitAction.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );
    assert.notEqual(
      await submitAction.evaluate((element) => getComputedStyle(element).backgroundColor),
      idleBackground,
    );
    await directory.screenshot({ path: join(evidence, `submit-action-${theme}-${language}.png`) });
    assert.equal(await row.getByRole('button').count(), 0);
    assert.equal(
      await row
        .getByText(language === 'en' ? 'Annotation target:' : '批注位置：', { exact: true })
        .isVisible(),
      true,
    );
    assert.equal(
      await row
        .getByText(language === 'en' ? 'User annotation:' : '用户批注：', { exact: true })
        .isVisible(),
      true,
    );
    for (const action of [language === 'en' ? 'Edit annotation' : '编辑批注', t.del]) {
      const icon = item.getByRole('button', { name: `${action} ${number}`, exact: true });
      assert.equal((await icon.textContent()).trim(), '');
      assert.equal(await icon.getAttribute('title'), null);
      await icon.focus();
      // Exercise keyboard focus; programmatic focus after a pointer click is not focus-visible.
      await icon.press('Shift+Tab');
      await page.keyboard.press('Tab');
      assert.equal(await icon.evaluate((element) => element.matches(':focus-visible')), true);
      await frame.locator('[data-slot=\"tooltip-content\"]').filter({ hasText: action }).waitFor();
      await icon.press('Escape');
      await frame
        .locator('[data-slot=\"tooltip-content\"]')
        .filter({ hasText: action })
        .waitFor({ state: 'hidden' });
      assert.equal(await icon.locator('svg[aria-hidden=true]').count(), 1);
    }
    await directory.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );
    await page.screenshot({ path: join(evidence, `directory-${theme}-${language}.png`) });
    let calls = await locateCount();
    // Whitespace, selected text, annotation text and number belong to the same native button.
    await row.click({ position: { x: 5, y: 5 } });
    await waitForLocate(++calls);
    await directory.waitFor({ state: 'hidden' });
    await editor.waitFor({ state: 'hidden' });
    assert.equal(await frame.getByTestId('located').textContent(), 'shared');
    for (const label of ['Shared annotation target', 'whole paragraph', `${number}.`]) {
      await directoryButton.click();
      await row.getByText(label, { exact: true }).click();
      await waitForLocate(++calls);
      await directory.waitFor({ state: 'hidden' });
      await editor.waitFor({ state: 'hidden' });
    }
    await directoryButton.click();
    await item
      .getByRole('button', {
        name: `${language === 'en' ? 'Edit annotation' : '编辑批注'} ${number}`,
        exact: true,
      })
      .click();
    await editor.waitFor();
    await waitForLocate(++calls);
    assert.equal(await input.inputValue(), 'whole paragraph');
    await input.and(frame.locator(':focus')).waitFor();
    assert.deepEqual(
      await input.evaluate((element) => [element.selectionStart, element.selectionEnd]),
      ['whole paragraph'.length, 'whole paragraph'.length],
    );
    await input.press('!');
    assert.equal(await input.inputValue(), 'whole paragraph!');
    await input.press('Escape');
    const marker = frame.locator(`[data-annotation-marker="${paragraph.id}"]`);
    await marker.click();
    await input.and(frame.locator(':focus')).waitFor();
    assert.deepEqual(
      await input.evaluate((element) => [element.selectionStart, element.selectionEnd]),
      ['whole paragraph'.length, 'whole paragraph'.length],
    );
    await input.press('Home');
    await input.press('X');
    assert.equal(await input.inputValue(), 'Xwhole paragraph');
    assert.equal(
      await input.evaluate((element) => element.selectionStart),
      1,
      'Typing must preserve a manually moved caret',
    );
    await input.fill('discard this edit');
    await button(t.cancel).click();
    await editor.waitFor({ state: 'hidden' });
    assert.equal((await draft()).annotations[0].comment, 'whole paragraph');
    await marker.click();
    await input.fill('');
    await button(t.save).click();
    await editor.waitFor({ state: 'hidden' });
    assert.equal((await draft()).annotations[0].comment, '');
    assert.equal((await draft()).annotations[0].id, paragraph.id);
    await directoryButton.click();
    await directory.waitFor();
    assert.equal(
      await row
        .getByText(language === 'en' ? 'User annotation:' : '用户批注：', { exact: true })
        .count(),
      0,
    );
    assert.equal(
      await row.getByText('Shared annotation target', { exact: true }).isVisible(),
      true,
    );
    assert.equal(await item.getByRole('button').count(), 3);
    await page.keyboard.press('Escape');
    await directory.waitFor({ state: 'hidden' });
    await marker.click();
    await input.and(frame.locator(':focus')).waitFor();
    await editor.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );
    await page.screenshot({ path: join(evidence, `paragraph-${theme}-${language}.png`) });
    const del = editor.getByRole('button', { name: t.del, exact: true });
    assert.equal(
      await editor.getAttribute('aria-label'),
      language === 'en' ? 'Edit annotation' : '编辑批注',
    );
    assert.equal(await del.getAttribute('title'), null);
    await del.hover();
    await frame.locator('[data-slot=\"tooltip-content\"]').filter({ hasText: t.del }).waitFor();
    await input.click();
    assert.equal((await del.textContent()).trim(), '');
    assert.equal(await del.locator('svg[aria-hidden=true]').count(), 1);
    assert.equal(await del.getAttribute('data-size'), 'icon-sm');
    assert.equal(await del.getAttribute('data-variant'), 'ghost');
    await input.fill(`draft-${theme}-${language}`);
    await input.press('Escape');
    await editor.waitFor({ state: 'hidden' });
    await marker.and(frame.locator(':focus')).waitFor();
    assert.equal(await marker.evaluate((element) => element === document.activeElement), true);
    assert.equal((await draft()).annotations[0].comment, '');
    await marker.click();
    await input.fill('discard using Escape');
    await page.keyboard.press('Escape');
    await marker.and(frame.locator(':focus')).waitFor();
    assert.equal(await marker.evaluate((element) => element === document.activeElement), true);
    assert.equal((await draft()).annotations[0].comment, '');
    await marker.click();
    await input.fill(`saved-${theme}-${language}`);
    await page.keyboard.press('Enter');
    await editor.waitFor({ state: 'hidden' });
    assert.equal((await draft()).annotations[0].comment, `saved-${theme}-${language}`);
    assert.equal((await events()).events.length, 0);
    await button('Disabled no').focus();
    await page.keyboard.press('Enter');
    assert.equal(await marker.isDisabled(), true);
    await button('Disabled yes').focus();
    await page.keyboard.press('Enter');
    await marker.click();
    await page.screenshot({ path: join(evidence, `${theme}-${language}.png`) });
    await del.focus();
    await page.keyboard.press('Enter');
    await editor.waitFor({ state: 'hidden' });
    assert.deepEqual(await draft(), { annotations: [] });
    assert.equal((await events()).events.length, 0);
    combinations.push({
      theme,
      language,
      compactAccessibleEditor: true,
      shortcutTooltip: true,
      editCaretAtEnd: true,
      escapeSaveDelete: true,
    });
  }
  const t = terms['zh-CN'];
  assert.equal(await frame.locator('[data-annotation-surface]').count(), 1);
  assert.equal(await button(t.submit).isVisible(), false);
  const targetText = frame.locator('[data-testid=target] [data-annotation-text]');
  const targetRect = await targetText.boundingBox();
  await page.mouse.move(targetRect.x, targetRect.y + targetRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetRect.x + targetRect.width, targetRect.y + targetRect.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await button(t.annotate).click();
  await frame.getByRole('textbox', { name: t.input, exact: true }).fill('text annotation');
  await button(t.save).click();
  await editor.waitFor({ state: 'hidden' });
  const first = (await draft()).annotations[0];
  assert.equal(first.comment, 'text annotation');
  await selectAnnotationText(frame, '[data-testid=target] [data-annotation-text]', 0, 6);
  await button(t.annotate).click();
  await frame.getByRole('textbox', { name: t.input, exact: true }).fill('保留这条批注');
  await button(t.save).click();
  await editor.waitFor({ state: 'hidden' });
  const second = (await draft()).annotations[1];
  assert.equal(await frame.locator('[data-annotation-surface]').count(), 1);
  assert.equal(await button(t.select).count(), 0);
  assert.equal(await button(t.finish).count(), 0);
  assert.equal(await button('Toolbar child').count(), 1);
  const catalog = frame.getByRole('button', { name: /^批注 \(\d+\)$/ });
  const objectNumber = await frame
    .locator(`[data-annotation-marker="${first.id}"]`)
    .getAttribute('data-annotation-number');
  await catalog.click();
  const directory = frame.getByRole('dialog', { name: '批注目录', exact: true });
  await directory.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  await directory.screenshot({ path: join(evidence, 'directory-two-annotations.png') });
  assert.equal(await directory.locator('[data-annotation-id]').count(), 2);
  assert.equal(
    await directory.getByRole('button', { name: /^(编辑批注|删除批注) \d+$/ }).count(),
    4,
  );
  await button(`定位批注 ${objectNumber}`).click();
  assert.equal(await frame.getByTestId('located').textContent(), 'shared');
  await catalog.click();
  await button(`编辑批注 ${objectNumber}`).click();
  assert.equal(await editor.getByText(/^批注 \d+$/).count(), 0);
  assert.equal((await draft()).annotations[0].id, first.id);
  await frame.getByRole('textbox', { name: t.input, exact: true }).press('Escape');
  await editor.waitFor({ state: 'hidden' });
  await catalog.click();
  const beforeDeleteLocate = await locateCount();
  await button(`删除批注 ${objectNumber}`).click();
  assert.equal(await frame.locator(`[data-annotation-id="${first.id}"]`).count(), 0);
  await frame.locator(`[data-annotation-marker="${first.id}"]`).waitFor({ state: 'detached' });
  assert.equal((await draft()).annotations.length, 1);
  assert.equal((await draft()).annotations[0].id, second.id);
  assert.equal(await locateCount(), beforeDeleteLocate);
  const secondNumber = await frame
    .locator(`[data-annotation-marker="${second.id}"]`)
    .getAttribute('data-annotation-number');
  await button(`删除批注 ${secondNumber}`).click();
  assert.equal((await draft()).annotations.length, 0);
  await page.keyboard.press('Escape');
  await directory.waitFor({ state: 'detached' });
  // Native text selection remains available while no object controls are shown.
  const text = frame.locator('[data-testid=target] [data-annotation-text]');
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
  await selectAnnotationText(frame, '[data-testid=target] [data-annotation-text]', 0, 6);
  await button(t.annotate).click();
  await frame.getByRole('textbox', { name: t.input, exact: true }).fill('saved independently');
  await button(t.save).click();
  assert.equal((await events()).events.length, 0);
  const submitted = page.waitForResponse(
    (response) => response.url().includes('/events') && response.request().method() === 'POST',
  );
  await openAnnotationDirectory(frame);
  const finalSubmit = frame.locator('[data-annotation-submit] button');
  const finalSubmitBox = await finalSubmit.boundingBox();
  await finalSubmit.click({
    position: { x: finalSubmitBox.width - 8, y: finalSubmitBox.height / 2 },
  });
  await submitted;
  assert.equal((await events()).events.length, 1);
  const launcher = frame.locator('[data-annotation-launcher]');
  const beforeScroll = await launcher.boundingBox();
  await frame.locator('main').evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await frame
    .locator('main')
    .evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  assert.deepEqual(
    await launcher.boundingBox(),
    beforeScroll,
    'Entry stays fixed while the document scrolls',
  );
  await openAnnotationDirectory(frame);
  const floatingDirectory = frame.getByRole('dialog', { name: '批注目录', exact: true });
  await floatingDirectory.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  const floatingBox = await floatingDirectory.boundingBox();
  assert.ok(
    floatingBox.y + floatingBox.height <= beforeScroll.y,
    'Directory opens above the entry',
  );
  await page.screenshot({ path: join(evidence, 'floating-directory-scrolled.png') });
  await page.keyboard.press('Escape');
  await floatingDirectory.waitFor({ state: 'hidden' });
  const savedBeforeConfigurationChange = await draft();
  await button('Annotations enabled yes').click();
  assert.equal(await launcher.count(), 0);
  assert.equal(await frame.locator('[data-annotation-surface]').count(), 0);
  await button('Annotations enabled no').click();
  assert.equal(await launcher.count(), 1);
  assert.equal(await frame.locator('[data-annotation-surface]').count(), 1);
  assert.deepEqual(
    await draft(),
    savedBeforeConfigurationChange,
    'Re-enabling uses the same page session',
  );
  assert.deepEqual(errors, []);
  const result = {
    ok: true,
    combinations,
    defaultObjectSelection: false,
    objectSelectionRemoved: true,
    wholeParagraphExactOffsets: true,
    emptyAnnotationRetainsId: true,
    singleFloatingEntry: true,
    configurationLifecycle: true,
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
