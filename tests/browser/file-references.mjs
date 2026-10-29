import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startFileReferenceFixture } from './file-reference-fixture.mjs';
import {
  openAnnotationDirectory,
  selectAnnotationText,
  submitAnnotations,
} from './annotation-tools.mjs';

const fixture = await startFileReferenceFixture();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  const reads = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname.includes('/actions/') &&
      request.method() === 'POST' &&
      decodeURIComponent(new URL(request.url()).pathname).endsWith('/markdown#readLocalFile')
    )
      reads.push(request.url());
  });
  await page.goto(fixture.url);
  const frame = page.frameLocator('iframe');
  const preview = frame.locator('[data-slot="file-preview"]');
  const source = preview.locator('[data-slot="file-preview-source"]');
  const events = async () =>
    (await fixture.service.runtime.events(fixture.panel.instanceId, 'file-references', 100, 0))
      .events;
  const submit = async () => {
    const receipt = page.waitForResponse(
      (response) => response.url().endsWith('/events') && response.request().method() === 'POST',
    );
    await submitAnnotations(frame);
    assert.equal((await receipt).status(), 200);
  };
  const open = async (label) => {
    const link = frame.getByRole('link', { name: label, exact: true });
    // Closing restores link focus; clear both focus and hover before waiting
    // for its address tooltip to close.
    await frame.getByRole('heading', { name: '文件引用验收', exact: true }).click();
    await page.mouse.move(0, 0);
    await frame.locator('[data-slot="tooltip-content"]').waitFor({ state: 'hidden' });
    try {
      await link.click();
    } catch (error) {
      console.error(
        'File link click evidence:',
        await link.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return {
            label: element.textContent,
            active: document.activeElement?.outerHTML,
            hit: hit?.outerHTML,
          };
        }),
      );
      if (process.env.PANEON_TEST_ARTIFACTS)
        await page.screenshot({
          path: join(process.env.PANEON_TEST_ARTIFACTS, 'file-references-failure.png'),
        });
      throw error;
    }
    await preview.waitFor();
    return link;
  };
  const close = async () => {
    await preview.press('Escape');
    await preview.waitFor({ state: 'hidden' });
  };
  await frame.getByRole('heading', { name: '文件引用验收', exact: true }).waitFor();
  assert.equal(await frame.getByRole('link', { name: 'source.ts', exact: true }).count(), 0);
  assert.equal(await frame.getByRole('link', { name: 'VS Code', exact: true }).count(), 0);
  assert.equal(await frame.locator('[data-custom-link]').textContent(), '自定义链接');

  const relativeLink = await open('相对路径');
  await source.getByText('export const line1 = 1;', { exact: false }).first().waitFor();
  assert.ok((await preview.textContent()).includes(fixture.root));
  await close();
  assert.equal(await relativeLink.evaluate((element) => element === document.activeElement), true);
  assert.equal(page.url(), fixture.url, 'Preview does not navigate or reload the panel');
  for (const label of ['绝对路径', 'file:// 本地文件']) {
    await open(label);
    await source.locator('[data-code-line="8"]').waitFor();
    await close();
  }
  await open('按文档目录解析');
  await source.getByText('export const documentRelative = true;', { exact: false }).waitFor();
  await close();
  await open('中文路径');
  await source.getByText('export const unicodePath = true;', { exact: false }).waitFor();
  await close();
  await open('CR 换行');
  await source.locator('[data-code-line="2"][data-line-highlighted]').waitFor();
  assert.match(await source.locator('[data-code-line="2"]').textContent(), /const second = 2;/);
  await close();

  for (const [label, expected] of [
    ['不存在', '引用的文件不存在。'],
    ['二进制', '仅支持预览 UTF-8 文本文件。'],
    ['过大文件', '文件预览大小上限为 1 MiB。'],
    ['目录', '引用目标不是普通文件。'],
  ]) {
    await open(label);
    await preview.getByRole('alert').waitFor();
    assert.equal(await preview.getByRole('alert').textContent(), expected);
    await close();
  }
  await open('空文件');
  await preview.locator('[data-slot="empty"]').waitFor();
  assert.equal(await preview.getByRole('alert').count(), 0);
  await close();
  await open('超出行号');
  await preview.getByRole('status').filter({ hasText: '引用的行号超出文件范围。' }).waitFor();
  await source.locator('[data-code-line="1"]').waitFor();
  await close();

  // The reader deliberately returns a mutable cached object and rerenders its provider.
  await open('读取器快照');
  await source.getByText('export const retained = 1;', { exact: false }).waitFor();
  await frame.locator('[data-reader-generation="1"]').waitFor();
  assert.match(await source.textContent(), /export const retained = 1;/);
  assert.doesNotMatch(await source.textContent(), /cacheUpdated/);
  await close();
  await open('读取器快照');
  await source.getByText('export const retained = 2;', { exact: false }).waitFor();
  await close();

  const original = await readFile(join(fixture.root, 'source.ts'), 'utf8');
  await open('source.ts:153–159');
  await source.locator('[data-code-line="153"] [data-shiki-token]').first().waitFor();
  assert.equal(await source.locator('[data-line-highlighted]').count(), 7);
  assert.equal(
    await source.locator('[data-code-line="153"]').evaluate((line) => {
      const viewport = line.closest('[data-slot="file-preview-source"]');
      const a = line.getBoundingClientRect(),
        b = viewport.getBoundingClientRect();
      return a.top >= b.top && a.bottom <= b.bottom && viewport.scrollTop > 0;
    }),
    true,
  );
  const resize = preview.getByRole('button', { name: '调整文件预览宽度', exact: true });
  const before = (await preview.boundingBox()).width;
  await resize.press('ArrowLeft');
  assert.equal(Math.round((await preview.boundingBox()).width - before), 32);
  await selectAnnotationText(frame, '[data-slot="file-preview"] [data-code-line="153"]', 0, 6);
  await frame.locator('[data-annotation-action]').click();
  await frame.locator('[data-annotation-editor] textarea').fill('Review the original file');
  // Editing in a file preview must block its close button and source controls too.
  const previewBox = await preview.boundingBox();
  await page.mouse.click(previewBox.x + previewBox.width - 24, previewBox.y + 24);
  assert.equal(await preview.isVisible(), true);
  assert.equal(await frame.locator('[data-annotation-editor]').isVisible(), true);
  assert.equal(
    await frame.locator('[data-annotation-editor] textarea').inputValue(),
    'Review the original file',
  );
  await frame.getByRole('button', { name: '取消', exact: true }).click();
  await frame.locator('[data-annotation-editor]').waitFor({ state: 'hidden' });
  assert.equal(await frame.locator('[data-annotation-marker]').count(), 0);
  assert.equal(await preview.isVisible(), true, 'Cancel closes only the editor');
  await selectAnnotationText(frame, '[data-slot="file-preview"] [data-code-line="153"]', 0, 6);
  await frame.locator('[data-annotation-action]').click();
  await frame.locator('[data-annotation-editor] textarea').fill('Review the original file');
  await frame.locator('[data-annotation-editor] textarea').press('Enter');
  await frame.locator('[data-annotation-editor]').waitFor({ state: 'hidden' });
  await close();
  assert.equal((await events()).length, 0, 'Saving a draft does not submit it');
  await submit();
  const [first] = await events();
  assert.equal(first.type, 'annotations');
  const [annotation] = first.payload.annotations;
  assert.equal(annotation.comment, 'Review the original file');
  assert.deepEqual(annotation.targets, [
    {
      ref: 'main',
      sourceRef: {
        path: join(await realpath(fixture.root), 'source.ts'),
        snapshotId: 'sha256:' + createHash('sha256').update(original).digest('hex'),
      },
      text: {
        start: original.indexOf('export const line153'),
        end: original.indexOf('export const line153') + 6,
        quote: 'export',
      },
    },
  ]);

  // Locating a saved annotation must reopen its snapshot without rereading changed disk contents.
  await writeFile(join(fixture.root, 'source.ts'), 'export const changedOnDisk = true;\n');
  const readsBeforeLocate = reads.length;
  await openAnnotationDirectory(frame);
  await frame.getByRole('button', { name: '定位批注 1', exact: true }).click();
  await preview.waitFor();
  await source.locator('[data-code-line="153"]').waitFor();
  assert.match(await source.textContent(), /export const line153 = 153;/);
  assert.equal(reads.length, readsBeforeLocate);
  await close();
  await openAnnotationDirectory(frame);
  await frame.getByRole('button', { name: '编辑批注 1', exact: true }).click();
  await frame.locator('[data-annotation-editor] textarea').fill('Corrected file annotation');
  await frame.locator('[data-annotation-editor] textarea').press('Enter');
  await frame.locator('[data-annotation-editor]').waitFor({ state: 'hidden' });
  if (await preview.isVisible()) await close();
  await submit();
  const all = await events();
  assert.equal(all.length, 2);
  assert.ok(all[1].id > first.id, 'Custom pages append the event supplied by onSubmit');
  assert.deepEqual(all[0], first, 'Editing cannot rewrite the previously submitted event');
  assert.equal(all[1].payload.annotations[0].comment, 'Corrected file annotation');
  assert.deepEqual(all[1].payload.annotations[0].targets, annotation.targets);
  await open('相对路径');
  await source.getByText('export const changedOnDisk = true;', { exact: false }).waitFor();
  await close();
  assert.deepEqual(errors, []);
  console.log(
    'File references passed: path bases, Unicode, line ranges, focus return, resize, bounded read errors, reader snapshots, exact file annotations, retained-source locate and explicit edit/resubmit events.',
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
