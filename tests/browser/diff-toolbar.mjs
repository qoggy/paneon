import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { commentTools } from './git-review-comment-tools.mjs';

const root = await mkdtemp(join(tmpdir(), 'paneon-diff-toolbar-'));
let service, browser;
try {
  const { startServer } = await import(
    process.env.PANEON_TEST_RUNTIME_ENTRY ??
      new URL('../../dist/runtime/server.js', import.meta.url).href
  );
  const skill =
    process.env.PANEON_TEST_SKILL_SOURCE ?? new URL('../../skills/paneon/', import.meta.url);
  await cp(
    typeof skill === 'string' ? join(skill, 'assets/shared') : new URL('assets/shared/', skill),
    join(root, 'shared'),
    { recursive: true },
  );
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    await readFile(new URL('./diff-toolbar-fixture.txt', import.meta.url), 'utf8'),
  );
  service = await startServer(join(root, 'data'));
  const panel = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const counter = button('定位当前差异');
  const previous = button('上一个差异');
  const next = button('下一个差异');
  const viewport = frame.locator('[data-toolbar-viewport]');
  await counter.waitFor();
  assert.equal(await counter.textContent(), '1 / 3 处差异');
  assert.equal(await previous.isDisabled(), true);
  assert.equal(await next.isEnabled(), true);
  assert.equal(await button('左右对比').getAttribute('aria-pressed'), 'true');
  await next.click();
  assert.equal(await counter.textContent(), '2 / 3 处差异');
  assert.ok((await viewport.evaluate((e) => e.scrollTop)) > 0);
  const secondScroll = await viewport.evaluate((e) => e.scrollTop);
  await next.click();
  assert.equal(await counter.textContent(), '3 / 3 处差异');
  assert.equal(await next.isDisabled(), true);
  assert.ok((await viewport.evaluate((e) => e.scrollTop)) > secondScroll);
  await previous.focus();
  await page.keyboard.press('Enter');
  assert.equal(await counter.textContent(), '2 / 3 处差异');
  await viewport.evaluate((e) => {
    e.scrollTop = 0;
  });
  await counter.click();
  assert.ok((await viewport.evaluate((e) => e.scrollTop)) > 0);
  await button('单列对比').click();
  assert.equal(await button('单列对比').getAttribute('aria-pressed'), 'true');
  assert.equal(await frame.locator('[data-diff-split]').count(), 0);
  assert.equal(await counter.textContent(), '2 / 3 处差异');
  await button('展开全部上下文').click();
  await counter.click();
  const changed = frame.locator('[data-code-side="new"][data-line="45"]');
  assert.ok(await changed.isVisible());
  const visible = await changed.boundingBox();
  const clip = await viewport.boundingBox();
  assert.ok(visible.y >= clip.y && visible.y < clip.y + clip.height);
  // Full source survives mode switches, including its CRLF line endings.
  assert.equal(
    await frame
      .locator('[data-code-side="new"]')
      .evaluateAll((elements) => elements.map((e) => e.textContent).join('')),
    Array.from(
      { length: 90 },
      (_, i) =>
        `const line${i + 1} = "${[10, 45, 80].includes(i + 1) ? 'changed' : 'original'} ${i + 1}";\r\n`,
    ).join(''),
  );
  await button('左右对比').click();
  assert.equal(await frame.locator('[data-diff-split]').count(), 1);
  await button('选择对象').click();
  await button('选择新侧第 45 行').click();
  const comments = commentTools(frame, page);
  await comments.write('Keep exact line 45');
  await comments.save();
  assert.equal(await comments.count(), 1);
  await button('单列对比').click();
  await button('收起上下文').click();
  assert.equal(await comments.count(), 1);
  assert.equal(await comments.text(1), 'Keep exact line 45');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await frame.locator('body').evaluate((e) => e.scrollWidth > window.innerWidth),
    false,
  );
  await page.screenshot({ path: '/tmp/paneon-diff-toolbar-mobile.png', fullPage: true });
  await button('Same source').click();
  assert.equal(await counter.textContent(), '无差异');
  for (const control of [counter, previous, next]) assert.equal(await control.isDisabled(), true);
  await button('Binary source').click();
  assert.equal(await frame.getByRole('group', { name: '差异操作', exact: true }).count(), 0);
  await button('Changed source').click();
  assert.equal(await counter.textContent(), '1 / 3 处差异');
  await page.setViewportSize({ width: 1100, height: 650 });
  await button('左右对比').click();
  await button('结束选择').click();
  await viewport.evaluate(async (element) => {
    element.scrollTop = 0;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.ok((await viewport.boundingBox()).width > 1000);
  await page.screenshot({ path: '/tmp/paneon-diff-toolbar-desktop.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'PASS Diff toolbar: three hunks, pointer navigation and current locate, boundaries, modes and exact CRLF, preserved comment, source reset, same/binary, 390px layout.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
