import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';
import { annotationTools, selectAnnotationText, submitAnnotations } from './annotation-tools.mjs';

const root = await mkdtemp(join(tmpdir(), 'paneon-diff-highlighting-'));
const evidence = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-diff-highlighting-evidence';
await mkdir(evidence, { recursive: true });
const before = [
  '# 生成客户端',
  '',
  '生成的 `get{InterfaceName}` 是纯工厂函数。',
  '',
  '注意：连接内网，使用 JDK8。',
  '',
  '```ts',
  'const first = 1;',
  'const second = 2;',
  '```',
  '',
  '中文重复 é🙂 保留原文坐标。',
  '',
  '仅删除这一行。',
  '',
  '这段上下文保持相同。',
].join('\r\n');
const after = [
  '# 生成客户端',
  '',
  '生成的 `build{InterfaceName}` 是纯工厂函数。',
  '',
  '连接内网，使用 Java11。并记录日志。',
  '',
  '```ts',
  '// added comment',
  'const first = 10;',
  'const second = 20;',
  '```',
  '',
  '中文重复 é🚀 新增；保留原文坐标。',
  '',
  '',
  '这段上下文保持相同。',
  '',
  '仅新增这一行。',
].join('\r\n');
let service, browser, page;
try {
  const skill = join(root, 'skill');
  await cp(
    process.env.PANEON_TEST_SKILL_SOURCE ?? new URL('../../skills/paneon', import.meta.url),
    skill,
    { recursive: true },
  );
  await writeFile(join(root, 'before.md'), before);
  await writeFile(join(root, 'after.md'), after);
  await writeFile(
    join(root, 'before.ts'),
    '// 注意：连接内网，使用 JDK8。\nconst mode = "sync";\ntype Client = string;\n',
  );
  await writeFile(
    join(root, 'after.ts'),
    '// 连接内网，使用 Java11。并记录日志。\nlet mode = "async";\ntype ApiClient = number;\n',
  );
  service = await startServer(join(root, 'data'));
  async function preferences(theme) {
    const result = await service.app.inject({
      method: 'POST',
      url: '/api/preferences',
      headers: {
        host: `127.0.0.1:${service.descriptor.port}`,
        authorization: `Bearer ${service.descriptor.controlToken}`,
      },
      payload: { ui: { language: 'zh-CN', theme } },
    });
    assert.equal(result.statusCode, 200);
  }
  await preferences('light');
  const instance = await service.runtime.run(
    join(skill, 'assets/panels/diff-review/panel.tsx'),
    root,
    {
      title: 'DiffView 分层高亮',
      files: [
        { displayPath: 'docs/client.md', oldPath: 'before.md', newPath: 'after.md' },
        { displayPath: 'src/readability.ts', oldPath: 'before.ts', newPath: 'after.ts' },
      ],
    },
    false,
  );
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
  const line = (side, number) => frame.locator(`[data-code-side="${side}"][data-line="${number}"]`);
  await line('new', 3).locator('[data-shiki-token]').first().waitFor();
  async function inline(side, number, kind) {
    return (
      await line(side, number).locator(`[data-diff-inline="${kind}"]`).allTextContents()
    ).join('');
  }
  assert.equal(await inline('old', 3, 'modify'), 'get');
  assert.equal(await inline('new', 3, 'modify'), 'build');
  assert.equal(await inline('old', 5, 'delete'), '注意：');
  assert.equal(await inline('new', 5, 'add'), '并记录日志。');
  assert.equal(await inline('new', 5, 'modify'), 'Java11');
  const colors = await frame
    .locator('[data-diff-kind]')
    .evaluateAll((cells) =>
      Object.fromEntries(
        cells.map((cell) => [cell.dataset.diffKind, getComputedStyle(cell).backgroundColor]),
      ),
    );
  assert.equal(new Set([colors.modify, colors.add, colors.delete]).size, 3);
  for (const [side, source] of [
    ['old', before],
    ['new', after],
  ]) {
    assert.equal(
      (await frame.locator(`[data-code-side="${side}"]`).allTextContents()).join(''),
      source,
    );
  }
  for (const [oldNumber, newNumber] of [
    [8, 9],
    [9, 10],
  ]) {
    const oldBox = await line('old', oldNumber).boundingBox();
    const newBox = await line('new', newNumber).boundingBox();
    assert.ok(
      Math.abs(newBox.y - oldBox.y - 24) < 1,
      'Each source stays continuous after insertion; the connector represents the offset.',
    );
  }
  assert.equal(await line('new', 8).evaluate((e) => e.closest('td').dataset.diffKind), 'add');
  await page.screenshot({ path: join(evidence, 'light.png') });

  // The quote spans syntax tokens and diff marks; offsets must refer to the complete CRLF source.
  const annotations = annotationTools(frame, page);
  await selectAnnotationText(frame, '[data-code-side="new"][data-line="3"]', 5, 25);
  await annotations.write('保留细粒度高亮及原文坐标');
  await annotations.save();
  await submitAnnotations(frame);
  const event = (await service.runtime.events(instance.instanceId, 'diff-highlighting', 100, 0))
    .events[0];
  const target = event.payload.annotations[0].targets[0];
  assert.equal(target.text.quote, 'build{InterfaceName}');
  assert.equal(after.slice(target.text.start, target.text.end), target.text.quote);
  await frame.getByRole('button', { name: '单列对比', exact: true }).click();
  assert.equal(await inline('new', 3, 'modify'), 'build');
  assert.equal(await inline('old', 3, 'modify'), 'get');
  await page.screenshot({ path: join(evidence, 'unified.png') });
  await frame.getByRole('button', { name: '左右对比', exact: true }).click();
  await annotations.locate(1);
  assert.equal(await inline('new', 3, 'modify'), 'build');
  await preferences('dark');
  await frame.locator('html[data-theme="dark"]').waitFor();
  const dark = await line('new', 3)
    .locator('[data-diff-inline]')
    .first()
    .evaluate((e) => ({
      inline: getComputedStyle(e).backgroundColor,
      row: getComputedStyle(e.closest('td')).backgroundColor,
    }));
  assert.notEqual(dark.inline, dark.row);
  assert.notEqual(dark.row, colors.modify);
  await page.screenshot({ path: join(evidence, 'dark.png') });
  await frame.getByRole('button', { name: 'readability.ts', exact: true }).dblclick();
  await line('new', 1).locator('[data-shiki-token]').first().waitFor();
  const contrast = [];
  for (const theme of ['light', 'dark']) {
    await preferences(theme);
    await frame.locator(`html[data-theme="${theme}"]`).waitFor();
    const samples = await frame.locator('[data-diff-inline]').evaluateAll((marks) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      const luminance = (color) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      return marks
        .filter((e) => e.textContent.trim())
        .map((mark) => {
          const style = getComputedStyle(mark);
          const fg = luminance(style.color),
            bg = luminance(style.backgroundColor);
          return {
            text: mark.textContent,
            kind: mark.dataset.diffInline,
            foreground: style.color,
            background: style.backgroundColor,
            ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
          };
        });
    });
    assert.deepEqual([...new Set(samples.map((s) => s.kind))].sort(), ['add', 'delete', 'modify']);
    assert.ok(
      samples.some((s) => s.text.includes('ApiClient')),
      'Cover syntax-colored type names.',
    );
    for (const sample of samples)
      assert.ok(sample.ratio >= 4.5, `${theme} text contrast: ${JSON.stringify(sample)}`);
    contrast.push({ theme, minimum: Math.min(...samples.map((s) => s.ratio)) });
    await page.screenshot({ path: join(evidence, `readability-${theme}.png`) });
  }
  await writeFile(join(evidence, 'contrast.json'), JSON.stringify(contrast, null, 2));
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      status: 'passed',
      blockAndInlineColors: true,
      continuousLines: true,
      exactSourceText: true,
      syntaxHighlighting: true,
      annotationSubmission: true,
      unified: true,
      darkTheme: true,
      syntaxTextContrast: contrast,
    }),
  );
} catch (error) {
  await page?.screenshot({ path: join(evidence, 'failure.png') });
  throw error;
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
