import { PACKAGE_VERSION, readPanelFixture } from '../panel-fixture.ts';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = await mkdtemp(join(tmpdir(), 'paneon-query-lifecycle-'));
const entry = join(root, 'panel.tsx');
const queryFile = join(root, 'query.jsonl');
const mutationFile = join(root, 'mutation-count.txt');
await writeFile(
  entry,
  await readPanelFixture(join(repository, 'tests/browser/query-lifecycle-fixture.txt')),
);
let service;
let browser;
const evidence = [];
async function queryRecords() {
  try {
    return (await readFile(queryFile, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
async function mutationCount() {
  try {
    return Number(await readFile(mutationFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}
async function until(check, message, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(20);
  }
  throw new Error(message);
}
try {
  service = await startServer(join(root, 'data'));
  const panel = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const streamSockets = new Set();
  let streamRequests = 0;
  service.app.websocketServer.on('connection', (socket, request) => {
    if (request.url === `/api/panels/${panel.instanceId}/stream`) {
      streamRequests++;
      streamSockets.add(socket);
      socket.once('close', () => streamSockets.delete(socket));
    }
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'Query lifecycle test', exact: true }).waitFor();
  await until(
    async () => (await queryRecords()).some((record) => record.type === 'start'),
    'The real initial query must start.',
  );
  await frame
    .getByRole('button', { name: 'Refetch query', exact: true })
    .click({ clickCount: 20, delay: 1 });
  const timerPhaseStarts = Date.now();
  await delay(1500);
  await frame.getByRole('button', { name: 'Unmount query', exact: true }).click();
  await frame.getByText('Query subscription unmounted', { exact: true }).waitFor();
  const startsAtUnmount = (await queryRecords()).filter((record) => record.type === 'start').length;
  await delay(700);
  const records = await queryRecords();
  assert.equal(
    records.filter((record) => record.type === 'start').length,
    startsAtUnmount,
    'Unmounted subscriptions must not start future refreshes.',
  );
  let active = 0,
    maxActive = 0,
    previousEnd;
  let timerGapChecks = 0;
  const activeIds = new Set();
  for (const record of records) {
    if (record.type === 'start') {
      if (
        previousEnd !== undefined &&
        previousEnd >= timerPhaseStarts &&
        record.time >= timerPhaseStarts
      ) {
        timerGapChecks++;
        assert.ok(
          record.time - previousEnd >= 70,
          'The next timer query must wait after the previous result completes.',
        );
      }
      active++;
      maxActive = Math.max(maxActive, active);
      activeIds.add(record.callId);
    } else {
      assert.equal(activeIds.delete(record.callId), true);
      active--;
      previousEnd = record.time;
    }
  }
  assert.equal(active, 0);
  assert.equal(maxActive, 1);
  assert.ok(timerGapChecks >= 2, 'At least two timer-only intervals must be observed.');
  assert.ok(startsAtUnmount >= 3, 'Repeated timer refreshes must actually run.');
  evidence.push({
    check:
      'A query subscription serializes rapid refetch and timer refreshes, schedules after completion, and stops future refreshes when unmounted.',
    starts: startsAtUnmount,
    maxActive,
    timerGapChecks,
  });

  const pixels = await frame
    .getByRole('img', { name: 'Canvas rectangle', exact: true })
    .evaluate((canvas) => {
      const context = canvas.getContext('2d');
      return context
        ? {
            painted: Array.from(context.getImageData(12, 12, 1, 1).data),
            outside: Array.from(context.getImageData(0, 0, 1, 1).data),
          }
        : null;
    });
  assert.deepEqual(pixels, { painted: [18, 52, 86, 255], outside: [0, 0, 0, 0] });
  evidence.push({
    check:
      'An ordinary React canvas ref and effect paint the expected rectangle inside the real panel iframe.',
    pixels,
  });

  const invalid = join(root, 'invalid-query.tsx');
  await writeFile(
    invalid,
    `import{definePanel,serverAction,useQuery,z}from'@qoggy/paneon/sdk';export const mutation=serverAction({input:z.object({}),handler:()=>({ok:true})});function Panel(){const result=useQuery(mutation,{});return <div>{String(result.loading)}</div>}export default definePanel({id:'invalid-query',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:Panel});`,
  );
  await assert.rejects(
    service.runtime.run(invalid, root, {}, false),
    (error) =>
      error.code === 'BUILD_FAILED' &&
      /mutation/.test(error.details?.diagnostic ?? '') &&
      /query/.test(error.details?.diagnostic ?? ''),
  );
  evidence.push({
    check: 'A mutation passed to useQuery is rejected by the real TypeScript panel build.',
  });

  let attempts = 0;
  let resolveExecuted, rejectExecuted;
  const executed = new Promise((resolve, reject) => {
    resolveExecuted = resolve;
    rejectExecuted = reject;
  });
  await page.route(`**/api/panels/${panel.instanceId}/actions/**`, async (route) => {
    if (!decodeURIComponent(new URL(route.request().url()).pathname).endsWith('/panel.tsx#mutate'))
      return route.continue();
    attempts++;
    try {
      const response = await route.fetch();
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.data.count, attempts);
      // The real handler has finished. Lose only its response to the trusted host.
      await route.abort('failed');
      resolveExecuted();
    } catch (error) {
      rejectExecuted(error);
      await route.abort('failed');
    }
  });
  await frame.getByRole('button', { name: 'Perform mutation once', exact: true }).click();
  await executed;
  await frame
    .getByLabel('Mutation result', { exact: true })
    .filter({ hasText: 'may have completed' })
    .waitFor();
  assert.equal(await mutationCount(), 1);
  assert.equal(attempts, 1);
  await delay(1200);
  assert.equal(await mutationCount(), 1);
  assert.equal(attempts, 1);
  evidence.push({
    check:
      'The backend mutation executes once before its browser response is lost, then the panel reports an unknown result without retrying.',
    attempts,
  });

  assert.ok(streamSockets.size > 0, 'A real WebSocket must be open before disconnecting it.');
  const beforeReconnect = streamRequests;
  // Browser offline emulation does not reliably interrupt already-open loopback streams.
  // End the exact real transport connection instead; the host must reconnect its WebSocket.
  for (const socket of streamSockets) socket.terminate();
  await page.getByText('Reconnecting to Paneon…', { exact: true }).waitFor();
  await page.getByText('Reconnecting to Paneon…', { exact: true }).waitFor({ state: 'hidden' });
  assert.ok(streamRequests > beforeReconnect, 'The host must open a new real WebSocket.');
  await delay(500);
  assert.equal(await mutationCount(), 1);
  assert.equal(attempts, 1);
  await page.reload();
  await frame.getByRole('heading', { name: 'Query lifecycle test', exact: true }).waitFor();
  await delay(600);
  assert.equal(await mutationCount(), 1);
  assert.equal(attempts, 1);
  evidence.push({
    check:
      'Actual WebSocket disconnection/reconnection and a page reload do not replay the mutation.',
    attempts,
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, evidence }, null, 2));
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
