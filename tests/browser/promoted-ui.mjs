import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { startServer } from '../../dist/runtime/server.js';
const root = await mkdtemp(join(tmpdir(), 'paneon-promoted-ui-'));
let service, browser;
try {
  await mkdir(join(root, 'data'), { recursive: true });
  await writeFile(join(root, 'data', 'config.json'), JSON.stringify({ server: { port: 0 } }));
  await writeFile(
    join(root, 'panel.tsx'),
    await readFile(new URL('./promoted-ui-fixture.txt', import.meta.url), 'utf8'),
  );
  service = await startServer(join(root, 'data'));
  const run = await service.runtime.run(join(root, 'panel.tsx'), root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const f = page.frameLocator('iframe');
  const prefs = async (theme, language) => {
    const result = await service.app.inject({
      method: 'POST',
      url: '/api/preferences',
      headers: {
        host: `127.0.0.1:${service.descriptor.port}`,
        authorization: `Bearer ${service.descriptor.controlToken}`,
      },
      payload: { ui: { theme, language } },
    });
    assert.equal(result.statusCode, 200);
  };
  await prefs('light', 'en');
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${run.instanceId}`);
  await f.getByRole('heading', { name: 'Promoted UI acceptance', exact: true }).waitFor();
  await f.getByRole('heading', { name: 'Plain Markdown', exact: true }).waitFor();
  const diff = f.getByTestId('diff');
  assert.equal(await diff.locator('[data-diff-source-headers]').count(), 0);
  await f.getByRole('button', { name: 'Toggle metadata', exact: true }).click();
  assert.equal(
    (await diff.locator('[data-diff-source-headers]').innerText()).trim(),
    'only-old.ts',
  );
  assert.equal((await diff.innerText()).includes('∅'), false);
  for (const theme of ['light', 'dark'])
    for (const language of ['en', 'zh-CN']) {
      await prefs(theme, language);
      const mode = language === 'en' ? 'Side by side' : '左右对比';
      await diff.getByRole('button', { name: mode, exact: true }).waitFor();
      await f.locator(`html[data-theme="${theme}"][data-language="${language}"]`).waitFor();
      const color = await diff
        .locator('[data-code-side="new"]')
        .first()
        .evaluate((el) => getComputedStyle(el.closest('td')).backgroundColor);
      assert.notEqual(color, 'rgba(0, 0, 0, 0)');
      assert.notEqual(color, 'rgb(255, 255, 255)');
    }
  await prefs('light', 'en');
  async function annotate(id, comment) {
    const text = f.getByTestId(id).locator('strong');
    await text.scrollIntoViewIfNeeded();
    const box = await text.boundingBox();
    await page.mouse.move(box.x + 1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await f.getByRole('button', { name: 'Annotation', exact: true }).click();
    await f.getByRole('textbox', { name: 'Annotation text', exact: true }).fill(comment);
    await f.getByRole('button', { name: 'Save', exact: true }).click();
  }
  const draft = async () => JSON.parse(await f.getByTestId('draft').textContent());
  await annotate('doc-a', 'A only');
  await annotate('doc-b', 'B only');
  let value = await draft();
  assert.equal(value.annotations.length, 2);
  assert.deepEqual(
    value.annotations.map((a) => a.targets[0].ref),
    ['plan-a', 'plan-b'],
  );
  const range = value.annotations[0].targets[0].text;
  assert.equal(range.quote, 'repeat');
  assert.equal(range.start, '## Review\n\nrepeat **'.length);
  assert.deepEqual(value.annotations[1].targets[0].text, range);
  const before = structuredClone(value);
  await f.getByRole('button', { name: 'Change source', exact: true }).click();
  await f.getByTestId('doc-a').getByRole('heading', { name: 'Review', exact: true }).waitFor();
  await f.getByTestId('doc-a').locator('[data-markdown-retained]').waitFor();
  await f.getByRole('button', { name: 'Submit annotations', exact: true }).click();
  await f.getByTestId('delivery-error').waitFor();
  assert.deepEqual(await draft(), before);
  assert.deepEqual(JSON.parse(await f.getByTestId('receipts').textContent()), []);
  await f.getByRole('button', { name: 'Allow delivery', exact: true }).click();
  await f.getByRole('button', { name: 'Submit annotations', exact: true }).click();
  await f.getByTestId('receipts').filter({ hasText: 'A only' }).waitFor();
  assert.deepEqual(JSON.parse(await f.getByTestId('receipts').textContent())[0], before);
  await f.getByRole('button', { name: 'Remove drafts', exact: true }).click();
  await f
    .getByTestId('doc-a')
    .getByRole('heading', { name: 'Updated document', exact: true })
    .waitFor();
  assert.equal((await draft()).annotations.length, 0);
  assert.deepEqual(errors, []);
  console.log(
    'PASS promoted UI: public imports; ordinary Markdown without Root; four theme/language combinations; metadata visibility; identical texts/distinct refs; exact Markdown source; preserved source on prop update; failed submit retains drafts; retry succeeds; removing drafts reveals new content.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
