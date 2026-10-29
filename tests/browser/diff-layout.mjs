import { PACKAGE_VERSION } from '../panel-fixture.ts';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';

const root = await mkdtemp(join(tmpdir(), 'paneon-diff-layout-'));
const original = Array.from(
  { length: 40 },
  (_, i) =>
    `const line${i + 1} = ${i === 2 ? JSON.stringify('long_source_'.repeat(100)) : i + 1};\n`,
).join('');
const modified = original.replace(
  'const line11',
  Array.from({ length: 6 }, (_, i) => `// inserted ${i}\n`).join('') + 'const line11',
);
let service, browser;
try {
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    `
    import {useState} from 'react';
    import {definePanel, z} from '@qoggy/paneon/sdk';
    import {Button, DiffView} from '@qoggy/paneon/ui';
    function Panel() {
      const [same, setSame] = useState(false);
      return <><Button onClick={() => setSame(true)}>Same source</Button>
        <div data-layout-host className="flex flex-col border" style={{height:'80rem'}}>
          <DiffView layout="bounded" oldPath="source.ts" newPath="source.ts"
            oldText={${JSON.stringify(original)}} newText={same ? ${JSON.stringify(original)} : ${JSON.stringify(modified)}} />
        </div></>;
    }
    export default definePanel({id:'diff-layout',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:Panel});
  `,
  );
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
  const panel = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
    ignoreDefaultArgs: ['--hide-scrollbars'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  const source = frame.locator('[data-diff-source]');
  const viewport = frame.locator('[data-diff-viewport]');
  await source.locator('[data-diff-connector][d]').waitFor();
  await source
    .locator('[data-code-side="new"][data-line="3"] [data-shiki-token]')
    .first()
    .waitFor();
  await source
    .locator('[data-code-side="old"][data-line="3"] [data-shiki-token]')
    .first()
    .waitFor();
  await source.evaluate((element) => {
    const style = document.createElement('style');
    style.dataset.testScrollbars = '';
    style.textContent = '::-webkit-scrollbar { width: 0; height: 0; }';
    element.append(style);
  });
  const initialLayout = await source.evaluate(async (element) => {
    await document.fonts.ready;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const view = element.querySelector('[data-diff-viewport]');
    return { width: element.clientWidth, height: view.clientHeight, content: view.scrollHeight };
  });
  assert.equal(
    initialLayout.height,
    initialLayout.content,
    'Initially the bounded content fits without vertical scrolling.',
  );
  await frame.locator('[data-layout-host]').evaluate((element) => (element.style.height = '20rem'));
  await viewport.evaluate((element) => (element.scrollTop = 500));
  const linked = await source.evaluate(async (element) => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const old = element
      .querySelector('[data-code-side="old"][data-line="30"]')
      .getBoundingClientRect();
    const next = element
      .querySelector('[data-code-side="new"][data-line="36"]')
      .getBoundingClientRect();
    return {
      difference: old.top - next.top,
      transforms: [...element.querySelectorAll('[data-diff-table]')].map(
        (table) => table.style.transform,
      ),
    };
  });
  console.log('height-only resize:', JSON.stringify(linked));
  assert.equal(
    await source.evaluate((element) => element.clientWidth),
    initialLayout.width,
    'Reproduce height changes without an incidental width resize.',
  );
  await source.evaluate(async (element) => {
    element.querySelector('[data-test-scrollbars]').textContent +=
      '[data-diff-scroll]::-webkit-scrollbar { height: 15px; }';
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  await viewport.evaluate((element) => (element.scrollTop = element.scrollHeight));
  async function measureBottoms() {
    return source.evaluate(async (element) => {
      await new Promise(requestAnimationFrame);
      return ['old', 'new'].map((side) => {
        const pane = element.querySelector(`[data-diff-scroll="${side}"]`);
        const rows = [...pane.querySelectorAll('tr')];
        const end = rows.at(-1).getBoundingClientRect().bottom;
        const clip = pane.getBoundingClientRect().top + pane.clientTop + pane.clientHeight;
        return {
          side,
          scrollbar: pane.offsetHeight - pane.clientHeight,
          overshoot: end - clip,
          verticalRange: pane.scrollHeight - pane.clientHeight,
        };
      });
    });
  }
  const bottoms = await measureBottoms();
  console.log('native scrollbar:', JSON.stringify(bottoms));
  await source.evaluate(async (element) => {
    element.querySelector('[data-test-scrollbars]').textContent +=
      '[data-diff-scroll="old"]::-webkit-scrollbar { height: 0; }';
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  await viewport.evaluate((element) => (element.scrollTop = element.scrollHeight));
  const asymmetric = await measureBottoms();
  console.log('one-sided native scrollbar:', JSON.stringify(asymmetric));
  await frame.getByRole('button', { name: 'Same source', exact: true }).click();
  await frame.getByRole('button', { name: '收起上下文', exact: true }).click();
  const emptyPanes = await source.locator('[data-diff-scroll][tabindex="0"]').count();
  console.log('empty focusable panes:', emptyPanes);
  assert.ok(
    Math.abs(linked.difference) <= 1,
    'Height-only resizing keeps corresponding context lines aligned while scrolling.',
  );
  assert.ok(
    bottoms.every((pane) => pane.scrollbar === 15),
    'Exercise non-overlay horizontal scrollbars.',
  );
  assert.ok(
    bottoms.every((pane) => pane.overshoot <= 1 && pane.verticalRange <= 1),
    'Last source lines remain above the scrollbar without internal vertical overflow.',
  );
  assert.deepEqual(
    asymmetric.map((pane) => pane.scrollbar),
    [0, 15],
  );
  assert.ok(
    asymmetric.every((pane) => pane.overshoot <= 1 && pane.verticalRange <= 1),
    'Reserve the larger scrollbar height when only one source has a native scrollbar.',
  );
  assert.equal(emptyPanes, 0, 'A collapsed unchanged diff has no empty focus stops.');
  assert.deepEqual(errors, []);
  console.log(
    'PASS Diff layout: height-only container resize, native horizontal scrollbars and empty collapsed context.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
