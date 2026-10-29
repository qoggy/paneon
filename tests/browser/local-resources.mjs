import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';

const root = await mkdtemp(join(tmpdir(), 'paneon-local-resources-'));
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-local-resources';
let service, browser;
try {
  await mkdir(join(root, 'docs'));
  await mkdir(artifacts, { recursive: true });
  const picture = join(root, 'picture.png');
  await copyFile(new URL('../../docs/readme/git-review.png', import.meta.url), picture);
  await copyFile(picture, join(root, '图 像.png'));
  const originalSVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="32"><rect width="48" height="32" fill="red"/></svg>';
  await writeFile(join(root, 'original.svg'), originalSVG);
  await writeFile(
    join(root, 'docs/picture.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSUcAAAAASUVORK5CYII=',
      'base64',
    ),
  );
  await writeFile(
    join(root, 'source.ts'),
    'export const first = 1;\nexport const second = 2;\nexport const third = 3;\n',
  );
  await writeFile(join(root, 'docs/source.ts'), 'export const documentRelative = true;');
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    String.raw`
import {useState} from 'react';
import {agent,annotationValueSchema,definePanel,z} from '@qoggy/paneon/sdk';
import {Button,Image,Markdown,Page,usePageAnnotations} from '@qoggy/paneon/ui';
function Panel(){
 const [document,setDocument]=useState(false);
 usePageAnnotations({onSubmit:value=>agent.emit('annotations',value)});
 return <Page title="普通 Markdown 本地资源验收">
  <div data-case="relative"><Markdown>{'![相对图片](./picture.png)'}</Markdown></div>
  <div data-case="absolute"><Markdown>{${JSON.stringify(`![绝对图片](${picture})`)}}</Markdown></div>
  <div data-case="direct-relative"><Image src="./picture.png" alt="独立组件相对图片" className="max-w-md" /></div>
  <div data-case="direct-absolute"><Image src={${JSON.stringify(picture)}} alt="独立组件绝对图片" /></div>
  <div data-case="direct-document"><Image src="./picture.png" alt="独立组件文档图片" sourcePath="docs/report.md" /></div>
  <div data-case="svg"><Image src="./original.svg" alt="SVG 原图" /></div>
  <div data-case="encoded"><Markdown>{'![中文图片](./%E5%9B%BE%20%E5%83%8F.png)'}</Markdown></div>
  <div data-case="document"><Markdown sourcePath="docs/report.md">{'![文档图片](./picture.png)\n\n[文档文件](./source.ts)'}</Markdown></div>
  <div data-case="missing"><Markdown>{'![缺失图片](./missing.png)'}</Markdown></div>
  <Button onClick={()=>setDocument(value=>!value)}>切换来源</Button>
  <div data-case="changing"><Markdown sourcePath={document?'docs/report.md':undefined}>{'![切换图片](./picture.png)'}</Markdown></div>
  <Markdown annotationTarget="notes">{'# 文件预览\n\n[查看源文件](./source.ts#L2-L3)'}</Markdown>
 </Page>;
}
export default definePanel({id:'plain-local-resources',requires:{paneon:'*'},input:z.object({}),events:{annotations:annotationValueSchema(z.string())},render:Panel});`,
  );
  service = await startServer(join(root, 'runtime'));
  const panel = await service.runtime.run(entry, root, {}, false);
  const action = service.runtime
    .manifest(panel.instanceId)
    .actions.find((item) => item.id.includes('/image#readImage'));
  assert.ok(action, 'The shared Image owns image reads without a panel-authored reader.');
  const client = await readFile(
    join(service.runtime.artifact(panel.instanceId, panel.revision).directory, 'client/client.js'),
    'utf8',
  );
  assert.doesNotMatch(client, /node:fs|O_NONBLOCK/);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  const errors = [],
    legacyRequests = [];
  const consoleErrors = [];
  page.on('console', (entry) => {
    if (entry.type() === 'error') consoleErrors.push(entry.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/file')) legacyRequests.push(request.url());
  });
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: '普通 Markdown 本地资源验收', exact: true }).waitFor();
  for (const name of [
    'relative',
    'absolute',
    'encoded',
    'document',
    'changing',
    'direct-relative',
    'direct-absolute',
    'direct-document',
  ]) {
    const image = frame.locator(`[data-case="${name}"] img`);
    await image.waitFor();
    await image.evaluate((element) => element.decode());
    assert.ok(await image.evaluate((element) => element.naturalWidth > 0), name);
    assert.match(await image.getAttribute('src'), /^data:image\/png;base64,/);
  }
  assert.equal(
    await frame.locator('[data-case="document"] img').evaluate((element) => element.naturalWidth),
    1,
  );
  assert.equal(
    await frame
      .locator('[data-case="direct-document"] img')
      .evaluate((element) => element.naturalWidth),
    1,
  );
  assert.match(
    await frame.locator('[data-case="direct-relative"] img').getAttribute('class'),
    /max-w-md/,
  );
  const origin = `http://127.0.0.1:${service.descriptor.port}`;
  for (const [name, path] of [
    ['relative', './picture.png'],
    ['absolute', picture],
    ['direct-relative', './picture.png'],
    ['direct-absolute', picture],
  ]) {
    const content = frame.locator(`[data-case="${name}"]`);
    await content.locator('img').hover();
    await content.getByRole('button', { name: 'More image options', exact: true }).click();
    await frame.getByRole('menuitem', { name: 'Copy path', exact: true }).click();
    await page.context().grantPermissions(['clipboard-read'], { origin });
    await page.waitForFunction(
      (expected) => navigator.clipboard.readText().then((text) => text === expected),
      path,
    );
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), path);
    await page.context().clearPermissions();
    await frame.getByRole('menu').waitFor({ state: 'hidden' });
  }
  const svg = frame.locator('[data-case="svg"]');
  await svg.locator('[data-slot="image"]').hover();
  await svg.getByRole('button', { name: 'More image options', exact: true }).click();
  const [downloaded] = await Promise.all([
    page.waitForEvent('download'),
    frame.getByRole('menuitem', { name: 'Download original', exact: true }).click(),
  ]).catch(async (error) => {
    console.error('Local image download diagnostics:', consoleErrors);
    console.error('Visible menus:', await frame.getByRole('menuitem').allTextContents());
    await page.screenshot({ path: join(artifacts, 'local-actions-failure.png') });
    throw error;
  });
  assert.equal(downloaded.suggestedFilename(), 'original.svg');
  assert.equal(
    await readFile(await downloaded.path(), 'utf8'),
    originalSVG,
    'Downloading an SVG retains original bytes instead of exporting a PNG.',
  );
  await frame.getByRole('menu').waitFor({ state: 'hidden' });
  await svg.locator('[data-slot="image"]').hover();
  await svg.getByRole('button', { name: 'More image options', exact: true }).click();
  await frame.getByRole('menuitem', { name: 'Copy image', exact: true }).click();
  await frame.locator('[data-slot="toast"]').filter({ hasText: 'Image copied' }).waitFor();
  await page.context().grantPermissions(['clipboard-read'], { origin });
  assert.equal(
    await page.evaluate(async () =>
      (await navigator.clipboard.read()).some((item) => item.types.includes('image/png')),
    ),
    true,
  );
  await page.context().clearPermissions();
  await frame.getByRole('menu').waitFor({ state: 'hidden' });
  await svg.locator('[data-slot="image"]').hover();
  await svg.getByRole('button', { name: 'Expand image', exact: true }).click();
  const svgViewer = frame.getByRole('dialog', { name: 'Image viewer', exact: true });
  await svgViewer.waitFor();
  const [expandedDownload] = await Promise.all([
    page.waitForEvent('download'),
    svgViewer.getByRole('button', { name: 'Download original', exact: true }).click(),
  ]);
  assert.equal(expandedDownload.suggestedFilename(), 'original.svg');
  assert.equal(await readFile(await expandedDownload.path(), 'utf8'), originalSVG);
  await page.keyboard.press('Escape');
  await svgViewer.waitFor({ state: 'hidden' });
  await frame
    .locator('[data-case="missing"]')
    .getByRole('status')
    .filter({ hasText: 'The referenced file does not exist.' })
    .waitFor();
  await frame.locator('[data-case="relative"] img').click();
  const viewer = frame.getByRole('dialog', { name: 'Image viewer', exact: true });
  await viewer.waitFor();
  await viewer.getByRole('button', { name: 'Actual size', exact: true }).click();
  await page.screenshot({ path: join(artifacts, 'local-image-viewer.png') });
  await page.keyboard.press('Escape');
  await frame.getByRole('button', { name: '切换来源', exact: true }).click();
  await frame.locator('[data-case="changing"] img').waitFor();
  await frame.locator('[data-case="changing"] img').evaluate((element) => element.decode());
  assert.equal(
    await frame.locator('[data-case="changing"] img').evaluate((element) => element.naturalWidth),
    1,
  );

  await frame.getByRole('link', { name: '文档文件', exact: true }).click();
  const preview = frame.locator('[data-slot="file-preview"]');
  await preview.getByText('export const documentRelative = true;', { exact: false }).waitFor();
  await page.keyboard.press('Escape');
  await frame.getByRole('link', { name: '查看源文件', exact: true }).click();
  await preview.locator('[data-code-line="2"][data-line-highlighted]').waitFor();
  await preview.getByText('export const second = 2;', { exact: false }).waitFor();
  await writeFile(join(root, 'source.ts'), 'export const changed = true;');
  assert.ok(
    (await preview.textContent()).includes('export const second = 2;'),
    'An open annotated preview retains its snapshot.',
  );
  await page.keyboard.press('Escape');
  await frame.getByRole('link', { name: '查看源文件', exact: true }).click();
  await preview.getByText('export const changed = true;', { exact: false }).waitFor();
  assert.deepEqual(legacyRequests, []);
  assert.deepEqual(errors, []);
  console.log(
    'Ordinary Markdown: relative/absolute/encoded/document paths, source changes, local image viewer and annotated file previews passed without /file requests.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
