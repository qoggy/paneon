import { selectDiffLayout } from './diff-toolbar-tools.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { PACKAGE_VERSION } from '../panel-fixture.ts';
import { startServer } from '../runtime-fixture.ts';
import { annotationTools, selectAnnotationText, submitAnnotations } from './annotation-tools.mjs';

const root = await mkdtemp(join(tmpdir(), 'paneon-diff-wrap-'));
const phrase = '内容 é🙂 abcdefghij ';
const oldLong = `\tconst line10 = "${phrase.repeat(8)}";\r\n`;
const newLong = `\tconst line10 = "${phrase.repeat(20)}";\r\n`;
const before = Array.from({ length: 70 }, (_, i) =>
  i === 9 ? oldLong : `const line${i + 1} = ${i + 1};\r\n`,
).join('');
const after = before
  .replace(oldLong, newLong)
  .replace('const line40', '// inserted\r\nconst line40');
const standalone = `\tconst url = "https://example.invalid/${'unbroken_value'.repeat(70)}";`;
let service, browser;
try {
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    `
    import {useRef, useState} from 'react';
    import {agent, definePanel, z} from '@qoggy/paneon/sdk';
    import {Button, CodeBlock, DiffView, useAnnotations, usePageAnnotations} from '@qoggy/paneon/ui';
    import type {DiffViewHandle} from '@qoggy/paneon/ui';
    const before = ${JSON.stringify(before)}, after = ${JSON.stringify(after)}, standalone = ${JSON.stringify(standalone)};
    function Draft() { const {value} = useAnnotations(); return <output data-draft className="sr-only">{JSON.stringify(value)}</output>; }
    function Panel() {
      const [initial, setInitial] = useState<boolean | undefined>();
      const [epoch, setEpoch] = useState(0);
      const [kind, setKind] = useState('both');
      const [document, setDocument] = useState(false);
      const diff = useRef<DiffViewHandle>(null);
      usePageAnnotations<string>({onSubmit: value => agent.emit('wrap-feedback', {
        annotations: value.annotations.map(({targets, comment}) => ({targets, comment})),
      }), adapter: { locate: target => diff.current?.reveal(target.text && (target.ref === 'old' || target.ref === 'new')
        ? {kind:'text', side:target.ref, ...target.text, quote:target.text.quote ?? ''} : {kind:'file'}) }});
      return <><Draft />
        <div className="flex gap-2">
          <Button onClick={() => setInitial(value => value === false)}>Change initial value</Button>
          <Button onClick={() => setEpoch(value => value + 1)}>Remount</Button>
          <Button onClick={() => setKind('add')}>Added file</Button>
          <Button onClick={() => setKind('delete')}>Deleted file</Button>
          <Button onClick={() => setKind('both')}>Both files</Button>
          <Button onClick={() => setDocument(value => !value)}>Toggle document</Button>
        </div>
        <div data-host className={document ? 'border' : 'flex h-[34rem] flex-col border'}>
          <DiffView key={epoch} ref={diff} defaultWrap={initial} layout={document ? 'document' : 'bounded'}
            oldText={kind === 'add' ? '' : kind === 'delete' ? standalone : before}
            newText={kind === 'delete' ? '' : kind === 'add' ? standalone : after}
            oldPath="source.ts" newPath="source.ts" annotationTargets={{old:'old',new:'new'}} />
        </div>
        <div data-reference className="mt-4"><CodeBlock key={epoch} code={standalone} language="typescript" defaultWrap={initial} /></div>
      </>;
    }
    export default definePanel({id:'diff-wrap',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:Panel});
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
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  const source = frame.locator('[data-diff-source]');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const wrap = source.getByRole('button', { name: '自动换行', exact: true });
  const reference = frame
    .locator('[data-reference]')
    .getByRole('button', { name: '自动换行', exact: true });
  const line = (side, number) =>
    source.locator(`[data-code-side="${side}"][data-line="${number}"]`);
  const settle = () =>
    source.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
  const assertFits = async () => {
    await settle();
    const panes = await source
      .locator('[data-diff-scroll]')
      .evaluateAll((elements) =>
        elements.map((e) => ({ width: e.clientWidth, content: e.scrollWidth })),
      );
    assert.ok(panes.length > 0);
    assert.ok(
      panes.every((pane) => pane.content <= pane.width + 1),
      JSON.stringify(panes),
    );
  };
  const text = (side) =>
    source
      .locator(`[data-code-side="${side}"]`)
      .evaluateAll((elements) => elements.map((e) => e.textContent).join(''));
  const appearance = (locator) =>
    locator.evaluate((e) => ({
      variant: e.dataset.variant,
      size: e.dataset.size,
      label: e.getAttribute('aria-label'),
      paths: [...e.querySelectorAll('svg path')].map((p) => p.getAttribute('d')),
    }));
  await wrap.waitFor();
  await reference.waitFor();
  assert.equal(await wrap.getAttribute('aria-pressed'), 'false');
  assert.equal(
    await reference.getAttribute('aria-pressed'),
    'true',
    'CodeBlock retains its own default.',
  );
  assert.equal((await line('new', 10).boundingBox()).height, 24);
  assert.ok(
    await source.locator('[data-diff-scroll="new"]').evaluate((e) => e.scrollWidth > e.clientWidth),
  );
  const offAppearance = await appearance(wrap);
  assert.equal(offAppearance.variant, 'ghost');
  assert.equal(offAppearance.size, 'icon-sm');
  assert.equal((await appearance(reference)).variant, 'secondary');
  assert.equal((await appearance(reference)).size, 'icon-xs');
  assert.deepEqual(
    (await appearance(reference)).paths,
    offAppearance.paths,
    'CodeBlock and DiffView use the same fixed wrap icon.',
  );
  await wrap.hover();
  await frame
    .locator('[data-slot="tooltip-content"]')
    .filter({ hasText: '当前：自动换行已关闭 · 点击开启' })
    .waitFor();
  await page.mouse.move(0, 0);
  await wrap.click();
  const onAppearance = await appearance(wrap);
  assert.equal(onAppearance.variant, 'secondary');
  assert.equal(onAppearance.variant, (await appearance(reference)).variant);
  assert.deepEqual(onAppearance.paths, offAppearance.paths, 'The wrap icon stays fixed.');
  await assertFits();
  assert.ok(
    (await line('new', 10).boundingBox()).height > (await line('old', 10).boundingBox()).height,
  );
  assert.equal(await text('old'), before);
  assert.equal(await text('new'), after);
  const sourceNode = await line('new', 10).elementHandle();
  const textNode = await line('new', 10).evaluateHandle((e) =>
    document.createTreeWalker(e, NodeFilter.SHOW_TEXT).nextNode(),
  );
  let calls = 0;
  const observe = (request) => {
    if (request.url().includes('/actions/') || request.url().endsWith('/events')) calls++;
  };
  page.on('request', observe);
  await wrap.focus();
  await wrap.press('Enter');
  await settle();
  assert.equal(await wrap.getAttribute('aria-pressed'), 'false');
  assert.deepEqual(await appearance(wrap), offAppearance);
  assert.equal((await line('new', 10).boundingBox()).height, 24);
  const pane = source.locator('[data-diff-scroll="new"]');
  const header = await source.locator('[data-diff-header]').boundingBox();
  await pane.evaluate((e) => (e.scrollLeft = 200));
  assert.equal(await pane.evaluate((e) => e.scrollLeft), 200);
  assert.deepEqual(await source.locator('[data-diff-header]').boundingBox(), header);
  await wrap.press('Space');
  await assertFits();
  assert.equal(await sourceNode.evaluate((e) => e.isConnected), true);
  assert.equal(await textNode.evaluate((e) => e.isConnected), true);
  assert.equal(calls, 0, 'Presentation toggles neither query nor submit.');
  page.off('request', observe);

  const divider = source.getByRole('separator', { name: '调整差异两侧宽度', exact: true });
  const initialHeight = (await line('new', 10).boundingBox()).height;
  for (let i = 0; i < 5; i++) await divider.press('ArrowRight');
  await assertFits();
  assert.ok((await line('new', 10).boundingBox()).height >= initialHeight);
  for (const width of [1100, 1600, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await assertFits();
  }
  const geometry = await source.evaluate((element) => ({
    paths: [...element.querySelectorAll('[data-diff-connector]')].map((path) =>
      path.getAttribute('d'),
    ),
    rows: [...element.querySelectorAll('[data-diff-table] tr')].map((row) => ({
      height: row.getBoundingClientRect().height,
      track: Number(row.dataset.diffTrackBottom) - Number(row.dataset.diffTrackTop),
    })),
  }));
  assert.ok(
    geometry.paths.length > 0 && geometry.paths.every((path) => path && !path.includes('NaN')),
  );
  assert.ok(
    geometry.rows.every((row) => row.track + 1 >= row.height),
    'Measured track accommodates every wrapped row.',
  );
  await button('下一个差异').click();
  const tail = await line('new', 41).boundingBox();
  const viewport = await source.locator('[data-diff-viewport]').boundingBox();
  assert.ok(
    tail.y >= viewport.y && tail.y < viewport.y + viewport.height,
    'Navigation reveals the later logical change after reflow.',
  );

  const selector = '[data-code-side="new"][data-line="10"]';
  await selectAnnotationText(frame, selector, 0, newLong.length - 2);
  const annotations = annotationTools(frame, page);
  await annotations.write('跨折行保留 CRLF 与 Unicode 原文坐标');
  await annotations.save();
  const draft = () => frame.locator('[data-draft]').evaluate((e) => JSON.parse(e.textContent));
  const saved = await draft();
  const target = saved.annotations[0].targets[0];
  assert.equal(target.text.start, after.indexOf(newLong));
  assert.equal(target.text.quote, newLong.slice(0, -2));
  assert.equal(after.slice(target.text.start, target.text.end), target.text.quote);
  await wrap.click();
  assert.deepEqual(await draft(), saved);
  await wrap.click();
  await selectDiffLayout(frame, '单列对比');
  await assertFits();
  assert.deepEqual(await draft(), saved);
  assert.equal(await text('new'), after);
  await button('隐藏未改动行').click();
  await assertFits();
  await selectDiffLayout(frame, '左右对比');
  await assertFits();
  await button('隐藏未改动行').click();
  await annotations.locate(1);
  assert.deepEqual(await draft(), saved);
  await submitAnnotations(frame);
  const events = (await service.runtime.events(panel.instanceId, 'wrap-test', 100, 0)).events;
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].payload, {
    annotations: saved.annotations.map(({ targets, comment }) => ({ targets, comment })),
  });

  await button('Change initial value').click();
  assert.equal(await wrap.getAttribute('aria-pressed'), 'true');
  assert.equal(await reference.getAttribute('aria-pressed'), 'true');
  await button('Remount').click();
  assert.equal(await wrap.getAttribute('aria-pressed'), 'false');
  assert.equal(await reference.getAttribute('aria-pressed'), 'false');
  await wrap.click();
  await button('Change initial value').click();
  await button('Change initial value').click();
  assert.equal(
    await wrap.getAttribute('aria-pressed'),
    'true',
    'Changing the initial value cannot overwrite the human choice.',
  );
  await button('Change initial value').click();
  await button('Remount').click();
  assert.equal(
    await wrap.getAttribute('aria-pressed'),
    'true',
    'Explicit defaultWrap=true starts wrapped.',
  );

  for (const [action, side] of [
    ['Added file', 'new'],
    ['Deleted file', 'old'],
  ]) {
    await button(action).click();
    await assertFits();
    assert.equal(await text(side), standalone);
    assert.equal(await source.locator('[data-diff-split]').count(), 0);
    assert.ok((await line(side, 1).boundingBox()).height > 24);
    await selectDiffLayout(frame, '单列对比');
    await assertFits();
    await selectDiffLayout(frame, '左右对比');
  }
  await button('Both files').click();
  await button('Toggle document').click();
  await assertFits();
  assert.equal(await source.getAttribute('data-diff-layout'), 'document');
  assert.equal(await text('new'), after);
  assert.deepEqual(errors, []);
  console.log(
    'PASS Diff word wrap: proposal-A controls and CodeBlock lifecycle; split/unified/single-sided/document reflow; raw source and DOM identity; resize/navigation geometry; CRLF/Unicode annotations and submission.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
