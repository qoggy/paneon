import { realpath } from 'node:fs/promises';
import { openAnnotationDirectory, submitAnnotations } from './annotation-tools.mjs';
import { selectDiffLines } from './annotation-tools.mjs';
import { verifyGitLayout } from './git-review-layout.mjs';
import { annotationTools } from './annotation-tools.mjs';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startGitReviewFixture } from './git-review-fixture.mjs';
const f = await startGitReviewFixture();
let browser;
let diagnosticPage;
const until = async (check, message) => {
  for (let i = 0; i < 300; i++) {
    if (await check()) return;
    await delay(50);
  }
  throw new Error(message);
};
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage();
  diagnosticPage = page;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(f.url());
  const frame = page.frameLocator('iframe'),
    button = (name) => frame.getByRole('button', { name, exact: true });
  const comments = annotationTools(frame, page);
  await frame.getByRole('button', { name: '仓库', exact: true }).waitFor();
  await frame.locator('[data-diff-source]').waitFor();
  await comments.assertNoLegacySection();
  const content = page.frames().find((candidate) => candidate.url().endsWith('/frame.html'));
  const clear = () => content.evaluate(() => document.getSelection().removeAllRanges());
  const select = async (side, line, from, to) =>
    content.evaluate(
      ({ side, line, from, to }) => {
        document.activeElement?.blur();
        const el = document.querySelector(`[data-code-side="${side}"][data-line="${line}"]`);
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT),
          positions = [];
        let n,
          offset = 0;
        while ((n = walker.nextNode())) {
          positions.push({ node: n, start: offset, end: offset + n.length });
          offset += n.length;
        }
        const first = positions.find((p) => p.end > from),
          last = positions.find((p) => p.end >= to);
        const range = document.createRange();
        range.setStart(first.node, from - first.start);
        range.setEnd(last.node, to - last.start);
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      },
      { side, line, from, to },
    );
  const finish = () => comments.save();
  const selectFile = async (name) => {
    await clear();
    await frame.getByRole('button', { name, exact: true }).dblclick();
    await frame.locator('[data-diff-source]').waitFor();
  };
  assert.equal((await f.events()).length, 0);
  await openAnnotationDirectory(frame);
  await frame.locator('[data-slot="empty"]').waitFor();
  assert.equal(await frame.locator('[data-annotation-submit]').count(), 0);
  await page.keyboard.press('Escape');
  assert.equal((await f.events()).length, 0);
  // Browse-mode native selection and copy remain ordinary.
  await frame.locator('[data-code-side="new"][data-line="1"] [style*="color"]').first().waitFor();
  await frame.locator('[data-code-side="new"][data-line="1"]').scrollIntoViewIfNeeded();
  const drag = await content.evaluate(() => {
    const el = document.querySelector('[data-code-side="new"][data-line="1"]');
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT),
      positions = [];
    let n,
      offset = 0;
    while ((n = walker.nextNode())) {
      positions.push({ node: n, start: offset, end: offset + n.length });
      offset += n.length;
    }
    const first = positions.find((p) => p.end > 12),
      last = positions.find((p) => p.end >= 14);
    const range = document.createRange();
    range.setStart(first.node, 12 - first.start);
    range.setEnd(last.node, 14 - last.start);
    const rect = range.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  const iframeBox = await page.locator('iframe').boundingBox();
  await page.mouse.move(iframeBox.x + drag.x + 1, iframeBox.y + drag.y + drag.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    iframeBox.x + drag.x + drag.width - 1,
    iframeBox.y + drag.y + drag.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();
  const physicallySelected = await content.evaluate(() => document.getSelection().toString());
  if (physicallySelected !== '缓存') {
    console.error({ drag, iframeBox, physicallySelected });
    await page.screenshot({ path: '/private/tmp/paneon-git-drag-failure.png', fullPage: true });
  }
  assert.equal(physicallySelected, '缓存');
  assert.equal(await comments.count(), 0);
  await content.evaluate(() => {
    window.copyPrevented = null;
    document.addEventListener('copy', (e) => {
      window.copyPrevented = e.defaultPrevented;
    });
  });
  await page.keyboard.press('ControlOrMeta+C');
  assert.equal(await content.evaluate(() => window.copyPrevented), false);
  await clear();

  // Staged source: choose the second repeated word, precisely through highlighted nodes.
  await select('new', 1, 15, 17);
  await comments.write('检查第二个缓存');
  await finish();
  await clear();
  await selectFile('未暂存 · M a.ts');
  await selectDiffLines(frame, 'new', 2);
  await comments.write('工作区 n=4');
  await finish();
  await button('单列对比').click();
  assert.equal(await button('收起上下文').getAttribute('aria-expanded'), 'true');
  await button('左右对比').click();
  // Refresh never retargets an old annotation.
  await writeFile(join(f.repo, 'a.ts'), 'fresh changed\r\nsecond line\r\n');
  assert.equal(
    await frame.locator('[data-code-side="new"][data-line="2"]').textContent(),
    'const n = 4;\r\n',
  );
  await button('刷新').click();
  await until(
    async () =>
      (await frame.locator('[data-code-side="new"][data-line="1"]').textContent()).includes(
        'fresh changed',
      ),
    'manual refresh did not load new contents',
  );
  assert.equal(await comments.count(), 2);
  await comments.locate(2, 1);
  await frame.getByText('回看保留快照', { exact: true }).waitFor();
  assert.ok((await frame.getByRole('note').innerText()).includes(await realpath(f.repo)));
  assert.equal(
    await frame.locator('[data-code-side="new"][data-line="2"]').textContent(),
    'const n = 4;\r\n',
  );
  await until(
    async () =>
      await content.evaluate(
        () =>
          [...(CSS.highlights.get('paneon-diff-location') ?? [])]
            .map((range) => range.toString())
            .join('') === 'const n = 4;\r\n',
      ),
    'old line target was not precisely highlighted',
  );
  await button('返回当前浏览').click();
  // Same repository/path, a distinct fixed branch-comparison source.
  await frame.getByRole('tab', { name: '分支/版本对比', exact: true }).click();
  await frame.getByRole('combobox', { name: '基线', exact: true }).click();
  await frame
    .getByRole('listbox', { name: '基线', exact: true })
    .getByRole('option', { name: 'base', exact: true })
    .click();
  await button('比较').click();
  await frame.getByRole('button', { name: 'M a.ts', exact: true }).dblclick();
  await frame
    .locator('[data-code-side="new"][data-line="2"]')
    .filter({ hasText: 'const n = 2' })
    .waitFor();
  await button('收起上下文').click();
  await selectDiffLines(frame, 'new', 1, 2);
  await finish();
  // Another repository, same file name.
  await frame.getByRole('button', { name: '仓库', exact: true }).click();
  await frame.getByRole('button', { name: /^server · / }).click();
  await frame.getByRole('tab', { name: '未提交改动', exact: true }).click();
  await frame.getByRole('button', { name: '未跟踪 · ? a.ts', exact: true }).dblclick();
  await frame
    .locator('[data-code-side="new"][data-line="1"]')
    .filter({ hasText: 'server-only' })
    .waitFor();
  await selectDiffLines(frame, 'new', 1);
  await finish();
  assert.equal((await f.events()).length, 0);
  for (const [length, limit] of [
    [66000, '65536'],
    [100000, '262144'],
  ]) {
    await comments.edit(4);
    await comments.write('中'.repeat(length));
    await comments.save();
    await submitAnnotations(frame);
    await frame.getByRole('alert').filter({ hasText: limit }).waitFor();
    assert.equal(await comments.count(), 4);
    assert.equal((await f.events()).length, 0);
  }
  await comments.edit(4);
  await comments.write('');
  await comments.save();
  await submitAnnotations(frame);
  await frame.locator('[data-slot="toast"]').filter({ hasText: '批注已提交。' }).waitFor();
  const first = (await f.events())[0];
  assert.equal(first.type, 'git-review-submitted');
  assert.ok(first.payload.files.every((source) => !('repositoryId' in source)));
  const annotations = first.payload.files.flatMap((file) => file.annotations);
  assert.equal(annotations.length, 4);
  assert.equal(first.payload.files.length, 4);
  assert.ok(annotations.every((annotation) => !('id' in annotation)));
  assert.equal('revision' in first, false);
  const phrase = annotations[0].targets[0];
  assert.deepEqual(phrase.selection, { start: 15, end: 17, quote: '缓存' });
  assert.equal(phrase.startLine, 1);
  assert.equal(phrase.endLine, 1);
  const old = annotations[1].targets[0];
  assert.equal(old.startLine, 2);
  assert.equal(old.endLine, 2);
  assert.equal(old.text.slice(old.selection.start, old.selection.end), 'const n = 4;\r\n');
  const source = first.payload.files[1];
  assert.equal(source.view.area, 'unstaged');
  assert.equal(first.payload.files[3].repositoryPath, await realpath(f.second));
  // Failed delivery keeps draft and successful receipt, then a complete correction can clear it.
  await comments.edit(4);
  await comments.write('修正所选内容');
  await comments.save();
  const eventUrl = `**/api/panels/${f.panel.instanceId}/events`;
  await page.route(eventUrl, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error: { code: 'TEST_FAILURE', message: 'Intentional save failure.' },
          }),
        })
      : route.continue(),
  );
  await submitAnnotations(frame);
  await frame.getByRole('alert').filter({ hasText: '未保存。' }).waitFor();
  assert.equal(await comments.count(), 4);
  assert.equal((await f.events()).length, 1);
  await page.unroute(eventUrl);
  await submitAnnotations(frame);
  await until(async () => (await f.events()).length === 2, 'correction missing');
  const second = (await f.events())[1];
  assert.equal(second.payload.replacesEventId, first.id);
  const corrected = second.payload.files.flatMap((file) => file.annotations);
  assert.deepEqual(corrected.slice(0, 3), annotations.slice(0, 3));
  assert.equal(corrected[3].comment, '修正所选内容');
  assert.equal('comment' in second.payload, false);
  for (let i = 4; i >= 1; i--) await comments.remove(i);
  await submitAnnotations(frame);
  await until(async () => (await f.events()).length === 3, 'empty correction missing');
  const cleared = (await f.events())[2];
  assert.deepEqual(cleared.payload.files, []);
  assert.equal(cleared.payload.replacesEventId, second.id);
  // Real CLI events and consumer ack against this runtime home.
  const execute = promisify(execFile);
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
      { env: { ...process.env, HOME: f.root } },
    );
    const result = JSON.parse(output.stdout);
    assert.equal(result.ok, true);
    return result.data;
  };
  const received = await cli('events', f.panel.instanceId, '--consumer', 'git-browser');
  assert.equal(received.events.length, 3);
  await cli(
    'ack',
    f.panel.instanceId,
    '--consumer',
    'git-browser',
    '--through',
    String(cleared.id),
  );
  assert.equal(
    (await cli('events', f.panel.instanceId, '--consumer', 'git-browser')).events.length,
    0,
  );
  // Agent-specified history/root, compare and missing file initial locations.
  for (const initialView of [
    { repositoryPath: f.repo, type: 'history' },
    { repositoryPath: f.repo, type: 'history', commit: f.rootCommit, file: 'a.ts' },
    { repositoryPath: f.repo, type: 'compare', base: 'base', file: 'a.ts' },
  ]) {
    const p = await f.run({ ...f.params, initialView });
    await page.goto(f.url(p));
    const next = page.frameLocator('iframe');
    if (initialView.type === 'history' && !initialView.commit)
      await next.getByRole('region', { name: '提交历史' }).waitFor();
    else await next.locator('[data-diff-source]').waitFor();
  }
  await verifyGitLayout(f, page);
  const missing = await f.run({
    ...f.params,
    initialView: { repositoryPath: f.repo, type: 'changes', file: 'missing.ts' },
  });
  await page.goto(f.url(missing));
  const missingFrame = page.frameLocator('iframe');
  // The file-tree shell appears before the initial repository catalog has finished loading.
  await missingFrame.locator('[data-file-id]').first().waitFor();
  await missingFrame.locator('[data-file-scroll][aria-busy=false]').waitFor();
  assert.ok((await missingFrame.locator('[data-file-id]').count()) > 0);
  assert.equal(await missingFrame.locator('[data-diff-source]').count(), 0);
  assert.equal(await missingFrame.getByRole('alert').count(), 0);
  for (const initialView of [
    { repositoryPath: f.repo, type: 'history', commit: f.rootCommit, file: 'missing.ts' },
    { repositoryPath: f.repo, type: 'compare', base: 'base', file: 'missing.ts' },
  ]) {
    const invalid = await f.run({ ...f.params, initialView });
    await page.goto(f.url(invalid));
    await page
      .frameLocator('iframe')
      .getByRole('alert')
      .filter({ hasText: 'not present' })
      .waitFor();
  }
  const artifact = process.env.PANEON_TEST_ARTIFACTS;
  if (artifact) {
    await mkdir(artifact, { recursive: true });
    await page.goto(f.url());
    await page.frameLocator('iframe').locator('[data-diff-source]').waitFor();
    await page.screenshot({ path: join(artifact, 'git-review.png'), fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log(
    'Git Chrome: copied skill, multi-repo/staged+unstaged, precise repeated Unicode text, layouts/context, explicit refresh/old snapshots, cross-view sources, complete corrections/failure/clear, initial views, CLI events/ack passed.',
  );
} catch (error) {
  console.error(
    await diagnosticPage
      ?.frameLocator('iframe')
      .locator('body')
      .innerText()
      .catch(() => 'No frame'),
  );
  throw error;
} finally {
  await browser?.close();
  await f.stop();
}
