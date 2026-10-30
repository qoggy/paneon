import { readPanelFixture } from '../panel-fixture.ts';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';
import {
  openAnnotationDirectory,
  selectAnnotationText,
  submitAnnotations,
} from './annotation-tools.mjs';

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
  const draft = async () => JSON.parse(await frame.locator('[data-draft]').textContent());
  const savedDraft = await draft();
  assert.equal(typeof savedDraft.annotations[0].id, 'string');
  assert.ok(savedDraft.annotations[0].id.length > 0);
  await submitAnnotations(frame);
  await frame.getByText(/^Saved as event \d+\.$/).waitFor();
  const events = await read();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'annotations-submitted');
  assert.equal(events[0].payload.annotations[0].comment, 'Consider persistence.');
  assert.equal('id' in events[0].payload.annotations[0], false);
  assert.deepEqual(await draft(), savedDraft, 'Submission keeps the internal annotation id');
  assert.deepEqual(events[0].payload.annotations[0].targets, [
    {
      ref: 'redis-plan',
      text: { start: 4, end: 9, quote: 'Redis' },
    },
  ]);
  await openAnnotationDirectory(frame);
  await frame.getByRole('button', { name: 'Edit annotation 1', exact: true }).click();
  await frame.locator('[data-annotation-editor] textarea').fill('Use durable storage.');
  await frame.getByRole('button', { name: 'Save', exact: true }).click();
  const editedDraft = await draft();
  assert.equal(editedDraft.annotations[0].id, savedDraft.annotations[0].id);
  assert.deepEqual(editedDraft.annotations[0].targets, savedDraft.annotations[0].targets);
  assert.equal((await read()).length, 1, 'Editing remains local until explicit submission');
  const resubmitted = page.waitForResponse(
    (response) => response.url().endsWith('/events') && response.request().method() === 'POST',
  );
  await submitAnnotations(frame);
  assert.equal((await resubmitted).status(), 200);
  const revisedEvents = await read();
  assert.equal(revisedEvents.length, 2);
  assert.deepEqual(revisedEvents[1].payload, {
    annotations: [{ targets: savedDraft.annotations[0].targets, comment: 'Use durable storage.' }],
  });
  assert.equal((await draft()).annotations[0].id, savedDraft.annotations[0].id);
  await openAnnotationDirectory(frame);
  await frame.getByRole('button', { name: 'Delete annotation 1', exact: true }).click();
  assert.deepEqual(await draft(), { annotations: [] });
  assert.equal((await read()).length, 2, 'Deletion only changes the internal draft');
  const title = 'main > header h1 [data-annotation-text]';
  const description = 'main > header p [data-annotation-text]';
  const pageRef = { page: 'example', version: 1 };
  const target = (field, end, quote) => ({
    ref: { id: pageRef, field },
    text: { start: 0, end, quote },
  });
  for (const [selector, end, comment] of [
    [title, 10, 'Title opinion'],
    [description, 10, 'Description opinion'],
  ]) {
    await selectAnnotationText(frame, selector, 0, end);
    await frame.locator('[data-annotation-action]').click();
    await frame.locator('[data-annotation-editor] textarea').fill(comment);
    await frame.getByRole('button', { name: 'Save', exact: true }).click();
  }
  await selectAnnotationText(frame, title, 0, 10, description);
  await frame.locator('[data-annotation-action]').click();
  await frame.locator('[data-annotation-editor] textarea').fill('Both fields');
  await frame.getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal((await read()).length, 2, 'Page annotations remain local until submission');
  const expected = [
    { targets: [target('title', 10, 'Annotation')], comment: 'Title opinion' },
    { targets: [target('description', 10, 'Annotation')], comment: 'Description opinion' },
    {
      targets: [target('title', 18, 'Annotation example'), target('description', 10, 'Annotation')],
      comment: 'Both fields',
    },
  ];
  assert.deepEqual(
    (await draft()).annotations.map(({ targets, comment }) => ({ targets, comment })),
    expected,
  );
  await openAnnotationDirectory(frame);
  await frame.getByRole('button', { name: 'Edit annotation 2', exact: true }).click();
  await frame.locator('[data-annotation-editor] textarea').waitFor();
  assert.equal(
    await frame.locator('[data-annotation-editor] textarea').inputValue(),
    'Description opinion',
  );
  await frame.locator('[data-annotation-editor] textarea').press('Escape');
  const pageSubmitted = page.waitForResponse(
    (response) => response.url().endsWith('/events') && response.request().method() === 'POST',
  );
  await submitAnnotations(frame);
  assert.equal((await pageSubmitted).status(), 200);
  assert.deepEqual((await read())[2].payload, { annotations: expected });
  assert.deepEqual(errors, []);
  console.log(
    'AnnotationText example passed: agent events omit ids, refs/ranges stay intact, and internal ids survive submission and editing until deletion.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
