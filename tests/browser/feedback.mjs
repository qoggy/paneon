import { submitAnnotations } from './annotation-tools.mjs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startFeedbackFixture } from './feedback-fixture.mjs';

const fixture = await startFeedbackFixture();
const execute = promisify(execFile);
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(fixture.url);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'Annotation acceptance', exact: true }).waitFor();
  if (process.env.PANEON_TEST_SCREENSHOTS)
    await mkdir(process.env.PANEON_TEST_SCREENSHOTS, { recursive: true });
  const content = page.frames().find((candidate) => candidate.url().endsWith('/frame.html'));
  assert.ok(content);
  const draft = async () => JSON.parse(await frame.getByTestId('draft').textContent());
  const button = (name) => frame.getByRole('button', { name, exact: true });
  // Center fixture-only commands before native clicks in full-height iframe hosts.
  const clickFixtureButton = async (name) => {
    await button(name).evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await button(name).click();
  };

  const editor = frame.locator('[data-annotation-editor]');
  const input = frame.getByRole('textbox', { name: '批注内容', exact: true });
  const marker = (number) => button(`批注 ${number}`);
  const markerFor = (id) => frame.locator(`[data-annotation-marker="${id}"]`);
  const latestMarker = async () => markerFor((await draft()).annotations.at(-1).id);
  const clickFloating = async (locator) => {
    await locator.waitFor();
    await locator.evaluate(async (element) => {
      const editor = element.closest('[data-annotation-editor]');
      if (editor) await Promise.all(editor.getAnimations({ subtree: true }).map((a) => a.finished));
      if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
        throw new Error('The floating control must be painted before clicking.');
    });
    const bounds = await locator.boundingBox();
    assert.ok(bounds);
    const viewport = page.viewportSize();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height);
    assert.equal(
      await locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(
          element.ownerDocument.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
        );
      }),
      true,
      'The floating control is actually exposed to a physical pointer.',
    );
    // CDP scroll-into-view can scroll the document for a positioned portal. Use the visible hit target.
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  };
  const fillEditor = async (text) => {
    // Exercise the native keyboard selection/caret path in the contextual textarea.
    await input.press('ControlOrMeta+A');
    await input.press('Backspace');
    if (text) await input.pressSequentially(text);
  };
  const cli = async (...args) => {
    const output = await execute(
      process.execPath,
      [
        process.env.PANEON_TEST_CLI_ENTRY ??
          new URL('../../dist/cli/index.js', import.meta.url).pathname,
        'panel',
        ...args,
        '--json',
      ],
      { env: { ...process.env, HOME: fixture.root }, encoding: 'utf8' },
    );
    const result = JSON.parse(output.stdout);
    assert.equal(result.ok, true);
    return result.data;
  };
  const read = () => cli('events', fixture.panel.instanceId, '--consumer', 'feedback-acceptance');
  const selectText = async (selector, start, end, endSelector = selector, keyboard = false) => {
    await frame.locator(selector).scrollIntoViewIfNeeded();
    await content.evaluate(
      ({ selector, start, end, endSelector, keyboard }) => {
        document.activeElement?.blur();
        const first = document.querySelector(selector).firstChild;
        const last = document.querySelector(endSelector).firstChild;
        const range = document.createRange();
        range.setStart(first, start);
        range.setEnd(last, end);
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        last.parentElement.dispatchEvent(
          keyboard
            ? new KeyboardEvent('keyup', { key: 'ArrowRight', shiftKey: true, bubbles: true })
            : new MouseEvent('mouseup', { bubbles: true }),
        );
      },
      { selector, start, end, endSelector, keyboard },
    );
  };
  const select = async (...args) => {
    await selectText(...args);
    await button('批注').waitFor();
  };
  const clearSelection = () => content.evaluate(() => document.getSelection().removeAllRanges());
  const save = async (comment = '') => {
    await fillEditor(comment);
    await clickFloating(button('保存'));
    await editor.waitFor({ state: 'hidden' });
  };
  const annotate = async (selector, start, end, comment = '', endSelector = selector) => {
    await select(selector, start, end, endSelector);
    await button('批注').click();
    await save(comment);
  };
  const plain = '[data-testid="plain"] [data-annotation-text]';

  // Normal browsing and copy remain native; text selection alone is not a saved entry.
  await frame.getByTestId('card-a').click();
  assert.equal((await draft()).annotations.length, 0);
  await button('Ordinary button 0').click();
  await button('Ordinary button 1').waitFor();
  await frame.getByRole('link', { name: 'Ordinary link 0' }).click();
  await frame.getByRole('textbox', { name: 'Ordinary input' }).fill('普通输入');
  await select(plain, 0, 2);
  assert.equal((await draft()).annotations.length, 0);
  if (process.env.PANEON_TEST_SCREENSHOTS)
    await page.screenshot({ path: `${process.env.PANEON_TEST_SCREENSHOTS}/comment-action.png` });
  assert.equal(await content.evaluate(() => document.getSelection().toString()), '重复');
  await content.evaluate(() => {
    window.copyPrevented = null;
    document.addEventListener('copy', (event) => {
      window.copyPrevented = event.defaultPrevented;
    });
  });
  await page.keyboard.press('ControlOrMeta+C');
  assert.equal(await content.evaluate(() => window.copyPrevented), false);
  assert.equal((await read()).events.length, 0);
  await button('批注').click();
  await fillEditor('暂不保存');
  // The fixture shortcut invokes submit without moving focus or dismissing the editor.
  await input.press('ControlOrMeta+Shift+Enter');
  await frame.getByRole('alert').filter({ hasText: '请先保存或取消' }).waitFor();
  assert.equal((await draft()).annotations.length, 0);
  assert.equal((await read()).events.length, 0);
  await input.press('Escape');
  assert.equal((await draft()).annotations.length, 0);
  assert.equal(await frame.locator('[data-annotation-marker]').count(), 0);
  // A physical mouse drag opens the action in normal browse mode.
  const text = frame.locator(plain);
  await text.scrollIntoViewIfNeeded();
  const rect = await text.boundingBox();
  assert.ok(rect);
  await page.mouse.move(rect.x + 1, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + 28, rect.y + rect.height / 2, { steps: 8 });
  await page.mouse.up();
  await button('批注').waitFor();
  assert.equal((await draft()).annotations.length, 0);
  await button('批注').click();
  await save();
  let value = await draft();
  assert.equal(value.annotations.length, 1);
  assert.equal(value.annotations[0].comment, '');
  const firstId = value.annotations[0].id;
  await clickFloating(marker(1));
  await fillEditor('中文批注');
  await input.press('Escape');
  assert.equal((await draft()).annotations[0].comment, '');
  await clickFloating(marker(1));
  await save('中文批注');
  assert.equal((await draft()).annotations[0].id, firstId);
  await clickFloating(marker(1));
  await fillEditor('Escape丢弃');
  await page.keyboard.press('Escape');
  assert.equal((await draft()).annotations[0].comment, '中文批注');

  // Selecting another range is a new comment request, never an implicit merge into this edit.
  await clickFloating(marker(1));
  await fillEditor('尚未保存的原批注');
  await selectText(plain, 20, 24);
  // Selection itself raises the unsaved-editor guard; no second action is required.
  await frame.getByRole('alert').filter({ hasText: '请先保存或取消' }).waitFor();
  assert.equal(await input.inputValue(), '尚未保存的原批注');
  assert.equal((await draft()).annotations.length, 1);
  assert.equal((await draft()).annotations[0].targets.length, 1);
  await input.press('Escape');
  assert.equal((await draft()).annotations[0].comment, '中文批注');

  // locate() leaves native selection; ordinary controls cannot recapture it.
  await button('Locate first').click();
  await content.waitForFunction(() => !document.getSelection().isCollapsed);
  const locatedDraft = await draft();
  await button('Ordinary button 1').click();
  await button('Ordinary button 2').waitFor();
  await frame.getByRole('textbox', { name: 'Ordinary input' }).focus();
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await draft(), locatedDraft);
  assert.equal(await button('批注').count(), 0);
  await frame.locator(plain).scrollIntoViewIfNeeded();
  await clickFloating(marker(1));
  await clickFloating(button('删除批注'));
  assert.equal((await draft()).annotations.length, 0);
  await marker(1).waitFor({ state: 'hidden' });

  // Disconnected source mappings and split graphemes still use exact UTF-16 source coordinates.
  await annotate(
    '[data-testid="discontinuous"] span:first-child',
    0,
    1,
    '',
    '[data-testid="discontinuous"] span:last-child',
  );
  assert.deepEqual(
    (await draft()).annotations[0].targets.map((target) => target.text),
    [
      { start: 0, end: 1, quote: '甲' },
      { start: 3, end: 4, quote: '乙' },
    ],
  );
  await clickFloating((await latestMarker()).first());
  await clickFloating(button('删除批注'));
  await annotate(
    '[data-testid="split"] span:first-child',
    0,
    1,
    '',
    '[data-testid="split"] span:last-child',
  );
  assert.deepEqual(
    (await draft()).annotations[0].targets.map((target) => target.text),
    [{ start: 0, end: 2, quote: 'é' }],
  );
  await clickFloating(await latestMarker());
  await clickFloating(button('删除批注'));

  // Native selection across two registered sources creates one multi-target annotation.
  await clearSelection();
  assert.equal(
    await frame
      .getByRole('button', { name: /^(Select objects|选择对象|Finish selecting|结束选择)$/ })
      .count(),
    0,
  );
  await annotate(
    '[data-testid="card-a"] [data-annotation-text]',
    0,
    6,
    '比较两个卡片',
    '[data-testid="card-b"] [data-annotation-text]',
  );
  value = await draft();
  assert.deepEqual(
    value.annotations[0].targets.map((target) => target.ref),
    ['card:a', 'card:b'],
  );
  assert.equal(
    value.annotations[0].targets.every((target) => !!target.text),
    true,
  );
  await frame
    .getByTestId('card-a')
    .evaluate((element) => element.scrollIntoView({ block: 'start' }));
  const multiId = value.annotations[0].id;
  await content.waitForFunction(
    (id) => document.querySelectorAll(`[data-annotation-marker="${id}"]`).length === 2,
    multiId,
  );
  assert.equal(await markerFor(multiId).count(), 2);
  assert.deepEqual(
    await markerFor(multiId).evaluateAll((items) =>
      items.map((item) => item.getAttribute('data-annotation-number')),
    ),
    ['1', '1'],
  );
  await annotate('[data-testid="card-b"] [data-annotation-text]', 0, 6, '独立批注');
  assert.equal((await draft()).annotations.length, 2);
  await clickFloating(await latestMarker());
  await clickFloating(button('删除批注'));
  assert.equal((await draft()).annotations[0].id, value.annotations[0].id);

  await annotate(plain, 5, 6, '家庭 emoji');
  const familyAnnotation = (await draft()).annotations[1];
  const family = familyAnnotation.targets[0];
  const familyMarker = markerFor(familyAnnotation.id);
  assert.deepEqual(family.text, { start: 4, end: 15, quote: '👨‍👩‍👧‍👦' });
  assert.equal((await draft()).annotations[1].targets.length, 1);
  await familyMarker.waitFor();
  assert.equal(await familyMarker.getAttribute('data-annotation-number'), '2');
  const familyY = await familyMarker.evaluate((element) => element.getBoundingClientRect().y);
  await button('Toggle layout gap').click();
  await content.waitForFunction(
    ({ id, y }) => {
      const marker = document.querySelector(`[data-annotation-marker="${id}"]`);
      return marker && marker.getBoundingClientRect().y > y + 100;
    },
    { id: familyAnnotation.id, y: familyY },
  );
  await button('Toggle layout gap').click();

  await annotate(plain, 16, 17);
  assert.equal((await draft()).annotations[2].targets[0].text.quote, 'é');
  await clickFloating(await latestMarker());
  await clickFloating(button('删除批注'));
  await annotate(plain, 22, 24, '同词不同位置');
  assert.equal((await draft()).annotations[2].targets[0].text.quote, '中文');
  await annotate(plain, 20, 24, '重叠范围');
  assert.equal((await draft()).annotations[3].targets[0].text.start, 20);
  const overlapPositions = await frame.locator('[data-annotation-marker]').evaluateAll((elements) =>
    elements.map((element) => ({
      x: element.getBoundingClientRect().x,
      y: element.getBoundingClientRect().y,
    })),
  );
  assert.equal(
    new Set(overlapPositions.map(({ x, y }) => `${x}:${y}`)).size,
    overlapPositions.length,
  );
  const beforeOverlapDelete = await draft();
  const scrollBeforeOverlapDelete = await content.evaluate(() => scrollY);
  await clickFloating(await latestMarker());
  await clickFloating(button('删除批注'));
  assert.deepEqual((await draft()).annotations, beforeOverlapDelete.annotations.slice(0, -1));
  assert.equal(await content.evaluate(() => scrollY), scrollBeforeOverlapDelete);
  await clickFloating(await latestMarker());
  await clickFloating(button('删除批注'));

  await annotate(
    '[data-testid="mapped"] strong',
    0,
    3,
    '跨格式原文',
    '[data-testid="mapped"] span:last-child',
  );
  assert.deepEqual((await draft()).annotations[2].targets[0].text, {
    start: 3,
    end: 10,
    quote: '重复**与重复',
  });
  const mappedId = (await draft()).annotations[2].id;
  // Saving creates markers without splitting registered Text nodes.
  assert.equal(
    await content.evaluate(
      () => document.querySelector('[data-testid="mapped"] strong').childNodes.length,
    ),
    1,
  );
  await button('Toggle mapped').click();
  const beforeMissing = await draft();
  await markerFor(mappedId).waitFor({ state: 'hidden' });
  // Unmounted content stays valid for submission, but only an adapter can bring it back.
  await button('Locate mapped').click();
  await frame.getByRole('alert').filter({ hasText: 'not displayed' }).waitFor();
  assert.deepEqual(await draft(), beforeMissing);
  assert.equal(await frame.getByTestId('attempts').textContent(), '0');
  await button('Toggle mapped').click();
  await markerFor(mappedId).waitFor();
  await button('Change source').click();
  await submitAnnotations(frame);
  await frame.getByRole('alert').filter({ hasText: 'stale' }).waitFor();
  assert.deepEqual(await draft(), beforeMissing);
  await frame.locator(plain).scrollIntoViewIfNeeded();
  await familyMarker.waitFor({ state: 'hidden' });
  await button('Change source').click();
  await button('Toggle B').click();
  await button('Locate second target').click();
  await frame.getByRole('alert').filter({ hasText: 'not displayed' }).waitFor();
  assert.equal((await draft()).annotations[0].targets.length, 2);
  await button('Adapter enabled no').click();
  await button('Change source').click();
  await clearSelection();
  await button('Locate family').click();
  await frame
    .getByTestId('located')
    .filter({ hasText: /^text:one$/ })
    .waitFor();
  assert.equal(await content.evaluate(() => document.getSelection().isCollapsed), true);
  await button('Change source').click();
  await button('Locate race').click();
  await frame
    .getByTestId('located')
    .filter({ hasText: /^remote:fast$/ })
    .waitFor();
  await delay(200);
  assert.equal(await frame.getByTestId('located').textContent(), 'remote:fast');
  await button('Locate second target').click();
  await frame
    .getByTestId('located')
    .filter({ hasText: /^card:b$/ })
    .waitFor();
  await button('Adapter ready').click();
  await submitAnnotations(frame);
  await frame.getByRole('alert').filter({ hasText: 'Snapshot unavailable' }).waitFor();
  assert.equal(await frame.getByTestId('attempts').textContent(), '0');
  await button('Adapter missing').click();

  // Nested-scroller, narrow iframe viewport, and marker editing use current mounted geometry.
  await select('[data-testid="nested-text"] [data-annotation-text]', 0, 2);
  await button('批注').click();
  await save('滚动批注');
  const nestedId = (await draft()).annotations.at(-1).id;
  const nestedMarker = frame.locator(`[data-annotation-marker="${nestedId}"]`);
  await nestedMarker.waitFor();
  const beforeScroll = await nestedMarker.evaluate((element) => element.getBoundingClientRect().y);
  await frame.getByTestId('nested-scroll').evaluate((element) => {
    element.scrollTop += 15;
  });
  await content.waitForFunction(
    ({ id, oldY }) => {
      const marker = document.querySelector(`[data-annotation-marker="${id}"]`);
      return marker && Math.abs(marker.getBoundingClientRect().y - oldY) > 10;
    },
    { id: nestedId, oldY: beforeScroll },
  );
  if (!process.env.PANEON_TEST_DESKTOP_ONLY) {
    await page.setViewportSize({ width: 390, height: 844 });
    await frame.getByTestId('nested-text').scrollIntoViewIfNeeded();
    await nestedMarker.click();
    await input.waitFor();
    const dialogRect = await editor.boundingBox();
    assert.ok(dialogRect.x >= 0 && dialogRect.x + dialogRect.width <= 391);
    await input.press('Escape');
  }
  await page.setViewportSize({ width: 1100, height: 900 });
  await nestedMarker.click();
  await clickFloating(button('删除批注'));

  // Keyboard text selection produces the same action and a new independent comment.
  await select(plain, 0, 2, plain, true);
  await button('批注').focus();
  await page.keyboard.press('Enter');
  await fillEditor('键盘批注');
  await input.press('Enter');
  await editor.waitFor({ state: 'hidden' });
  const keyboardId = (await draft()).annotations.at(-1).id;
  await frame.locator(`[data-annotation-marker="${keyboardId}"]`).click();
  await clickFloating(button('删除批注'));
  assert.equal((await read()).events.length, 0, 'Saving and navigation never emit events.');

  // A narrower semantic reference maps through adapter source offsets, not quote searches.
  await clickFixtureButton('Select bridge interval');
  const bridgeId = (await draft()).annotations.at(-1).id;
  const bridgeMarker = frame.locator(`[data-annotation-marker="${bridgeId}"]`);
  await frame.getByTestId('bridge').scrollIntoViewIfNeeded();
  await bridgeMarker.waitFor();
  const beforeBridgeHide = await draft();
  await clickFixtureButton('Toggle bridge');
  await bridgeMarker.waitFor({ state: 'hidden' });
  assert.deepEqual(await draft(), beforeBridgeHide);
  await clickFixtureButton('Toggle bridge');
  await frame.getByTestId('bridge').scrollIntoViewIfNeeded();
  await bridgeMarker.click();
  await clickFloating(button('删除批注'));

  // Invalid programmatic ranges still fail, without destroying already saved comments.
  const beforeInvalid = (await draft()).annotations.length;
  await clickFixtureButton('Add invalid grapheme');
  await content.waitForFunction(
    (count) =>
      JSON.parse(document.querySelector('[data-testid="draft"]').textContent).annotations.length ===
      count + 1,
    beforeInvalid,
  );
  const invalid = (await draft()).annotations.at(-1);
  assert.deepEqual(invalid.targets[0].text, { start: 5, end: 6, quote: '\udc68' });
  await submitAnnotations(frame);
  await frame.getByRole('alert').filter({ hasText: 'stale' }).waitFor();
  // Programmatic controller-created invalid entry has no DOM marker; delete through low-level fixture.
  await clickFixtureButton('Remove last');
  const beforeFailure = await draft();
  await clickFixtureButton('Submit twice and mutate');
  assert.equal(await frame.getByRole('button', { name: /^批注 \(\d+\)$/ }).isDisabled(), true);
  await frame.getByRole('alert').filter({ hasText: 'Deliberate submission failure' }).waitFor();
  assert.equal(await frame.getByTestId('attempts').textContent(), '1');
  assert.deepEqual(await draft(), beforeFailure);
  assert.match(await frame.getByTestId('hook-error').textContent(), /cannot be edited/);
  assert.equal((await read()).events.length, 0);
  await button('Failure on').click();
  await submitAnnotations(frame);
  await frame
    .getByTestId('snapshot')
    .filter({ hasText: 'annotations' })
    .waitFor({ state: 'attached' });
  assert.deepEqual(JSON.parse(await frame.getByTestId('snapshot').textContent()), beforeFailure);
  assert.deepEqual(await draft(), beforeFailure);
  const delivered = await read();
  assert.equal(delivered.events.length, 1);
  assert.deepEqual(delivered.events[0].payload, beforeFailure);
  await cli(
    'ack',
    fixture.panel.instanceId,
    '--consumer',
    'feedback-acceptance',
    '--through',
    String(delivered.events[0].id),
  );
  assert.equal((await read()).events.length, 0);
  await clearSelection();
  assert.deepEqual(errors, []);
  {
    // A visible source can still sit at the iframe edge; center it before the native marker click.
    await frame.locator(plain).evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await content.waitForFunction((id) => {
      const source = document.querySelector('[data-testid="plain"] [data-annotation-text]');
      const marker = document.querySelector(`[data-annotation-marker="${id}"]`);
      if (!source || !marker) return false;
      const text = source.getBoundingClientRect();
      const number = marker.getBoundingClientRect();
      return (
        number.top >= 0 && number.bottom <= innerHeight && Math.abs(number.top - text.top) < 40
      );
    }, familyAnnotation.id);
    // Start before opening so a wrongly positioned first visible frame cannot be missed.
    await content.evaluate((id) => {
      window.annotationFirstPaint = null;
      const measure = () => {
        const editor = document.querySelector('[data-annotation-editor]');
        if (!editor?.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
          requestAnimationFrame(measure);
          return;
        }
        const marker = document.querySelector(`[data-annotation-marker="${id}"]`);
        window.annotationFirstPaint = {
          anchored: editor.getBoundingClientRect().toJSON(),
          number: marker.getBoundingClientRect().toJSON(),
        };
      };
      requestAnimationFrame(measure);
    }, familyAnnotation.id);
    await clickFloating(familyMarker);
    await content.waitForFunction(() => window.annotationFirstPaint !== null);
    const { anchored, number } = await content.evaluate(() => window.annotationFirstPaint);
    assert.ok(anchored.x <= number.x && anchored.x + anchored.width > number.x);
    assert.ok(
      Math.min(Math.abs(anchored.y - number.bottom), Math.abs(anchored.bottom - number.y)) < 48,
      'Editor must be anchored on its first painted frame.',
    );
    if (process.env.PANEON_TEST_SCREENSHOTS)
      await page.screenshot({ path: `${process.env.PANEON_TEST_SCREENSHOTS}/comment-editor.png` });
    await input.press('Escape');
    if (process.env.PANEON_TEST_SCREENSHOTS)
      await page.screenshot({ path: `${process.env.PANEON_TEST_SCREENSHOTS}/comment-markers.png` });
  }
  console.log(
    'Contextual annotations: native/keyboard selection, empty Save, temporary edits/Cancel/Delete, stable identities and contiguous numbers, multi-source text ranges, repeated/emoji/mapped ranges, nested scrolling, stale snapshots, locate races, frozen explicit submit/failure and CLI events/ack pass.',
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
