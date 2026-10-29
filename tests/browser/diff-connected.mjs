import { PACKAGE_VERSION } from '../panel-fixture.ts';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';
import { annotationTools, selectAnnotationText } from './annotation-tools.mjs';

const root = await mkdtemp(join(tmpdir(), 'paneon-diff-connected-'));
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-diff-connected';
const before = Array.from({ length: 180 }, (_, i) => `const line${i + 1} = ${i + 1};\r\n`).join('');
const after = before
  .replace('const line20 = 20;\r\n', '')
  .replace('const line21 = 21;\r\n', '')
  .replace('const line50 = 50;\r\n', 'const line50 = call(\r\n  first,\r\n  second,\r\n);\r\n')
  .replace(
    'const line90 = 90;\r\n',
    '// inserted one\r\n// inserted two\r\n// inserted three\r\nconst line90 = 90;\r\n',
  )
  .replace('const line130 = 130;', `const line130 = "${'long_source_'.repeat(100)}";`);
let service, browser, page;
try {
  await mkdir(artifacts, { recursive: true });
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    `
    import {useRef, useState} from 'react';
    import {definePanel, z} from '@qoggy/paneon/sdk';
    import {Button, DiffView, useAnnotations, usePageAnnotations} from '@qoggy/paneon/ui';
    import type {DiffViewHandle} from '@qoggy/paneon/ui';
    const oldText = ${JSON.stringify(before)}, newText = ${JSON.stringify(after)};
    function Draft() { const {value} = useAnnotations(); return <output data-draft className="sr-only">{JSON.stringify(value)}</output>; }
    function Panel() {
      const diff = useRef<DiffViewHandle>(null);
      const [bounded, setBounded] = useState(true);
      usePageAnnotations<'old' | 'new'>({onSubmit: async () => {}, adapter: {
        resolve: target => ({status:'ready', text:target.ref === 'old' ? oldText : newText}),
        targetRanges: target => target.text ? diff.current?.getRanges({kind:'text', side:target.ref, ...target.text}) ?? [] : [],
        locate: target => diff.current?.reveal(target.text ? {kind:'text', side:target.ref, ...target.text} : {kind:'file'}),
      }});
      return <><Draft /><Button onClick={() => setBounded(!bounded)}>Toggle document</Button>
        <div data-test-host className={bounded ? 'flex h-[36rem] flex-col border' : 'border'}>
          <DiffView key={String(bounded)} ref={diff} oldText={oldText} newText={newText}
            oldPath="source.ts" newPath="source.ts" annotationTargets={{old:'old',new:'new'}}
            layout={bounded ? 'bounded' : 'document'} />
        </div></>;
    }
    export default definePanel({id:'diff-connected', requires:{paneon:'${PACKAGE_VERSION}'}, input:z.object({}), render:Panel});
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
    payload: { ui: { language: 'zh-CN', theme: 'light' } },
  });
  const panel = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  const source = frame.locator('[data-diff-source]');
  const viewport = frame.locator('[data-diff-viewport]');
  const line = (side, number) => frame.locator(`[data-code-side="${side}"][data-line="${number}"]`);
  await frame.locator('[data-diff-connector="add"][d]').waitFor();

  async function assertContinuous() {
    const geometry = await source.evaluate(async (element) => {
      await new Promise(requestAnimationFrame);
      return ['old', 'new'].map((side) => {
        const table = element.querySelector(`[data-diff-table="${side}"]`);
        const rows = [...table.querySelectorAll('tr')];
        return {
          missing: rows.filter((row) => !row.querySelector(`[data-code-side="${side}"]`)).length,
          gaps: rows
            .slice(1)
            .map(
              (row, index) =>
                row.getBoundingClientRect().top - rows[index].getBoundingClientRect().bottom,
            ),
          text: [...table.querySelectorAll('[data-code-side]')]
            .map((cell) => cell.textContent)
            .join(''),
        };
      });
    });
    for (const [index, side] of geometry.entries()) {
      assert.equal(side.missing, 0);
      assert.ok(
        side.gaps.every((gap) => Math.abs(gap) < 1),
        'Every real source line follows the preceding line without padding.',
      );
      assert.equal(side.text, index === 0 ? before : after);
    }
  }
  async function assertEmptyEdges() {
    const edges = await source.evaluate((element) => {
      const svg = element.querySelector('[data-diff-connectors]');
      const lane = svg.getBoundingClientRect();
      return [...element.querySelectorAll('[data-diff-empty-edge]')].map((edge) => {
        const kind = edge.dataset.diffEmptyEdge;
        const path = svg.querySelector(`[data-diff-connector="${kind}"]`);
        const values = path
          .getAttribute('d')
          .match(/-?[\d.]+/g)
          .map(Number);
        const rect = edge.getBoundingClientRect();
        return {
          height: rect.height,
          width: rect.width,
          y: rect.top + 1,
          expectedY: lane.top + values[kind === 'add' ? 1 : 7],
          x: kind === 'add' ? rect.right : rect.left,
          expectedX: kind === 'add' ? lane.left : lane.right,
          color: getComputedStyle(edge).borderTopColor,
          expectedColor: getComputedStyle(path).stroke,
        };
      });
    });
    for (const edge of edges) {
      assert.equal(edge.height, 2, 'The empty side has a visible horizontal line.');
      assert.ok(edge.width > 100);
      assert.ok(
        Math.abs(edge.y - edge.expectedY) <= 1,
        'The line meets the zero-height end of its connector.',
      );
      assert.ok(Math.abs(edge.x - edge.expectedX) <= 1);
      assert.equal(edge.color, edge.expectedColor);
    }
  }
  await assertContinuous();
  assert.equal(
    await frame.locator('[data-diff-empty-edge="add"][data-diff-empty-side="old"]').count(),
    1,
  );
  assert.equal(
    await frame.locator('[data-diff-empty-edge="delete"][data-diff-empty-side="new"]').count(),
    1,
  );
  assert.deepEqual(
    await frame
      .locator('[data-diff-connector]')
      .evaluateAll((paths) => paths.map((path) => path.dataset.diffConnector)),
    ['delete', 'modify', 'add', 'modify'],
  );
  await assertEmptyEdges();
  await source.screenshot({ path: join(artifacts, 'deletion-light.png') });

  // No source padding at the one-to-many replacement; its endpoints differ in height.
  await frame.getByRole('button', { name: '下一个差异', exact: true }).click();
  const old50 = await line('old', 50).boundingBox();
  const old51 = await line('old', 51).boundingBox();
  const new48 = await line('new', 48).boundingBox();
  const new52 = await line('new', 52).boundingBox();
  assert.equal(old51.y - old50.y, 24);
  assert.equal(new52.y - new48.y, 96);
  const endpoints = await frame
    .locator('[data-diff-connector="modify"]')
    .first()
    .evaluate((path) => {
      const values = path
        .getAttribute('d')
        .match(/-?[\d.]+/g)
        .map(Number);
      const origin = path.ownerSVGElement.getBoundingClientRect().top;
      return [values[1], values[13], values[7], values[9]].map((y) => y + origin);
    });
  for (const [index, expected] of [old50.y, old50.y + old50.height, new48.y, new52.y].entries()) {
    assert.ok(
      Math.abs(endpoints[index] - expected) <= 1,
      'Connector edges attach to actual source ranges.',
    );
  }
  await source.screenshot({ path: join(artifacts, 'replacement-light.png') });
  await frame.getByRole('button', { name: '下一个差异', exact: true }).click();
  await assertEmptyEdges();
  await source.screenshot({ path: join(artifacts, 'insertion-light.png') });
  await frame.getByRole('button', { name: '上一个差异', exact: true }).click();

  // Shared vertical scrolling maps the two continuous tables through their correspondences.
  for (const fraction of [0, 0.2, 0.5, 0.85, 1, 0.4, 0]) {
    await viewport.evaluate(
      (element, fraction) =>
        (element.scrollTop = (element.scrollHeight - element.clientHeight) * fraction),
      fraction,
    );
    await assertContinuous();
    await assertEmptyEdges();
    const alignment = await source.evaluate((element) => {
      const split = element.querySelector('[data-diff-split]');
      const paths = [...split.querySelectorAll('[data-diff-connector]')];
      return paths.every((path) => !path.getAttribute('d').includes('NaN'));
    });
    assert.ok(alignment);
  }
  const divider = frame.getByRole('separator', { name: '调整差异两侧宽度', exact: true });
  for (let i = 0; i < 5; i++) await divider.press('ArrowRight');
  await assertContinuous();
  await assertEmptyEdges();
  for (const width of [1100, 1600, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await assertContinuous();
    await assertEmptyEdges();
  }
  await frame.locator('[data-diff-scroll="new"]').evaluate((element) => (element.scrollLeft = 100));
  assert.equal(
    await frame.locator('[data-diff-scroll="old"]').evaluate((element) => element.scrollLeft),
    0,
  );
  assert.equal(
    await frame.locator('[data-diff-scroll="new"]').evaluate((element) => element.scrollLeft),
    100,
  );
  await frame.locator('[data-diff-scroll="new"]').evaluate((element) => (element.scrollLeft = 0));

  // Block annotations retain both full-source coordinates and follow the connector lane.
  await frame.getByRole('button', { name: '定位当前差异', exact: true }).click();
  await frame.getByRole('button', { name: '批注第 1 处改动', exact: true }).click();
  const annotations = annotationTools(frame, page);
  async function locate(number) {
    const trigger = frame.getByRole('button', { name: /^批注 \(\d+\)$/ });
    // Use the launcher's keyboard action so hovering is not a second open gesture.
    await trigger.press('Enter');
    await frame.getByRole('dialog', { name: '批注目录', exact: true }).waitFor();
    await frame.getByRole('button', { name: `定位批注 ${number}`, exact: true }).click();
    await page.keyboard.press('Escape');
    await frame.getByRole('dialog', { name: '批注目录', exact: true }).waitFor({ state: 'hidden' });
  }
  await annotations.write('删除块');
  await annotations.save();
  let draft = JSON.parse(await frame.locator('[data-draft]').textContent());
  assert.equal(draft.annotations[0].targets.length, 1);
  assert.equal(draft.annotations[0].targets[0].ref, 'old');
  assert.equal(
    draft.annotations[0].targets[0].text.quote,
    'const line20 = 20;\r\nconst line21 = 21;\r\n',
  );
  await selectAnnotationText(frame, '[data-code-side="new"][data-line="48"]', 0, 12);
  await annotations.write('折行后的原文位置');
  await annotations.save();
  draft = JSON.parse(await frame.locator('[data-draft]').textContent());
  const target = draft.annotations[1].targets[0];
  assert.equal(after.slice(target.text.start, target.text.end), target.text.quote);
  await viewport.evaluate((element) => (element.scrollTop = element.scrollHeight));
  await locate(2);
  const located = await line('new', 48).boundingBox(),
    clip = await viewport.boundingBox();
  assert.ok(located.y >= clip.y && located.y < clip.y + clip.height);
  await frame.getByRole('button', { name: '单列对比', exact: true }).click();
  assert.equal(await frame.locator('[data-diff-connectors]').count(), 0);
  await frame.getByRole('button', { name: '左右对比', exact: true }).click();
  await assertContinuous();
  assert.equal(JSON.parse(await frame.locator('[data-draft]').textContent()).annotations.length, 2);

  await frame.getByRole('button', { name: '收起上下文', exact: true }).click();
  assert.ok((await frame.locator('[data-diff-hunk]').count()) > 1);
  assert.equal(
    await frame.locator('tr:not([data-diff-hunk-header]) td:not(:has([data-code-side]))').count(),
    0,
  );
  const compactHunks = await source.evaluate((element) =>
    ['old', 'new'].map((side) => {
      const rows = [...element.querySelectorAll(`[data-diff-table="${side}"] tr`)];
      return rows
        .slice(1)
        .every(
          (row, index) =>
            Math.abs(row.getBoundingClientRect().top - rows[index].getBoundingClientRect().bottom) <
            1,
        );
    }),
  );
  assert.deepEqual(
    compactHunks,
    [true, true],
    'Hunk headers and source rows also remain continuous in collapsed context.',
  );
  await source.screenshot({ path: join(artifacts, 'hunks-light.png') });
  await frame.getByRole('button', { name: '展开全部上下文', exact: true }).click();
  await frame.getByRole('button', { name: 'Toggle document', exact: true }).click();
  await source.filter({ has: frame.locator('[data-diff-connectors]') }).waitFor();
  await assertContinuous();
  await locate(2);
  await assertContinuous();
  await service.app.inject({
    method: 'POST',
    url: '/api/preferences',
    headers: {
      host: `127.0.0.1:${service.descriptor.port}`,
      authorization: `Bearer ${service.descriptor.controlToken}`,
    },
    payload: { ui: { theme: 'dark' } },
  });
  await frame.locator('html[data-theme="dark"]').waitFor();
  await page.screenshot({ path: join(artifacts, 'document-dark.png') });
  assert.deepEqual(errors, []);
  console.log(
    'Continuous split diff passed: unequal changes, connectors, linked scrolling, resize, block/text annotations, reveal, hunks, unified/document and dark theme.',
  );
} catch (error) {
  await page?.screenshot({ path: join(artifacts, 'failure.png') });
  throw error;
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
