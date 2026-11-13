import { SKILL_ROOT } from '../skill-paths.ts';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';
import { assertFileIcons } from './file-icon-tools.mjs';
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
  await cp(process.env.PANEON_TEST_SKILL_SOURCE ?? SKILL_ROOT, skill, { recursive: true });
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
  const loadingPanel = await service.runtime.run(
    join(skill, 'assets/panels/file-review/panel.tsx'),
    root,
    { directories: ['docs'] },
    false,
  );
  let releaseScan;
  const scanGate = new Promise((resolve) => {
    releaseScan = resolve;
  });
  const loadingActions = `**/api/panels/${loadingPanel.instanceId}/actions/**`;
  await page.route(loadingActions, async (route) => {
    if (decodeURIComponent(route.request().url()).endsWith('/actions.ts#resolvePaths'))
      await scanGate;
    await route.continue();
  });
  await page.goto(url(loadingPanel));
  const loadingFrame = page.frameLocator('iframe');
  const sidebar = loadingFrame.locator('[data-file-review-sidebar]');
  const scanning = sidebar.getByRole('status').filter({ hasText: '正在加载文件列表…' });
  await scanning.waitFor();
  assert.equal(
    await sidebar.getByRole('group', { name: '审阅文件' }).getAttribute('aria-busy'),
    'true',
  );
  assert.equal(await loadingFrame.getByText('没有匹配的文件。', { exact: true }).count(), 0);
  assert.equal(await loadingFrame.locator('[data-file-review-viewport]').count(), 0);
  const loadingSearch = loadingFrame.getByRole('textbox', { name: '搜索文件', exact: true });
  await loadingSearch.fill('__no_match_while_loading__');
  assert.equal(await scanning.count(), 1);
  assert.equal(await loadingFrame.getByText('没有匹配的文件。', { exact: true }).count(), 0);
  await page.screenshot({ path: join(artifacts, 'directory-loading.png'), fullPage: true });
  releaseScan();
  await loadingFrame.getByText('没有匹配的文件。', { exact: true }).waitFor();
  assert.equal(
    await sidebar.getByRole('group', { name: '审阅文件' }).getAttribute('aria-busy'),
    'false',
  );
  await loadingSearch.fill('');
  await loadingFrame.locator('[data-tree-item^="file:"]').first().waitFor();
  assert.equal(await scanning.count(), 0);
  await page.unroute(loadingActions);
  // Resolve mixed path spellings before grouping, including a file outside the panel cwd.
  const mixedFiles = [
    join(root, 'docs/plan.MARKDOWN'),
    './notes.md',
    '../docs/plan.MARKDOWN',
    join(root, 'config.json'),
  ];
  const mixed = await service.runtime.run(
    join(skill, 'assets/panels/file-review/panel.tsx'),
    join(root, 'docs'),
    { files: mixedFiles },
    false,
  );
  let releasePaths;
  const pathsGate = new Promise((resolve) => {
    releasePaths = resolve;
  });
  const mixedActions = `**/api/panels/${mixed.instanceId}/actions/**`;
  await page.route(mixedActions, async (route) => {
    if (decodeURIComponent(route.request().url()).endsWith('/actions.ts#resolvePaths'))
      await pathsGate;
    await route.continue();
  });
  await page.goto(url(mixed));
  const mixedFrame = page.frameLocator('iframe');
  await mixedFrame.locator('strong [data-source-leaf]').waitFor();
  const pendingDirectories = await mixedFrame.locator('[data-tree-item^="directory:"]').count();
  assert.equal(
    await mixedFrame.locator('[data-file-review-sidebar]').getByRole('status').count(),
    1,
  );
  assert.equal(await mixedFrame.getByText('没有匹配的文件。', { exact: true }).count(), 0);
  releasePaths();
  assert.equal(pendingDirectories, 0, 'Pending resolution must not show literal path roots');
  const mixedDirectory = mixedFrame.locator(`[data-tree-item="directory:${root}/docs"]`);
  await mixedFrame.locator('[data-tree-item="file:1"]').waitFor();
  assert.equal(await mixedFrame.locator('[data-tree-item^="directory:"]').count(), 2);
  assert.equal(await mixedDirectory.getAttribute('aria-expanded'), 'true');
  assert.equal(await mixedDirectory.getAttribute('title'), 'docs · 3');
  assert.equal(
    await mixedFrame.locator(`[data-tree-item="directory:${root}"]`).getAttribute('title'),
    `${root} · 4`,
  );
  const mixedChildren = await mixedDirectory.getAttribute('aria-controls');
  assert.ok(mixedChildren);
  assert.deepEqual(
    await mixedFrame
      .locator(`[id="${mixedChildren}"] [data-tree-item^="file:"]`)
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-tree-item'))),
    ['file:1', 'file:0', 'file:2'],
    'Equivalent paths share a directory while duplicate entries retain their indices',
  );
  await mixedFrame.locator('[data-tree-item="file:1"]').click();
  await mixedFrame.getByRole('heading', { name: 'Notes', exact: true }).waitFor();
  assert.equal(await mixedFrame.locator('[data-file-review-path]').textContent(), './notes.md');
  await page.unroute(mixedActions);
  await page.goto(url(panel));
  const frame = page.frameLocator('iframe');
  const comments = annotationTools(frame, page);
  const path = frame.locator('[data-file-review-path]');
  const viewport = frame.locator('[data-file-review-viewport]');
  const row = (index) => frame.locator(`[data-tree-item="file:${index}"]`);
  const search = frame.getByRole('textbox', { name: '搜索文件', exact: true });
  const line = (number) => viewport.locator(`[data-code-line="${number}"]`);
  await frame.locator('strong [data-source-leaf]').waitFor();
  await assertFileIcons(frame.locator('[data-tree-item^="file:"]'), files.length);
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
  const directory = frame.locator(`[data-tree-item="directory:${root}/docs"]`);
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
  await viewport.getByRole('status').filter({ hasText: '文件不存在' }).waitFor();
  assert.equal(await path.textContent(), files[5]);
  await viewport
    .getByText('此路径下没有文件。请检查路径是否正确，以及文件是否已被移动或删除。')
    .waitFor();
  assert.equal(await viewport.getByRole('alert').count(), 0);
  assert.equal(await viewport.getByText('The action failed.', { exact: true }).count(), 0);
  await page.screenshot({ path: join(artifacts, 'file-review-missing-light.png') });
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
  await row(5).click();
  await viewport.getByRole('status').filter({ hasText: 'File not found' }).waitFor();
  await viewport
    .getByText(
      'No file exists at this path. Check that the path is correct and the file has not been moved or deleted.',
    )
    .waitFor();
  assert.equal(await viewport.getByRole('alert').count(), 0);
  await page.screenshot({ path: join(artifacts, 'file-review-missing-dark.png') });

  const single = await run(['docs/plan.MARKDOWN'], 'Single document');
  await page.goto(url(single));
  await frame.locator('strong [data-source-leaf]').waitFor();
  assert.equal(await frame.locator('[data-file-review-split]').count(), 0);
  assert.equal(await frame.getByRole('separator').count(), 0);
  await page.screenshot({ path: join(artifacts, 'file-review-single.png') });

  await service.app.inject({
    method: 'POST',
    url: '/api/preferences',
    headers: {
      host: `127.0.0.1:${service.descriptor.port}`,
      authorization: `Bearer ${service.descriptor.controlToken}`,
    },
    payload: { ui: { language: 'zh-CN', theme: 'light' } },
  });
  const viewSource = [
    '# Markdown 视图切换',
    '',
    '正文 **保留批注🙂**。',
    '',
    '[相同标签](./first.md) 与 [相同标签](./second.md)',
    '',
    `<!-- ${'long source line '.repeat(80)} -->`,
    '',
    ...Array.from({ length: 45 }, (_, index) => `第 ${index + 1} 段正文，用于验证阅读位置。`),
  ].join('\r\n');
  await writeFile(join(root, 'views.md'), viewSource);
  await writeFile(join(root, 'long.ts'), `export const message = "${'x'.repeat(400)}";\n`);
  const views = await run(['views.md', 'docs/notes.md', 'long.ts'], 'Markdown 视图切换');
  await page.goto(url(views));
  const renderedTab = frame.getByRole('tab', { name: '渲染', exact: true });
  const sourceTab = frame.getByRole('tab', { name: '源码', exact: true });
  await frame.locator('strong [data-source-leaf]').waitFor();
  assert.equal(await renderedTab.getAttribute('aria-selected'), 'true');
  await save('strong [data-source-leaf]', 0, '保留批注🙂'.length, '正文批注');
  await sourceTab.click();
  await line(3).filter({ hasText: '**保留批注🙂**' }).waitFor();
  assert.equal(await viewport.locator('[data-markdown-annotation]').count(), 0);
  assert.equal(await viewport.locator('pre').getAttribute('data-language'), 'markdown');
  const sourceViewport = viewport.locator(
    ':scope > [data-slot="code-block"] > [data-slot="code-block-content"]',
  );
  const scrollSource = async (left) => {
    await sourceViewport.evaluate((element, left) => {
      element.scrollLeft = left;
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, left);
    assert.equal(await sourceViewport.evaluate((element) => element.scrollLeft), left);
  };
  await scrollSource(400);
  await row(1).click();
  await viewport.getByRole('heading', { name: 'Notes' }).waitFor();
  await row(0).click();
  await line(3).waitFor();
  assert.equal(await sourceViewport.evaluate((element) => element.scrollLeft), 400);
  await renderedTab.click();
  await frame.locator('strong [data-source-leaf]').waitFor();
  await sourceTab.click();
  await line(3).waitFor();
  assert.equal(await sourceViewport.evaluate((element) => element.scrollLeft), 400);
  await scrollSource(0);
  await comments.locate(1);
  assert.equal(await sourceTab.getAttribute('aria-selected'), 'true');
  assert.equal(await viewport.evaluate(() => document.getSelection()?.toString()), '保留批注🙂');
  await save('[data-code-line="3"]', 3, 3 + '**保留批注🙂**'.length, '格式标记批注');
  const urlStart = '[相同标签](./first.md) 与 [相同标签]('.length;
  await save('[data-code-line="5"]', urlStart, urlStart + './second.md'.length, '第二个链接地址');

  await renderedTab.click();
  await comments.locate(1);
  assert.equal(await renderedTab.getAttribute('aria-selected'), 'true');
  assert.equal(await viewport.evaluate(() => document.getSelection()?.toString()), '保留批注🙂');
  await comments.locate(2);
  await line(3).waitFor();
  assert.equal(await sourceTab.getAttribute('aria-selected'), 'true');
  assert.equal(
    await viewport.evaluate(() => document.getSelection()?.toString()),
    '**保留批注🙂**',
  );
  await renderedTab.click();
  await comments.locate(3);
  await line(5).waitFor();
  assert.equal(await sourceTab.getAttribute('aria-selected'), 'true');
  assert.equal(await viewport.evaluate(() => document.getSelection()?.toString()), './second.md');
  await page.screenshot({
    path: join(artifacts, 'file-review-markdown-source.png'),
    animations: 'disabled',
  });

  await row(1).click();
  await viewport.getByRole('heading', { name: 'Notes' }).waitFor();
  assert.equal(await renderedTab.getAttribute('aria-selected'), 'true');
  await row(0).click();
  await line(3).waitFor();
  assert.equal(await sourceTab.getAttribute('aria-selected'), 'true');
  await row(2).click();
  await line(1).filter({ hasText: 'export const message' }).waitFor();
  assert.equal(await frame.getByRole('tablist').count(), 0);
  await scrollSource(250);
  await row(1).click();
  await viewport.getByRole('heading', { name: 'Notes' }).waitFor();
  await row(2).click();
  await line(1).filter({ hasText: 'export const message' }).waitFor();
  assert.equal(await sourceViewport.evaluate((element) => element.scrollLeft), 250);
  await comments.locate(1);
  await line(3).waitFor();
  assert.equal(await sourceTab.getAttribute('aria-selected'), 'true');

  // Each view keeps its own scroll position; only the active renderer is mounted.
  await viewport.evaluate((element) => {
    element.scrollTop = 300;
  });
  // Wait for the scroll event that records the position before changing views.
  await viewport.evaluate(
    (element) =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await renderedTab.click();
  await frame.locator('strong [data-source-leaf]').waitFor();
  assert.equal(await viewport.locator('[data-code-line]').count(), 0);
  await sourceTab.click();
  await line(3).waitFor();
  assert.equal(await viewport.evaluate((element) => element.scrollTop), 300);
  await renderedTab.click();
  await frame.locator('strong [data-source-leaf]').waitFor();
  await viewport.evaluate((element) => {
    element.scrollTop = 0;
  });
  assert.equal(await renderedTab.getAttribute('aria-selected'), 'true');
  await page.screenshot({
    path: join(artifacts, 'file-review-markdown-rendered.png'),
    animations: 'disabled',
  });
  await renderedTab.focus();
  await renderedTab.press('ArrowRight');
  await line(3).waitFor();
  assert.equal(await sourceTab.getAttribute('aria-selected'), 'true');
  await sourceTab.press('ArrowLeft');
  await frame.locator('strong [data-source-leaf]').waitFor();
  const compactPage = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await compactPage.goto(url(views));
  const compactFrame = compactPage.frameLocator('iframe');
  await compactFrame.locator('strong [data-source-leaf]').waitFor();
  await compactPage.screenshot({
    path: join(artifacts, 'file-review-markdown-compact.png'),
    animations: 'disabled',
  });
  assert.equal(
    await compactFrame
      .locator('html')
      .evaluate((element) => element.scrollWidth > element.clientWidth),
    false,
  );
  await compactPage.close();

  await submitAnnotations(frame);
  const viewEvents = await service.runtime.events(
    views.instanceId,
    'markdown-views-test',
    100,
    1000,
  );
  assert.equal(viewEvents.events.length, 1);
  const submitted = viewEvents.events[0].payload.files[0];
  assert.equal(submitted.annotations.length, 3);
  assert.deepEqual(submitted.annotations[2].targets[0].text, {
    start: viewSource.indexOf('./second.md'),
    end: viewSource.indexOf('./second.md') + './second.md'.length,
    quote: './second.md',
  });
  assert.equal(JSON.stringify(submitted).includes('fileIndex'), false);

  // An image registers its range while loading; locating it must retain Rendered.
  await cp(new URL('../fixtures/checkout.svg', import.meta.url), join(root, 'screen.svg'));
  await writeFile(join(root, 'media.md'), '# 图片审阅\n\n![Checkout](./screen.svg)\n');
  const mediaPanel = await run(['media.md', 'long.ts'], '图片批注定位');
  await page.goto(url(mediaPanel));
  const image = viewport.locator('img[alt="Checkout"]');
  await image.waitFor();
  await image.hover();
  await viewport
    .locator('[data-slot="image"]')
    .getByRole('button', { name: '批注', exact: true })
    .click();
  await comments.write('确认图片批注仍定位到渲染视图');
  await comments.save();
  await frame.locator('[data-annotation-editor]').waitFor({ state: 'hidden' });
  await row(1).click();
  await line(1).filter({ hasText: 'export const message' }).waitFor();
  let releaseImage;
  const imageGate = new Promise((resolve) => {
    releaseImage = resolve;
  });
  const imageAction = `**/api/panels/${mediaPanel.instanceId}/actions/**`;
  const isImageRead = (request) => decodeURIComponent(request.url()).includes('/image#readImage');
  const holdImageRead = async (route) => {
    if (isImageRead(route.request())) await imageGate;
    await route.continue();
  };
  await page.route(imageAction, holdImageRead);
  try {
    // Gate Image's actual reader, not a timer, to exercise its pending object registration.
    const readingImage = page.waitForRequest(isImageRead);
    await comments.locate(1);
    await readingImage;
    await viewport.locator('[data-slot="image"]').getByRole('status').waitFor();
    assert.equal(await renderedTab.getAttribute('aria-selected'), 'true');
    releaseImage();
    await image.waitFor();
    assert.equal(await renderedTab.getAttribute('aria-selected'), 'true');
    assert.equal(await viewport.locator('[data-code-line]').count(), 0);
  } finally {
    releaseImage();
    await page.unrouteAll({ behavior: 'wait' });
  }
  assert.equal(
    (await service.runtime.events(mediaPanel.instanceId, 'media-location-test', 100, 0)).events
      .length,
    0,
  );

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

  await mkdir(join(root, 'review-source'));
  await mkdir(join(root, 'review-tests'));
  await mkdir(join(root, 'review-empty'));
  await writeFile(join(root, 'review-source/api.ts'), 'export const directoryValue = 42;\n');
  await writeFile(join(root, 'review-tests/api.test.ts'), 'expect(directoryValue).toBe(42);\n');
  const runDirectories = (params) =>
    service.runtime.run(join(skill, 'assets/panels/file-review/panel.tsx'), root, params, false);
  const directoryPanel = await runDirectories({
    files: ['docs/notes.md'],
    directories: ['review-source', 'review-tests', './review-source'],
  });
  const directoryReads = [];
  const directoryObserver = (request) => {
    if (
      request.url().includes(`/panels/${directoryPanel.instanceId}/`) &&
      decodeURIComponent(request.url()).endsWith('/actions.ts#readFile')
    )
      directoryReads.push(request.postDataJSON().input);
  };
  page.on('request', directoryObserver);
  await page.goto(url(directoryPanel));
  await viewport.getByRole('heading', { name: 'Notes', exact: true }).waitFor();
  for (const name of ['docs', 'review-source', 'review-tests']) {
    const branch = frame.locator(`[data-tree-item="directory:${join(root, name)}"]`);
    await branch.waitFor();
    assert.equal(await branch.getAttribute('aria-expanded'), 'true');
  }
  assert.equal(await row(0).count(), 1, 'The explicit file is initially visible');
  await search.fill('api.ts');
  await row(1).click();
  await line(1).filter({ hasText: 'directoryValue' }).waitFor();
  assert.equal(await path.textContent(), 'review-source/api.ts');
  await save('[data-file-review-viewport] [data-code-line="1"]', 13, 27, '目录文件批注');
  await unlink(join(root, 'review-source/api.ts'));
  await search.fill('api.test.ts');
  await row(2).click();
  await line(1).filter({ hasText: 'expect' }).waitFor();
  await comments.locate(1);
  await line(1).filter({ hasText: 'export const directoryValue' }).waitFor();
  assert.equal(await path.textContent(), 'review-source/api.ts');
  assert.equal(await search.inputValue(), '');
  assert.equal(directoryReads.filter((input) => input.fileIndex === 1).length, 1);
  assert.ok(directoryReads.every((input) => !('files' in input) && typeof input.path === 'string'));
  await submit();
  const directoryEvent = (
    await service.runtime.events(directoryPanel.instanceId, 'directory-test', 100, 0)
  ).events[0];
  assert.equal(directoryEvent.type, 'file-review-submitted');
  assert.equal(directoryEvent.payload.files[0].path, join(root, 'review-source/api.ts'));
  assert.equal(
    directoryEvent.payload.files[0].annotations[0].targets[0].text.quote,
    'directoryValue',
  );
  page.off('request', directoryObserver);

  const oneDirectoryFile = await runDirectories({ directories: ['review-tests'] });
  await page.goto(url(oneDirectoryFile));
  await line(1).filter({ hasText: 'expect' }).waitFor();
  assert.equal(await frame.locator('[data-file-review-split]').count(), 1);
  assert.equal(await path.textContent(), 'review-tests/api.test.ts');
  const emptyDirectory = await runDirectories({ directories: ['review-empty'] });
  await page.goto(url(emptyDirectory));
  await frame.getByText('目录中没有文件。', { exact: true }).waitFor();
  assert.equal(await viewport.count(), 0);
  const failedDirectory = await runDirectories({ directories: ['review-missing'] });
  await page.goto(url(failedDirectory));
  await frame
    .locator('[data-file-review-sidebar]')
    .getByText('目录读取失败。', { exact: true })
    .waitFor();
  assert.equal(await frame.getByText('没有匹配的文件。', { exact: true }).count(), 0);
  assert.equal(await viewport.count(), 0);
  const partialDirectory = await runDirectories({
    files: ['docs/notes.md'],
    directories: ['review-missing'],
  });
  await page.goto(url(partialDirectory));
  await viewport.getByRole('heading', { name: 'Notes', exact: true }).waitFor();
  await frame.getByRole('alert').filter({ hasText: 'review-missing' }).waitFor();

  for (const name of [
    'expand-source/components/Button.tsx',
    'expand-source/forms/nested/input.ts',
  ]) {
    await mkdir(join(root, name, '..'), { recursive: true });
    await writeFile(join(root, name), 'export const value = 1;\n');
  }
  const chainDirectory = await runDirectories({ directories: ['expand-source/forms'] });
  await page.goto(url(chainDirectory));
  const formsRoot = frame.locator(
    `[data-tree-item="directory:${join(root, 'expand-source/forms')}"]`,
  );
  await formsRoot.waitFor();
  assert.equal(await formsRoot.getAttribute('aria-expanded'), 'true');
  assert.equal(
    await frame
      .locator(`[data-tree-item="directory:${join(root, 'expand-source/forms/nested')}"]`)
      .getAttribute('aria-expanded'),
    'false',
  );
  assert.equal(
    await row(0).count(),
    0,
    'Discovered descendants stay inside collapsed subdirectories',
  );

  const overlappingFile = await runDirectories({
    files: ['expand-source/components/Button.tsx'],
    directories: ['expand-source'],
  });
  await page.goto(url(overlappingFile));
  await row(0).waitFor();
  assert.equal(await row(0).count(), 1, 'The explicit and discovered file share one entry');
  assert.equal(await frame.locator('[data-tree-item^="file:"]').count(), 1);
  for (const name of ['expand-source', 'expand-source/components'])
    assert.equal(
      await frame
        .locator(`[data-tree-item="directory:${join(root, name)}"]`)
        .getAttribute('aria-expanded'),
      'true',
    );
  assert.equal(
    await frame
      .locator(`[data-tree-item="directory:${join(root, 'expand-source/forms/nested')}"]`)
      .getAttribute('aria-expanded'),
    'false',
  );
  await search.fill('input.ts');
  await row(1).waitFor();
  assert.equal(await frame.locator('[data-tree-item^="file:"]').count(), 1);

  await mkdir(join(root, 'link-review'));
  await mkdir(join(root, 'link-targets/ui'), { recursive: true });
  await mkdir(join(root, 'link-targets/empty'));
  const linkedCode = 'export const sharedValue = 42;\n';
  await writeFile(join(root, 'link-targets/ui/Button.tsx'), linkedCode);
  await writeFile(join(root, 'link-targets/settings.json'), '{"theme":"system"}\n');
  await symlink('../link-targets/settings.json', join(root, 'link-review/settings.json'));
  await symlink('../link-targets/ui', join(root, 'link-review/shared-ui'));
  await symlink('../link-targets/empty', join(root, 'link-review/empty-dir'));
  await symlink('../link-targets/missing.ts', join(root, 'link-review/broken.ts'));
  await symlink('../../link-review', join(root, 'link-targets/ui/back'));
  const linkPanel = await runDirectories({
    files: ['link-review/settings.json'],
    directories: ['link-review'],
  });
  await page.goto(url(linkPanel));
  await line(1).filter({ hasText: 'theme' }).waitFor();
  const linkedDirectory = frame.locator(
    `[data-tree-item="directory:${join(root, 'link-review/shared-ui')}"]`,
  );
  await linkedDirectory.waitFor();
  assert.equal(await linkedDirectory.getAttribute('data-symlink'), 'directory');
  assert.equal(await linkedDirectory.getAttribute('aria-expanded'), 'false');
  assert.equal(await row(0).getAttribute('data-symlink'), 'file');
  assert.equal(
    await path.evaluate((element) => element.parentElement.getBoundingClientRect().height),
    33,
  );
  await row(0).locator('[data-slot="tooltip-trigger"]').hover();
  const linkTip = frame
    .locator('[data-slot="tooltip-content"]')
    .filter({ hasText: '../link-targets/settings.json' });
  await linkTip.waitFor();
  assert.equal(await linkTip.textContent(), '../link-targets/settings.json');
  await page.mouse.move(0, 0);
  await search.fill('Button.tsx');
  await row(2).click();
  await line(1).filter({ hasText: 'sharedValue' }).waitFor();
  assert.equal(await path.textContent(), 'link-review/shared-ui/Button.tsx');
  await save('[data-file-review-viewport] [data-code-line="1"]', 13, 24, '通过目录链接审阅');
  await search.fill('');
  await linkedDirectory.click();
  const loop = frame.locator(
    `[data-tree-item="directory:${join(root, 'link-review/shared-ui/back')}"]`,
  );
  await loop.waitFor();
  assert.equal(await loop.innerText(), 'back');
  await loop.locator('[data-slot="tooltip-trigger"]').hover();
  const loopTip = frame
    .locator('[data-slot="tooltip-content"]')
    .filter({ hasText: '../../link-review（循环）' });
  await loopTip.waitFor();
  assert.equal(await loopTip.textContent(), '../../link-review（循环）');
  await page.mouse.move(0, 0);
  const beforeLoop = await path.textContent();
  await loop.click();
  assert.equal(await path.textContent(), beforeLoop, 'A cycle marker does not select a file');
  const emptyLink = frame.locator(
    `[data-tree-item="directory:${join(root, 'link-review/empty-dir')}"]`,
  );
  assert.equal(await emptyLink.getAttribute('data-symlink'), 'directory');
  await emptyLink.click();
  assert.equal(await emptyLink.getAttribute('aria-expanded'), 'true');
  assert.equal(await row(1).getAttribute('data-symlink'), 'unavailable');
  await row(0).click();
  await line(1).filter({ hasText: 'theme' }).waitFor();
  await unlink(join(root, 'link-review/shared-ui'));
  await comments.locate(1);
  await line(1).filter({ hasText: 'sharedValue' }).waitFor();
  await submit();
  const linkEvent = (await service.runtime.events(linkPanel.instanceId, 'symlink-test', 100, 0))
    .events[0];
  assert.equal(linkEvent.payload.files[0].path, join(root, 'link-review/shared-ui/Button.tsx'));
  assert.equal(linkEvent.payload.files[0].annotations[0].targets[0].text.quote, 'sharedValue');

  const explicitLink = await runDirectories({ files: ['link-review/settings.json'] });
  await page.goto(url(explicitLink));
  await line(1).filter({ hasText: 'theme' }).waitFor();
  assert.equal(await frame.locator('[data-file-review-split]').count(), 0);
  assert.equal(
    await path.evaluate((element) => element.parentElement.getBoundingClientRect().height),
    33,
  );
  assert.equal(await path.textContent(), 'link-review/settings.json');
  await frame.getByText('→ ../link-targets/settings.json', { exact: true }).hover();
  await frame
    .locator('[data-slot="tooltip-content"]')
    .filter({ hasText: '../link-targets/settings.json' })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'File review: copied Skill, literal paths, single/multi-file tree/search/keyboard/split, main and linked snapshot remount/locate, CRLF/CR/Unicode/repeated text, failure/correction/withdrawal, unknown/empty/missing/near-limit files, late reads and light/dark desktop passed.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
