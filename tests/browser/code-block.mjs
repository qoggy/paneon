import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { readPanelFixture } from '../panel-fixture.ts';
import { startServer } from '../runtime-fixture.ts';
import {
  openAnnotationDirectory,
  selectAnnotationText,
  submitAnnotations,
} from './annotation-tools.mjs';

const root = await mkdtemp(join(tmpdir(), 'paneon-code-block-'));
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-code-block-evidence';
const repeated = 'const same = "甲😀";';
const source =
  repeated + '\r\n' + repeated + '\r\n\r\n  console.log("' + 'abcdefgh'.repeat(60) + '");\r\n\r';
const display = source.replace(/\r\n?/g, '\n');
const cases = [
  'const final = "尾😀";',
  '\r\n\r\n',
  '',
  'a\rb\r',
  '中文😀\n\n',
  '  a\r\n b\r c\n\n',
];
let service, browser;
try {
  await mkdir(artifacts, { recursive: true });
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    await readPanelFixture(new URL('./code-block-fixture.txt', import.meta.url)),
  );
  service = await startServer(join(root, 'runtime'));
  const panel = await service.runtime.run(entry, root, { source, cases }, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  const block = frame.getByTestId('annotated');
  await block.getByText('重试策略', { exact: true }).waitFor();
  const basic = frame.getByTestId('default');
  assert.equal(await basic.getByText('Plain Text', { exact: true }).count(), 1);
  assert.equal(
    await frame.getByTestId('explicit-header').getByText('TypeScript', { exact: true }).count(),
    1,
  );
  assert.equal(await basic.locator('pre').getAttribute('data-numbered'), null);
  assert.equal(
    await basic
      .getByRole('button', { name: 'Word wrap', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(await basic.locator('script').count(), 0);
  assert.ok(await basic.locator('pre').evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
  assert.equal(
    await block
      .locator('[data-slot="code-block"]')
      .evaluate((el) => el.classList.contains('max-w-160')),
    true,
  );
  assert.equal(await block.locator('pre').textContent(), display);
  assert.equal(await block.locator('[data-code-line]').count(), display.split('\n').length);
  assert.equal(await block.locator('[data-line-highlighted]').count(), 2);
  assert.equal(await block.locator('pre').getAttribute('data-numbered'), 'true');
  assert.ok(await block.locator('pre').evaluate((el) => el.scrollWidth > el.clientWidth));

  // Hiding the header retains built-in controls, reachable by hover and keyboard focus.
  await frame.getByRole('button', { name: '切换标题栏', exact: true }).click();
  assert.equal(await block.locator('[data-slot="code-block-header"]').count(), 0);
  assert.equal(await block.locator('[data-slot="code-block-title"]').count(), 0);
  const actions = block.locator('[data-slot="code-block"] > [data-slot="code-block-actions"]');
  assert.equal(await actions.evaluate((el) => getComputedStyle(el).position), 'absolute');
  const actionOpacity = () =>
    actions.evaluate(async (el) => {
      getComputedStyle(el).opacity;
      await Promise.all(el.getAnimations().map((animation) => animation.finished));
      return getComputedStyle(el).opacity;
    });
  assert.equal(await actionOpacity(), '0');
  await block.hover();
  assert.equal(await actionOpacity(), '1');
  await frame.getByRole('button', { name: '切换标题栏', exact: true }).hover();
  assert.equal(await actionOpacity(), '0');
  await block.locator('pre').press('Shift+Tab');
  assert.equal(
    await block
      .getByRole('button', { name: 'Copy code', exact: true })
      .evaluate((el) => el.ownerDocument.activeElement === el),
    true,
  );
  assert.equal(await actionOpacity(), '1');

  // Save against the initial plain DOM, then replace it with syntax tokens.
  const from = display.indexOf(repeated, repeated.length);
  const to = display.indexOf(');') + 2;
  await selectAnnotationText(frame, '[data-testid="annotated"] code', from, to);
  await frame.locator('[data-annotation-action]').click();
  await frame.locator('[data-annotation-editor] textarea').fill('跨 token 与 CRLF 原文');
  await frame.getByRole('button', { name: /^(Save|保存)$/, exact: true }).click();
  const events = async () => {
    const response = await service.app.inject({
      method: 'GET',
      url: `/api/panels/${panel.instanceId}/events?consumer=code-block`,
      headers: {
        host: `127.0.0.1:${service.descriptor.port}`,
        authorization: `Bearer ${service.descriptor.controlToken}`,
      },
    });
    assert.equal(response.statusCode, 200);
    return response.json().data.events;
  };
  assert.equal((await events()).length, 0, 'Saving a draft does not submit it.');
  const draft = async () => JSON.parse(await frame.locator('[data-draft]').textContent());
  const saved = (await draft()).annotations[0];
  assert.equal(typeof saved.id, 'string');
  assert.ok(saved.id.length > 0);
  await frame.getByRole('button', { name: '切换标题栏', exact: true }).click();
  assert.equal(await block.getByText('重试策略', { exact: true }).count(), 1);
  assert.deepEqual((await draft()).annotations[0], saved);
  assert.equal(await block.locator('pre').getAttribute('data-wrap'), null);
  await frame.getByRole('button', { name: '切换标题栏', exact: true }).click();
  assert.deepEqual((await draft()).annotations[0], saved);
  assert.equal(await block.locator('code').textContent(), display);
  await frame.getByRole('button', { name: '启用高亮', exact: true }).click();
  const keyword = block
    .locator('[data-shiki-token]')
    .filter({ hasText: /^const$/ })
    .first();
  await keyword.waitFor();
  assert.equal(await block.locator('code').textContent(), display);
  await openAnnotationDirectory(frame);
  await frame
    .getByRole('button', { name: /^(Locate annotation|定位批注) 1$/, exact: true })
    .click();
  assert.equal(
    await block.evaluate((el) => el.ownerDocument.getSelection().getRangeAt(0).toString()),
    display.slice(from, to),
  );
  await page.keyboard.press('Escape');
  await frame.getByRole('button', { name: '切换行号', exact: true }).click();
  assert.equal(await block.locator('pre').getAttribute('data-numbered'), null);
  assert.equal(await block.locator('[data-line-highlighted]').count(), 2);
  const wrap = block.getByRole('button', { name: 'Word wrap', exact: true });
  await wrap.press('Space');
  assert.equal(await wrap.getAttribute('aria-pressed'), 'true');
  assert.ok(await block.locator('pre').evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
  await frame.getByRole('button', { name: '修改初始换行', exact: true }).click();
  await frame.getByRole('button', { name: '修改初始换行', exact: true }).click();
  assert.equal(
    await wrap.getAttribute('aria-pressed'),
    'true',
    'defaultWrap does not reset the human choice after mounting.',
  );
  assert.equal(await block.locator('code').textContent(), display);

  const copy = block.getByRole('button', { name: 'Copy code', exact: true });
  await copy.click();
  await frame.locator('[data-slot="toast"]').filter({ hasText: 'Code copied' }).waitFor();
  await page.context().grantPermissions(['clipboard-read'], { origin: new URL(page.url()).origin });
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), source);
  await page.context().clearPermissions();
  await page.evaluate(() => {
    window.__copyCalls = 0;
    navigator.clipboard.writeText = () =>
      new Promise((resolve) => {
        window.__copyCalls++;
        window.__finishCopy = resolve;
      });
  });
  await copy.press('Enter');
  await page.waitForFunction(() => typeof window.__finishCopy === 'function');
  assert.equal(await copy.getAttribute('aria-disabled'), 'true');
  assert.equal(await copy.evaluate((el) => el.ownerDocument.activeElement === el), true);
  await copy.press('Space');
  assert.equal(await page.evaluate(() => window.__copyCalls), 1);
  await page.evaluate(() => window.__finishCopy());
  await block.locator('button[aria-label="Copy code"][aria-disabled="false"]').waitFor();
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('Clipboard denied for test'));
  });
  await copy.press('Enter');
  await frame.locator('[data-slot="toast"]').filter({ hasText: 'Unable to copy code.' }).waitFor();
  assert.equal(await copy.evaluate((el) => el.ownerDocument.activeElement === el), true);
  await page.evaluate(() => Reflect.deleteProperty(navigator.clipboard, 'writeText'));
  await copy.press('Tab');
  assert.equal(await block.locator('pre').evaluate((el) => el.matches(':focus-visible')), true);
  assert.notEqual(
    await block
      .locator('[data-slot="code-block"]')
      .evaluate((el) => getComputedStyle(el).boxShadow),
    'none',
  );

  for (let index = 0; index < cases.length; index++) {
    const sample = frame.getByTestId(`case-${index}`);
    if (cases[index] && index % 2 === 0)
      await sample.locator('[data-shiki-token]').first().waitFor();
    assert.equal(await sample.locator('code').textContent(), cases[index].replace(/\r\n?/g, '\n'));
    assert.equal(
      await sample.locator('[data-code-line]').count(),
      cases[index].split(/\r\n|\r|\n/).length,
    );
  }
  await frame.getByTestId('bash').getByText('Bash', { exact: true }).waitFor();
  assert.equal(await frame.getByTestId('unknown').locator('[data-shiki-token]').count(), 0);
  const light = await keyword.evaluate((el) => getComputedStyle(el).color);
  await block.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(artifacts, 'light.png') });
  await page.evaluate(async () => {
    const response = await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ui: { theme: 'dark', language: 'zh-CN' } }),
    });
    if (!response.ok) throw new Error('Theme update failed');
  });
  await frame.locator('html.dark').waitFor();
  assert.notEqual(await keyword.evaluate((el) => getComputedStyle(el).color), light);
  await block.getByRole('button', { name: '自动换行', exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'dark.png') });

  // Two identical sources carry independent references; use the second occurrence in both.
  await selectAnnotationText(frame, '[data-testid="identical"] code', from, from + repeated.length);
  await frame.locator('[data-annotation-action]').click();
  await frame.locator('[data-annotation-editor] textarea').fill('相同文本的另一个对象');
  await frame.getByRole('button', { name: '保存', exact: true }).click();
  const beforeSubmit = await draft();
  await submitAnnotations(frame);
  let received = await events();
  assert.equal(received.length, 1);
  for (const annotation of received[0].payload.annotations) assert.equal('id' in annotation, false);
  assert.deepEqual(await draft(), beforeSubmit, 'Publishing does not mutate internal drafts');
  assert.equal(beforeSubmit.annotations[0].id, saved.id);
  const rawStart = source.indexOf(repeated, repeated.length);
  const rawEnd = source.indexOf(');') + 2;
  assert.deepEqual(
    received[0].payload.annotations.map((a) => a.targets),
    [
      [
        {
          ref: { kind: 'snippet', id: 'main', version: 1 },
          text: { start: rawStart, end: rawEnd, quote: source.slice(rawStart, rawEnd) },
        },
      ],
      [
        {
          ref: 'identical',
          text: { start: rawStart, end: rawStart + repeated.length, quote: repeated },
        },
      ],
    ],
  );
  await openAnnotationDirectory(frame);
  await frame.getByRole('button', { name: '修改反馈', exact: true }).click();
  await openAnnotationDirectory(frame);
  await frame.getByRole('button', { name: '编辑批注 1', exact: true }).click();
  await frame.locator('[data-annotation-editor] textarea').fill('更正 CodeBlock 意见');
  await frame.getByRole('button', { name: '保存', exact: true }).click();
  assert.equal((await draft()).annotations[0].id, saved.id);
  assert.deepEqual((await draft()).annotations[0].targets, saved.targets);
  assert.equal((await events()).length, 1, 'Editing keeps the opinion local');
  await frame.getByRole('button', { name: '切换内容', exact: true }).click();
  const changing = frame.getByTestId('changing');
  await changing.locator('[data-shiki-token]').filter({ hasText: '"next"' }).waitFor();
  assert.equal(await changing.locator('code').textContent(), '{"next":true}\n');
  assert.equal(await changing.getByText('JSON', { exact: true }).count(), 1);
  await selectAnnotationText(frame, '[data-testid="changing"] code', 1, 7);
  await frame.locator('[data-annotation-action]').click();
  await frame.locator('[data-annotation-editor] textarea').fill('新版本');
  await frame.getByRole('button', { name: '保存', exact: true }).click();
  await submitAnnotations(frame);
  received = await events();
  assert.equal(received.length, 2);
  assert.equal(received[1].payload.replacesEventId, received[0].id);
  assert.deepEqual(received[1].payload.annotations.slice(0, 2), [
    { ...received[0].payload.annotations[0], comment: '更正 CodeBlock 意见' },
    received[0].payload.annotations[1],
  ]);
  assert.deepEqual(received[1].payload.annotations[2].targets, [
    { ref: 'next', text: { start: 1, end: 7, quote: '"next"' } },
  ]);

  await openAnnotationDirectory(frame);
  await frame.getByRole('button', { name: '修改反馈', exact: true }).click();
  for (const index of [0, 3, 4, 5]) {
    const normalized = cases[index].replace(/\r\n?/g, '\n');
    await selectAnnotationText(frame, `[data-testid="case-${index}"] code`, 0, normalized.length);
    await frame.locator('[data-annotation-action]').click();
    await frame.locator('[data-annotation-editor] textarea').fill(`完整原文 ${index}`);
    await frame.getByRole('button', { name: '保存', exact: true }).click();
  }
  await submitAnnotations(frame);
  received = await events();
  assert.equal(received.length, 3);
  assert.equal(received[2].payload.replacesEventId, received[1].id);
  for (const event of received)
    for (const annotation of event.payload.annotations) assert.equal('id' in annotation, false);
  assert.deepEqual(
    (await draft()).annotations.slice(0, 2).map(({ id }) => id),
    beforeSubmit.annotations.map(({ id }) => id),
    'Corrections retain existing internal ids',
  );
  assert.deepEqual(
    received[2].payload.annotations.slice(3).map((annotation) => annotation.targets),
    [0, 3, 4, 5].map((index) => [
      {
        ref: `case-${index}`,
        text: { start: 0, end: cases[index].length, quote: cases[index] },
      },
    ]),
    'Whole-code annotations preserve raw line endings, trailing empty lines and absent EOF newline.',
  );

  const blankMetrics = await frame
    .getByTestId('case-1')
    .locator('[data-code-line]')
    .evaluateAll((rows) =>
      rows.map((row) => ({
        height: row.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(row).lineHeight),
      })),
    );
  for (const row of blankMetrics)
    assert.ok(Math.abs(row.height - row.lineHeight) <= 1, JSON.stringify(blankMetrics));

  // No annotation target means ordinary native text selection has no annotation action.
  await openAnnotationDirectory(frame);
  await frame.getByRole('button', { name: '修改反馈', exact: true }).click();
  await frame.locator('[data-testid="unregistered"] code').evaluate((el) => {
    const range = el.ownerDocument.createRange();
    range.selectNodeContents(el);
    const selection = el.ownerDocument.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  assert.equal(await frame.locator('[data-annotation-action]').count(), 0);

  assert.deepEqual(errors, []);
  console.log(
    'CodeBlock passed: boolean/string header, floating controls on hover and keyboard focus, retained drafts and wrapping across header changes; raw copying/failure/pending focus, logical lines, themes, exact CRLF/CR/Unicode annotations across async tokens, independent identities, locate, explicit submit and correction.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
