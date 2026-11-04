import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { readPanelFixture } from '../panel-fixture.ts';
import { startServer } from '../runtime-fixture.ts';
import {
  assertToastUndoExitsUp,
  openAnnotationDirectory,
  selectAnnotationText,
} from './annotation-tools.mjs';

const root = await mkdtemp(join(tmpdir(), 'paneon-annotation-undo-'));
const artifacts = process.env.PANEON_TEST_SCREENSHOTS ?? '/tmp/paneon-uiux-implementation-20261104';
let service, browser;
try {
  await mkdir(artifacts, { recursive: true });
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    await readPanelFixture(new URL('./annotation-editor-fixture.txt', import.meta.url)),
  );
  service = await startServer(join(root, 'data'));
  const panel = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  await frame
    .getByRole('heading', { name: 'Annotation editor acceptance' })
    .waitFor({ timeout: 10000 })
    .catch((error) => {
      throw new Error(`Annotation page did not render: ${JSON.stringify(errors)}`, {
        cause: error,
      });
    });
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const draft = async () => JSON.parse(await frame.getByTestId('draft').textContent());
  for (const [start, end, comment] of [
    [0, 6, 'first opinion'],
    [7, 17, 'second opinion'],
  ]) {
    await selectAnnotationText(frame, '[data-testid="target"]', start, end);
    await frame.locator('[data-annotation-action]').click();
    await frame.getByRole('textbox', { name: 'Annotation text', exact: true }).fill(comment);
    await button('Save').click();
  }
  const original = await draft();
  await openAnnotationDirectory(frame);
  await button('Delete annotation 1').click();
  const toast = frame.locator('[data-slot="toast"]').filter({ hasText: 'Annotation deleted' });
  await toast.waitFor();
  assert.equal((await draft()).annotations.length, 1);
  await assertToastUndoExitsUp(
    frame,
    toast,
    toast.getByRole('button', { name: 'Undo', exact: true }),
  );
  assert.deepEqual(await draft(), original);
  assert.equal(await frame.locator('[data-annotation-marker]').count(), 2);

  await openAnnotationDirectory(frame);
  await button('Edit annotation 2').click();
  await frame.getByRole('textbox', { name: 'Annotation text', exact: true }).fill('unsaved edit');
  await button('Delete annotation').click();
  await toast.waitFor();
  await toast.getByRole('button', { name: 'Undo', exact: true }).click({ trial: true });
  const toastBox = await toast.boundingBox();
  const launcherBox = await frame.locator('[data-annotation-launcher]').boundingBox();
  assert.ok(
    toastBox.y + toastBox.height <= launcherBox.y - 8,
    'Undo toast stays above the annotation entry',
  );
  await page.screenshot({ path: join(artifacts, 'annotation-delete-undo.png') });
  assert.equal(await frame.locator('[data-annotation-editor]').count(), 0);
  await toast.getByRole('button', { name: 'Undo', exact: true }).click();
  await toast.waitFor({ state: 'detached' });
  assert.deepEqual(await draft(), original);

  await openAnnotationDirectory(frame);
  await button('Delete annotation 1').click();
  await toast.waitFor();
  await button('Disabled no').click();
  assert.equal(await toast.getByRole('button', { name: 'Undo', exact: true }).isDisabled(), true);
  await button('Disabled yes').click();
  await toast.getByRole('button', { name: 'Undo', exact: true }).click();
  await toast.waitFor({ state: 'detached' });
  assert.deepEqual(await draft(), original);
  await service.app.inject({
    method: 'POST',
    url: '/api/preferences',
    headers: {
      host: `127.0.0.1:${service.descriptor.port}`,
      authorization: `Bearer ${service.descriptor.controlToken}`,
    },
    payload: { ui: { language: 'zh-CN' } },
  });
  await frame.locator('html[lang="zh-CN"]').waitFor();
  await openAnnotationDirectory(frame);
  await button('删除批注 1').click();
  const chineseToast = frame.locator('[data-slot="toast"]').filter({ hasText: '批注已删除' });
  await chineseToast.getByRole('button', { name: '撤销', exact: true }).waitFor();
  await chineseToast.locator('[data-slot="toast-close"]').click();
  await chineseToast.waitFor({ state: 'detached' });
  assert.equal(
    (await draft()).annotations.length,
    1,
    'Dismissing the toast does not undo deletion',
  );

  // Each deletion keeps its own notice and can be undone in any order.
  for (const [start, end] of [
    [0, 6],
    [18, 24],
    [2, 4],
  ]) {
    await selectAnnotationText(frame, '[data-testid="target"]', start, end);
    await frame.locator('[data-annotation-action]').click();
    await frame.locator('[data-annotation-editor] textarea').fill(`连续删除 ${start}`);
    await button('保存').click();
  }
  const beforeSequence = await draft();
  assert.equal(beforeSequence.annotations.length, 4);
  await openAnnotationDirectory(frame);
  const removeLast = () =>
    frame
      .getByRole('button', { name: /^删除批注 \d+$/ })
      .last()
      .click();
  const activeToasts = frame
    .locator('[data-slot="toast"]:not([data-ending-style]):not([data-limited])')
    .filter({ hasText: '批注已删除' });
  const notice = (comment) => chineseToast.filter({ hasText: comment });
  const restore = async (comment, observeExit = false) => {
    const item = notice(comment);
    await activeToasts.first().hover();
    const undo = item.getByRole('button', { name: '撤销', exact: true });
    if (observeExit) await assertToastUndoExitsUp(frame, item, undo);
    else {
      await undo.click();
      await item.waitFor({ state: 'detached' });
    }
  };
  await removeLast();
  await notice('连续删除 2').waitFor();
  await removeLast();
  await removeLast();
  assert.equal(await activeToasts.count(), 3, 'Three deletions keep three actionable notices');
  await activeToasts.first().hover();
  await frame.locator('[data-slot="toast-viewport"][data-expanded]').waitFor({ state: 'attached' });
  await activeToasts
    .last()
    .getByRole('button', { name: '撤销', exact: true })
    .click({ trial: true });
  await page.screenshot({ path: join(artifacts, 'annotation-consecutive-delete.png') });
  await restore('连续删除 18', true); // Middle notice first, rather than reversing deletion order.
  assert.equal(await activeToasts.count(), 2);
  await restore('连续删除 2');
  await restore('连续删除 0');
  assert.deepEqual((await draft()).annotations, beforeSequence.annotations);

  await openAnnotationDirectory(frame);
  for (let index = 0; index < 4; index++) await removeLast();
  await notice('连续删除 2').waitFor({ state: 'detached' });
  assert.equal(await activeToasts.count(), 3, 'A fourth deletion releases the oldest recovery');
  await activeToasts.first().hover();
  await restore('连续删除 18', true); // The backmost expanded notice must also exit upwards.
  await activeToasts.first().hover();
  await notice('连续删除 0').locator('[data-slot="toast-close"]').click();
  await notice('连续删除 0').waitFor({ state: 'detached' });
  assert.equal(await activeToasts.count(), 1, 'Closing one notice preserves the others');
  await restore('second opinion');
  assert.deepEqual(
    (await draft()).annotations,
    [beforeSequence.annotations[0], beforeSequence.annotations[2]],
    'Only the closed and capacity-evicted deletions remain deleted',
  );

  await openAnnotationDirectory(frame);
  await removeLast();
  await notice('连续删除 18').waitFor();
  await page.mouse.move(10, 10);
  await page.waitForTimeout(2700);
  await removeLast();
  await page.mouse.move(10, 10);
  await page.waitForTimeout(2700);
  await notice('连续删除 18').waitFor({ state: 'detached' });
  await notice('second opinion').waitFor();
  assert.equal(
    await activeToasts.count(),
    1,
    'Adding a deletion does not restart older expiry timers',
  );
  await restore('second opinion');
  assert.deepEqual((await draft()).annotations, [beforeSequence.annotations[0]]);

  await selectAnnotationText(frame, '[data-testid="target"]', 0, 6);
  await frame.locator('[data-annotation-action]').click();
  await frame.locator('[data-annotation-editor] textarea').fill('Unmount cleanup');
  await button('保存').click();
  await openAnnotationDirectory(frame);
  await removeLast();
  await removeLast();
  assert.equal(await activeToasts.count(), 2);
  await button('Annotations enabled yes').click();
  await chineseToast.first().waitFor({ state: 'detached' });
  assert.deepEqual(
    (await draft()).annotations,
    [],
    'Unmounting closes all recovery notices without restoring deletions',
  );
  const response = await service.app.inject({
    method: 'GET',
    url: `/api/panels/${panel.instanceId}/events?consumer=undo-acceptance`,
    headers: {
      host: `127.0.0.1:${service.descriptor.port}`,
      authorization: `Bearer ${service.descriptor.controlToken}`,
    },
  });
  assert.deepEqual(response.json().data.events, [], 'Deleting and undoing never submit feedback');
  assert.deepEqual(errors, []);
  console.log(
    'PASS annotation undo: directory/editor, independent stacked recovery in arbitrary order, capacity, individual close/expiry, disabled state, unmount cleanup and no implicit events',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
