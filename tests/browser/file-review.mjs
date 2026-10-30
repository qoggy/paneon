import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';
import {
  annotationTools,
  openAnnotationDirectory,
  selectAnnotationText,
  submitAnnotations,
} from './annotation-tools.mjs';

const root = await realpath(await mkdtemp(join(tmpdir(), 'paneon-file-review-')));
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-file-review-acceptance';
let service, browser;
try {
  const skill = join(root, 'skill');
  await cp(
    process.env.PANEON_TEST_SKILL_SOURCE ?? new URL('../../skills/paneon', import.meta.url),
    skill,
    { recursive: true },
  );
  await mkdir(join(root, 'docs'));
  await mkdir(artifacts, { recursive: true });
  const markdown = '# 缓存方案🙂\n\n正文 **精确范围**。\n\n[关联文件](../linked.ts)\n';
  const code = 'const first = "中文🙂";\r\nrepeat\rrepeat\r\n' + 'x'.repeat(300) + '\n';
  const linked = 'const timeout = 30000;\n';
  await Promise.all([
    writeFile(join(root, 'docs/plan.MARKDOWN'), markdown),
    writeFile(join(root, 'docs/notes.md'), '# Notes\n'),
    writeFile(join(root, 'source#?%.ts'), code),
    writeFile(join(root, 'config.json'), '{"ttl":30000}\n'),
    writeFile(join(root, 'linked.ts'), linked),
    writeFile(join(root, 'unknown.xyz'), 'plain text'),
    writeFile(join(root, 'empty'), ''),
    writeFile(join(root, 'large.xyz'), ('near limit ' + 'x'.repeat(500) + '\n').repeat(2000)),
  ]);
  service = await startServer(join(root, 'runtime'));
  await service.app.inject({
    method: 'POST',
    url: '/api/preferences',
    headers: {
      host: `127.0.0.1:${service.descriptor.port}`,
      authorization: `Bearer ${service.descriptor.controlToken}`,
    },
    payload: { ui: { language: 'zh-CN' } },
  });
  const files = [
    'docs/plan.MARKDOWN',
    'source#?%.ts',
    'config.json',
    'unknown.xyz',
    'empty',
    'missing',
    'large.xyz',
    'source#?%.ts',
    'docs/notes.md',
  ];
  const run = (files, title = '缓存方案与实现') =>
    service.runtime.run(
      join(skill, 'assets/panels/file-review/panel.tsx'),
      root,
      { files, title },
      false,
    );
  const panel = await run(files);
  assert.equal(panel.definitionId, 'file-review');
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const url = (panel) => `http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`;
  await page.goto(url(panel));
  const frame = page.frameLocator('iframe');
  const comments = annotationTools(frame, page);
  const path = frame.locator('[data-file-review-path]');
  const viewport = frame.locator('[data-file-review-viewport]');
  const row = (index) => frame.locator(`[data-tree-item="file:${index}"]`);
  const search = frame.getByRole('textbox', { name: '搜索文件', exact: true });
  const line = (number) => viewport.locator(`[data-code-line="${number}"]`);
  await frame.locator('strong [data-source-leaf]').waitFor();
  const save = async (selector, start, end, comment) => {
    await selectAnnotationText(frame, selector, start, end);
    await comments.write(comment);
    await comments.save();
    await frame.locator('[data-annotation-editor]').waitFor({ state: 'hidden' });
  };
  await save('strong [data-source-leaf]', 0, 4, '确认原始 Markdown 范围');
  await frame.getByRole('link', { name: '关联文件', exact: true }).click();
  await frame.locator('[data-slot="file-preview-source"] [data-code-line="1"]').waitFor();
  await save('[data-slot="file-preview-source"] [data-code-line="1"]', 16, 21, '确认链接文件来源');
  await frame.locator('[data-slot="file-preview"]').press('Escape');
  await frame.locator('[data-slot="file-preview"]').waitFor({ state: 'hidden' });

  await search.fill(root.toUpperCase() + '/SOURCE');
  assert.equal(
    await row(1).count(),
    1,
    'Search resolves unread absolute paths without reading them',
  );
  assert.equal(await row(0).count(), 0);
  await search.fill('');
  await row(1).click();
  await line(3).filter({ hasText: 'repeat' }).waitFor();
  assert.equal(await path.textContent(), files[1]);
  assert.equal(await viewport.locator('[data-slot="code-block-header"]').count(), 0);
  assert.equal(
    await frame.locator('[data-markdown-annotation]').count(),
    0,
    'Only the active renderer stays mounted',
  );
  await save('[data-file-review-viewport] [data-code-line="3"]', 0, 6, '第二次 repeat');
  await selectAnnotationText(frame, '[data-file-review-viewport] [data-code-line="1"]', 15, 19);
  await comments.write('未保存草稿');
  const editor = frame.locator('[data-annotation-editor]');
  const oldPath = await path.textContent();
  // Modal outside interaction must retain the editor and block file navigation.
  const treeBox = await row(2).boundingBox();
  await page.mouse.click(treeBox.x + treeBox.width / 2, treeBox.y + treeBox.height / 2);
  assert.equal(await editor.locator('textarea').inputValue(), '未保存草稿');
  assert.equal(await path.textContent(), oldPath);
  await editor.locator('textarea').press('Escape');
  await editor.waitFor({ state: 'hidden' });

  const reads = [];
  const observe = (request) => {
    if (decodeURIComponent(request.url()).endsWith('/actions.ts#readFile'))
      reads.push(request.postDataJSON().input.fileIndex);
  };
  page.on('request', observe);
  const group = frame.getByRole('button', { name: '按目录分组', exact: true });
  const directory = frame.locator('[data-tree-item="directory:docs"]');
  const expand = frame.getByRole('button', { name: '全部展开', exact: true });
  const collapse = frame.getByRole('button', { name: '全部折叠', exact: true });
  assert.equal(
    await frame.getByRole('button', { name: /^(查看当前文件|View current file)$/ }).count(),
    0,
  );
  assert.deepEqual(
    await frame
      .getByRole('toolbar', { name: '文件操作' })
      .getByRole('button')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label'))),
    ['按目录分组', '全部展开', '全部折叠'],
  );
  assert.equal(await directory.getAttribute('title'), 'docs · 2');
  assert.equal(await directory.locator('span').last().textContent(), '2');
  await directory.click();
  assert.equal(await directory.getAttribute('aria-expanded'), 'false');
  const retainedCode = await viewport.locator('code').elementHandle();
  await group.click();
  assert.equal(await group.getAttribute('aria-pressed'), 'false');
  assert.equal(await frame.locator('[data-tree-item^="directory:"]').count(), 0);
  await row(0).getByText('docs', { exact: true }).waitFor();
  assert.equal(await row(1).getAttribute('aria-pressed'), 'true');
  assert.equal(await row(7).getAttribute('aria-pressed'), 'false');
  assert.equal(await expand.isDisabled(), true);
  assert.equal(await collapse.isDisabled(), true);
  await search.fill(root.toUpperCase() + '/DOCS/PLAN');
  await row(0).waitFor();
  assert.equal(await row(1).count(), 0);
  await group.click();
  assert.equal(await directory.getAttribute('title'), 'docs · 1');
  await row(0).waitFor();
  assert.equal(await collapse.isDisabled(), true);
  await search.fill('');
  assert.equal(await directory.getAttribute('title'), 'docs · 2');
  assert.equal(await directory.getAttribute('aria-expanded'), 'false');
  await row(0).waitFor({ state: 'hidden' });
  assert.equal(await path.textContent(), files[1]);
  assert.equal(await retainedCode.evaluate((element) => element.isConnected), true);
  assert.equal(await comments.count(), 3);
  assert.deepEqual(reads, [], 'Navigation presentation does not reread files');
  const splitter = frame.getByRole('separator', { name: '调整文件列表与预览宽度', exact: true });
  const left = frame.locator('[data-file-review-split] [data-panel="true"]').first();
  const before = (await left.boundingBox()).width;
  const handle = await splitter.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 70, handle.y + handle.height / 2, { steps: 8 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.ok(Math.abs((await left.boundingBox()).width - before) < 2);
  await splitter.press('ArrowRight');
  assert.ok((await left.boundingBox()).width > before + 10);
  assert.deepEqual(reads, []);
  await writeFile(join(root, files[1]), 'CHANGED');
  await unlink(join(root, 'linked.ts'));
  await row(2).click();
  await line(1).filter({ hasText: 'ttl' }).waitFor();
  await row(1).click();
  await line(3).filter({ hasText: 'repeat' }).waitFor();
  assert.deepEqual(reads, [2], 'Returning uses the retained source');
  await page.screenshot({ path: join(artifacts, 'file-review-code-light.png') });

  await search.fill('config');
  await group.click();
  await comments.locate(1);
  assert.equal(await search.inputValue(), '');
  assert.equal(await path.textContent(), files[0]);
  assert.equal(await viewport.evaluate(() => document.getSelection().toString()), '精确范围');
  assert.equal(await group.getAttribute('aria-pressed'), 'false');
  await group.click();
  assert.equal(await directory.getAttribute('aria-expanded'), 'true');
  assert.equal(await row(0).getAttribute('aria-pressed'), 'true');
  await row(2).click();
  await line(1).filter({ hasText: 'ttl' }).waitFor();
  await comments.locate(2);
  await frame.locator('[data-slot="file-preview-source"]').waitFor();
  assert.equal(
    await frame
      .locator('[data-slot="file-preview-source"]')
      .evaluate(() => document.getSelection().toString()),
    '30000',
  );
  await frame.locator('[data-slot="file-preview"]').press('Escape');
  await frame.locator('[data-slot="file-preview"]').waitFor({ state: 'hidden' });
  await comments.locate(3);
  await line(3).waitFor();
  assert.equal(await viewport.evaluate(() => document.getSelection().toString()), 'repeat');
  // Registration after asynchronous highlighting must retain the second occurrence's source coordinates.
  await viewport.locator('[data-shiki-token]').first().waitFor();
  await row(2).click();
  await line(1).filter({ hasText: 'ttl' }).waitFor();
  await comments.locate(3);
  assert.equal(await viewport.evaluate(() => document.getSelection().toString()), 'repeat');
  await save('[data-file-review-path] [data-annotation-text]', 0, 6, '确认路径批注');
  await row(2).click();
  await line(1).filter({ hasText: 'ttl' }).waitFor();
  await search.fill('config');
  const readsBeforePathLocate = [...reads];
  await comments.locate(4);
  assert.equal(await path.textContent(), files[1]);
  assert.equal(await search.inputValue(), '');
  assert.deepEqual(
    await path.evaluate(() => {
      const selection = document.getSelection();
      return {
        quote: selection.toString(),
        start: selection.anchorOffset,
        inPath: !!selection.anchorNode.parentElement.closest('[data-file-review-path]'),
      };
    }),
    { quote: 'source', start: 0, inPath: true },
  );
  assert.deepEqual(reads, readsBeforePathLocate, 'Path locate uses the retained snapshot');
  await page.screenshot({ path: join(artifacts, 'file-review-path-annotation.png') });
  assert.equal(
    (await service.runtime.events(panel.instanceId, 'file-review-test', 100, 0)).events.length,
    0,
  );

  const events = async () =>
    (await service.runtime.events(panel.instanceId, 'file-review-test', 100, 1000)).events;
  const submit = async () => {
    const response = page.waitForResponse(
      (response) => response.url().endsWith('/events') && response.request().method() === 'POST',
    );
    await submitAnnotations(frame);
    assert.equal((await response).status(), 200);
  };
  const failSubmission = async (kind, status, message) => {
    const pattern =
      kind === 'validation'
        ? `**/api/panels/${panel.instanceId}/actions/**`
        : `**/api/panels/${panel.instanceId}/events`;
    await page.route(pattern, (route) => {
      if (
        route.request().method() !== 'POST' ||
        (kind === 'validation' &&
          !decodeURIComponent(route.request().url()).endsWith('/actions.ts#validateFeedback'))
      )
        return route.continue();
      return route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: { code: 'TEST_FAILURE', message } }),
      });
    });
    await submitAnnotations(frame);
    await frame.getByRole('alert').filter({ hasText: message }).first().waitFor();
    assert.equal(await comments.count(), 4);
    await page.unroute(pattern);
  };
  for (const [kind, status, message] of [
    ['validation', 400, 'Range validation failed'],
    ['event', 413, 'Event payload too large'],
    ['event', 500, 'Save failed'],
  ]) {
    await failSubmission(kind, status, message);
    assert.equal((await events()).length, 0);
  }
  await submit();
  const first = (await events())[0];
  assert.equal(first.type, 'file-review-submitted');
  assert.deepEqual(
    first.payload.files.map((file) => file.path),
    [join(root, files[0]), join(root, 'linked.ts'), join(root, files[1])],
  );
  assert.deepEqual(first.payload.files[2].annotations[0].targets[0].text, {
    start: code.indexOf('repeat', code.indexOf('repeat') + 1),
    end: code.indexOf('repeat', code.indexOf('repeat') + 1) + 6,
    quote: 'repeat',
  });
  assert.equal(first.payload.files[1].annotations[0].targets[0].text.quote, '30000');
  assert.deepEqual(first.payload.files[2].annotations[1], {
    targets: [{ path: { quote: 'source' } }],
    comment: '确认路径批注',
  });
  assert.equal(JSON.stringify(first.payload).includes('sourceRef'), false);
  assert.equal(JSON.stringify(first.payload).includes('fileIndex'), false);
  await openAnnotationDirectory(frame);
  await frame.getByRole('button', { name: '修改反馈', exact: true }).click();
  await comments.edit(3);
  await frame.locator('[data-annotation-editor] textarea').fill('修正第二次 repeat');
  await frame.getByRole('button', { name: '保存', exact: true }).click();
  await comments.edit(4);
  await frame.locator('[data-annotation-editor] textarea').fill('修正路径批注');
  await frame.getByRole('button', { name: '保存', exact: true }).click();
  await failSubmission('event', 500, 'Correction failed');
  assert.equal((await events()).length, 1);
  await submit();
  const corrected = (await events())[1];
  assert.equal(corrected.payload.replacesEventId, first.id);
  assert.equal(corrected.payload.files.length, 3);
  assert.equal(corrected.payload.files[2].annotations[0].comment, '修正第二次 repeat');
  assert.deepEqual(corrected.payload.files[2].annotations[1], {
    targets: [{ path: { quote: 'source' } }],
    comment: '修正路径批注',
  });
  await openAnnotationDirectory(frame);
  await frame.getByRole('button', { name: '修改反馈', exact: true }).click();
  for (let number = 4; number >= 1; number--) await comments.remove(number);
  await submit();
  assert.deepEqual((await events())[2].payload, { files: [], replacesEventId: corrected.id });

  await row(3).click();
  await line(1).filter({ hasText: 'plain text' }).waitFor();
  assert.equal(await viewport.locator('pre').getAttribute('data-language'), 'text');
  await row(4).click();
  await viewport.getByText('文件没有内容。', { exact: true }).waitFor();
  await row(5).click();
  await viewport.getByRole('alert').filter({ hasText: '读取文件失败。' }).waitFor();
  const started = Date.now();
  await row(6).click();
  await line(2000).waitFor();
  console.log(`Near-limit 1,024,000-byte preview ready in ${Date.now() - started}ms`);
  await row(2).click();
  await line(1).filter({ hasText: 'ttl' }).waitFor();
  // The duplicate entry reads independently after disk change.
  await row(7).click();
  await line(1).filter({ hasText: 'CHANGED' }).waitFor();
  page.off('request', observe);

  await service.app.inject({
    method: 'POST',
    url: '/api/preferences',
    headers: {
      host: `127.0.0.1:${service.descriptor.port}`,
      authorization: `Bearer ${service.descriptor.controlToken}`,
    },
    payload: { ui: { language: 'en', theme: 'dark' } },
  });
  await frame.getByRole('heading', { name: '缓存方案与实现' }).waitFor();
  await row(2).click();
  await line(1).filter({ hasText: 'ttl' }).waitFor();
  await frame.locator('html.dark').waitFor();
  await page.screenshot({ path: join(artifacts, 'file-review-code-dark.png') });

  const single = await run(['docs/plan.MARKDOWN'], 'Single document');
  await page.goto(url(single));
  await frame.locator('strong [data-source-leaf]').waitFor();
  assert.equal(await frame.locator('[data-file-review-split]').count(), 0);
  assert.equal(await frame.getByRole('separator').count(), 0);
  await page.screenshot({ path: join(artifacts, 'file-review-single.png') });

  // Delay the real first response to verify that navigation cannot attach it to another file.
  const late = await run(['config.json', 'unknown.xyz'], 'Late reads');
  let release, received, finished;
  const delayed = new Promise((resolve) => {
    received = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const settled = new Promise((resolve) => {
    finished = resolve;
  });
  const actionURL = `**/api/panels/${late.instanceId}/actions/**`;
  await page.route(actionURL, async (route) => {
    if (
      !decodeURIComponent(route.request().url()).endsWith('/actions.ts#readFile') ||
      route.request().postDataJSON()?.input?.fileIndex !== 0
    )
      return route.continue();
    const response = await route.fetch();
    received();
    await gate;
    await route.fulfill({ response });
    finished();
  });
  await page.goto(url(late));
  await delayed;
  await row(1).click();
  await line(1).filter({ hasText: 'plain text' }).waitFor();
  release();
  await settled;
  assert.equal(await path.textContent(), 'unknown.xyz');
  assert.match(await line(1).textContent(), /plain text/);
  await page.unroute(actionURL);
  await row(0).click();
  await line(1).filter({ hasText: 'ttl' }).waitFor();
  await row(1).press('Enter');
  await line(1).filter({ hasText: 'plain text' }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'File review: copied Skill, literal paths, single/multi-file tree/search/keyboard/split, main and linked snapshot remount/locate, CRLF/CR/Unicode/repeated text, failure/correction/withdrawal, unknown/empty/missing/near-limit files, late reads and light/dark desktop passed.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
