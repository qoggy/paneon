import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';
import { annotationTools, selectAnnotationText, submitAnnotations } from './annotation-tools.mjs';

const root = await mkdtemp(join(tmpdir(), 'paneon-built-in-diff-review-'));
let service, browser, page;
try {
  const skill = join(root, 'skill');
  await cp(
    process.env.PANEON_TEST_SKILL_SOURCE ?? new URL('../../skills/paneon', import.meta.url),
    skill,
    { recursive: true },
  );
  await Promise.all([
    writeFile(join(root, 'original.ts'), 'export const value = 1;\n'),
    writeFile(join(root, 'proposed.ts'), 'export const value = 2;\n'),
    writeFile(join(root, 'added.ts'), 'export const added = true;\n'),
  ]);
  service = await startServer(join(root, 'data'));
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
    {
      displayPath: 'lib/workflow/prompts/worker.ts',
      oldPath: 'original.ts',
      newPath: 'proposed.ts',
    },
    { displayPath: 'lib/workflow/prompts/added.ts', oldPath: null, newPath: 'added.ts' },
    { displayPath: 'docs/obsolete.ts', oldPath: 'original.ts', newPath: null },
    { displayPath: 'z-root.ts', oldPath: 'original.ts', newPath: 'original.ts' },
  ];
  const instance = await service.runtime.run(
    join(skill, 'assets/panels/diff-review/panel.tsx'),
    root,
    { files },
    false,
  );
  assert.equal(instance.definitionId, 'diff-review');
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${instance.instanceId}`);
  const frame = page.frameLocator('iframe');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const newLine = frame.locator('[data-code-side="new"][data-line="1"]');
  await newLine.filter({ hasText: 'value = 2' }).waitFor();
  const rows = frame.locator('[data-tree-item]');
  assert.deepEqual(await rows.evaluateAll((rows) => rows.map((row) => row.dataset.treeItem)), [
    'directory:docs',
    'file:2',
    'directory:lib/workflow/prompts',
    'file:1',
    'file:0',
    'file:3',
  ]);
  const directory = frame.locator('[data-tree-item="directory:lib/workflow/prompts"]');
  assert.equal(await directory.getAttribute('title'), 'lib/workflow/prompts · 2');
  const search = frame.getByRole('textbox', { name: '搜索文件', exact: true });
  await search.fill('PROPOSED.TS');
  assert.equal(await button('worker.ts').isVisible(), true);
  assert.equal(await button('added.ts').count(), 0);
  assert.equal(await directory.getAttribute('title'), 'lib/workflow/prompts · 1');
  await search.fill('');
  assert.equal(await button('added.ts').isVisible(), true);

  const annotations = annotationTools(frame, page);
  await selectAnnotationText(frame, '[data-code-side="new"][data-line="1"]', 13, 18);
  await annotations.write('保留这处修改的原始快照');
  await annotations.save();
  const splitter = frame.getByRole('separator', { name: '调整文件列表与差异宽度', exact: true });
  const left = frame.locator('[data-file-review-split] [data-panel="true"]').first();
  const beforeWidth = (await left.boundingBox()).width;
  assert.equal((await splitter.boundingBox()).width, 1);
  const source = await frame.locator('[data-diff-source]').elementHandle();
  let requests = 0;
  const observe = (request) => {
    if (request.url().includes('/actions/')) requests++;
  };
  page.on('request', observe);
  const handle = await splitter.boundingBox();
  await page.mouse.move(handle.x + 3, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - 77, handle.y + handle.height / 2, { steps: 8 });
  await page.mouse.up();
  const narrowed = (await left.boundingBox()).width;
  assert.ok(Math.abs(beforeWidth - narrowed - 80) < 2);
  await splitter.press('ArrowRight');
  assert.ok(Math.abs((await left.boundingBox()).width - narrowed - 16) < 2);
  assert.equal(await source.evaluate((element) => element.isConnected), true);
  assert.equal(await annotations.count(), 1);
  assert.equal(requests, 0, 'Resizing does not read files or submit feedback.');
  page.off('request', observe);
  await button('added.ts').dblclick();
  await newLine.filter({ hasText: 'added = true' }).waitFor();
  await selectAnnotationText(frame, '[data-code-side="new"][data-line="1"]', 13, 18);
  await annotations.write('新增文件也可以批注');
  await annotations.save();
  assert.equal(await annotations.count(), 2);

  await writeFile(join(root, 'proposed.ts'), 'export const value = 1;\n');
  await button('worker.ts').dblclick();
  await newLine.filter({ hasText: 'value = 1' }).waitFor();
  await frame.locator('[data-tree-item="file:0"][data-comparison-status="="]').waitFor();
  await button('added.ts').dblclick();
  await newLine.filter({ hasText: 'added = true' }).waitFor();
  await annotations.locate(1);
  await newLine.filter({ hasText: 'value = 2;' }).waitFor();
  await frame.locator('[data-tree-item="file:0"][data-comparison-status="M"]').waitFor();
  assert.equal(await button('worker.ts').getAttribute('aria-pressed'), 'true');
  await submitAnnotations(frame);
  const first = (await service.runtime.events(instance.instanceId, 'diff-review-test', 100, 1000))
    .events;
  assert.equal(first.length, 1);
  assert.equal(first[0].type, 'diff-review-submitted');
  const payload = first[0].payload;
  assert.equal(payload.annotations.length, 2);
  assert.deepEqual(
    payload.annotations.map((a) => a.targets[0].text.quote),
    ['value', 'added'],
  );
  assert.deepEqual(
    payload.sources.map((s) => s.fileIndex),
    [0, 1],
  );
  assert.equal(payload.sources[0].newPath, 'proposed.ts');
  assert.match(payload.sources[0].snapshotId, /^sha256:[a-f0-9]{64}$/);
  assert.equal(payload.annotations[0].targets[0].ref.snapshotId, payload.sources[0].snapshotId);
  assert.equal('newText' in payload.sources[0], false);

  await annotations.edit(1);
  await annotations.write('更正后的意见');
  await annotations.save();
  await submitAnnotations(frame);
  const second = (await service.runtime.events(instance.instanceId, 'diff-review-test', 100, 1000))
    .events;
  assert.equal(second.length, 2);
  assert.equal(second[1].payload.replacesEventId, first[0].id);
  assert.equal(second[1].payload.annotations[0].comment, '更正后的意见');
  await page.screenshot({
    path: '/private/tmp/paneon-neutral-tree-evidence/builtin-diff-review.png',
  });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      status: 'passed',
      builtIn: true,
      compressedSortedPaths: true,
      physicalPathSearch: true,
      visibleCounts: true,
      textAnnotations: true,
      preservedSnapshotLocation: true,
      explicitSubmission: true,
      correction: true,
      sharedResizable: true,
    }),
  );
} catch (error) {
  if (page)
    await page.screenshot({
      path: '/private/tmp/paneon-neutral-tree-evidence/builtin-diff-review-failure.png',
    });
  throw error;
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
