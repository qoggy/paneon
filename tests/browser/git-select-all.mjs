import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { git } from '../git-review-fixture.ts';
import { sourceLines } from '../../skills/paneon/assets/shared/diff-model.ts';
import { startGitReviewFixture } from './git-review-fixture.mjs';
import { commentTools } from './git-review-comment-tools.mjs';

const f = await startGitReviewFixture();
let browser;
let page;
let profiler;
const metrics = [];
try {
  const lines = 600;
  const source = (version) =>
    Array.from(
      { length: lines },
      (_, i) =>
        `export const value${i} = { ${version}Index: ${i}, text: '中文 é 👨‍👩‍👧‍👦 item ${i}' };\n`,
    ).join('');
  const oldText = source('old'),
    newText = source('new');
  await writeFile(join(f.repo, 'large.ts'), oldText);
  await git(f.repo, 'add', 'large.ts');
  await git(f.repo, 'commit', '-qm', 'Create large selection source');
  await writeFile(join(f.repo, 'large.ts'), newText);
  const panel = await f.run({
    ...f.params,
    initialView: { repositoryId: 'web', type: 'changes', file: 'large.ts' },
  });
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [],
    crashes = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('crash', () => crashes.push('renderer crash'));
  await page.addInitScript(() => {
    globalThis.longTasks = [];
    new PerformanceObserver((list) =>
      globalThis.longTasks.push(
        ...list.getEntries().map((e) => ({ start: e.startTime, duration: e.duration })),
      ),
    ).observe({ type: 'longtask', buffered: true });
  });
  await page.goto(f.url(panel));
  const frame = page.frameLocator('iframe');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  await frame
    .locator('[data-code-side="new"] [data-language="typescript"] [style]')
    .first()
    .waitFor();
  const content = page.frames().find((c) => c.url().endsWith('/frame.html'));
  const comments = commentTools(frame, page);
  if (process.env.PANEON_PERF_PROFILE) {
    profiler = await context.newCDPSession(content);
    await profiler.send('Profiler.enable');
    await profiler.send('Profiler.start');
  }
  console.log('SOURCE', {
    linesPerSide: lines,
    utf16PerSide: newText.length,
    highlightedSpans: await frame.locator('[data-code-side] span').count(),
  });
  const settle = () =>
    content.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
  const clear = () => content.evaluate(() => document.getSelection().removeAllRanges());
  async function selectAll(label, side = 'new') {
    await clear();
    await frame.locator(`[data-diff-scroll="${side}"]`).first().focus();
    const before = Date.now();
    await page.keyboard.press('Meta+a');
    const selected = await content.evaluate(() => document.getSelection().toString());
    assert.ok(
      selected.includes('value0') && selected.includes(`value${lines - 1}`),
      'Native select-all retains the full displayed source',
    );
    // Meta+A is ordinary native selection: no implicit saved comment/event.
    assert.equal(await comments.count(), label === 'split' ? 0 : 1);
    await page.keyboard.press('Meta+c');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(copied.includes('value0') && copied.includes(`value${lines - 1}`));
    assert.ok(copied.includes('é 👨‍👩‍👧‍👦'), 'Copy preserves combining marks and emoji');
    const collected = Date.now();
    // The existing document collector runs on Shift release, not the A keyup.
    await page.keyboard.press('Shift');
    await settle();
    const duration = Date.now() - collected;
    metrics.push({ label, selectionAndCopyMs: collected - before, collectAndPaintMs: duration });
    assert.ok(duration < 1500, `${label} selection collector blocked for ${duration}ms`);
    assert.equal((await f.events(panel)).length, 0);
  }
  await selectAll('split');
  let started = Date.now();
  await comments.write('Review both complete sources');
  await comments.save();
  await settle();
  let elapsed = Date.now() - started;
  metrics.push({ label: 'save', durationMs: elapsed });
  assert.ok(elapsed < 2500, `Saving a full selection blocked for ${elapsed}ms`);
  assert.equal(await comments.count(), 1);
  await comments.edit(1);
  await frame.getByLabel('评论内容', { exact: true }).fill('Discard this edit');
  await button('取消').click();
  assert.equal(await comments.text(1), 'Review both complete sources');
  await button('收起上下文').click();
  // Re-registering syntax DOM for unified/expanded/select modes preserves saved coordinates.
  await clear();
  await button('单列对比').click();
  await selectAll('unified', 'unified');
  await clear();
  await button('展开全部上下文').click();
  await button('选择对象').click();
  await selectAll('expanded-select', 'unified');
  await clear();
  // Oversized feedback is explicitly rejected by the existing event contract.
  // It must retain the complete draft, not truncate source or freeze the page.
  started = Date.now();
  await button('提交评论').click();
  await frame
    .getByRole('alert')
    .filter({ hasText: /65536|262144/ })
    .waitFor();
  metrics.push({ label: 'oversized-submit', durationMs: Date.now() - started });
  assert.equal((await f.events(panel)).length, 0);
  assert.equal(await comments.count(), 1);
  await comments.remove(1);
  assert.equal(await comments.count(), 0);
  // A precise selection inside a multi-code-point emoji expands to that grapheme.
  const family = '👨‍👩‍👧‍👦';
  await content.evaluate(() =>
    document
      .querySelector('[data-code-side="new"][data-line="1"]')
      .scrollIntoView({ block: 'center' }),
  );
  await content.evaluate(() => {
    document.activeElement?.blur();
    const element = document.querySelector('[data-code-side="new"][data-line="1"]');
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const start = node.data.indexOf('👨‍👩‍👧‍👦');
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start + 2);
      range.setEnd(node, start + 4);
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return;
    }
    throw new Error('Emoji source text is missing');
  });
  await comments.write('Review the emoji');
  await comments.save();
  await button('提交评论').click();
  await frame
    .getByRole('status')
    .filter({ hasText: /已保存为事件/ })
    .waitFor();
  const events = await f.events(panel);
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.annotations.length, 1);
  const annotation = events[0].payload.annotations[0];
  assert.equal(annotation.comment, 'Review the emoji');
  assert.equal(annotation.targets.length, 1);
  const target = annotation.targets[0];
  assert.equal(target.ref.side, 'new');
  assert.equal(target.text.quote, family);
  const start = sourceLines(newText)[target.ref.startLine - 1].start;
  assert.equal(
    target.text.quote,
    newText.slice(start + target.text.start, start + target.text.end),
  );
  await content.evaluate(() =>
    document.querySelector('[data-code-side]').scrollIntoView({ block: 'center' }),
  );
  await settle();
  await page.screenshot({ path: '/tmp/paneon-b58-select-all.png' });
  const tasks = await content.evaluate(() => globalThis.longTasks);
  console.log('METRICS', JSON.stringify(metrics));
  console.log('LONG_TASKS', JSON.stringify(tasks));
  assert.deepEqual(errors, []);
  assert.deepEqual(crashes, []);
  console.log(
    'Git native Meta+A/copy, full-selection Save/Cancel, unified/expanded/select modes and exact submitted source ranges passed.',
  );
} catch (error) {
  if (profiler) {
    const profile = await profiler.send('Profiler.stop');
    await writeFile('/tmp/paneon-b58-all.cpuprofile', JSON.stringify(profile.profile));
  }
  console.error('PARTIAL_METRICS', JSON.stringify(metrics));
  console.error(
    'FAIL_TASKS',
    await Promise.race([
      page
        ?.frames()
        .find((c) => c.url().endsWith('/frame.html'))
        ?.evaluate(() => globalThis.longTasks)
        .catch(() => 'unavailable'),
      new Promise((resolve) => setTimeout(() => resolve('diagnostic timeout'), 1000)),
    ]),
  );
  await page
    ?.screenshot({ path: '/tmp/paneon-b58-select-all-failure.png', timeout: 2000 })
    .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await f.stop();
}
