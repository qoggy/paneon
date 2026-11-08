import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';
import { PACKAGE_VERSION } from '../panel-fixture.ts';
import { selectAnnotationText, submitAnnotations } from './annotation-tools.mjs';

const root = await mkdtemp(join(tmpdir(), 'paneon-event-browser-'));
let service, browser;
try {
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    `
import {agent,definePanel,z} from '@qoggy/paneon/sdk';
import {Page,Section,AnnotationText,usePageAnnotations} from '@qoggy/paneon/ui';
import {useRef} from 'react';
function Panel(){
  const last=useRef<number | undefined>(undefined);
  usePageAnnotations({onSubmit:async value=>{
    const receipt=await agent.emit('annotations-submitted',{
      annotations:value.annotations.map(({targets,comment})=>({targets,comment})),
      extra:{preserved:true},
      ...(last.current===undefined?{}:{replacesEventId:last.current}),
    });
    last.current=receipt.id;
  }});
  return <Page title="Page heading" description="Page description" annotationTarget="page">
    <Section title="Section heading" description="Section description" annotationTarget="section">
      <AnnotationText target="body">Body explanation</AnnotationText>
    </Section>
  </Page>;
}
export default definePanel({id:'event-browser',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:Panel});
`,
  );
  service = await startServer(join(root, 'data'));
  const panel = await service.runtime.run(entry, root, {}, false);
  const url = `http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`;
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'Page heading', exact: true }).waitFor();
  let previous;
  for (const [selector, ref] of [
    ['h1 [data-annotation-text]', { id: 'page', field: 'title' }],
    ['main > header p [data-annotation-text]', { id: 'page', field: 'description' }],
    ['h2 [data-annotation-text]', { id: 'section', field: 'title' }],
    ['section > header p [data-annotation-text]', { id: 'section', field: 'description' }],
    ['section > [data-annotation-text]', 'body'],
  ]) {
    await selectAnnotationText(frame, selector, 0, 4);
    await frame.locator('[data-annotation-action]').click();
    await frame.locator('[data-annotation-editor] textarea').fill('Browser regression feedback.');
    await frame
      .locator('[data-annotation-editor]')
      .getByRole('button', { name: /^(Save|保存)$/ })
      .click();
    const delivered = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/panels/${panel.instanceId}/events`) &&
        response.request().method() === 'POST',
    );
    await submitAnnotations(frame);
    const response = await delivered;
    assert.equal(response.status(), 200, await response.text());
    const { data } = await response.json();
    assert.deepEqual(data.payload.annotations.at(-1).targets[0].ref, ref);
    assert.deepEqual(data.payload.extra, { preserved: true });
    assert.equal(data.payload.replacesEventId, previous);
    previous = data.id;
  }
  const events = await service.runtime.events(panel.instanceId, 'browser', 100, 0);
  assert.equal(events.events.length, 5);
  service.runtime.store.ack(panel.instanceId, 'browser', previous);
  assert.deepEqual((await service.runtime.events(panel.instanceId, 'browser', 100, 0)).events, []);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      pageAndSectionTitlesAndDescriptions: 4,
      body: 1,
      corrections: 4,
      preservedExtraFields: true,
      pageErrors: errors,
    }),
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
