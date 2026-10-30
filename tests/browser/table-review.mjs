import {
  openAnnotationDirectory,
  selectAnnotationText,
  submitAnnotations,
} from './annotation-tools.mjs';
import { annotationTools } from './annotation-tools.mjs';
import assert from 'node:assert/strict';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { markdown, startTableReviewFixture } from './table-review-fixture.mjs';
const fixture = await startTableReviewFixture();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(fixture.url(fixture.table));
  const frame = page.frameLocator('iframe');
  const comments = annotationTools(frame, page);
  async function waitForSubmitted() {
    const toast = frame.locator('[data-slot="toast"]').filter({ hasText: '批注已提交。' });
    await toast.waitFor();
    await toast.locator('[data-slot="toast-close"]').click();
    await toast.waitFor({ state: 'detached' });
  }
  await frame.getByRole('heading', { name: 'Table review acceptance', exact: true }).waitFor();
  await comments.assertNoLegacySection();
  await openAnnotationDirectory(frame);
  await frame.locator('[data-slot="empty"]').waitFor();
  assert.equal(await frame.locator('[data-annotation-submit]').count(), 0);
  await page.keyboard.press('Escape');
  assert.equal((await fixture.events(fixture.table)).length, 0);
  assert.equal(await frame.getByRole('button', { name: '重置视图', exact: true }).count(), 0);
  assert.equal(await frame.getByRole('button', { name: '选择帮助', exact: true }).count(), 0);
  await frame.getByLabel('搜索全表', { exact: true }).fill('no-matching-row');
  await frame
    .locator('tbody [data-slot="empty"]')
    .getByText('没有匹配结果。', { exact: true })
    .waitFor();
  assert.equal(await frame.locator('[data-row-index]').count(), 0);
  await frame.getByRole('button', { name: '清除搜索', exact: true }).click();
  assert.equal(await frame.getByLabel('筛选 说明', { exact: true }).count(), 0);
  await frame.getByRole('button', { name: '筛选列', exact: true }).click();
  await frame.getByLabel('筛选 Number', { exact: true }).fill('10');
  await frame.getByLabel('筛选 Boolean', { exact: true }).fill('false');
  await page.keyboard.press('Escape');
  assert.deepEqual(
    await frame
      .locator('[data-row-index]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.rowIndex)),
    ['1'],
  );
  assert.match(
    await frame.locator('[data-table-statistics]').textContent(),
    /1–1 \/ 1 行 · 原始 4 行/,
  );
  await frame.getByRole('button', { name: '移除筛选 Number', exact: true }).click();
  assert.equal(
    await frame.getByRole('button', { name: '移除筛选 Boolean', exact: true }).count(),
    1,
  );
  await frame.getByRole('button', { name: '重置视图', exact: true }).click();
  await frame.getByLabel('搜索全表', { exact: true }).fill('SAME');
  assert.equal(await frame.locator('[data-row-index]').count(), 2);
  await frame.getByRole('button', { name: '清除搜索', exact: true }).click();
  assert.equal(await frame.getByRole('button', { name: '重置视图', exact: true }).count(), 0);
  assert.equal(
    await frame.locator('[data-row-index="0"] [data-cell-key="b"]').textContent(),
    'true',
  );
  await frame.getByRole('button', { name: '排序 Number', exact: true }).click();
  assert.deepEqual(
    await frame
      .locator('[data-row-index]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.rowIndex)),
    ['1', '2'],
  );
  await frame.getByRole('button', { name: '排序 Number', exact: true }).click();
  assert.equal(await frame.locator('[data-row-index]').first().getAttribute('data-row-index'), '0');
  await frame.getByRole('button', { name: '重置视图', exact: true }).click();
  assert.equal(await frame.locator('[data-column-key="n"]').getAttribute('aria-sort'), 'none');
  await frame.getByRole('button', { name: '排序 Number', exact: true }).click();
  assert.equal(await frame.getByRole('button', { name: '选择对象', exact: true }).count(), 0);
  assert.equal(await frame.getByRole('checkbox').count(), 0);
  assert.equal(await frame.getByRole('button', { name: '选择帮助', exact: true }).count(), 0);
  assert.equal(await comments.count(), 0, 'sorting must not create annotations');
  await frame.getByRole('button', { name: '重置视图', exact: true }).click();
  // Physical selection uses rendered source geometry; it never injects feedback state.
  async function selectText(locator, start, end, expected) {
    await locator.scrollIntoViewIfNeeded();
    const frameBox = await page.locator('iframe').boundingBox();
    const points = await locator.evaluate(
      (node, { start, end, frameBox }) => {
        const text = node.firstChild;
        const a = document.createRange();
        a.setStart(text, start);
        a.setEnd(text, start + 1);
        const b = document.createRange();
        b.setStart(text, end - 1);
        b.setEnd(text, end);
        const first = a.getBoundingClientRect(),
          last = b.getBoundingClientRect();
        const iframe = frameBox;
        return {
          x1: iframe.x + first.left + 0.5,
          y1: iframe.y + first.top + first.height / 2,
          x2: iframe.x + last.right - 0.5,
          y2: iframe.y + last.top + last.height / 2,
        };
      },
      { start, end, frameBox },
    );
    await page.mouse.move(points.x1, points.y1);
    await page.mouse.down();
    await page.mouse.move(points.x2, points.y2, { steps: 16 });
    await page.mouse.up();
    assert.equal(await locator.evaluate(() => document.getSelection().toString()), expected);
  }
  const header = frame.locator('[data-column-key="name"] [data-annotation-text]');
  assert.equal(await header.locator('xpath=ancestor::button').count(), 0);
  await selectText(header, 0, 2, '说明');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '说明');
  assert.equal(await frame.locator('[data-column-key="name"]').getAttribute('aria-sort'), 'none');
  await comments.write('这个列名需要说明');
  assert.equal((await fixture.events(fixture.table)).length, 0, 'editing does not submit');
  await comments.save();
  assert.equal((await fixture.events(fixture.table)).length, 0, 'saving retains a local draft');
  await frame.getByRole('button', { name: '排序 Number', exact: true }).click();
  await frame.getByRole('button', { name: '下一页', exact: true }).click();
  const rowsBeforeLocate = await frame
    .locator('[data-row-index]')
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.rowIndex));
  await comments.locate(1);
  assert.deepEqual(
    await frame
      .locator('[data-row-index]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.rowIndex)),
    rowsBeforeLocate,
    'header locate preserves page and sort',
  );
  assert.equal(await header.evaluate(() => document.getSelection().toString()), '说明');
  await frame.getByLabel('搜索全表', { exact: true }).fill('last');
  await comments.locate(1);
  assert.equal(
    await frame.getByLabel('搜索全表', { exact: true }).inputValue(),
    'last',
    'header locate preserves filters',
  );
  await frame.getByRole('button', { name: '重置视图', exact: true }).click();
  const textCell = frame.locator(
    '[data-row-index="0"] [data-cell-key="name"] [data-annotation-text]',
  );
  await selectText(textCell, 7, 11, '中文🙂');
  await comments.write('中文🙂');
  await comments.save();
  await selectText(textCell, 12, 18, 'repeat');
  await comments.write('discarded');
  await frame.getByLabel('批注内容', { exact: true }).press('Escape');
  assert.equal(await comments.count(), 2);
  await selectText(textCell, 12, 18, 'repeat');
  await comments.write('第二个repeat');
  await comments.save();
  // One continuous selection includes the number and boolean cells between two string cells.
  await selectAnnotationText(
    frame,
    '[data-row-index="0"] [data-cell-key="name"] [data-annotation-text]',
    12,
    4,
    '[data-row-index="1"] [data-cell-key="name"] [data-annotation-text]',
  );
  await comments.write('跨单元格意见');
  await comments.save();
  await frame.getByRole('button', { name: '下一页', exact: true }).click();
  await comments.locate(2);
  await frame.locator('[data-row-index="0"]').waitFor();
  assert.equal(await textCell.evaluate(() => document.getSelection().toString()), '中文🙂');
  for (const [rowIndex, columnKey, quote] of [
    [0, 'n', '20'],
    [0, 'b', 'true'],
    [1, 'b', 'false'],
  ]) {
    const cell = frame.locator(
      `[data-row-index="${rowIndex}"] [data-cell-key="${columnKey}"] [data-annotation-text]`,
    );
    await selectText(cell, 0, quote.length, quote);
    await comments.write(`检查 ${quote}`);
    await comments.save();
  }
  await frame.getByRole('button', { name: '下一页', exact: true }).click();
  await comments.locate(5);
  await frame.locator('[data-row-index="0"]').waitFor();
  assert.equal(
    await frame
      .locator('[data-row-index="0"] [data-cell-key="n"]')
      .evaluate(() => document.getSelection().toString()),
    '20',
  );
  assert.equal((await fixture.events(fixture.table)).length, 0);
  const eventUrl = `**/api/panels/${fixture.table.instanceId}/events`;
  await page.route(eventUrl, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: { code: 'TEST_FAILURE', message: 'Intentional failure.' },
      }),
    }),
  );
  await submitAnnotations(frame);
  await frame.getByRole('alert').filter({ hasText: '未保存。' }).waitFor();
  assert.equal(await comments.count(), 7);
  assert.equal(await comments.text(2), '中文🙂');
  await page.unroute(eventUrl);
  let releaseEvent;
  let eventStarted;
  let eventRequests = 0;
  const heldEvent = new Promise((resolve) => {
    releaseEvent = resolve;
  });
  const requestedEvent = new Promise((resolve) => {
    eventStarted = resolve;
  });
  await page.route(eventUrl, async (route) => {
    eventRequests++;
    eventStarted();
    await heldEvent;
    await route.continue();
  });
  await submitAnnotations(frame);
  await requestedEvent;
  const saving = frame.getByRole('button', { name: /^批注 \(\d+\)$/ });
  assert.equal(await saving.isDisabled(), true);
  await saving.evaluate((button) => button.click());
  assert.equal(await frame.locator('[data-slot="toast"]').count(), 0);
  assert.equal(eventRequests, 1);
  releaseEvent();
  await waitForSubmitted();
  await page.unroute(eventUrl);
  const first = (await fixture.events(fixture.table))[0];
  assert.equal(first.type, 'table-submitted');
  assert.equal(first.payload.annotations.length, 7);
  for (const annotation of first.payload.annotations) assert.equal('id' in annotation, false);
  assert.equal('comment' in first.payload, false);
  assert.deepEqual(first.payload.annotations[0].targets, [
    { ref: { kind: 'header', columnKey: 'name' }, text: { start: 0, end: 2, quote: '说明' } },
  ]);
  assert.deepEqual(first.payload.annotations[1].targets, [
    {
      ref: { kind: 'cell', rowIndex: 0, columnKey: 'name' },
      text: { start: 7, end: 11, quote: '中文🙂' },
    },
  ]);
  assert.deepEqual(first.payload.annotations[2].targets, [
    {
      ref: { kind: 'cell', rowIndex: 0, columnKey: 'name' },
      text: { start: 12, end: 18, quote: 'repeat' },
    },
  ]);
  assert.deepEqual(first.payload.annotations[3], {
    targets: [
      {
        ref: { kind: 'cell', rowIndex: 0, columnKey: 'name' },
        text: { start: 12, end: 18, quote: 'repeat' },
      },
      {
        ref: { kind: 'cell', rowIndex: 0, columnKey: 'n' },
        text: { start: 0, end: 2, quote: '20' },
      },
      {
        ref: { kind: 'cell', rowIndex: 0, columnKey: 'b' },
        text: { start: 0, end: 4, quote: 'true' },
      },
      {
        ref: { kind: 'cell', rowIndex: 1, columnKey: 'name' },
        text: { start: 0, end: 4, quote: 'same' },
      },
    ],
    comment: '跨单元格意见',
  });
  for (const [index, rowIndex, columnKey, quote] of [
    [4, 0, 'n', '20'],
    [5, 0, 'b', 'true'],
    [6, 1, 'b', 'false'],
  ])
    assert.deepEqual(first.payload.annotations[index], {
      targets: [
        {
          ref: { kind: 'cell', rowIndex, columnKey },
          text: { start: 0, end: quote.length, quote },
        },
      ],
      comment: `检查 ${quote}`,
    });
  assert.equal(await frame.getByRole('button', { name: '选择对象', exact: true }).count(), 0);
  if (process.env.PANEON_TEST_ARTIFACTS) {
    await mkdir(process.env.PANEON_TEST_ARTIFACTS, { recursive: true });
    await page.screenshot({
      path: join(process.env.PANEON_TEST_ARTIFACTS, 'table-review-annotated.png'),
      fullPage: true,
    });
  }
  await openAnnotationDirectory(frame);
  await frame.getByRole('button', { name: '修改反馈', exact: true }).click();
  for (let number = 7; number >= 1; number--) await comments.remove(number);
  await submitAnnotations(frame);
  await waitForSubmitted();
  const revisions = await fixture.events(fixture.table);
  assert.equal(revisions.length, 2);
  assert.deepEqual(revisions[1].payload, {
    annotations: [],
    replacesEventId: first.id,
  });
  const cli = await fixture.cli(
    'events',
    fixture.table.instanceId,
    '--consumer',
    'table-review-cli',
  );
  assert.equal(cli.events.length, 2);
  await fixture.cli(
    'ack',
    fixture.table.instanceId,
    '--consumer',
    'table-review-cli',
    '--through',
    String(revisions[1].id),
  );
  assert.equal(
    (await fixture.cli('events', fixture.table.instanceId, '--consumer', 'table-review-cli')).events
      .length,
    0,
  );
  if (process.env.PANEON_TEST_TABLE_ONLY !== '1') {
    const review = await fixture.runReview();
    await page.goto(fixture.url(review));
    await frame.getByRole('heading', { name: 'Markdown review acceptance', exact: true }).waitFor();
    await comments.assertNoLegacySection();
    assert.equal(await frame.locator('script').filter({ hasText: 'unsafe()' }).count(), 0);
    // A registered Markdown link remains a native link in browse mode.
    await frame.locator('[data-markdown-annotation] a').evaluate((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        link.dataset.nativeClicks = String(Number(link.dataset.nativeClicks ?? 0) + 1);
      });
    });
    await frame.locator('[data-markdown-annotation] a').click();
    assert.equal(
      await frame.locator('[data-markdown-annotation] a').getAttribute('data-native-clicks'),
      '1',
    );
    assert.equal(await comments.count(), 0);
    // Browse mode preserves copying and does not create annotations.
    const repeat = frame.locator('strong [data-source-leaf]').filter({ hasText: /^repeat$/ });
    await repeat.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    assert.equal(await comments.count(), 0);
    await repeat.evaluate(() => document.getSelection().removeAllRanges());
    // Physical mouse selection of the second repeated word uses AST positions.
    const box = await repeat.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + 1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 15 });
    await page.mouse.up();
    await comments.write('second repeat');
    await comments.save();
    // One continuous selection crosses emphasis, a link, an entity and an escape.
    await frame.locator('[data-markdown-annotation]').evaluate((root) => {
      const leaves = [...root.querySelectorAll('[data-source-leaf]')];
      const start = leaves.find(
        (node) => node.textContent === 'repeat' && node.parentElement.tagName === 'STRONG',
      ).firstChild;
      const end = leaves.find((node) => node.textContent.includes('escaped.')).firstChild;
      const range = document.createRange();
      range.setStart(start, 0);
      range.setEnd(end, end.data.length);
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await comments.write('cross formatting');
    await comments.save();
    await frame
      .locator('code [data-source-leaf]')
      .filter({ hasText: /^a  b$/ })
      .evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });
    await comments.write('inline code');
    await comments.save();
    await frame.locator('pre code [data-source-leaf]').evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await comments.write('fenced code');
    await comments.save();
    assert.equal(await frame.getByRole('button', { name: '选择对象', exact: true }).count(), 0);
    await writeFile(fixture.markdownFilePath, '# Changed after reading\n');
    await submitAnnotations(frame);
    await waitForSubmitted();
    const result = (await fixture.events(review))[0];
    assert.equal(result.payload.annotations.length, 4);
    assert.equal('comment' in result.payload, false);
    const [second, cross, inline, fenced] = result.payload.annotations;
    const secondStart = markdown.indexOf('**repeat**') + 2;
    assert.deepEqual(second.targets[0].text, {
      start: secondStart,
      end: secondStart + 6,
      quote: 'repeat',
    });
    assert.equal(inline.targets[0].text.quote, 'a  b');
    assert.equal(fenced.targets[0].text.quote, 'const x = 1;\n');
    await unlink(fixture.markdownFilePath);
    for (const entry of result.payload.annotations)
      for (const target of entry.targets)
        if (target.text)
          assert.equal(markdown.slice(target.text.start, target.text.end), target.text.quote);
    await comments.locate(1, 1);
    assert.equal(
      await frame
        .locator('[data-markdown-annotation]')
        .evaluate(() => document.getSelection().toString()),
      'repeat',
    );
    console.log(
      'Review source assertions verified repeated-word mouse selection, raw quote consistency, inline/fenced code and exact-word locate; checking continuous link coverage next.',
    );
    assert.equal(
      cross.targets.length,
      1,
      'Links must be included in one continuous registered source range.',
    );
    const crossEnd = markdown.indexOf('escaped.') + 8;
    assert.deepEqual(cross.targets[0].text, {
      start: secondStart,
      end: crossEnd,
      quote: markdown.slice(secondStart, crossEnd),
    });
    await comments.locate(2, 1);
    assert.equal(
      await frame
        .locator('[data-markdown-annotation]')
        .evaluate(() => document.getSelection().toString()),
      'repeat and linked 中文🙂 & * escaped.',
    );
    await openAnnotationDirectory(frame);
    await frame.getByRole('button', { name: '修改反馈', exact: true }).click();
    for (let number = 4; number >= 1; number--) await comments.remove(number);
    await submitAnnotations(frame);
    await waitForSubmitted();
    const reviewEvents = await fixture.events(review);
    assert.deepEqual(reviewEvents[1].payload, {
      annotations: [],
      replacesEventId: result.id,
    });

    await writeFile(fixture.markdownFilePath, markdown);
    const absoluteReview = await fixture.runReview(fixture.markdownFilePath);
    await page.goto(fixture.url(absoluteReview));
    await frame.locator('pre code [data-source-leaf]').waitFor();
    assert.equal(await frame.getByRole('alert').count(), 0);
    await writeFile(fixture.markdownFilePath, '');
    const emptyReview = await fixture.runReview(fixture.markdownFilePath);
    await page.goto(fixture.url(emptyReview));
    await frame
      .locator('main [data-slot="empty"]')
      .getByText('文件没有内容。', { exact: true })
      .waitFor();
    assert.equal(await frame.locator('[data-markdown-annotation]').count(), 0);
    assert.equal(await frame.getByRole('alert').count(), 0);
    assert.equal(await frame.locator('[data-source-leaf]').count(), 0);
    await unlink(fixture.markdownFilePath);
    const missingReview = await fixture.runReview(fixture.markdownFilePath);
    await page.goto(fixture.url(missingReview));
    await frame.getByRole('alert').filter({ hasText: '读取文件失败。' }).waitFor();
    assert.equal(await frame.locator('[data-markdown-annotation]').count(), 0);
    assert.equal((await fixture.events(missingReview)).length, 0);
    console.log(
      'Review file input: relative/absolute Unicode paths, empty/missing files, snapshot submission after file changes, locate and clearing after deletion passed.',
    );
  }
  if (process.env.PANEON_TEST_ARTIFACTS) {
    await mkdir(process.env.PANEON_TEST_ARTIFACTS, { recursive: true });
    await page.screenshot({
      path: join(process.env.PANEON_TEST_ARTIFACTS, 'table-review.png'),
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    process.env.PANEON_TEST_TABLE_ONLY === '1'
      ? 'Table-only Chrome: copied skill, CLI --params-file, sorting/filtering/pagination identities, header/cell physical text selection and clipboard, independent feedback, Unicode, failure retention, clearing revisions and CLI events/ack passed. Markdown review was not run.'
      : 'Table/review Chrome: all assertions passed.',
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
