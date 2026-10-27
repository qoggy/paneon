import { openAnnotationDirectory, submitAnnotations } from './annotation-tools.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { annotationTools } from './annotation-tools.mjs';
import { layoutInput, longNote, startTableLayoutFixture } from './table-layout-fixture.mjs';

const fixture = await startTableLayoutFixture();
const artifacts = process.env.PANEON_TEST_ARTIFACTS;
let browser;
const metrics = [];
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  if (artifacts) await mkdir(artifacts, { recursive: true });
  for (const width of process.env.PANEON_TEST_DESKTOP_ONLY === '1' ? [1440] : [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 1000 },
      hasTouch: width === 390,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const frame = page.frameLocator('iframe');
    const button = (name) => frame.getByRole('button', { name, exact: true });
    const waitForSubmission = async () => {
      const toast = frame.locator('[data-slot="toast"]').filter({ hasText: '批注已提交。' });
      await toast.waitFor();
      await toast.locator('[data-slot="toast-close"]').click();
      await toast.waitFor({ state: 'detached' });
    };
    const screenshot = async (name) => {
      if (artifacts)
        await page.screenshot({
          path: join(artifacts, `table-${width}-${name}.png`),
          fullPage: true,
          animations: 'disabled',
        });
    };
    const open = async (panel, title) => {
      await page.goto(fixture.url(panel));
      await frame.getByRole('heading', { name: title, exact: true }).waitFor();
      await frame.getByRole('table', { name: title, exact: true }).waitFor();
    };
    const measure = async (scenario) => {
      const m = await frame.locator('main').evaluate((main) => {
        const doc = document.documentElement;
        const table = main.querySelector('table');
        const container = table.parentElement;
        const head = table.querySelector('thead').getBoundingClientRect();
        const row = table.querySelector('tbody tr').getBoundingClientRect();
        return {
          viewport: doc.clientWidth,
          document: doc.scrollWidth,
          main: main.getBoundingClientRect().width,
          container: container.clientWidth,
          table: table.getBoundingClientRect().width,
          tableTop: head.top,
          headHeight: head.height,
          rowHeight: row.height,
        };
      });
      assert.ok(
        m.document <= m.viewport + 1,
        `${scenario} ${width}: page overflow ${JSON.stringify(m)}`,
      );
      assert.ok(m.container <= m.main, `${scenario}: table scroll stays within main`);
      metrics.push({ width, scenario, ...m });
      return m;
    };
    await open(fixture.normal, layoutInput.title);
    const normal = await measure('normal');
    assert.ok(
      normal.headHeight >= 36 && normal.headHeight <= 41,
      `compact header: ${normal.headHeight}`,
    );
    assert.ok(normal.rowHeight >= 39, `minimum row height: ${normal.rowHeight}`);
    if (width === 1440)
      assert.ok(normal.rowHeight <= 41, `compact desktop row: ${normal.rowHeight}`);
    if (width === 1440) assert.ok(normal.tableTop < 165, 'data starts near the compact toolbar');
    assert.equal(await button('重置视图').count(), 0);
    assert.equal(await button('选择帮助').count(), 0);
    assert.equal(await frame.locator('[data-cell-key="healthy"]').first().textContent(), 'true');
    assert.equal(await frame.locator('[data-cell-key="healthy"]').last().textContent(), 'false');
    assert.equal(
      await frame
        .locator('[data-cell-key="latency"]')
        .first()
        .evaluate((cell) => getComputedStyle(cell).textAlign),
      'right',
    );
    await screenshot('normal');
    const description = button('表格说明');
    if (width === 390) await description.tap();
    else {
      await description.focus();
      await page.keyboard.press('Enter');
    }
    await frame
      .getByRole('dialog', { name: '表格说明', exact: true })
      .getByText('完整说明的第二段保留在这里。', { exact: true })
      .waitFor();
    await screenshot('description');
    await page.keyboard.press('Escape');
    assert.equal(await description.getAttribute('aria-expanded'), 'false');
    const filters = button('筛选列');
    if (width === 390) await filters.tap();
    else {
      await filters.focus();
      await page.keyboard.press('Enter');
    }
    await frame.getByLabel('筛选 健康', { exact: true }).fill('false');
    await screenshot('filter-popover');
    await page.keyboard.press('Escape');
    await frame.getByLabel('搜索全表', { exact: true }).fill('unmatched');
    await frame.getByText('没有匹配结果。', { exact: true }).waitFor();
    assert.match(
      await frame.locator('[data-table-statistics]').textContent(),
      /0–0 \/ 0 行 · 原始 5 行/,
    );
    await measure('no-match');
    await screenshot('no-match');
    await button('移除筛选 健康').click();
    assert.equal(await frame.getByLabel('搜索全表', { exact: true }).inputValue(), 'unmatched');
    await button('清除搜索').click();
    assert.equal(await button('重置视图').count(), 0);
    await button('排序 耗时 ms').click();
    assert.equal(
      await frame.locator('[data-row-index]').first().getAttribute('data-row-index'),
      '4',
    );
    await button('下一页').click();
    await button('重置视图').click();
    assert.equal(
      await frame.locator('[data-row-index]').first().getAttribute('data-row-index'),
      '0',
    );
    assert.equal(await button('选择对象').count(), 0);
    assert.equal(await frame.getByRole('checkbox').count(), 0);
    const headerLabel = frame.locator('[data-column-key="note"] [data-annotation-text]');
    await headerLabel.scrollIntoViewIfNeeded();
    const frameBox = await page.locator('iframe').boundingBox();
    const selectionPoints = await headerLabel.evaluate((node, iframe) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const box = range.getBoundingClientRect();
      return {
        x1: iframe.x + box.left + 0.5,
        x2: iframe.x + box.right - 0.5,
        y: iframe.y + box.top + box.height / 2,
      };
    }, frameBox);
    await page.mouse.move(selectionPoints.x1, selectionPoints.y);
    await page.mouse.down();
    await page.mouse.move(selectionPoints.x2, selectionPoints.y, { steps: 12 });
    await page.mouse.up();
    assert.equal(await headerLabel.evaluate(() => document.getSelection().toString()), '说明');
    await screenshot('selected');
    const comments = annotationTools(frame, page);
    await comments.write('列名说明');
    await comments.save();
    await measure('saved-comment');
    await screenshot('comment');
    await button('下一页').click();
    await comments.locate(1, 1);
    assert.equal(
      await frame.locator('[data-row-index]').first().getAttribute('data-row-index'),
      '3',
    );
    assert.equal(await comments.text(1), '列名说明');
    await submitAnnotations(frame);
    await waitForSubmission();
    const first = (await fixture.events(fixture.normal)).at(-1);
    assert.deepEqual(first.payload.annotations[0].targets, [
      { ref: { kind: 'header', columnKey: 'note' }, text: { start: 0, end: 2, quote: '说明' } },
    ]);
    await openAnnotationDirectory(frame);
    await button('修改反馈').click();
    await comments.edit(1);
    await frame.getByLabel('批注内容', { exact: true }).fill('列名更正');
    await comments.save();
    await submitAnnotations(frame);
    await waitForSubmission();
    const correction = (await fixture.events(fixture.normal)).at(-1);
    assert.equal(correction.payload.replacesEventId, first.id);
    assert.equal(correction.payload.annotations[0].comment, '列名更正');
    await open(fixture.long, '长列名与原文评审');
    await measure('long-content');
    const longHeader = frame.locator('[data-column-key="note"]');
    assert.ok(
      await longHeader.evaluate((head) => head.scrollWidth <= head.clientWidth + 1),
      'long heading wraps within its column',
    );
    const source = frame.locator('[data-cell-key="note"] [data-annotation-text]');
    assert.equal(await source.textContent(), longNote);
    assert.equal(
      await source.evaluate((node) => node.childNodes.length),
      1,
      'CSS wrapping preserves the one source Text node',
    );
    const rects = await source.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getClientRects().length;
    });
    assert.ok(rects > 3, 'long source wraps over multiple visual lines');
    await screenshot('long-content');
    // Bring the source into the horizontal viewport before selecting its visible quote.
    await source.evaluate((node) => node.scrollIntoView({ block: 'start', inline: 'center' }));
    await source.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await screenshot('long-content-scrolled');
    // Select the exact raw-source quote after wrapping, without enabling object selection.
    await source.evaluate((node) => {
      const range = document.createRange();
      range.setStart(node.firstChild, 5);
      range.setEnd(node.firstChild, 9);
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    const longComments = annotationTools(frame, page);
    await longComments.write('原文坐标');
    await longComments.save();
    await submitAnnotations(frame);
    await waitForSubmission();
    const event = (await fixture.events(fixture.long)).at(-1);
    assert.deepEqual(event.payload.annotations[0].targets[0], {
      ref: { kind: 'cell', rowIndex: 0, columnKey: 'note' },
      text: { start: 5, end: 9, quote: '中文🙂' },
    });
    await longComments.locate(1);
    assert.equal(await source.evaluate(() => document.getSelection().toString()), '中文🙂');
    await open(fixture.many, '多列表格评审');
    const many = await measure('many-columns');
    assert.ok(many.table > many.container, 'many columns scroll inside table');
    await frame.locator('[data-slot="table-container"]').evaluate((container) => {
      container.scrollLeft = container.scrollWidth;
    });
    await screenshot('many-columns-scrolled');
    await open(fixture.empty, '空数据评审');
    await frame.getByText('表格没有数据。', { exact: true }).waitFor();
    assert.match(await frame.locator('[data-table-statistics]').textContent(), /0–0 \/ 0 行/);
    assert.equal(await button('上一页').isDisabled(), true);
    assert.equal(await button('下一页').isDisabled(), true);
    await measure('empty');
    await screenshot('empty');
    assert.deepEqual(errors, []);
    await context.close();
  }
  if (artifacts)
    await writeFile(join(artifacts, 'table-layout-metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics, null, 2));
  console.log(
    `Table layout Chrome: ${process.env.PANEON_TEST_DESKTOP_ONLY === '1' ? 'desktop' : 'desktop/390px'}, compact density, raw types, filters/removal/reset, sorting/pagination, header text annotations, cross-page locate/correction, long source UTF-16, many-column scrolling, empty/no-match all passed.`,
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
