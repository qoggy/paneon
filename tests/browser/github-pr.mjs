import { openAnnotationDirectory, submitAnnotations } from './annotation-tools.mjs';
import { selectDiffLines, selectAnnotationText } from './annotation-tools.mjs';
import { annotationTools } from './annotation-tools.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startGithubPRFixture } from './github-pr-fixture.mjs';
import { body, ids } from '../github-pr-fixture.ts';
const until = async (check, message) => {
  for (let i = 0; i < 300; i++) {
    if (await check()) return;
    await delay(50);
  }
  throw new Error(message);
};
async function completeAcceptance() {
  const f = await startGithubPRFixture();
  let browser, page;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
    });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(f.url());
    const frame = page.frameLocator('iframe'),
      button = (name) => frame.getByRole('button', { name, exact: true });
    const comments = annotationTools(frame, page);
    await frame.getByRole('heading', { name: 'example/project', exact: true }).waitFor();
    await frame.getByRole('heading', { name: 'Review cache behavior #101', exact: true }).waitFor();
    await frame.locator('[data-markdown-annotation]').waitFor();
    if (process.env.PANEON_TEST_ARTIFACTS) {
      await mkdir(process.env.PANEON_TEST_ARTIFACTS, { recursive: true });
      await page.screenshot({
        path: join(process.env.PANEON_TEST_ARTIFACTS, 'pr-overview.png'),
        fullPage: true,
      });
    }
    const content = page.frames().find((candidate) => candidate.url().endsWith('/frame.html'));
    const clear = () => content.evaluate(() => document.getSelection().removeAllRanges());
    const finish = () => comments.save();
    const comment = () => ({ fill: (value) => comments.write(value) });
    await comments.assertNoLegacySection();
    // gh --limit is a growing maximum, never a claimed cursor.
    await button('加载更多').click();
    await frame.getByText('已加载 31 条', { exact: false }).waitFor();
    await frame.getByLabel('搜索 PR', { exact: true }).fill('第二个');
    await button('搜索').click();
    await frame.getByText('已加载 1 条', { exact: false }).waitFor();
    await frame.getByLabel('搜索 PR', { exact: true }).fill('');
    await frame.getByRole('combobox', { name: 'PR 状态', exact: true }).click();
    await frame.getByRole('option', { name: '已关闭', exact: true }).click();
    await frame.getByText('已加载 30 条', { exact: false }).waitFor();
    await frame.getByRole('combobox', { name: 'PR 状态', exact: true }).click();
    await frame.getByRole('option', { name: '开放中', exact: true }).click();
    await frame.getByText('正在加载 PR…', { exact: true }).waitFor({ state: 'hidden' });
    await openAnnotationDirectory(frame);
    await frame.locator('[data-slot="empty"]').waitFor();
    assert.equal(await frame.locator('[data-annotation-submit]').count(), 0);
    await page.keyboard.press('Escape');
    assert.equal((await f.events()).length, 0);
    // Native mouse text selection/copy through rendered Markdown.
    const leaf = frame
      .locator('[data-source-leaf]')
      .filter({ hasText: '重复 缓存 缓存🙂，含 ' })
      .first();
    await leaf.scrollIntoViewIfNeeded();
    const rect = await leaf.evaluate(async (el) => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.__commentMouse = [];
      for (const event of ['mousedown', 'mouseup'])
        document.addEventListener(
          event,
          (e) =>
            window.__commentMouse.push({
              event,
              target: e.target.tagName,
              text: e.target.textContent?.slice(0, 80),
              x: e.clientX,
              y: e.clientY,
            }),
          { once: true },
        );
      const r = document.createRange();
      r.setStart(el.firstChild, 6);
      r.setEnd(el.firstChild, 8);
      const b = r.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    });
    const box = await page.locator('iframe').boundingBox();
    await page.mouse.move(box.x + rect.x + 1, box.y + rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + rect.x + rect.width - 1, box.y + rect.y + rect.height / 2, {
      steps: 12,
    });
    await page.mouse.up();
    const physicalQuote = await content.evaluate(() => document.getSelection().toString());
    if (physicalQuote !== '缓存') {
      console.error('Native selection geometry', {
        rect,
        iframe: box,
        currentLeaf: await leaf.boundingBox(),
        events: await content.evaluate(() => window.__commentMouse),
        physicalQuote,
      });
      if (process.env.PANEON_TEST_ARTIFACTS) {
        await mkdir(process.env.PANEON_TEST_ARTIFACTS, { recursive: true });
        await page.screenshot({
          path: join(process.env.PANEON_TEST_ARTIFACTS, 'github-pr-native-selection-failure.png'),
          fullPage: true,
        });
      }
    }
    assert.equal(physicalQuote, '缓存');
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

    await leaf.scrollIntoViewIfNeeded();
    await leaf.evaluate((el) => {
      document.activeElement?.blur();
      const r = document.createRange();
      r.setStart(el.firstChild, 6);
      r.setEnd(el.firstChild, 8);
      const s = document.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await comment().fill('检查第二个缓存');
    await finish();
    await clear();
    // Continuous rendered range crosses emphasis, link and entity; quote retains raw Markdown.
    await content.evaluate(() => {
      document.activeElement?.blur();
      const leaves = [
        ...document.querySelectorAll('[data-markdown-annotation] [data-source-leaf]'),
      ];
      const first = leaves.find((el) => el.textContent.startsWith('重复 缓存'));
      const last = leaves.find((el) => el.textContent.includes('原文。'));
      const r = document.createRange();
      r.setStart(first.firstChild, 0);
      r.setEnd(last.firstChild, last.firstChild.length);
      const s = document.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      last.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await comment().fill('跨格式说明');
    await finish();
    await clear();
    // Query failure remains distinct from a failed CI result.
    await f.state({ fail: 'checks' });
    await frame.getByRole('tab', { name: '检查', exact: true }).click();
    await frame.getByRole('alert').filter({ hasText: 'checks failure' }).waitFor();
    await f.state({});
    await frame.getByRole('tab', { name: '检查', exact: true }).click();
    await frame.locator('[data-pr-check="CR_NODE_1"]').waitFor();
    assert.match(await frame.locator('[data-pr-check="CR_NODE_1"]').textContent(), /未通过/);
    if (process.env.PANEON_TEST_ARTIFACTS)
      await page.screenshot({
        path: join(process.env.PANEON_TEST_ARTIFACTS, 'pr-checks.png'),
        fullPage: true,
      });
    await f.state({ fail: 'blob' });
    await frame.getByRole('tab', { name: '文件改动', exact: true }).click();
    await frame.getByRole('alert').filter({ hasText: 'blob failure' }).waitFor();
    await f.state({});
    await button('修改 · src/a.ts').click();
    await frame
      .locator('[data-code-side="new"][data-line="2"]')
      .filter({ hasText: 'n = 2' })
      .waitFor();
    if (process.env.PANEON_TEST_ARTIFACTS)
      await page.screenshot({
        path: join(process.env.PANEON_TEST_ARTIFACTS, 'pr-files.png'),
        fullPage: true,
      });
    await selectDiffLines(frame, 'new', 2);
    await comment().fill('原 head 的代码');
    await finish();
    await button('单列对比').click();
    await button('展开全部上下文').click();
    await button('左右对比').click();
    // A description can change without a new head; its saved text remains locatable.
    await f.state({ version: 1 });
    await button('刷新 PR').click();
    await frame.getByText('新的说明，缓存已经变化。', { exact: true }).waitFor();
    const beforeLocation = {
      annotations: await comments.count(),
      events: (await f.events()).length,
    };
    await comments.locate(1, 1);
    await frame.getByText('正在查看先前版本', { exact: true }).waitFor();
    await until(
      async () => (await content.evaluate(() => document.getSelection().toString())) === '缓存',
      'old Markdown phrase was not located exactly',
    );
    await button('返回当前 PR').click();
    console.log(
      'Markdown locate/navigation evidence:',
      JSON.stringify({
        before: beforeLocation,
        after: {
          annotations: await comments.count(),
          events: (await f.events()).length,
        },
      }),
    );
    assert.equal(
      await comments.count(),
      3,
      'Locating a phrase then clicking navigation must not create another annotation.',
    );
    await f.state({ version: 1, headVersion: 1 });
    await button('刷新 PR').click();
    await button('提交版本').click();
    await frame.locator(`code[title="${ids.newer}"]`).waitFor();
    await comments.locate(3, 1);
    await frame
      .locator('[data-code-side="new"][data-line="2"]')
      .filter({ hasText: 'n = 2' })
      .waitFor();
    await until(
      async () =>
        await content.evaluate(
          () =>
            [...(CSS.highlights.get('paneon-diff-location') ?? [])]
              .map((range) => range.toString())
              .join('') === 'const n = 2;\r\n',
        ),
      'old fixed diff was not highlighted exactly',
    );
    await button('返回当前 PR').click();
    await clear();
    await frame.getByRole('button', { name: '#202 第二个 PR', exact: true }).click();
    await frame.getByRole('heading', { name: '第二个 PR #202', exact: true }).waitFor();
    await selectAnnotationText(frame, '[data-markdown-annotation] p');
    await finish();
    assert.equal((await f.events()).length, 0);
    assert.equal(await comments.count(), 4);
    await button('请 AI 审阅').click();
    await frame.getByRole('status').filter({ hasText: '审阅请求已发送给当前 AI。' }).waitFor();
    const requested = (await f.events())[0];
    assert.equal(requested.type, 'review-requested');
    assert.deepEqual(requested.payload, {
      repository: 'example/project',
      number: 202,
      baseCommit: ids.base,
      headCommit: ids.second,
    });
    assert.equal((await f.events()).length, 1);
    const originalAnnotation = await comments.text(1);
    for (const [length, limit] of [
      [66000, '65536'],
      [100000, '262144'],
    ]) {
      await comments.edit(1);
      await comments.write('中'.repeat(length));
      await comments.save();
      await submitAnnotations(frame);
      await frame.getByRole('alert').filter({ hasText: limit }).waitFor();
      assert.equal(await comments.count(), 4);
      assert.equal((await f.events()).length, 1);
    }
    await comments.edit(1);
    await comments.write(originalAnnotation);
    await comments.save();
    const eventURL = `**/api/panels/${f.panel.instanceId}/events`;
    await page.route(eventURL, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: false,
              error: { code: 'TEST_FAILURE', message: 'Intentional PR save failure.' },
            }),
          })
        : route.continue(),
    );
    await submitAnnotations(frame);
    await frame.getByRole('alert').filter({ hasText: 'Intentional PR save failure' }).waitFor();
    assert.equal(await comments.count(), 4);
    await page.unroute(eventURL);
    await submitAnnotations(frame);
    await frame.locator('[data-slot="toast"]').filter({ hasText: '批注已提交。' }).waitFor();
    const first = (await f.events())[1];
    assert.equal(first.type, 'pr-feedback-submitted');
    assert.equal(first.payload.annotations.length, 4);
    assert.equal(Object.keys(first.payload.sources).length, 3);
    const phrase = first.payload.annotations[0].targets[0],
      start = body().indexOf('缓存', body().indexOf('缓存') + 1);
    assert.deepEqual(phrase.text, { start, end: start + 2, quote: '缓存' });
    assert.equal(
      first.payload.annotations[1].targets[0].text.quote,
      body().slice(body().indexOf('重复'), -1),
    );
    const diff = first.payload.annotations[2].targets[0];
    assert.equal(diff.ref.startLine, 2);
    assert.equal(diff.ref.endLine, 2);
    assert.equal(diff.text.quote, 'const n = 2;\r\n');
    assert.equal(first.payload.sources[diff.ref.sourceId].headCommit, ids.head);
    assert.equal(
      first.payload.sources[first.payload.annotations[3].targets[0].ref.sourceId].number,
      202,
    );
    await comments.edit(1);
    await comment().fill('更正说明');
    await finish();
    assert.equal((await f.events()).length, 2);
    await submitAnnotations(frame);
    await until(async () => (await f.events()).length === 3, 'explicit corrected feedback missing');
    const corrected = (await f.events())[2];
    assert.equal(corrected.payload.annotations[0].id, first.payload.annotations[0].id);
    assert.equal(corrected.payload.annotations[0].comment, '更正说明');
    assert.equal(corrected.payload.replacesEventId, undefined);
    const execute = promisify(execFile),
      cli = async (...args) => {
        const out = await execute(
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
        const result = JSON.parse(out.stdout);
        assert.equal(result.ok, true);
        return result.data;
      };
    const events = await cli('events', f.panel.instanceId, '--consumer', 'pr-browser');
    assert.equal(events.events.length, 3);
    await cli(
      'ack',
      f.panel.instanceId,
      '--consumer',
      'pr-browser',
      '--through',
      String(corrected.id),
    );
    assert.equal(
      (await cli('events', f.panel.instanceId, '--consumer', 'pr-browser')).events.length,
      0,
    );
    // API coverage must remain visibly incomplete; a query failure must never look unchanged.
    await f.state({ coverage: true });
    const limited = await f.run();
    await page.goto(f.url(limited));
    await page
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Review cache behavior #101', exact: true })
      .waitFor();
    await page.frameLocator('iframe').getByRole('tab', { name: '文件改动', exact: true }).click();
    await page.frameLocator('iframe').getByText('文件列表可能不完整', { exact: false }).waitFor();
    const noInitial = await f.run({ repository: 'example/project' });
    await page.goto(f.url(noInitial));
    await page
      .frameLocator('iframe')
      .getByText('选择一个 PR 开始审阅。', { exact: true })
      .waitFor();
    assert.equal((await f.events(noInitial)).length, 0);
    const calls = await f.calls();
    assert.ok(calls.some((args) => args[0] === 'pr' && args[1] === 'list' && args.includes('60')));
    assert.ok(
      calls
        .filter((args) => args[0] === 'api' && args[1] !== 'graphql')
        .every((args) => args.includes('GET')),
    );
    assert.equal(
      calls.some((args) => args[0] === 'pr' && !['list', 'view'].includes(args[1])),
      false,
    );
    const artifact = process.env.PANEON_TEST_ARTIFACTS;
    if (artifact) {
      await mkdir(artifact, { recursive: true });
      await page.goto(f.url(f.panel));
      await page.frameLocator('iframe').locator('[data-pr-overview]').waitFor();
      await page.screenshot({ path: join(artifact, 'github-pr.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log(
      'PR Chrome fixture passed: copied skill, list limits/search/state, native selection/copy, Markdown/diff text ranges and check display, same-head body/check changes, fixed-head old snapshots, cross-PR feedback, independent review request, query/event failures, size limits, explicit corrections, coverage and CLI events/ack.',
    );
  } catch (error) {
    console.error(
      await page
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
}

await test(
  'complete PR workflow including Markdown locate/navigation draft invariance',
  completeAcceptance,
);

await test('independent PR delivery, old sources, transport limits and failures', async () => {
  const f = await startGithubPRFixture();
  let browser, page;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
    });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(f.url());
    const frame = page.frameLocator('iframe'),
      button = (name) => frame.getByRole('button', { name, exact: true });
    const comments = annotationTools(frame, page);
    const finish = () => comments.save();
    await frame.getByRole('heading', { name: 'Review cache behavior #101', exact: true }).waitFor();
    await frame.locator('[data-markdown-annotation]').waitFor();

    await selectAnnotationText(frame, '[data-markdown-annotation] p');
    await finish();
    await frame.getByRole('tab', { name: '文件改动', exact: true }).click();
    await frame
      .locator('[data-code-side="new"][data-line="2"]')
      .filter({ hasText: 'n = 2' })
      .waitFor();
    await selectDiffLines(frame, 'new', 2);
    await finish();
    await f.state({ version: 1, headVersion: 1 });
    await button('刷新 PR').click();
    await frame.getByText('新的说明，缓存已经变化。', { exact: true }).waitFor();
    await frame.getByRole('button', { name: '#202 第二个 PR', exact: true }).click();
    await frame.getByRole('heading', { name: '第二个 PR #202', exact: true }).waitFor();
    await selectAnnotationText(frame, '[data-markdown-annotation] p');
    await finish();
    assert.equal(await comments.count(), 3);
    assert.equal((await f.events()).length, 0);
    await button('请 AI 审阅').click();
    await frame.getByRole('status').filter({ hasText: '审阅请求已发送给当前 AI。' }).waitFor();
    const requested = (await f.events())[0];
    assert.equal(requested.type, 'review-requested');
    assert.deepEqual(requested.payload, {
      repository: 'example/project',
      number: 202,
      baseCommit: ids.base,
      headCommit: ids.second,
    });
    const originalAnnotation = await comments.text(1);
    for (const [length, limit] of [
      [66000, '65536'],
      [100000, '262144'],
    ]) {
      await comments.edit(1);
      await comments.write('中'.repeat(length));
      await comments.save();
      await submitAnnotations(frame);
      await frame.getByRole('alert').filter({ hasText: limit }).waitFor();
      assert.equal(await comments.count(), 3);
      assert.equal((await f.events()).length, 1);
    }
    await comments.edit(1);
    await comments.write(originalAnnotation);
    await comments.save();
    const eventURL = `**/api/panels/${f.panel.instanceId}/events`;
    await page.route(eventURL, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: false,
              error: { code: 'TEST_FAILURE', message: 'Intentional independent save failure.' },
            }),
          })
        : route.continue(),
    );
    await submitAnnotations(frame);
    await frame
      .getByRole('alert')
      .filter({ hasText: 'Intentional independent save failure' })
      .waitFor();
    assert.equal(await comments.count(), 3);
    assert.equal((await f.events()).length, 1);
    await page.unroute(eventURL);
    await submitAnnotations(frame);
    await frame.locator('[data-slot="toast"]').filter({ hasText: '批注已提交。' }).waitFor();
    const first = (await f.events())[1];
    assert.equal(first.type, 'pr-feedback-submitted');
    assert.equal(first.payload.annotations.length, 3);
    assert.equal(Object.keys(first.payload.sources).length, 3);
    const oldDescription =
      first.payload.sources[first.payload.annotations[0].targets[0].ref.sourceId];
    assert.equal(oldDescription.kind, 'description');
    assert.equal(oldDescription.headCommit, ids.head);
    const oldDiff = first.payload.annotations[1].targets[0];
    assert.equal(oldDiff.ref.startLine, 2);
    assert.equal(oldDiff.text.quote, 'const n = 2;\r\n');
    assert.equal(first.payload.sources[oldDiff.ref.sourceId].headCommit, ids.head);
    assert.equal(
      first.payload.sources[first.payload.annotations[2].targets[0].ref.sourceId].number,
      202,
    );
    await comments.edit(1);
    await comments.write('明确更正');
    await finish();
    assert.equal((await f.events()).length, 2);
    await submitAnnotations(frame);
    await until(
      async () => (await f.events()).length === 3,
      'independent corrected feedback missing',
    );
    const corrected = (await f.events())[2];
    assert.equal(corrected.payload.annotations[0].id, first.payload.annotations[0].id);
    assert.equal(corrected.payload.annotations[0].comment, '明确更正');
    assert.equal(corrected.payload.replacesEventId, undefined);
    const execute = promisify(execFile),
      cli = async (...args) => {
        const out = await execute(
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
        const result = JSON.parse(out.stdout);
        assert.equal(result.ok, true);
        return result.data;
      };
    assert.equal(
      (await cli('events', f.panel.instanceId, '--consumer', 'independent-pr')).events.length,
      3,
    );
    await cli(
      'ack',
      f.panel.instanceId,
      '--consumer',
      'independent-pr',
      '--through',
      String(corrected.id),
    );
    assert.equal(
      (await cli('events', f.panel.instanceId, '--consumer', 'independent-pr')).events.length,
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      'Independent PR delivery passed; the complete-workflow case separately verifies Markdown locate/navigation.',
    );
  } finally {
    await browser?.close();
    await f.stop();
  }
});

await test('independent 300-file API coverage and omitted initial PR', async () => {
  const f = await startGithubPRFixture();
  let browser;
  try {
    await f.state({ coverage: true });
    browser = await chromium.launch({
      headless: true,
      channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(f.url());
    let frame = page.frameLocator('iframe');
    await frame.getByRole('heading', { name: 'Review cache behavior #101', exact: true }).waitFor();
    await frame.getByRole('tab', { name: '文件改动', exact: true }).click();
    await frame.getByText('文件列表可能不完整', { exact: false }).waitFor();
    assert.match(await frame.locator('main').last().textContent(), /300.*301/);
    assert.equal((await f.events()).length, 0);
    const noInitial = await f.run({ repository: 'example/project' });
    await page.goto(f.url(noInitial));
    frame = page.frameLocator('iframe');
    await frame.getByText('选择一个 PR 开始审阅。', { exact: true }).waitFor();
    assert.equal((await f.events(noInitial)).length, 0);
    console.log('Independent PR coverage and no-initial-detail navigation passed.');
  } finally {
    await browser?.close();
    await f.stop();
  }
});
