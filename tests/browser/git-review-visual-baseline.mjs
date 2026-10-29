import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { startGitReviewFixture } from './git-review-fixture.mjs';
const execute = promisify(execFile),
  f = await startGitReviewFixture();
let browser;
const artifact = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-stateless-visual';
try {
  await mkdir(artifact, { recursive: true });
  const baseline = join(f.root, 'baseline');
  await mkdir(baseline);
  const archive = join(f.root, 'baseline.tar');
  await execute('git', [
    'archive',
    'a32404d8d97fef89fa0eb86f3e76bf1c00081aea',
    '--format=tar',
    `--output=${archive}`,
    'skills/paneon',
  ]);
  await execute('tar', ['-xf', archive, '-C', baseline]);
  browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu'],
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage(),
    errors = [],
    results = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const initialViews = [
    { repositoryId: 'web', type: 'changes', file: 'a.ts' },
    { repositoryId: 'web', type: 'history', commit: f.feature, file: 'a.ts' },
    {
      repositoryId: 'web',
      type: 'compare',
      base: f.rootCommit,
      head: f.feature,
      mode: 'commits',
      file: 'a.ts',
    },
  ];
  for (const initialView of initialViews) {
    const input = {
      title: 'Git review acceptance',
      repositories: [
        { id: 'web', path: f.repo, label: 'Web' },
        { id: 'server', path: f.second, label: 'Server' },
      ],
      initialView,
    };
    const before = await f.service.runtime.run(
      join(baseline, 'skills/paneon/assets/panels/git-review/panel.tsx'),
      f.root,
      input,
      false,
    );
    const { repositoryId: _, ...view } = initialView;
    const after = await f.run({ ...f.params, initialView: { ...view, repositoryPath: f.repo } });
    for (const theme of ['light', 'dark'])
      for (const language of ['en', 'zh-CN'])
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          await f.service.app.inject({
            method: 'POST',
            url: '/api/preferences',
            headers: {
              host: `127.0.0.1:${f.service.descriptor.port}`,
              authorization: `Bearer ${f.service.descriptor.controlToken}`,
            },
            payload: { ui: { theme, language } },
          });
          const buffers = [],
            dom = [];
          const key = `${initialView.type}-${theme}-${language}-${width}`;
          for (const [name, panel] of [
            ['before', before],
            ['after', after],
          ]) {
            await page.goto(f.url(panel));
            const frame = page.frameLocator('iframe');
            await frame.locator(`html[data-theme="${theme}"][lang="${language}"]`).waitFor();
            await frame.locator('[data-code-side="new"] [style*="color"]').first().waitFor();
            const content = page.frames().find((frame) => frame.url().endsWith('/frame.html'));
            await content.evaluate(async () => {
              await document.fonts.ready;
              await new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              );
            });
            const nodes = await frame.locator('[data-git-workbench]').evaluate((element) =>
              [element, ...element.querySelectorAll('*')].map((node) => ({
                tag: node.tagName,
                classes: node.getAttribute('class'),
                role: node.getAttribute('role'),
                label: node.getAttribute('aria-label'),
                text: node.children.length ? undefined : node.textContent,
                rect: [
                  node.getBoundingClientRect().x,
                  node.getBoundingClientRect().y,
                  node.getBoundingClientRect().width,
                  node.getBoundingClientRect().height,
                ],
              })),
            );
            dom.push(nodes);
            buffers.push(
              await page.locator('iframe').screenshot({
                path: join(artifact, `${key}-${name}.png`),
                animations: 'disabled',
                caret: 'hide',
              }),
            );
          }
          assert.deepEqual(
            dom[1],
            dom[0],
            `Rendered structure, controls and geometry changed: ${key}`,
          );
          const hashes = buffers.map((buffer) => createHash('sha256').update(buffer).digest('hex'));
          results.push({ key, identical: hashes[0] === hashes[1], hashes });
          if (hashes[0] !== hashes[1]) {
            // Preserve both screenshots for inspection. Do not hide differences with a threshold.
            await writeFile(join(artifact, `${key}-dom.json`), JSON.stringify(dom, null, 2));
          }
        }
  }
  await writeFile(
    join(artifact, 'results.json'),
    JSON.stringify(
      { baseline: 'a32404d8d97fef89fa0eb86f3e76bf1c00081aea', results, errors },
      null,
      2,
    ),
  );
  assert.deepEqual(errors, []);
  assert.ok(
    results.every((result) => result.identical),
    'Screenshot bytes differ; inspect retained before/after artifacts.',
  );
  console.log(
    JSON.stringify({
      ok: true,
      pairs: results.length,
      identicalScreenshots: true,
      identicalStructureAndGeometry: true,
      artifact,
    }),
  );
} finally {
  await browser?.close();
  await f.stop();
}
