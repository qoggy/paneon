import { PACKAGE_VERSION } from '../panel-fixture.ts';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';
import {
  openAnnotationDirectory,
  selectAnnotationText,
  submitAnnotations,
} from './annotation-tools.mjs';

const root = await mkdtemp(join(tmpdir(), 'paneon-frontmatter-'));
let service, browser;
try {
  const examples = JSON.parse(
    await readFile(new URL('../fixtures/markdown-frontmatter.json', import.meta.url), 'utf8'),
  );
  const source =
    '\uFEFF---\r\nname: "发布中文🙂"\r\nversion: 900719925474099312345\r\nitems:\r\n  - first\r\n  - second\r\n---\r\n\r\n# 正文标题\r\n\r\n**正文中文🙂** and repeated text.\r\n';
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    `
import {agent,annotationValueSchema,definePanel,z} from '@qoggy/paneon/sdk';
import {Button,Markdown,Page,usePageAnnotations} from '@qoggy/paneon/ui';
import {useState} from 'react';
const source=${JSON.stringify(source)}, examples=${JSON.stringify(examples)};
function Panel(){const [example,setExample]=useState(-1);usePageAnnotations({onSubmit:value=>agent.emit('annotations',value)});return <Page title="Frontmatter acceptance"><div data-testid="annotated"><Markdown annotationTarget="document">{source}</Markdown></div><Button onClick={()=>setExample(value=>(value+1)%examples.length)}>Next YAML case</Button><output data-case-index={example}>{example < 0 ? 'No case' : examples[example].id}</output>{example>=0&&<div data-testid="case"><Markdown>{examples[example].source}</Markdown></div>}<div data-testid="off"><Markdown frontmatter="off">{source}</Markdown></div></Page>}
export default definePanel({id:'frontmatter-acceptance',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),events:{annotations:annotationValueSchema(z.string())},render:Panel});`,
  );
  service = await startServer(join(root, 'runtime'));
  const panel = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [],
    warnings = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  const document = frame.getByTestId('annotated');
  const metadata = document.locator('[data-markdown-frontmatter]');
  await metadata.waitFor();
  assert.equal(await metadata.locator('button, details, script').count(), 0);
  assert.match(await metadata.textContent(), /发布中文🙂/);
  assert.match(await metadata.textContent(), /900719925474099312345/);
  assert.equal(await metadata.locator('li').count(), 2);
  await document.getByRole('heading', { name: '正文标题', exact: true }).waitFor();
  assert.equal(await frame.getByTestId('off').locator('[data-markdown-frontmatter]').count(), 0);
  const save = async (selector, quote, comment) => {
    await selectAnnotationText(frame, selector, 0, quote.length);
    await frame.locator('[data-annotation-action]').click();
    await frame.locator('[data-annotation-editor] textarea').fill(comment);
    await frame.locator('[data-annotation-editor] textarea').press('Enter');
    await frame.locator('[data-annotation-editor]').waitFor({ state: 'hidden' });
  };
  await save(
    '[data-testid="annotated"] [data-markdown-frontmatter] > dl > .yaml-entry:first-child > dd .yaml-value [data-source-leaf="yaml"]',
    '发布中文🙂',
    'Metadata annotation',
  );
  await save(
    '[data-testid="annotated"] strong [data-source-leaf]',
    '正文中文🙂',
    'Body annotation',
  );
  const events = async () =>
    (await service.runtime.events(panel.instanceId, 'frontmatter', 100, 0)).events;
  const submit = async () => {
    const receipt = page.waitForResponse(
      (response) => response.url().endsWith('/events') && response.request().method() === 'POST',
    );
    await submitAnnotations(frame);
    assert.equal((await receipt).status(), 200);
  };
  assert.equal((await events()).length, 0);
  await submit();
  const [first] = await events();
  assert.equal(first.type, 'annotations');
  assert.equal(first.payload.annotations.length, 2);
  for (const [index, quote] of ['发布中文🙂', '正文中文🙂'].entries()) {
    const annotation = first.payload.annotations[index];
    assert.deepEqual(annotation.targets, [
      {
        ref: 'document',
        text: { start: source.indexOf(quote), end: source.indexOf(quote) + quote.length, quote },
      },
    ]);
  }
  await openAnnotationDirectory(frame);
  await frame.getByRole('button', { name: 'Locate annotation 1', exact: true }).click();
  await metadata.waitFor();
  await openAnnotationDirectory(frame);
  await frame.getByRole('button', { name: 'Edit annotation 1', exact: true }).click();
  await frame.locator('[data-annotation-editor] textarea').fill('Corrected metadata annotation');
  await frame.locator('[data-annotation-editor] textarea').press('Enter');
  await frame.locator('[data-annotation-editor]').waitFor({ state: 'hidden' });
  await submit();
  const all = await events();
  assert.equal(all.length, 2);
  assert.ok(all[1].id > first.id, 'Custom pages append the event supplied by onSubmit');
  assert.deepEqual(all[0], first, 'Editing cannot rewrite the previously submitted event');
  assert.equal(all[1].payload.annotations[0].comment, 'Corrected metadata annotation');
  assert.deepEqual(
    all[1].payload.annotations.map((x) => x.targets),
    first.payload.annotations.map((x) => x.targets),
  );

  for (const [index, example] of examples.entries()) {
    await frame.getByRole('button', { name: 'Next YAML case', exact: true }).click();
    await frame.locator(`[data-case-index="${index}"]`).waitFor();
    const rendered = frame.getByTestId('case');
    assert.equal(
      await rendered.locator('[data-markdown-frontmatter]').count(),
      example.expected === 'markdown' ? 0 : 1,
      example.id,
    );
    assert.equal(
      await rendered.locator('[data-markdown-frontmatter][data-invalid]').count(),
      example.expected === 'error' ? 1 : 0,
      example.id,
    );
    assert.equal(await rendered.locator('script').count(), 0, example.id);
    if (example.expected === 'error') assert.match(await rendered.textContent(), /./, example.id);
  }
  assert.ok(warnings.some((warning) => warning.includes('Invalid YAML frontmatter:')));
  assert.deepEqual(errors, []);
  console.log(
    `Markdown frontmatter passed: ${examples.length} shared YAML cases, exact BOM/CRLF/Unicode annotation coordinates, explicit submit/correction, locate, literal invalid YAML and frontmatter=off.`,
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
