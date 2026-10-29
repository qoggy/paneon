import { PACKAGE_VERSION } from '../panel-fixture.ts';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';

const root = await mkdtemp(join(tmpdir(), 'paneon-diff-scrollbars-'));
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-diff-scrollbars';
const original = Array.from(
  { length: 240 },
  (_, i) =>
    `const line${i + 1} = ${i === 4 ? JSON.stringify('long_source_'.repeat(80)) : i + 1};\n`,
).join('');
const modified = original
  .replace('const line20 = 20;\nconst line21 = 21;\n', '')
  .replace('const line60 = 60;', 'const line60 = changed(60);')
  .replace('const line100', '// inserted first\n// inserted second\nconst line100')
  .replace('const line160 = 160;', 'const line160 = call(\n  first,\n  second,\n);');
let service, browser;
try {
  await mkdir(artifacts, { recursive: true });
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    `
    import {useState} from 'react';
    import {definePanel, z} from '@qoggy/paneon/sdk';
    import {Button, DiffView} from '@qoggy/paneon/ui';
    function Panel() {
      const [bounded, setBounded] = useState(true);
      return <><Button onClick={() => setBounded(!bounded)}>Toggle document</Button>
        <div data-test-host className={bounded ? 'flex h-[36rem] flex-col border' : 'border'}>
          <DiffView layout={bounded ? 'bounded' : 'document'}
            oldPath="source.ts" newPath="source.ts"
            oldText={${JSON.stringify(original)}} newText={${JSON.stringify(modified)}} />
        </div></>;
    }
    export default definePanel({id:'diff-scrollbars',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:Panel});
  `,
  );
  service = await startServer(join(root, 'data'));
  async function preferences(theme) {
    await service.app.inject({
      method: 'POST',
      url: '/api/preferences',
      headers: {
        host: `127.0.0.1:${service.descriptor.port}`,
        authorization: `Bearer ${service.descriptor.controlToken}`,
      },
      payload: { ui: { language: 'zh-CN', theme } },
    });
  }
  await preferences('light');
  const panel = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const frame = page.frameLocator('iframe');
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const source = frame.locator('[data-diff-source]');
  const viewport = frame.locator('[data-diff-viewport]');
  const rail = (side) => source.locator(`[data-diff-scrollbar="${side}"]`);
  const thumb = (side) => rail(side).locator('[data-diff-scrollbar-thumb]');
  async function settle() {
    await source.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
  }
  async function assertLinked() {
    await settle();
    const geometry = await source.evaluate((element) => {
      const top = element.querySelector('[data-diff-viewport]').getBoundingClientRect().top;
      const lines = [...element.querySelectorAll('[data-code-side="old"]')];
      const visible = lines.find((line) => line.getBoundingClientRect().top >= top + 24);
      const partner = [...element.querySelectorAll('[data-code-side="new"]')].find(
        (line) => line.textContent === visible?.textContent,
      );
      return {
        top,
        line: visible?.dataset.line,
        partner: partner?.dataset.line,
        scroll: element.querySelector('[data-diff-viewport]').scrollTop,
        old: visible?.getBoundingClientRect().top,
        next: partner?.getBoundingClientRect().top,
      };
    });
    assert.ok(Math.abs(geometry.old - geometry.next) < 1, JSON.stringify(geometry));
  }
  async function dragThumb(side, fraction) {
    await settle();
    const track = await rail(side).boundingBox();
    const handle = await thumb(side).boundingBox();
    const x = handle.x + handle.width / 2;
    await page.mouse.move(x, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      x,
      track.y + handle.height / 2 + (track.height - handle.height) * fraction,
      { steps: 10 },
    );
    await page.mouse.up();
    await assertLinked();
  }
  await rail('old').waitFor({ state: 'visible' });
  await thumb('new').waitFor({ state: 'visible' });
  await settle();
  assert.equal(await source.getByRole('scrollbar').count(), 2);
  const marks = await source.locator('[data-diff-scrollbar-mark]').evaluateAll((elements) =>
    elements.map((element) => ({
      kind: element.dataset.diffScrollbarMark,
      color: getComputedStyle(element).backgroundColor,
      pointer: getComputedStyle(element).pointerEvents,
      role: element.getAttribute('role'),
      tabIndex: element.tabIndex,
    })),
  );
  assert.deepEqual([...new Set(marks.map((mark) => mark.kind))].sort(), [
    'add',
    'delete',
    'modify',
  ]);
  assert.equal(new Set(marks.map((mark) => mark.color)).size, 3);
  assert.ok(
    marks.every((mark) => mark.pointer === 'none' && mark.role === null && mark.tabIndex === -1),
  );
  const originalNode = await source.locator('[data-code-side="old"]').first().elementHandle();
  let reads = 0;
  page.on('request', (request) => {
    if (request.url().includes('/actions/')) reads++;
  });
  await dragThumb('old', 0.35);
  assert.ok(Number(await rail('new').getAttribute('aria-valuenow')) > 0);
  await dragThumb('new', 0.7);
  const track = await rail('old').boundingBox();
  await page.mouse.click(track.x + 1, track.y + track.height * 0.45);
  await settle();
  const position = Number(await rail('old').getAttribute('aria-valuenow'));
  assert.ok(
    position > 1500 && position < 3500,
    `Track click scrolls to its proportional position: ${position}`,
  );
  await rail('old').press('End');
  await settle();
  assert.ok(
    await viewport.evaluate(
      (element) => Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) <= 1,
    ),
  );
  for (const side of ['old', 'new']) {
    const end = await rail(side).evaluate((element) => {
      const thumb = element.querySelector('[data-diff-scrollbar-thumb]').getBoundingClientRect();
      return element.getBoundingClientRect().bottom - thumb.bottom;
    });
    assert.ok(Math.abs(end) < 1, 'Both thumbs reach the bottom with unequal source lengths.');
  }
  await rail('new').press('Home');
  await settle();
  assert.equal(await viewport.evaluate((element) => element.scrollTop), 0);
  await viewport.hover();
  await page.mouse.wheel(0, 1200);
  await settle();
  await assertLinked();
  assert.ok(Number(await rail('old').getAttribute('aria-valuenow')) > 0);
  await rail('old').press('PageDown');
  await assertLinked();
  await viewport.evaluate((element) => {
    element.scrollTop = 1300;
  });
  await settle();
  await source.screenshot({ path: join(artifacts, 'bounded-light.png') });
  assert.equal(await originalNode.evaluate((element) => element.isConnected), true);
  assert.equal(reads, 0, 'Scrolling keeps source DOM and performs no file or Git reads.');

  await frame.getByRole('button', { name: '收起上下文', exact: true }).click();
  await settle();
  assert.equal(await source.getByRole('scrollbar').count(), 2);
  await frame.getByRole('button', { name: '单列对比', exact: true }).click();
  assert.equal(await source.getByRole('scrollbar').count(), 0);
  assert.notEqual(
    await viewport.evaluate((element) => getComputedStyle(element).scrollbarWidth),
    'none',
  );
  await frame.getByRole('button', { name: '左右对比', exact: true }).click();
  await frame.getByRole('button', { name: '展开全部上下文', exact: true }).click();
  await dragThumb('new', 0.5);
  await frame.locator('[data-test-host]').evaluate((element) => {
    element.style.height = '24rem';
  });
  await assertLinked();
  await dragThumb('old', 0.4);
  const horizontal = source.locator('[data-diff-scroll="old"]');
  await horizontal.evaluate((element) => {
    element.scrollLeft = 500;
  });
  await settle();
  assert.equal(await horizontal.evaluate((element) => element.scrollLeft), 500);
  assert.equal(
    await rail('old').evaluate((element) => element.getBoundingClientRect().left),
    await source.evaluate((element) => element.getBoundingClientRect().left),
  );

  await frame.getByRole('button', { name: 'Toggle document', exact: true }).click();
  await settle();
  await rail('new').press('PageDown');
  await settle();
  assert.ok(Number(await rail('new').getAttribute('aria-valuenow')) > 0);
  await page.screenshot({ path: join(artifacts, 'document-light.png') });
  await rail('new').press('End');
  await settle();
  for (const side of ['old', 'new']) {
    assert.equal(
      await rail(side).getAttribute('aria-valuenow'),
      await rail(side).getAttribute('aria-valuemax'),
    );
  }
  await rail('old').press('Home');
  await settle();
  assert.equal(await rail('new').getAttribute('aria-valuenow'), '0');
  await preferences('dark');
  await frame.locator('html[data-theme="dark"]').waitFor();
  await settle();
  await page.screenshot({ path: join(artifacts, 'document-dark.png') });
  await frame.getByRole('button', { name: 'Toggle document', exact: true }).click();
  await settle();
  await dragThumb('new', 0.6);
  await frame.locator('[data-test-host]').evaluate((element) => {
    element.style.height = '1000rem';
  });
  await settle();
  for (const side of ['old', 'new']) {
    assert.equal(await rail(side).getAttribute('aria-valuemax'), '0');
    assert.equal(await rail(side).getAttribute('tabindex'), '-1');
    assert.equal(await thumb(side).isVisible(), false);
    assert.ok((await rail(side).locator('[data-diff-scrollbar-mark]').count()) > 0);
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS Diff scrollbars: decorative marks, both thumb drags, track clicks, linked wheel/keyboard scrolling, source preservation, modes, resize and document layout.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
