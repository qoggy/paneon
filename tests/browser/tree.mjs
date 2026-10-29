import { readPanelFixture } from '../panel-fixture.ts';
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';

const root = await mkdtemp(join(tmpdir(), 'paneon-tree-contract-'));
let service, browser, page, unblockRead;
try {
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    await readPanelFixture(new URL('../fixtures/panels/tree-panel.tsx', import.meta.url)),
  );
  service = await startServer(join(root, 'data'));
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const frame = page.frameLocator('iframe');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const state = async () => JSON.parse(await frame.locator('[data-state]').textContent());
  async function waitResult(text) {
    await frame.locator('[data-state]').filter({ hasText: text }).waitFor();
  }
  async function run(controlled = true) {
    const instance = await service.runtime.run(entry, root, { controlled }, false);
    await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${instance.instanceId}`);
    await button('folder').waitFor();
  }
  await run();
  assert.equal(await frame.getByRole('tree').count(), 0);
  assert.equal(await frame.locator('[data-probe-id=empty]').getAttribute('data-branch'), 'true');
  await button('Reveal deep').click();
  await waitResult('pending:deep');
  assert.deepEqual((await state()).requested, ['folder', 'nested']);
  assert.deepEqual((await state()).results, ['pending:deep']);
  assert.equal(await button('deep.ts').count(), 0);
  await button('Accept expansion').click();
  await waitResult('done:deep');
  assert.equal((await state()).selected, null);
  assert.deepEqual((await state()).actions, []);
  assert.equal(await button('deep.ts').getAttribute('data-level'), '3');
  await button('deep.ts').click();
  assert.deepEqual((await state()).actions, []);
  const selectedOnce = (await state()).selectionChanges;
  await button('deep.ts').click();
  assert.equal(
    (await state()).selectionChanges,
    selectedOnce + 1,
    'Repeated selection retains user intent',
  );
  await button('deep.ts').press('Enter');
  assert.deepEqual((await state()).actions, ['deep-original']);
  await button('deep.ts').dblclick();
  assert.deepEqual((await state()).actions, ['deep-original', 'deep-original']);
  const selections = (await state()).selectionChanges;
  await button('deep.ts').press('Tab');
  assert.equal((await state()).selectionChanges, selections);
  await button('locked.ts').press('Enter');
  assert.equal((await state()).selected, 'deep');
  assert.equal((await state()).actions.at(-1), 'locked');
  await button('Reveal missing').click();
  await waitResult('TREE_ITEM_NOT_FOUND');
  await button('Collapse all').click();
  await button('Accept expansion').click();
  await button('Reveal deep').click();
  await button('Cancel reveal').click();
  await waitResult('AbortError');
  const resultCount = (await state()).results.length;
  await button('Accept expansion').click();
  assert.equal((await state()).results.length, resultCount, 'cancelled calls never complete later');

  await run();
  await button('Reveal deep').click();
  await button('folder').click();
  await waitResult('AbortError');
  await button('Reveal deep').click();
  await button('Toggle removed').click();
  await waitResult('TREE_ITEM_NOT_FOUND');

  await run();
  await button('Reveal deep').click();
  await button('Reveal solo').click();
  await waitResult('done:solo');
  assert.deepEqual((await state()).results, [
    'pending:deep',
    'pending:solo',
    'AbortError',
    'done:solo',
  ]);
  await button('Reveal deep').click();
  await button('Toggle mount').click();
  assert.equal((await state()).results.at(-1), 'AbortError');

  await run();
  await button('Reveal deep').click();
  await frame.getByLabel('Search', { exact: true }).fill('solo');
  await waitResult('TREE_ITEM_FILTERED');
  await button('Reveal deep').click();
  assert.equal((await state()).results.at(-1), 'TREE_ITEM_FILTERED');
  await frame.getByLabel('Search', { exact: true }).fill('deep');
  assert.equal(await button('deep.ts').isVisible(), true);
  assert.deepEqual((await state()).expanded, []);
  const changes = (await state()).expansionChanges;
  await button('Collapse all').click();
  assert.equal((await state()).expansionChanges, changes);
  await frame.getByLabel('Search', { exact: true }).fill('');
  assert.equal(await button('deep.ts').count(), 0);
  await button('Toggle automatic').click();
  await button('Reveal deep').click();
  await waitResult('done:deep');
  await button('folder').click();
  assert.equal(await button('deep.ts').count(), 0);
  await button('Reveal deep').click();
  await frame
    .locator('[data-state]')
    .filter({ hasText: /done:deep.*done:deep/ })
    .waitFor();
  await button('deep.ts').press('F2');
  assert.equal(await button('solo.ts').evaluate((row) => row === document.activeElement), true);
  await frame.getByLabel('Search', { exact: true }).fill('');
  await button('deep.ts').press('Delete');
  assert.equal(
    (await state()).selected,
    null,
    'controlled selection is not invented by focus recovery',
  );

  await run(false);
  await button('Expand all').click();
  await button('deep.ts').click();
  await button('deep.ts').press('Delete');
  await frame.locator('[data-state]').filter({ hasText: '"selected":null' }).waitFor();
  assert.equal((await state()).selectionChanges, 2);
  assert.equal(await button('empty').evaluate((row) => row === document.activeElement), true);
  await button('Toggle loading').click();
  assert.equal(
    await frame.getByRole('group', { name: 'Probe tree' }).getAttribute('aria-busy'),
    'true',
  );
  assert.equal(await button('solo.ts').isVisible(), true);
  await button('Toggle data').click();
  assert.equal(await frame.getByText('No nodes', { exact: true }).count(), 0);
  await button('Toggle loading').click();
  await frame.getByText('No nodes', { exact: true }).waitFor();

  const example = join(root, 'skill/assets/panels/diff-review');
  await cp(new URL('../../skills/paneon/assets/panels/diff-review', import.meta.url), example, {
    recursive: true,
  });
  await cp(
    new URL('../../skills/paneon/assets/shared', import.meta.url),
    join(root, 'skill/assets/shared'),
    { recursive: true },
  );
  await Promise.all([
    writeFile(join(root, 'original.ts'), 'export const value = 1;\n'),
    writeFile(join(root, 'proposed.ts'), 'export const value = 2;\n'),
    writeFile(join(root, 'added.ts'), 'export const added = true;\n'),
  ]);
  const instance = await service.runtime.run(
    join(example, 'panel.tsx'),
    root,
    {
      files: [
        {
          displayPath: 'prompts/analyze-session-worker.md',
          oldPath: 'original.ts',
          newPath: 'proposed.ts',
        },
        { displayPath: 'prompts/added.ts', oldPath: null, newPath: 'added.ts' },
        { displayPath: 'prompts/deleted.ts', oldPath: 'original.ts', newPath: null },
        { displayPath: 'prompts/missing.ts', oldPath: 'missing.ts', newPath: 'proposed.ts' },
        { displayPath: 'prompts/unchanged.ts', oldPath: 'original.ts', newPath: 'original.ts' },
      ],
    },
    false,
  );
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${instance.instanceId}`);
  await frame
    .locator('[data-code-side="old"][data-line="1"]')
    .filter({ hasText: 'value = 1' })
    .waitFor();
  const toolbar = frame.getByRole('toolbar', { name: 'File actions', exact: true });
  const statusRow = (index, status) =>
    frame.locator(`[data-tree-item="file:${index}"][data-comparison-status="${status}"]`);
  await statusRow(0, 'M').waitFor();
  await statusRow(1, 'A').waitFor();
  await statusRow(2, 'D').waitFor();
  await statusRow(4, '=').waitFor();
  assert.match(await button('added.ts').getAttribute('class'), /text-green-700/);
  assert.match(await button('analyze-session-worker.md').getAttribute('class'), /text-blue-600/);
  assert.match(await button('deleted.ts').getAttribute('class'), /text-muted-foreground/);
  assert.equal(await button('added.ts').getAttribute('title'), 'Added · prompts/added.ts');
  assert.equal(await button('added.ts').locator('svg').count(), 1);
  assert.equal(await toolbar.getByRole('button').count(), 4);
  const grouping = toolbar.getByRole('button', { name: 'Group by directory', exact: true });
  const originalLine = await frame.locator('[data-code-side="old"][data-line="1"]').elementHandle();
  assert.equal(await grouping.getAttribute('aria-pressed'), 'true');
  await grouping.click();
  assert.equal(await grouping.getAttribute('aria-pressed'), 'false');
  assert.equal(await frame.locator('[data-tree-item^="directory:"]').count(), 0);
  assert.equal(
    await toolbar.getByRole('button', { name: 'Expand all', exact: true }).isDisabled(),
    true,
  );
  assert.equal(await button('analyze-session-worker.md').getAttribute('aria-pressed'), 'true');
  await grouping.click();
  assert.equal(
    await button('analyze-session-worker.md').isVisible(),
    true,
    'Grouping restores expansion',
  );
  assert.equal(
    await originalLine.evaluate((line) => line.isConnected),
    true,
    'Grouping retains the open diff',
  );
  await toolbar.getByRole('button', { name: 'Collapse all', exact: true }).click();
  assert.equal(await button('analyze-session-worker.md').count(), 0);
  await toolbar.getByRole('button', { name: 'Expand all', exact: true }).click();
  await button('analyze-session-worker.md').waitFor();
  await frame.getByRole('textbox', { name: 'Search files', exact: true }).fill('added');
  assert.equal(
    await toolbar.getByRole('button', { name: 'Collapse all', exact: true }).isDisabled(),
    true,
  );
  await frame.getByRole('textbox', { name: 'Search files', exact: true }).fill('');
  await button('added.ts').click();
  assert.ok(
    (await frame.locator('[data-code-side="old"][data-line="1"]').innerText()).includes(
      'value = 1',
    ),
    'Click only selects and retains the open diff',
  );
  await toolbar.getByRole('button', { name: 'View file diff', exact: true }).click();
  await frame
    .locator('[data-code-side="new"][data-line="1"]')
    .filter({ hasText: 'added = true' })
    .waitFor();
  await button('analyze-session-worker.md').press('Enter');
  await frame
    .locator('[data-code-side="old"][data-line="1"]')
    .filter({ hasText: 'value = 1' })
    .waitFor();
  await frame
    .locator('[data-code-side="new"][data-line="1"]')
    .filter({ hasText: 'value = 2' })
    .waitFor();
  await button('added.ts').dblclick();
  await frame
    .locator('[data-code-side="new"][data-line="1"]')
    .filter({ hasText: 'added = true' })
    .waitFor();
  assert.equal(await frame.locator('[data-code-side="old"]').count(), 0);
  await button('deleted.ts').dblclick();
  await frame
    .locator('[data-code-side="old"][data-line="1"]')
    .filter({ hasText: 'value = 1' })
    .waitFor();
  assert.equal(await frame.locator('[data-code-side="new"]').count(), 0);
  await button('missing.ts').dblclick();
  await frame.getByRole('alert').filter({ hasText: 'Could not read files:' }).waitFor();
  await statusRow(3, '!').waitFor();
  assert.equal(
    await frame.locator('[data-code-side]').count(),
    0,
    'Read failure is not an empty side',
  );
  await button('unchanged.ts').dblclick();
  await statusRow(4, '=').waitFor();
  assert.equal(
    await button('unchanged.ts').getAttribute('title'),
    'Unchanged · prompts/unchanged.ts',
  );

  const gate = new Promise((resolve) => {
    unblockRead = resolve;
  });
  const isOriginalRead = (request) =>
    request.method() === 'POST' &&
    request.url().includes('/actions/') &&
    request.postDataJSON()?.input?.oldPath === 'original.ts' &&
    request.postDataJSON()?.input?.newPath === 'proposed.ts';
  await page.route('**/actions/*', async (route) => {
    if (isOriginalRead(route.request())) await gate;
    await route.continue();
  });
  const started = page.waitForRequest(isOriginalRead);
  await button('analyze-session-worker.md').dblclick();
  await started;
  await button('added.ts').dblclick();
  await frame
    .locator('[data-code-side="new"][data-line="1"]')
    .filter({ hasText: 'added = true' })
    .waitFor();
  const completed = page.waitForResponse((response) => isOriginalRead(response.request()));
  unblockRead();
  await completed;
  assert.equal(await frame.locator('[data-code-side="old"]').count(), 0);
  assert.ok(
    (await frame.locator('[data-code-side="new"][data-line="1"]').innerText()).includes(
      'added = true',
    ),
  );
  await page.screenshot({
    path: '/private/tmp/paneon-neutral-tree-evidence/tree-diff-example.png',
  });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      status: 'passed',
      controlledReveal: true,
      cancellation: true,
      searchOverlay: true,
      nativeInteraction: true,
      dataChanges: true,
      builtInDiffReview: true,
      fileDiff: true,
      nullSidesAndErrors: true,
      staleReadIgnored: true,
      fileToolbar: true,
      comparisonStatuses: true,
    }),
  );
} catch (error) {
  console.error('Tree contract failed:', error);
  if (page) {
    await page.screenshot({ path: '/private/tmp/paneon-neutral-tree-evidence/tree-failure.png' });
    console.error(
      await page
        .frameLocator('iframe')
        .locator('body')
        .evaluate((body) => ({
          state: body.querySelector('[data-state]')?.textContent,
          rows: [...body.querySelectorAll('[data-tree-item]')].map((row) => ({
            id: row.getAttribute('data-tree-item'),
            rects: row.getClientRects().length,
            ancestors: [
              ...(function* () {
                let parent = row.parentElement;
                while (parent) {
                  yield {
                    slot: parent.getAttribute('data-slot'),
                    display: getComputedStyle(parent).display,
                    hidden: parent.hidden,
                  };
                  parent = parent.parentElement;
                }
              })(),
            ],
          })),
        })),
    );
  }
  throw error;
} finally {
  unblockRead?.();
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
