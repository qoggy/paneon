import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';
import {
  openAnnotationDirectory,
  selectAnnotationText,
  submitAnnotations,
} from './annotation-tools.mjs';

const root = await realpath(await mkdtemp(join(tmpdir(), 'paneon-markdown-review-')));
const markdown =
  '---\nname: 发布方案🙂\n---\n\n# 全文标题\n\n正文 **词句**。`inline()`\n\n```ts\nconst timeout = 5000;\n```\n\n| 字段 | 值 |\n| --- | --- |\n| 表格文字 | 1 |\n\n- 列表文字\n\n> 引用文字\n\n[关联文件](./request.ts)\n';
const fileText = 'const timeout = 5000;\n';
let service, browser;
try {
  const skill = join(root, 'skill');
  await cp(
    process.env.PANEON_TEST_SKILL_SOURCE ?? new URL('../../skills/paneon', import.meta.url),
    skill,
    { recursive: true },
  );
  await writeFile(join(root, 'review.md'), markdown);
  await writeFile(join(root, 'request.ts'), fileText);
  service = await startServer(join(root, 'runtime'));
  const panel = await service.runtime.run(
    join(skill, 'assets/panels/file-review/panel.tsx'),
    root,
    { title: 'Markdown review format', files: ['review.md'] },
    false,
  );
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  await frame.locator('[data-markdown-frontmatter]').waitFor();
  const save = async (selector, quote) => {
    await frame.locator(selector).scrollIntoViewIfNeeded();
    await selectAnnotationText(frame, selector, 0, quote.length);
    await frame.locator('[data-annotation-action]').click();
    const input = frame.locator('[data-annotation-editor] textarea');
    await input.fill(`调整${quote}`);
    await input.press('Enter');
    await frame.locator('[data-annotation-editor]').waitFor({ state: 'hidden' });
  };
  const cases = [
    ['[data-markdown-frontmatter] dd [data-source-leaf]', '发布方案🙂'],
    ['h1 [data-source-leaf]', '全文标题'],
    ['strong [data-source-leaf]', '词句'],
    ['p > code [data-source-leaf]', 'inline()'],
    ['pre code [data-source-leaf]', 'const timeout = 5000;'],
    ['td:first-child [data-source-leaf]', '表格文字'],
    ['li [data-source-leaf]', '列表文字'],
    ['blockquote [data-source-leaf]', '引用文字'],
  ];
  // Each case selects within one rendered text source, without cross-paragraph selection.
  for (const [selector, quote] of cases) await save(selector, quote);
  await frame.getByRole('link', { name: '关联文件', exact: true }).click();
  const fileSelector = '[data-slot="file-preview-source"] [data-code-line="1"]';
  await frame.locator(fileSelector).waitFor();
  for (const quote of ['timeout', '5000']) {
    const start = fileText.indexOf(quote);
    await selectAnnotationText(frame, fileSelector, start, start + quote.length);
    await frame.locator('[data-annotation-action]').click();
    const input = frame.locator('[data-annotation-editor] textarea');
    await input.fill(`调整${quote}`);
    await input.press('Enter');
    await frame.locator('[data-annotation-editor]').waitFor({ state: 'hidden' });
  }
  await frame.locator('[data-slot="file-preview"]').press('Escape');
  await frame.locator('[data-slot="file-preview"]').waitFor({ state: 'hidden' });
  const events = async () =>
    (await service.runtime.events(panel.instanceId, 'markdown-review', 100, 0)).events;
  assert.equal((await events()).length, 0, 'Saving a draft does not emit feedback');
  // Submission uses the retained sources even after the files change.
  await writeFile(join(root, 'review.md'), '# changed\n');
  await writeFile(join(root, 'request.ts'), 'changed\n');
  const submit = async () => {
    const response = page.waitForResponse(
      (result) => result.url().endsWith('/events') && result.request().method() === 'POST',
    );
    await submitAnnotations(frame);
    assert.equal((await response).status(), 200);
  };
  await submit();
  const [event] = await events();
  assert.equal(event.type, 'file-review-submitted');
  assert.deepEqual(
    event.payload.files[0].annotations,
    cases.map(([, quote]) => {
      const start = markdown.indexOf(quote);
      return {
        targets: [{ text: { start, end: start + quote.length, quote } }],
        comment: `调整${quote}`,
      };
    }),
  );
  assert.deepEqual(event.payload.files.slice(1), [
    {
      path: join(root, 'request.ts'),
      snapshotId: `sha256:${createHash('sha256').update(fileText).digest('hex')}`,
      annotations: ['timeout', '5000'].map((quote) => {
        const start = fileText.indexOf(quote);
        return {
          targets: [{ text: { start, end: start + quote.length, quote } }],
          comment: `调整${quote}`,
        };
      }),
    },
  ]);
  await openAnnotationDirectory(frame);
  await frame.getByRole('button', { name: 'Correct feedback', exact: true }).click();
  await openAnnotationDirectory(frame);
  await frame.getByRole('button', { name: 'Edit annotation 1', exact: true }).click();
  const input = frame.locator('[data-annotation-editor] textarea');
  assert.equal(await input.inputValue(), '调整发布方案🙂');
  await input.fill('更正元数据意见');
  await input.press('Enter');
  await frame.locator('[data-annotation-editor]').waitFor({ state: 'hidden' });
  await submit();
  const corrected = (await events())[1];
  assert.deepEqual(corrected.payload, {
    ...event.payload,
    files: event.payload.files.map((file, index) =>
      index === 0
        ? {
            ...file,
            annotations: file.annotations.map((annotation, at) =>
              at === 0 ? { ...annotation, comment: '更正元数据意见' } : annotation,
            ),
          }
        : file,
    ),
    replacesEventId: event.id,
  });
  assert.deepEqual(errors, []);
  console.log(
    'Markdown review: body, headings, frontmatter, inline/fenced code, table/list/blockquote text, linked snapshot grouping, retained sources and correction passed.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
