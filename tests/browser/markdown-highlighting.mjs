import { readPanelFixture } from '../panel-fixture.ts';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';
import { selectAnnotationText, submitAnnotations } from './annotation-tools.mjs';

const root = await mkdtemp(join(tmpdir(), 'paneon-markdown-highlighting-'));
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-markdown-highlighting-evidence';
const code =
  '// 中文注释🙂\nconst title = "' + '中文🙂'.repeat(40) + '";\n\n  console.log(title);\n';
const source = '# 代码批注\r\n\r\n```ts\r\n' + code.replaceAll('\n', '\r\n') + '```';
const renderedCode = code.replaceAll('\n', '\r\n').replace(/\r\n$/, '\n');
const plainSource = '```ts\n' + code + '```';
const languages = [
  ['js', 'const enabled = true;'],
  ['json', '{ "enabled": true, "count": 42 }'],
  ['sh', 'echo "hello"'],
  ['yml', 'enabled: true'],
  ['python', 'def greet(name):\n    return "hello " + name'],
  ['java', 'class Example { int count = 42; }'],
  ['css', '.example { color: red; }'],
  ['html', '<div class="example">hello</div>'],
  ['tsx', 'const view = <div title="hello" />;'],
];
let service, browser;
try {
  await mkdir(artifacts, { recursive: true });
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    await readPanelFixture(new URL('./markdown-highlighting-fixture.txt', import.meta.url)),
  );
  service = await startServer(join(root, 'runtime'));
  const panel = await service.runtime.run(entry, root, { source, plainSource, languages }, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  const errors = [];
  const externalRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.hostname !== '127.0.0.1')
      externalRequests.push(url.href);
  });
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  const annotated = frame.getByTestId('annotated');
  const keyword = annotated.locator('[data-shiki-token]').filter({ hasText: /^const$/ });
  await keyword.waitFor();
  assert.equal(
    await annotated.locator('code').textContent(),
    renderedCode,
    'Code must preserve whitespace, blank lines and Unicode.',
  );
  const colors = await annotated
    .locator('[data-shiki-token]')
    .evaluateAll((nodes) => [...new Set(nodes.map((node) => getComputedStyle(node).color))]);
  assert.ok(colors.length >= 3, 'Keywords, strings and comments must visibly differ.');
  for (const [language] of languages)
    await frame.getByTestId(language).locator('[data-shiki-token]').first().waitFor();
  for (const name of ['unknown', 'untyped', 'inline', 'custom-code', 'original'])
    assert.equal(
      await frame.getByTestId(name).locator('[data-shiki-token]').count(),
      0,
      `${name} must retain its existing renderer.`,
    );
  assert.equal(await frame.getByTestId('custom-code').locator('[data-custom-code]').count(), 1);
  const pluginCode = frame.getByTestId('plugin');
  assert.equal(await pluginCode.locator('code').textContent(), code);
  assert.equal(
    await pluginCode.locator('[data-shiki-token]').count(),
    0,
    'Author-provided rehype markup must retain its own highlighting.',
  );
  assert.equal(
    await pluginCode.locator('.custom-syntax').evaluate((el) => getComputedStyle(el).color),
    'rgb(12, 123, 45)',
  );
  await frame.getByTestId('nested').locator('blockquote [data-shiki-token]').first().waitFor();
  const longBlock = frame.getByTestId('long');
  const long = longBlock.locator('pre');
  const wrapButton = longBlock.getByRole('button', { name: 'Word wrap', exact: true });
  assert.equal(await wrapButton.getAttribute('aria-pressed'), 'true');
  const wrapMetrics = await long.evaluate((el) => {
    const code = el.querySelector('code');
    const content = code.firstElementChild;
    return {
      width: el.clientWidth,
      scroll: el.scrollWidth,
      whiteSpace: getComputedStyle(el).whiteSpace,
      overflowWrap: getComputedStyle(el).overflowWrap,
      codeWidth: code.clientWidth,
      codeMinWidth: getComputedStyle(code).minWidth,
      contentWidth: content.clientWidth,
      contentWhiteSpace: getComputedStyle(content).whiteSpace,
    };
  });
  assert.ok(wrapMetrics.scroll <= wrapMetrics.width + 1, JSON.stringify(wrapMetrics));
  const longText = await long.textContent();
  await wrapButton.click();
  assert.equal(await wrapButton.getAttribute('aria-label'), 'Word wrap');
  assert.equal(await wrapButton.getAttribute('aria-pressed'), 'false');
  assert.ok(await long.evaluate((el) => el.scrollWidth > el.clientWidth));
  assert.equal(await long.textContent(), longText);
  const copyButton = longBlock.getByRole('button', { name: 'Copy code', exact: true });
  const copyBox = await copyButton.boundingBox();
  await long.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  assert.equal(
    (await copyButton.boundingBox()).x,
    copyBox.x,
    'Toolbar stays fixed while the code scrolls.',
  );
  const enableWrap = longBlock.getByRole('button', { name: 'Word wrap', exact: true });
  await enableWrap.focus();
  await enableWrap.press('Space');
  assert.ok(await long.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
  assert.equal(await long.textContent(), longText);
  assert.equal(await annotated.getByText('TypeScript', { exact: true }).count(), 1);
  assert.equal(await frame.getByTestId('sh').getByText('Bash', { exact: true }).count(), 1);
  assert.equal(
    await frame.getByTestId('untyped').getByText('Plain Text', { exact: true }).count(),
    1,
  );
  assert.equal(await frame.getByTestId('unknown').getByText('unknown', { exact: true }).count(), 1);
  for (const name of ['inline', 'original', 'custom-code'])
    assert.equal(
      await frame.getByTestId(name).locator('[data-slot="markdown-code-block"]').count(),
      0,
    );

  await annotated.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(artifacts, 'light.png') });

  await annotated.getByRole('button', { name: 'Copy code', exact: true }).hover();
  const copyTooltip = frame
    .locator('[data-slot="tooltip-content"]')
    .filter({ hasText: /^Copy code$/ });
  await copyTooltip.waitFor();
  await annotated.getByRole('button', { name: 'Copy code', exact: true }).click();
  await frame.locator('[data-slot="toast"]').filter({ hasText: 'Code copied' }).waitFor();
  const context = page.context();
  await context.grantPermissions(['clipboard-read'], { origin: new URL(page.url()).origin });
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    renderedCode,
    'Copy preserves code whitespace and CRLF without including the toolbar.',
  );
  await context.clearPermissions();
  // Keep the host clipboard operation pending so the disabled/focus state is observable.
  await page.evaluate(() => {
    window.__codeCopyCalls = 0;
    navigator.clipboard.writeText = () =>
      new Promise((resolve) => {
        window.__codeCopyCalls++;
        window.__finishCodeCopy = resolve;
      });
  });
  const keyboardCopy = annotated.getByRole('button', { name: 'Copy code', exact: true });
  await keyboardCopy.focus();
  await keyboardCopy.press('Enter');
  await page.waitForFunction(() => typeof window.__finishCodeCopy === 'function');
  assert.equal(await keyboardCopy.getAttribute('aria-disabled'), 'true');
  assert.equal(
    await keyboardCopy.evaluate((el) => el.ownerDocument.activeElement === el),
    true,
    'Copy retains keyboard focus while pending.',
  );
  await keyboardCopy.press('Space');
  assert.equal(
    await page.evaluate(() => window.__codeCopyCalls),
    1,
    'A pending copy cannot be activated again.',
  );
  await page.evaluate(() => window.__finishCodeCopy());
  await annotated.locator('button[aria-label="Copy code"][aria-disabled="false"]').waitFor();
  assert.equal(
    await keyboardCopy.evaluate((el) => el.ownerDocument.activeElement === el),
    true,
    'Copy retains keyboard focus after success.',
  );
  await page.evaluate(() => {
    delete window.__codeCopyCalls;
    delete window.__finishCodeCopy;
  });
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('Clipboard denied for test'));
  });
  await keyboardCopy.press('Enter');
  await frame.locator('[data-slot="toast"]').filter({ hasText: 'Unable to copy code.' }).waitFor();
  assert.equal(
    await keyboardCopy.evaluate((el) => el.ownerDocument.activeElement === el),
    true,
    'Copy retains keyboard focus after failure.',
  );
  await page.evaluate(() => {
    Reflect.deleteProperty(navigator.clipboard, 'writeText');
  });
  await page.mouse.move(0, 0);
  const wrappedHeight = await annotated.locator('pre').evaluate((el) => el.clientHeight);
  await annotated.getByRole('button', { name: 'Word wrap', exact: true }).click();
  assert.ok((await annotated.locator('pre').evaluate((el) => el.clientHeight)) < wrappedHeight);
  await annotated.getByRole('button', { name: 'Word wrap', exact: true }).click();
  assert.equal(await annotated.locator('code').textContent(), renderedCode);
  const lightColor = await keyword.evaluate((el) => getComputedStyle(el).color);

  // This range crosses multiple tokens, a surrogate pair, a blank line and indentation.
  const from = renderedCode.indexOf('const');
  const to = renderedCode.indexOf('console.log(title);') + 'console.log(title);'.length;
  await selectAnnotationText(frame, '[data-testid="annotated"] pre code', from, to);
  await frame.locator('[data-annotation-action]').click();
  await frame.locator('[data-annotation-editor] textarea').fill('保留代码原文坐标');
  await frame.getByRole('button', { name: /^(Save|保存)$/, exact: true }).click();
  await submitAnnotations(frame);
  const response = await service.app.inject({
    method: 'GET',
    url: `/api/panels/${panel.instanceId}/events?consumer=markdown-highlighting`,
    headers: {
      host: `127.0.0.1:${service.descriptor.port}`,
      authorization: `Bearer ${service.descriptor.controlToken}`,
    },
  });
  assert.equal(response.statusCode, 200);
  const events = response.json().data.events;
  assert.equal(events.length, 1);
  const start = source.indexOf('const');
  const end = source.indexOf('console.log(title);') + 'console.log(title);'.length;
  assert.deepEqual(events[0].payload.annotations[0].targets, [
    { ref: 'code', text: { start, end, quote: source.slice(start, end) } },
  ]);

  await page.evaluate(async () => {
    const response = await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ui: { theme: 'dark', language: 'zh-CN' } }),
    });
    if (!response.ok) throw new Error('Theme update failed');
  });
  await frame.locator('html.dark').waitFor();
  assert.notEqual(await keyword.evaluate((el) => getComputedStyle(el).color), lightColor);
  assert.equal(await annotated.locator('code').textContent(), renderedCode);
  await annotated.getByRole('button', { name: '自动换行', exact: true }).click();
  await annotated.getByRole('button', { name: '自动换行', exact: true }).hover();
  await frame
    .locator('[data-slot="tooltip-content"]')
    .filter({ hasText: /^启用自动换行$/ })
    .waitFor();
  await annotated.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(artifacts, 'dark.png') });
  await frame.getByRole('button', { name: /^(Annotations|批注) \(1\)$/ }).click();
  await frame.getByRole('button', { name: /^(Locate annotation|定位批注) 1$/ }).click();
  assert.equal(
    await annotated.evaluate((el) => el.ownerDocument.getSelection().toString()),
    renderedCode.slice(from, to),
  );
  await page.keyboard.press('Escape');
  await frame.getByRole('button', { name: '切换代码', exact: true }).click();
  const changed = frame.getByTestId('changing');
  await changed.locator('[data-shiki-token]').filter({ hasText: '"next"' }).waitFor();
  assert.equal(await changed.locator('code').textContent(), '{"next":true}\n');
  assert.equal(await changed.getByText('JSON', { exact: true }).count(), 1);
  await frame.getByTestId('mermaid').locator('svg.flowchart').waitFor();
  assert.equal(await frame.getByTestId('mermaid').locator('pre').count(), 0);
  assert.equal(
    await frame.getByTestId('mermaid').locator('[data-slot="markdown-code-block"]').count(),
    0,
  );
  await frame.locator('body').press('ControlOrMeta+A');
  assert.equal(
    await frame
      .locator('body')
      .evaluate((el) => el.ownerDocument.getSelection().toString().includes('TypeScript')),
    false,
    'Native selection excludes toolbar labels.',
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, [], 'Code, themes and Mermaid use packaged local assets.');
  console.log(
    'Markdown highlighting passed: toolbar, language labels, wrap and horizontal scrolling, real clipboard and failure feedback, keyboard focus and toggle semantics, tooltips, themes, custom renderers, Mermaid, updates and exact CRLF annotation selection/locate/submit.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
