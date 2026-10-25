import { submitAnnotations } from './annotation-tools.mjs';
import { selectDiffLines } from './annotation-tools.mjs';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startGitReviewFixture } from './git-review-fixture.mjs';
import { git } from '../git-review-fixture.ts';
import { annotationTools } from './annotation-tools.mjs';
const f = await startGitReviewFixture();
const evidence = '/tmp/paneon-git-review-chrome-evidence';
let browser, page;
const errors = [],
  crashes = [],
  geometry = [];
try {
  const text = Array.from(
    { length: 340 },
    (_, i) =>
      `export const line${i + 1} = "old ${i + 1} ${'wide_source_'.repeat(i === 249 ? 120 : 1)}";\n`,
  ).join('');
  await writeFile(join(f.repo, 'reading.ts'), text);
  await git(f.repo, 'add', 'reading.ts');
  await git(f.repo, 'commit', '-qm', 'Create reading baseline');
  await git(f.repo, 'checkout', '-qb', 'feature/20261024-readable-branch-column');
  await writeFile(
    join(f.repo, 'reading.ts'),
    text.replace('old 250', 'new 250').replace('old 290', 'new 290'),
  );
  await git(f.repo, 'commit', '-qam', 'Review bounded diff viewport');
  const tip = await git(f.repo, 'rev-parse', 'HEAD');
  const panel = await f.run({
    ...f.params,
    initialView: { repositoryId: 'web', type: 'history', commit: tip, file: 'reading.ts' },
  });
  const prefs = async (theme, language) =>
    f.service.app.inject({
      method: 'POST',
      url: '/api/preferences',
      headers: {
        host: `127.0.0.1:${f.service.descriptor.port}`,
        authorization: `Bearer ${f.service.descriptor.controlToken}`,
      },
      payload: { ui: { theme, language } },
    });
  await prefs('light', 'zh-CN');
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  page = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('crash', () => crashes.push('crash'));
  await page.goto(f.url(panel));
  const frame = page.frameLocator('iframe');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  await frame.locator('[data-code-side="new"][data-line="250"]').waitFor();
  const content = page.frames().find((x) => x.url().endsWith('/frame.html'));
  const viewport = frame.locator('[data-diff-viewport]');
  const header = frame.locator('[data-diff-header]');
  const column = frame.getByRole('complementary', { name: '历史分支', exact: true });
  const workspace = frame.locator('[data-history-workspace]');
  const left = (await column.boundingBox()).width,
    total = (await workspace.boundingBox()).width;
  assert.ok(left / total >= 0.2 && left / total <= 0.23, `default branch width ${left}/${total}`);
  const current = frame.locator('[data-current-branch=true]');
  assert.equal((await current.textContent()).trim(), '20261024-readable-branch-column');
  assert.match(await current.getAttribute('aria-description'), /当前分支/);
  assert.ok(await current.locator('svg').count());
  assert.equal(await frame.getByText('只读审阅 · 批注提交给当前 AI', { exact: true }).count(), 0);
  assert.equal(await header.getByText('（整文件）', { exact: true }).count(), 0);
  assert.equal(await header.locator('[title="reading.ts → reading.ts"]').count(), 0);
  assert.equal(await frame.locator('[data-diff-source-header]').count(), 2);
  // The code owns vertical scrolling. Its headers are sibling chrome, not overlaid inside it.
  const measure = () =>
    content.evaluate(() => {
      const vp = document.querySelector('[data-diff-viewport]'),
        h = document.querySelector('[data-diff-header]'),
        s = document.querySelector('[data-diff-source-headers]'),
        outer = document.querySelector('[data-git-diff-scroll]');
      const rect = (e) => {
        const r = e.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height, left: r.left, right: r.right };
      };
      return {
        viewport: rect(vp),
        header: rect(h),
        sources: rect(s),
        scrollTop: vp.scrollTop,
        scrollHeight: vp.scrollHeight,
        clientHeight: vp.clientHeight,
        overflow: getComputedStyle(vp).overflowY,
        outerOverflow: getComputedStyle(outer).overflowY,
        outerScroll: outer.scrollTop,
        windowScroll: scrollY,
      };
    });
  await page.waitForTimeout(120);
  const initial = await measure();
  assert.equal(initial.overflow, 'auto');
  assert.equal(initial.outerOverflow, 'hidden');
  assert.ok(
    Math.abs(initial.viewport.top - initial.sources.bottom) <= 1,
    'scrollbar starts at code body, below both headers',
  );
  assert.ok(initial.scrollTop > 1000, 'first opening locates the late first actual change');
  const change = await frame.locator('[data-code-side="new"][data-line="250"]').boundingBox();
  assert.ok(change.y >= initial.viewport.top && change.y < initial.viewport.bottom);
  await viewport.evaluate((el) => (el.scrollTop += 120));
  const after = await measure();
  assert.deepEqual(after.header, initial.header);
  assert.deepEqual(after.sources, initial.sources);
  assert.equal(after.outerScroll, 0);
  assert.equal(after.windowScroll, initial.windowScroll);
  // Explicit locate must use the real body viewport with no extra header inset.
  await button('下一个差异').click();
  const next = await frame.locator('[data-code-side="new"][data-line="290"]').boundingBox();
  assert.ok(
    Math.abs(next.y + next.height / 2 - (initial.viewport.top + initial.viewport.height / 2)) < 3,
    'change centred in body viewport',
  );
  const comments = annotationTools(frame, page);

  await selectDiffLines(frame, 'new', 289);
  await comments.write('Context line before the bounded change');
  await comments.save();
  assert.equal(await comments.count(), 1);
  await selectDiffLines(frame, 'new', 290);
  await comments.write('Exact bounded line');
  await comments.save();

  await button('收起上下文').click();

  await selectDiffLines(frame, 'new', 291);
  await comments.write('Context line with unchanged surroundings collapsed');
  await comments.save();

  await button('展开全部上下文').click();
  await comments.locate(2);
  const located = await frame.locator('[data-code-side="new"][data-line="290"]').boundingBox();
  assert.ok(located.y >= initial.viewport.top && located.y < initial.viewport.bottom);
  const markers = await frame.getByRole('button', { name: '批注 2', exact: true }).boundingBox();
  assert.ok(markers.y >= initial.viewport.top, 'line marker stays in code viewport');
  await frame.locator('[data-diff-scroll="new"]').focus();
  await page.keyboard.press('Meta+a');
  await page.keyboard.press('Shift');
  assert.equal(await comments.count(), 3);
  await content.evaluate(() => document.getSelection()?.removeAllRanges());
  await submitAnnotations(frame);
  for (let i = 0; i < 100 && (await f.events(panel)).length === 0; i++)
    await page.waitForTimeout(50);
  const targets = (await f.events(panel))[0].payload.annotations.flatMap((x) => x.targets);
  assert.deepEqual(
    targets.map((x) => x.ref.kind),
    ['lines', 'lines', 'lines'],
  );
  assert.deepEqual(
    targets.map((target) => target.ref.startLine),
    [289, 290, 291],
  );
  assert.ok(targets.every((target) => target.text && target.ref.side === 'new'));
  // Show balanced centre gutter / natural colour for screenshots.
  await button('定位当前差异').click();
  await mkdir(evidence, { recursive: true });
  for (const width of process.env.PANEON_TEST_DESKTOP_ONLY ? [1920, 1280] : [1920, 1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark'])
      for (const language of ['en', 'zh-CN']) {
        await prefs(theme, language);
        await page.waitForTimeout(100);
        if (width < 768) await viewport.scrollIntoViewIfNeeded();
        const g = await measure();
        geometry.push({ width, theme, language, ...g });
        assert.ok(Math.abs(g.viewport.top - g.sources.bottom) <= 1);
        assert.equal(
          await content.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        await page.screenshot({
          path: join(evidence, `${width}-${theme}-${language}.png`),
          fullPage: width < 768,
        });
      }
  }
  // Git review reuses the public DiffView for whole-file additions and deletions.
  await prefs('light', 'zh-CN');
  await writeFile(
    join(f.repo, 'single-added.ts'),
    Array.from({ length: 340 }, (_, i) => `export const addedLine${i + 1} = ${i + 1};\n`).join(''),
  );
  await git(f.repo, 'add', 'single-added.ts');
  await git(f.repo, 'rm', 'reading.ts');
  await git(f.repo, 'commit', '-qm', 'Add and delete whole files');
  const singleCommit = await git(f.repo, 'rev-parse', 'HEAD');
  const singleStatuses = await git(
    f.repo,
    'diff',
    '--name-status',
    `${singleCommit}^`,
    singleCommit,
  );
  assert.match(singleStatuses, /^A\tsingle-added\.ts$/m);
  assert.match(singleStatuses, /^D\treading\.ts$/m);
  for (const [file, side] of [
    ['single-added.ts', 'new'],
    ['reading.ts', 'old'],
  ]) {
    const singlePanel = await f.run({
      ...f.params,
      initialView: { repositoryId: 'web', type: 'history', commit: singleCommit, file },
    });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(f.url(singlePanel));
    const pane = frame.locator(`[data-diff-scroll="${side}"]`);
    await pane.waitFor();
    assert.equal(await frame.getByText(/^(?:Mode|模式)[:：]/).count(), 0);
    assert.equal(await frame.locator('[data-diff-divider]').count(), 0);
    assert.equal(await frame.locator('[data-diff-source-header]').count(), 1);
    assert.equal(await frame.locator(`[data-code-side="${side}"]`).count(), 340);
    const sourceWidth = (await frame.locator('[data-diff-source]').boundingBox()).width;
    assert.ok(Math.abs((await pane.boundingBox()).width - sourceWidth) <= 1);
    assert.ok(
      Math.abs(
        (await frame.locator(`[data-diff-source-header="${side}"]`).boundingBox()).width -
          sourceWidth,
      ) <= 1,
    );
    await selectDiffLines(frame, side, 1);
    await comments.write(`Whole file ${side}`);
    await comments.save();
    await submitAnnotations(frame);
    for (let i = 0; i < 100 && (await f.events(singlePanel)).length === 0; i++)
      await page.waitForTimeout(50);
    const target = (await f.events(singlePanel))[0].payload.annotations[0].targets[0];
    assert.equal(target.ref.side, side);
    assert.equal(target.ref.startLine, 1);
    assert.equal(target.text.start, 0);
    assert.ok(
      target.text.quote.startsWith(
        side === 'old' ? 'export const line1' : 'export const addedLine1',
      ),
    );
    await page.screenshot({ path: join(evidence, `single-${side}.png`) });
  }
  // A plain string consumer has no AnnotationRoot and retains document scrolling.
  const plainEntry = join(
    f.root,
    'agent-skills/paneon/assets/panels/git-review/plain-diff-acceptance.tsx',
  );
  await writeFile(
    plainEntry,
    `import {definePanel,z} from 'paneon/sdk';
import {DiffView} from '../../shared/diff.tsx';
const oldText=Array.from({length:340},(_,i)=>'line '+(i+1)+'\\n').join('');
export default definePanel({id:'plain-diff',requires:{paneon:'0.0.0'},input:z.object({}),render:()=> <main><h1>Plain document consumer</h1><DiffView oldText={oldText} newText={oldText.replace('line 250','updated 250')} oldPath="old.txt" newPath="new.txt" defaultExpanded /></main>});`,
  );
  const plainPanel = await f.service.runtime.run(plainEntry, f.root, {}, false);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(f.url(plainPanel));
  await frame.locator('[data-diff-layout="document"]').waitFor();
  const natural = await frame.locator('[data-diff-viewport]').evaluate((el) => ({
    height: el.clientHeight,
    scrollHeight: el.scrollHeight,
    overflow: getComputedStyle(el).overflowY,
  }));
  assert.ok(natural.height > 6000, 'plain string component uses natural document height');
  assert.equal(natural.height, natural.scrollHeight);
  assert.equal(natural.overflow, 'visible');
  assert.equal(
    await frame.locator('[data-annotation-surface]').count(),
    0,
    'plain string Diff needs no AnnotationRoot or contextual annotation UI',
  );
  await page.screenshot({ path: join(evidence, 'plain-document.png') });
  assert.deepEqual(errors, []);
  assert.deepEqual(crashes, []);
  await writeFile(
    join(evidence, 'result.json'),
    JSON.stringify({ pass: true, left, total, initial, after, geometry, errors, crashes }, null, 2),
  );
  console.log(
    'PASS Git chrome: initial branch proportions, removed duplicate copy, accessible current branch, body-only vertical viewport, stable headers, centred changes, registered text annotations, native Command+A, theme screenshots; full-width added/deleted files and submitted annotation sides; no page errors.',
    evidence,
  );
} catch (error) {
  await mkdir(evidence, { recursive: true });
  await page?.screenshot({ path: join(evidence, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await f.stop();
}
