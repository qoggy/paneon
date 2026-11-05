import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';
import { readPanelFixture } from '../panel-fixture.ts';

const root = await mkdtemp(join(tmpdir(), 'paneon-file-icons-'));
let service, browser;
try {
  service = await startServer(join(root, 'data'));
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    await readPanelFixture(new URL('../fixtures/panels/file-icons.tsx', import.meta.url)),
  );
  const instance = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${instance.instanceId}`);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'FileIcon', exact: true }).waitFor();
  const icon = (file) => frame.locator(`[data-file=${JSON.stringify(file)}] img`);
  let previousToml;
  for (const theme of ['light', 'dark']) {
    await service.app.inject({
      method: 'POST',
      url: '/api/preferences',
      headers: {
        host: `127.0.0.1:${service.descriptor.port}`,
        authorization: `Bearer ${service.descriptor.controlToken}`,
      },
      payload: { ui: { theme } },
    });
    await frame.locator(`html[data-theme="${theme}"]`).waitFor();
    const images = frame.locator('main img');
    assert.equal(await images.count(), 23);
    const geometry = await images.evaluateAll(async (elements) => {
      await Promise.all(elements.map((image) => image.decode()));
      return elements.map((image) => ({
        width: image.getBoundingClientRect().width,
        height: image.getBoundingClientRect().height,
        alt: image.alt,
        hidden: image.getAttribute('aria-hidden'),
        embedded: image.src.startsWith('data:image/svg+xml'),
        draggable: image.draggable,
      }));
    });
    for (const image of geometry) {
      assert.equal(image.alt, '');
      assert.equal(image.hidden, 'true');
      assert.equal(image.embedded, true, 'Icons must be embedded and work offline.');
      assert.equal(image.draggable, false);
    }
    assert.ok(geometry.slice(0, -1).every((image) => image.width === 16 && image.height === 16));
    assert.equal(geometry.at(-1).width, 14);
    assert.equal(geometry.at(-1).height, 14);
    const docker = await icon('Dockerfile').getAttribute('src');
    assert.equal(await icon('src/Dockerfile').getAttribute('src'), docker);
    assert.equal(await icon('C:\\workspace\\Dockerfile').getAttribute('src'), docker);
    const unknown = await icon('unknown.xyz').getAttribute('src');
    for (const file of [
      'application.properties',
      'app.log',
      'Dockerfile',
      'app.component.ts',
      'CLAUDE.md',
      'CMakePresets.json',
      '.github/FUNDING.yml',
      'Caddyfile',
    ])
      assert.notEqual(await icon(file).getAttribute('src'), unknown, file);
    assert.notEqual(
      await icon('CLAUDE.md').getAttribute('src'),
      await icon('guide.md').getAttribute('src'),
    );
    assert.notEqual(
      await icon('CMakePresets.json').getAttribute('src'),
      await icon('data.json').getAttribute('src'),
    );
    assert.notEqual(
      await icon('.github/FUNDING.yml').getAttribute('src'),
      await icon('config.yaml').getAttribute('src'),
    );
    const toml = await icon('config.toml').getAttribute('src');
    if (previousToml) assert.notEqual(toml, previousToml, 'Theme variants must update live.');
    previousToml = toml;
    await page.screenshot({ path: `/private/tmp/paneon-file-icons-${theme}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log(
    'FileIcon: requested types, aliases, paths, sizes, offline SVGs and live themes passed.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
