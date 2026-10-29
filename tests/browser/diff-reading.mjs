import { selectDiffLines } from './annotation-tools.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
const root = await mkdtemp(join(tmpdir(), 'paneon-diff-reading-'));
let service, browser, debugPage;
const evidence = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-diff-reading-evidence';
try {
  const { startServer } = await import(
    process.env.PANEON_TEST_RUNTIME_ENTRY ??
      new URL('../../dist/runtime/server.js', import.meta.url).href
  );
  await cp(new URL('../../skills/paneon/assets/shared/', import.meta.url), join(root, 'shared'), {
    recursive: true,
  });
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    await readFile(new URL('./diff-reading-fixture.txt', import.meta.url), 'utf8'),
  );
  await mkdir(join(root, 'data'), { recursive: true });
  await writeFile(join(root, 'data', 'config.json'), JSON.stringify({ server: { port: 0 } }));
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
  const page = (debugPage = await browser.newPage({ viewport: { width: 1280, height: 780 } }));
  const errors = [],
    crashes = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('crash', () => crashes.push('crash'));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const viewport = frame.locator('[data-reading-viewport]');
  const divider = frame.getByRole('separator', { name: '调整差异两侧宽度' });
  const content = await page
    .waitForEvent('framenavigated', { timeout: 100 })
    .catch(() => page.frames().find((f) => f.url().endsWith('/frame.html')));
  await frame.locator('[data-code-side="new"][data-line="250"]').waitFor();
  assert.equal(
    await frame.locator('[data-diff-column-layout][data-slot="resizable-panel-group"]').count(),
    1,
  );
  await page.waitForTimeout(100);
  assert.equal(await button('收起上下文').getAttribute('aria-expanded'), 'true');
  assert.equal(await frame.locator('[data-code-side="new"]').count(), 340);
  const visible = await frame.locator('[data-code-side="new"][data-line="250"]').boundingBox();
  const clip = await viewport.boundingBox();
  assert.ok(
    visible.y > clip.y + 60 && visible.y < clip.y + clip.height - 20,
    'late first change is located initially',
  );
  const outerBefore = await content.evaluate(() => window.scrollY);
  await button('下一个差异').click();
  assert.equal(
    await content.evaluate(() => window.scrollY),
    outerBefore,
    'navigation only scrolls diff',
  );
  await viewport.evaluate((e) => (e.scrollTop += 65));
  const geometry = await content.evaluate(() => {
    const v = document.querySelector('[data-reading-viewport]').getBoundingClientRect();
    const h = document.querySelector('[data-diff-header]').getBoundingClientRect();
    const hit = document.elementFromPoint(v.left + 20, v.top + 3);
    return {
      viewportTop: v.top,
      headerTop: h.top,
      headerHit: !!hit?.closest('[data-diff-header]'),
    };
  });
  assert.ok(
    Math.abs(geometry.headerTop - geometry.viewportTop) <= 2,
    'toolbar has no padding gap above it',
  );
  assert.ok(geometry.headerHit, 'top strip paints toolbar, never source code');
  const source = frame.locator('[data-diff-source]');
  const left = () =>
    frame
      .locator('[data-diff-scroll="old"]')
      .first()
      .evaluate((e) => e.clientWidth);
  const assertSeparatorGeometry = async () => {
    const now = Number(await divider.getAttribute('aria-valuenow'));
    const min = Number(await divider.getAttribute('aria-valuemin'));
    const max = Number(await divider.getAttribute('aria-valuemax'));
    const width = await source.evaluate((e) => e.clientWidth);
    assert.ok(
      Math.abs(((width - 1) * now) / 100 + 0.5 - (await left())) <= 1,
      'separator percentage matches the shared table column width',
    );
    assert.ok(
      min > 0 && min <= now && now <= max && max <= 100,
      'ARIA min/current/max share library percentage units',
    );
  };
  const initial = await left();
  // Observe DOM rebuilds while dragging; geometry changes must retain syntax Text nodes.
  await content.evaluate(() => {
    globalThis.savedCodeNode = document.querySelector('[data-code-side="new"][data-line="250"]');
    globalThis.codeMutations = 0;
    globalThis.codeObserver = new MutationObserver((ms) => (globalThis.codeMutations += ms.length));
    globalThis.codeObserver.observe(globalThis.savedCodeNode, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  let box = await divider.boundingBox();
  await page.mouse.move(box.x + box.width / 2, Math.max(clip.y + 160, box.y + 5));
  await page.mouse.down();
  await page.mouse.move(box.x + 110, clip.y + 170, { steps: 12 });
  await page.mouse.up();
  assert.ok((await left()) > initial + 80, 'pointer moves shared divider');
  assert.equal(
    await content.evaluate(
      () =>
        globalThis.savedCodeNode ===
        document.querySelector('[data-code-side="new"][data-line="250"]'),
    ),
    true,
  );
  assert.equal(
    await content.evaluate(() => globalThis.codeMutations),
    0,
    'no syntax mutation on drag',
  );
  assert.ok(
    ['col-resize', 'ew-resize'].includes(await divider.evaluate((e) => getComputedStyle(e).cursor)),
  );
  await assertSeparatorGeometry();
  const moved = await left();
  await divider.focus();
  await page.keyboard.press('ArrowLeft');
  assert.ok((await left()) < moved - 10);
  const keyWidth = await left();
  await button('收起上下文').click();
  const widths = await frame
    .locator('[data-diff-scroll="old"]')
    .evaluateAll((es) => es.map((e) => e.clientWidth));
  assert.equal(widths.length, 1, 'Collapsed hunks share one continuous source pane.');
  assert.ok(
    widths.every((w) => Math.abs(w - keyWidth) < 2),
    'all hunks share ratio',
  );
  await button('展开全部上下文').click();
  await button('单列对比').click();
  await button('左右对比').click();
  assert.ok(Math.abs((await left()) - keyWidth) < 2, 'ratio survives unified switch');
  await assertSeparatorGeometry();
  await divider.focus();
  await page.keyboard.press('Home');
  assert.ok((await left()) >= 190);
  await page.keyboard.press('End');
  assert.ok(
    (await frame.locator('[data-diff-scroll="new"]').evaluate((e) => e.clientWidth)) >= 190,
  );
  // Escape cancels live pointer drag and restores both document cursor and ratio.
  const beforeCancel = await left();
  box = await divider.boundingBox();
  await page.mouse.move(box.x + 4, clip.y + 170);
  await page.mouse.down();
  await page.mouse.move(box.x - 120, clip.y + 170);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.ok(Math.abs((await left()) - beforeCancel) < 2);
  assert.equal(await content.evaluate(() => document.documentElement.style.cursor), '');
  // Native cancellation and lost capture must release document state, including mid-resize.
  for (const cancellation of ['pointercancel', 'lostpointercapture', 'resize']) {
    box = await divider.boundingBox();
    await page.mouse.move(box.x + 4, clip.y + 170);
    await page.mouse.down();
    await page.mouse.move(box.x - 40, clip.y + 170);
    if (cancellation === 'resize') await page.setViewportSize({ width: 1250, height: 780 });
    else
      await divider.evaluate((element, type) => {
        const pointerId = 1;
        if (type === 'lostpointercapture' && element.hasPointerCapture(pointerId))
          element.releasePointerCapture(pointerId);
        else element.dispatchEvent(new PointerEvent(type, { pointerId, bubbles: true }));
      }, cancellation);
    await page.mouse.up();
    assert.equal(await content.evaluate(() => document.documentElement.style.cursor), '');
  }
  await page.setViewportSize({ width: 1280, height: 780 });
  // Independent horizontal scrolling; central line gutters remain beside the divider.
  const oldPane = frame.locator('[data-diff-scroll="old"]'),
    newPane = frame.locator('[data-diff-scroll="new"]');
  await oldPane.evaluate((e) => (e.scrollLeft = 320));
  assert.ok((await oldPane.evaluate((e) => e.scrollLeft)) > 200);
  assert.equal(await newPane.evaluate((e) => e.scrollLeft), 0);
  // Restore a balanced layout for source selection and screenshots.
  await divider.focus();
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft');
  await oldPane.evaluate((e) => (e.scrollLeft = 0));
  await button('定位当前差异').click();

  await selectDiffLines(frame, 'new', 290);
  // Own the handful of real UI actions here so this regression is independently
  // runnable before or after the parallel annotation terminology migration.
  const input = frame.getByLabel(/^(?:批注|评论)内容$/);
  const catalogButton = frame.getByRole('button', { name: /^(?:批注|评论) \(\d+\)$/ });
  const annotations = {
    async count() {
      return (await catalogButton.count())
        ? Number((await catalogButton.textContent()).match(/\((\d+)\)/)[1])
        : 0;
    },
    async write(value) {
      if (!(await input.isVisible()))
        await frame.getByRole('button', { name: /^(?:批注|评论)$/ }).click();
      await input.fill(value);
    },
    async save() {
      await button('保存').click();
    },
    async edit(number) {
      if ((await catalogButton.getAttribute('aria-expanded')) !== 'true')
        await catalogButton.press('Enter');
      await frame.getByLabel(/^(?:批注|评论)目录$/).waitFor({ state: 'visible' });
      await frame
        .getByRole('button', { name: new RegExp(`^编辑(?:批注|评论) ${number}$`) })
        .click();
      await input.click();
      await frame.getByLabel(/^(?:批注|评论)目录$/).waitFor({ state: 'hidden' });
    },
    async text(number) {
      await this.edit(number);
      const value = await input.inputValue();
      await input.press('Escape');
      return value;
    },
  };
  await annotations.write('Exact line after resize');
  await annotations.save();
  assert.equal(await annotations.count(), 1);
  await assertSeparatorGeometry();
  const marked = await annotations.text(1);
  assert.equal(marked, 'Exact line after resize');

  const scrollBefore = await viewport.evaluate((e) => e.scrollTop),
    saved = await source.evaluate((e) => ((globalThis.diffIdentity = e), true));
  assert.equal(saved, true);
  await button('收起文件差异').click();
  assert.equal(await viewport.isVisible(), false);
  await button('Reopen').click();
  assert.equal(await viewport.evaluate((e) => e.scrollTop), scrollBefore);
  assert.equal(await source.evaluate((e) => e === globalThis.diffIdentity), true);
  // Command+A stays native, with no render crash or accidental saved annotation.
  await newPane.focus();
  await page.keyboard.press('Meta+a');
  await page.keyboard.press('Shift');
  assert.equal(await annotations.count(), 1);
  await content.evaluate(() => document.getSelection()?.removeAllRanges());
  // Centre the split and show the first change for a neutral reading screenshot.
  box = await divider.boundingBox();
  const sourceBox = await source.boundingBox();
  await page.mouse.move(box.x + 4, clip.y + 170);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, clip.y + 170);
  await page.mouse.up();
  await button('上一个差异').click();
  await annotations.edit(1);
  await input.press('Escape');
  await button('定位当前差异').click();
  await content.evaluate(() => document.getSelection()?.removeAllRanges());
  await mkdir(evidence, { recursive: true });
  for (const [theme, language] of [
    ['light', 'zh-CN'],
    ['dark', 'zh-CN'],
    ['light', 'en'],
    ['dark', 'en'],
  ]) {
    await prefs(theme, language);
    await page.waitForTimeout(120);
    await page.screenshot({ path: join(evidence, `${theme}-${language}.png`) });
  }
  await prefs('light', 'zh-CN');
  await page.waitForTimeout(100);
  if (process.env.PANEON_TEST_DESKTOP_ONLY !== '1') {
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await frame.locator('body').evaluate((e) => e.scrollWidth > window.innerWidth),
      false,
    );
    assert.ok((await left()) > 80);
    assert.ok((await newPane.evaluate((e) => e.clientWidth)) > 80);
    await divider.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.screenshot({ path: join(evidence, 'mobile.png') });
  }
  for (const kind of [
    'added',
    'deleted',
    'filled',
    'cleared',
    'same',
    'spaces-old',
    'spaces-new',
    'empty',
  ]) {
    await button(kind).click();
    await frame.locator(`[data-reading-kind="${kind}"] [data-diff-source]`).waitFor();
    assert.equal(await button('收起上下文').getAttribute('aria-expanded'), 'true');
    const side = ['deleted', 'cleared'].includes(kind) ? 'old' : 'new';
    const single = ['added', 'deleted', 'filled', 'cleared'].includes(kind);
    assert.equal(await divider.count(), single ? 0 : 1);
    assert.equal(await frame.locator('[data-diff-source-header]').count(), single ? 1 : 2);
    assert.equal(await button('左右对比').getAttribute('aria-pressed'), 'true');
    if (kind === 'empty') {
      assert.equal(await frame.locator('[data-code-side]').count(), 0);
    } else {
      const fullSide = kind === 'spaces-new' ? 'old' : side;
      assert.equal(await frame.locator(`[data-code-side="${fullSide}"]`).count(), 340);
    }
    if (single) {
      const pane = frame.locator(`[data-diff-scroll="${side}"]`);
      const width = await source.evaluate((element) => element.clientWidth);
      assert.ok(
        Math.abs((await pane.boundingBox()).width - width) <= 1,
        `${kind} fills the code width`,
      );
      const header = frame.locator(`[data-diff-source-header="${side}"]`);
      assert.ok(
        Math.abs((await header.boundingBox()).width - width) <= 1,
        `${kind} fills the header width`,
      );
      assert.ok((await header.innerText()).includes(side === 'old' ? '764da2f4' : 'ba6b313e'));
      assert.equal(
        await frame.locator(`[data-code-side="${side === 'old' ? 'new' : 'old'}"]`).count(),
        0,
      );
      const color = await pane
        .locator('[data-code-side]')
        .first()
        .evaluate((element) => getComputedStyle(element.closest('td')).backgroundColor);
      assert.notEqual(color, 'rgba(0, 0, 0, 0)', 'single-side rows retain their change color');
      for (const mode of ['单列对比', '左右对比']) {
        await button(mode).click();
        await button('收起上下文').click();
        await button('定位当前差异').click();
        assert.equal(await frame.locator(`[data-code-side="${side}"]`).count(), 340);
        assert.equal(await divider.count(), 0);
        await button('展开全部上下文').click();
      }
      if (kind === 'added' || kind === 'deleted') {
        await selectDiffLines(frame, side, 1);
        await annotations.write(`Single-side ${kind}`);
        await annotations.save();
        const draft = JSON.parse(await frame.locator('[data-reading-feedback]').textContent());
        const target = draft.annotations.at(-1).targets[0];
        assert.equal(target.ref.side, side);
        assert.equal(target.ref.sourceId, kind);
        assert.equal(target.ref.startLine, 1);
        assert.equal(target.text.start, 0);
        assert.ok(target.text.quote.startsWith('const line1'));
      }
      if (kind === 'added' || kind === 'deleted')
        await page.screenshot({ path: join(evidence, `${kind}.png`) });
    }
    if (kind === 'spaces-old' || kind === 'spaces-new') {
      const blankSide = kind === 'spaces-old' ? 'old' : 'new';
      assert.equal(await frame.locator(`[data-code-side="${blankSide}"]`).textContent(), ' \r\n');
    }
    if (kind === 'same' || kind === 'empty')
      assert.equal(await button('定位当前差异').isDisabled(), true);
  }
  await button('changed').click();
  await divider.waitFor();
  assert.ok(
    (await left()) < (await source.boundingBox()).width - 190,
    'two-sided layout returns after source prop updates',
  );
  await button('located').click();
  await page.waitForTimeout(120);
  const located = await frame.locator('[data-code-side="new"][data-line="12"]').boundingBox();
  const locatedViewport = await viewport.boundingBox();
  assert.ok(
    located.y > locatedViewport.y + 40 && located.y < locatedViewport.y + locatedViewport.height,
    'explicit annotation location takes precedence over late first change',
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(crashes, []);
  await writeFile(
    join(evidence, 'result.json'),
    JSON.stringify(
      { pass: true, geometry, initialWidth: initial, movedWidth: moved, errors, crashes },
      null,
      2,
    ),
  );
  console.log(
    'PASS Diff reading: late first change/full context, sticky clipping, bounded scroll, pointer/keyboard/cancel/resize, shared split ratio, horizontal panes, annotations, collapse state, Command+A; full-width added/deleted/filled/cleared, whitespace and empty boundaries, prop updates, modes, exact annotation sides; light/dark/en/zh screenshots.',
    evidence,
  );
} catch (error) {
  console.log(await debugPage?.locator('iframe').getAttribute('src'));
  console.log(await debugPage?.frameLocator('iframe').locator('body').innerText());
  await debugPage?.screenshot({ path: '/tmp/paneon-refine-failure.png' });
  throw error;
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
