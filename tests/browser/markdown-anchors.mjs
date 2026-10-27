import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';
import { selectAnnotationText, submitAnnotations } from './annotation-tools.mjs';

const root = await mkdtemp(join(tmpdir(), 'paneon-markdown-anchors-'));
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-markdown-anchors-evidence';
const filler = Array.from(
  { length: 16 },
  (_, index) => `正文段落 ${index + 1}，用于验证滚动定位。`,
).join('\n\n');
const source = [
  '# 目录体验',
  '[中文章节](#中文章节) · [编码中文](#%E4%B8%AD%E6%96%87%E7%AB%A0%E8%8A%82) · [重复标题](#repeat-1) · [格式标题](#hello-world-code) · [不存在](#missing-heading)',
  filler,
  '## 中文章节',
  '中文章节正文。',
  filler,
  '## Repeat',
  '第一个重复标题。',
  filler,
  '## Repeat',
  '第二个重复标题。',
  filler,
  '## Hello **World** `Code`',
  filler,
].join('\n\n');
let service, browser;
try {
  await mkdir(artifacts, { recursive: true });
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    await readFile(new URL('./markdown-anchors-fixture.txt', import.meta.url)),
  );
  service = await startServer(join(root, 'runtime'));
  const panel = await service.runtime.run(entry, root, { source }, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const navigations = [];
  page.on('framenavigated', (frame) => navigations.push(frame.url()));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  const first = frame.getByTestId('first');
  const second = frame.getByTestId('second');
  const heading = (container, name) => container.getByRole('heading', { name, exact: true });
  await heading(first, '中文章节').waitFor();
  assert.ok(await heading(first, '中文章节').getAttribute('id'), 'Headings need anchor IDs.');
  const ids = await frame
    .locator('[data-testid="first"] [id], [data-testid="second"] [id]')
    .evaluateAll((nodes) => nodes.map((node) => node.id));
  assert.equal(new Set(ids).size, ids.length, 'Independent Markdown instances need unique IDs.');
  const navigationCount = navigations.length;
  await frame.getByLabel('State marker').fill('still retained');
  const offset = async (container, target) =>
    target.evaluate(
      (el, testId) => {
        const viewport = el.closest(`[data-testid="${testId}"]`);
        return el.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
      },
      await container.getAttribute('data-testid'),
    );
  const top = (container) => container.evaluate((el) => el.scrollTop);
  const reset = (container) =>
    container.evaluate((el) => {
      el.scrollTop = 0;
    });
  const aligned = async (container, target) =>
    assert.ok(
      Math.abs(await offset(container, target)) <= 2,
      'The target heading must align with its scroll viewport.',
    );

  await second.getByRole('link', { name: '中文章节', exact: true }).click();
  await aligned(second, heading(second, '中文章节'));
  assert.equal(await top(first), 0, 'Clicking the second document must not scroll the first.');
  await reset(second);
  await second.getByRole('link', { name: '编码中文', exact: true }).click();
  await aligned(second, heading(second, '中文章节'));
  await reset(second);
  await second.getByRole('link', { name: '重复标题', exact: true }).press('Enter');
  await aligned(second, heading(second, 'Repeat').nth(1));
  await reset(second);
  await second.getByRole('link', { name: '格式标题', exact: true }).click();
  await aligned(second, heading(second, 'Hello World Code'));
  await page.screenshot({ path: join(artifacts, 'scoped-navigation.png') });
  await first.getByRole('link', { name: '中文章节', exact: true }).click();
  await aligned(first, heading(first, '中文章节'));

  const originalId = await heading(first, '中文章节').getAttribute('id');
  await frame.getByRole('button', { name: '更新文档', exact: true }).click();
  await heading(first, 'Later heading').waitFor();
  assert.equal(await heading(first, '中文章节').getAttribute('id'), originalId);
  await reset(first);
  await first.getByRole('link', { name: '重复标题', exact: true }).click();
  await aligned(first, heading(first, 'Repeat').nth(1));

  const author = frame.getByTestId('author-id');
  assert.equal(await author.locator('[data-custom-heading]').getAttribute('id'), 'author-heading');
  await author.getByRole('link', { name: '作者锚点', exact: true }).click();
  await frame.getByTestId('custom-link').getByRole('button', { name: '自定义链接' }).click();
  await frame.getByText('Custom link clicked', { exact: true }).waitFor();
  assert.equal(await frame.getByLabel('State marker').inputValue(), 'still retained');
  assert.equal(
    navigations.length,
    navigationCount,
    'Resolved anchors must not navigate or reload the iframe.',
  );

  await reset(second);
  await second.getByRole('link', { name: '不存在', exact: true }).click();
  assert.equal(await top(second), 0, 'A missing heading must not scroll to another document.');
  await second.getByRole('link', { name: '中文章节', exact: true }).click();
  await selectAnnotationText(
    frame,
    '[data-testid="second"] h2',
    0,
    4,
    '[data-testid="second"] h2:first-of-type',
  );
  await frame.getByRole('button', { name: /^(批注|Annotation)$/ }).click();
  await frame.getByLabel(/^(批注内容|Annotation text)$/).fill('跳转后批注标题');
  await frame.getByRole('button', { name: /^(保存|Save)$/ }).click();
  await submitAnnotations(frame);
  const response = await service.app.inject({
    method: 'GET',
    url: `/api/panels/${panel.instanceId}/events?consumer=markdown-anchors`,
    headers: {
      host: `127.0.0.1:${service.descriptor.port}`,
      authorization: `Bearer ${service.descriptor.controlToken}`,
    },
  });
  assert.equal(response.statusCode, 200);
  const events = response.json().data.events;
  assert.equal(events.length, 1);
  const start = source.indexOf('## 中文章节') + 3;
  assert.deepEqual(events[0].payload.annotations[0].targets, [
    { ref: 'second', text: { start, end: start + 4, quote: '中文章节' } },
  ]);
  assert.deepEqual(errors, []);
  console.log(
    'Markdown anchors passed: scoped scroll, Chinese/encoded fragments, duplicate/formatted headings, keyboard, source updates, custom IDs/renderers, no reload, and exact annotation submission.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
