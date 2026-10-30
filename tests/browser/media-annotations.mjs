import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createPackageFixture } from '../package-fixture.mjs';
import { readPanelFixture } from '../panel-fixture.ts';
import { startServer } from '../runtime-fixture.ts';
import {
  assertAnnotationEditorOpensAfterLocate,
  openAnnotationDirectory,
  submitAnnotations,
} from './annotation-tools.mjs';

const root = await realpath(await mkdtemp(join(tmpdir(), 'paneon-media-annotations-')));
let service, browser;
try {
  let skillSource =
    process.env.PANEON_TEST_SKILL_SOURCE ?? new URL('../../skills/paneon', import.meta.url);
  if (process.argv.includes('--package')) {
    const packageDirectory = join(root, 'package');
    await mkdir(packageDirectory);
    const { packageRoot } = await createPackageFixture(packageDirectory);
    process.env.PANEON_TEST_RUNTIME_ENTRY = pathToFileURL(
      join(packageRoot, 'dist/runtime/server.js'),
    ).href;
    skillSource = join(packageRoot, 'skills/paneon');
  }
  const entry = join(root, 'panel.tsx');
  await mkdir(join(root, 'tests/fixtures'), { recursive: true });
  await cp(
    new URL('../fixtures/checkout.svg', import.meta.url),
    join(root, 'tests/fixtures/checkout.svg'),
  );
  await writeFile(
    entry,
    await readPanelFixture(new URL('../fixtures/panels/media-annotations.tsx', import.meta.url)),
  );
  service = await startServer(join(root, 'runtime'));
  const panel = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'Media annotation acceptance', exact: true }).waitFor();
  const section = (name) => frame.getByTestId(name);
  const editor = frame.locator('[data-annotation-editor]');
  const input = editor.locator('textarea');
  const draft = async () => JSON.parse(await frame.getByTestId('draft').textContent());
  const events = async () =>
    (await service.runtime.events(panel.instanceId, 'media-acceptance', 100, 0)).events;
  const save = async (media, comment) => {
    await media.locator('img, [data-slot="mermaid-diagram"] > [role="button"]').first().hover();
    await media.getByRole('button', { name: 'Annotation', exact: true }).click();
    await input.fill(comment);
    await input.press('Enter');
    await editor.waitFor({ state: 'hidden' });
  };
  const image = section('standalone-image');
  const diagram = section('standalone-mermaid');
  const markdown = section('markdown');
  const markdownImage = markdown.locator('[data-slot="image"]');
  const markdownDiagram = markdown.locator('[data-slot="mermaid"]');
  await diagram.locator('svg[id^="mermaid-"]').waitFor();
  await markdownDiagram.locator('svg[id^="mermaid-"]').waitFor();
  await save(image, 'Standalone image');
  await save(diagram, 'Standalone Mermaid');
  await save(markdownImage, 'Markdown image');
  await save(markdownDiagram, 'Markdown Mermaid');
  const pure = section('pure-media').locator('[data-slot="mermaid"]');
  assert.equal(await pure.count(), 2);
  for (const [index, comment] of [
    'First identical diagram',
    'Second identical diagram',
  ].entries()) {
    await pure.nth(index).locator('svg[id^="mermaid-"]').waitFor();
    await save(pure.nth(index), comment);
  }
  const source = await frame.getByTestId('source').textContent();
  const imageSyntax = '![Checkout](./tests/fixtures/checkout.svg)';
  const imageStart = source.indexOf(imageSyntax);
  assert.ok(imageStart >= 0);
  const fenceStart = source.indexOf('~~~mermaid');
  assert.ok(fenceStart >= 0);
  const diagramCode = 'flowchart LR\n  Cart --> Payment --> Complete';
  const pureFence = '```mermaid\n' + diagramCode + '\n```';
  const expected = [
    { ref: { image: 'checkout', version: 1 }, src: './tests/fixtures/checkout.svg' },
    { ref: 'standalone-flow', type: 'mermaid' },
    {
      ref: 'checkout-doc',
      text: { start: imageStart, end: imageStart + imageSyntax.length, quote: imageSyntax },
    },
    { ref: 'checkout-doc', type: 'mermaid', text: { start: fenceStart, end: source.length } },
    { ref: 'pure-media', type: 'mermaid', text: { start: 0, end: pureFence.length } },
    {
      ref: 'pure-media',
      type: 'mermaid',
      text: { start: pureFence.length + 2, end: pureFence.length * 2 + 2 },
    },
  ];
  assert.deepEqual(
    (await draft()).annotations.map((item) => item.targets),
    expected.map((target) => [target]),
  );
  assert.equal(
    await section('plain').getByRole('button', { name: 'Annotation', exact: true }).count(),
    0,
  );

  // Expanded media must edit the same draft, retain original refs/src and handle editor Escape first.
  const beforeViewers = (await draft()).annotations;
  for (const [index, media, label, content] of [
    [0, image, 'Image viewer', image.locator('img[role="button"]')],
    [
      1,
      diagram,
      'Diagram viewer',
      diagram.locator('[data-slot="mermaid-diagram"] > [role="button"]'),
    ],
    [2, markdownImage, 'Image viewer', markdownImage.locator('img[role="button"]')],
    [
      3,
      markdownDiagram,
      'Diagram viewer',
      markdownDiagram.locator('[data-slot="mermaid-diagram"] > [role="button"]'),
    ],
  ]) {
    await content.click();
    const viewer = frame.getByRole('dialog', { name: label, exact: true });
    await viewer.locator('img').evaluate((element) => element.decode());
    const annotate = viewer.getByRole('button', { name: 'Annotation', exact: true });
    await annotate.click();
    assert.equal(await input.inputValue(), beforeViewers[index].comment);
    await input.fill('Cancel this draft');
    await input.press('Escape');
    await editor.waitFor({ state: 'hidden' });
    assert.equal(await viewer.isVisible(), true);
    assert.equal((await draft()).annotations[index].comment, beforeViewers[index].comment);
    await annotate.click();
    await input.fill(beforeViewers[index].comment + ' revised in viewer');
    await input.press('Enter');
    await editor.waitFor({ state: 'hidden' });
    await viewer
      .getByRole('button', {
        name: label === 'Image viewer' ? 'Close image' : 'Close diagram',
        exact: true,
      })
      .click();
    await viewer.waitFor({ state: 'hidden' });
    const current = (await draft()).annotations;
    assert.equal(current.length, 6);
    assert.equal(current[index].id, beforeViewers[index].id);
    assert.deepEqual(current[index].targets, [expected[index]]);
    assert.equal(await media.isVisible(), true);
  }

  // Source-only media paths include frontmatter and linked/reference-style images.
  const linked = section('linked-image');
  assert.equal(await linked.locator('a button').count(), 0);
  const linkedImages = linked.locator('[data-slot="image"]');
  const linkedSource = await frame.getByTestId('linked-source').textContent();
  for (const [index, quote] of [
    '![Linked checkout](./tests/fixtures/checkout.svg)',
    '![Reference checkout][checkout]',
  ].entries()) {
    await save(
      index === 0 ? linked.locator('a').first().locator('..') : linkedImages.nth(index),
      `Linked image ${index + 1}`,
    );
    const start = linkedSource.indexOf(quote);
    assert.ok(start >= 0);
    expected.push({ ref: 'linked-images', text: { start, end: start + quote.length, quote } });
  }
  const frontmatterSource = await frame.getByTestId('frontmatter-source').textContent();
  await save(section('frontmatter').locator('[data-slot="mermaid"]'), 'Diagram after frontmatter');
  expected.push({
    ref: 'frontmatter-doc',
    type: 'mermaid',
    text: { start: frontmatterSource.indexOf('~~~mermaid'), end: frontmatterSource.length },
  });
  assert.deepEqual(
    (await draft()).annotations.map((item) => item.targets),
    expected.map((target) => [target]),
  );
  assert.equal(
    (await events()).length,
    0,
    'Saving, viewing, editing and cancellation never emit feedback',
  );
  await openAnnotationDirectory(frame);
  await frame.getByRole('button', { name: 'Edit annotation 6', exact: true }).click();
  await input.and(frame.locator(':focus')).waitFor();
  assert.equal(await input.inputValue(), 'Second identical diagram');
  await input.press('Escape');
  await editor.waitFor({ state: 'hidden' });
  const submitted = page.waitForResponse(
    (response) => response.url().endsWith('/events') && response.request().method() === 'POST',
  );
  await submitAnnotations(frame);
  assert.equal((await submitted).status(), 200);
  const delivered = await events();
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].type, 'media-feedback');
  const saved = (await draft()).annotations;
  assert.deepEqual(delivered[0].payload, {
    annotations: saved.map(({ targets, comment }) => ({ targets, comment })),
  });
  for (const annotation of delivered[0].payload.annotations) {
    assert.equal('id' in annotation, false);
    for (const target of annotation.targets) {
      if (target.type === 'mermaid') {
        assert.equal('quote' in (target.text ?? {}), false);
        assert.equal('src' in target, false);
      }
    }
  }

  // File Review unmounts media while reading another file; location must restore it before editing.
  const skill = join(root, 'skill');
  await cp(skillSource, skill, { recursive: true });
  const fileSource = '# Long review\n\n' + 'Context above the media.\n\n'.repeat(100) + source;
  const fileOffset = fileSource.indexOf(source);
  const fileImageText = {
    ...expected[2].text,
    start: expected[2].text.start + fileOffset,
    end: expected[2].text.end + fileOffset,
  };
  const fileMermaidText = {
    start: expected[3].text.start + fileOffset,
    end: expected[3].text.end + fileOffset,
  };
  await writeFile(join(root, 'review.md'), fileSource);
  await writeFile(join(root, 'other.ts'), 'const other = true;\n');
  const fileReview = await service.runtime.run(
    join(skill, 'assets/panels/file-review/panel.tsx'),
    root,
    { title: 'File media snapshots', files: ['review.md', 'other.ts'] },
    false,
  );
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${fileReview.instanceId}`);
  const preview = frame.locator('[data-file-review-viewport]');
  await preview.locator('svg[id^="mermaid-"]').waitFor();
  await save(preview.locator('[data-slot="image"]'), 'File image');
  await save(preview.locator('[data-slot="mermaid"]'), 'File Mermaid');
  await writeFile(join(root, 'review.md'), '# Changed on disk\n');

  // Leave a pending image edit by ordinary file navigation, then release its late read.
  await frame.locator('[data-tree-item="file:1"]').click();
  await preview.locator('[data-code-line="1"]').waitFor();
  let releaseImage;
  const imageGate = new Promise((resolve) => {
    releaseImage = resolve;
  });
  const isImageRead = (request) => decodeURIComponent(request.url()).includes('/image#readImage');
  const holdImageRead = async (route) => {
    if (isImageRead(route.request())) await imageGate;
    await route.continue();
  };
  await page.route('**/actions/**', holdImageRead);
  try {
    const readingImage = page.waitForRequest(isImageRead);
    await frame.locator('[data-tree-item="file:0"]').click();
    await readingImage;
    await preview.getByRole('status').filter({ hasText: 'Loading image…' }).waitFor();
    await openAnnotationDirectory(frame);
    await frame.getByRole('button', { name: 'Edit annotation 1', exact: true }).click();
    assert.equal(await editor.count(), 0, 'The edit waits for the image to load');
    await frame.locator('[data-tree-item="file:1"]').click();
    await preview.locator('[data-code-line="1"]').waitFor();
    const assertNavigationRetained = async () => {
      await frame.locator('html').evaluate(async () => {
        for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
      });
      assert.equal(await frame.locator('[data-file-review-path]').textContent(), 'other.ts');
      assert.equal(
        await editor.count(),
        0,
        'A cancelled media edit must not open in the code file',
      );
      assert.equal(await frame.getByRole('alert').count(), 0, 'Navigation is not a load error');
    };
    await assertNavigationRetained();
    const lateImage = page.waitForResponse((response) => isImageRead(response.request()));
    releaseImage();
    assert.equal((await lateImage).status(), 200);
    await assertNavigationRetained();
  } finally {
    releaseImage();
    await page.unroute('**/actions/**', holdImageRead);
  }

  const locationFailures = [];
  for (const [number, selector, comment] of [
    [1, '[data-file-review-viewport] [data-slot="image"] img', 'Located file image'],
    [
      2,
      '[data-file-review-viewport] [data-slot="mermaid-diagram"] > [role="button"]',
      'Located file Mermaid',
    ],
  ]) {
    await frame.locator('[data-tree-item="file:1"]').click();
    await preview.locator('[data-code-line="1"]').filter({ hasText: 'const other' }).waitFor();
    try {
      await assertAnnotationEditorOpensAfterLocate(frame, selector, async () => {
        await openAnnotationDirectory(frame);
        await frame.getByRole('button', { name: `Edit annotation ${number}`, exact: true }).click();
      });
    } catch (error) {
      if (error.code !== 'ERR_ASSERTION') throw error;
      locationFailures.push({ number, message: error.message });
      console.error(`File Review media annotation ${number}: ${error.message}`);
    }
    assert.equal(await frame.locator('[data-file-review-path]').textContent(), 'review.md');
    assert.equal(
      await editor.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
      }),
      true,
      'The restored media editor stays inside the visible viewport',
    );
    await input.fill(comment);
    await input.press('Enter');
    await editor.waitFor({ state: 'hidden' });
  }
  const fileEvents = async () =>
    (await service.runtime.events(fileReview.instanceId, 'media-acceptance', 100, 0)).events;
  assert.equal((await fileEvents()).length, 0);
  const fileSubmitted = page.waitForResponse(
    (response) => response.url().endsWith('/events') && response.request().method() === 'POST',
  );
  await submitAnnotations(frame);
  assert.equal((await fileSubmitted).status(), 200);
  const [fileEvent] = await fileEvents();
  assert.equal(fileEvent.type, 'file-review-submitted');
  assert.deepEqual(fileEvent.payload, {
    files: [
      {
        path: join(root, 'review.md'),
        snapshotId:
          'sha256:' +
          createHash('sha256')
            .update(JSON.stringify([join(root, 'review.md'), fileSource]))
            .digest('hex'),
        annotations: [
          { targets: [{ text: fileImageText }], comment: 'Located file image' },
          {
            targets: [{ type: 'mermaid', text: fileMermaidText }],
            comment: 'Located file Mermaid',
          },
        ],
      },
    ],
  });
  console.log(
    'File Review media retained the original snapshot and exact public feedback after disk changes.',
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(
    locationFailures,
    [],
    'File Review must restore media before opening its annotation editor',
  );
  console.log(
    'Media annotations: four media kinds, original Image src, shared viewer drafts, editor-first Escape, repeated fences, CRLF/Unicode/frontmatter, linked/reference images, directory editing, File Review media remount/edit and retained-snapshot submission passed.',
  );
} finally {
  try {
    await browser?.close();
  } finally {
    try {
      await service?.stop();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
}
