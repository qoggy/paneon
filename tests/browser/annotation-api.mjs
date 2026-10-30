import { readPanelFixture } from '../panel-fixture.ts';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';
import { selectAnnotationText, submitAnnotations } from './annotation-tools.mjs';

const root = await mkdtemp(join(tmpdir(), 'paneon-annotation-api-'));
let service, browser;
try {
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    await readPanelFixture(new URL('./annotation-api-fixture.txt', import.meta.url)),
  );
  service = await startServer(join(root, 'data'));
  const panel = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'Annotation example', exact: true }).waitFor();
  assert.equal(await frame.locator('[data-annotation-surface]').count(), 1);
  const read = async () => {
    const response = await service.app.inject({
      method: 'GET',
      url: `/api/panels/${panel.instanceId}/events?consumer=annotation-api`,
      headers: {
        host: `127.0.0.1:${service.descriptor.port}`,
        authorization: `Bearer ${service.descriptor.controlToken}`,
      },
    });
    assert.equal(response.statusCode, 200);
    return response.json().data.events;
  };
  await selectAnnotationText(frame, '[data-slot="card"] [data-annotation-text]', 4, 9);
  await frame.locator('[data-annotation-action]').click();
  await frame.locator('[data-annotation-editor] textarea').fill('Consider persistence.');
  await frame.getByRole('button', { name: /^(Save|保存)$/, exact: true }).click();
  assert.equal((await read()).length, 0, 'Save must not send an event');
  await submitAnnotations(frame);
  await frame.getByText(/^Saved as event \d+\.$/).waitFor();
  const events = await read();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'annotations-submitted');
  assert.equal(events[0].payload.annotations[0].comment, 'Consider persistence.');
  assert.deepEqual(events[0].payload.annotations[0].targets, [
    {
      ref: 'redis-plan',
      text: { start: 4, end: 9, quote: 'Redis' },
    },
  ]);
  assert.deepEqual(errors, []);
  console.log(
    'Annotation example passed: native selection → Save → explicit submit → event consumption.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
