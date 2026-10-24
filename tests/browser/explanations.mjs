import { verifySentinel } from './sentinel-leap-array.mjs';
import { verifyDiningPhilosophers } from './dining-philosophers.mjs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { startExplanationsFixture } from './explanations-fixture.mjs';

const fixture = await startExplanationsFixture();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await verifyDiningPhilosophers(page, fixture);
  await verifySentinel(page, fixture);
  const cli = async (...args) => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        process.env.PANEON_TEST_CLI_ENTRY ??
          new URL('../../dist/cli/index.js', import.meta.url).pathname,
        'panel',
        ...args,
        '--json',
      ],
      { env: { ...process.env, HOME: fixture.root }, cwd: fixture.root },
    );
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    return result.data;
  };
  const read = await cli(
    'events',
    fixture.panels['dining-philosophers'].instanceId,
    '--consumer',
    'explanation-cli',
    '--wait-ms',
    '0',
  );
  assert.equal(read.events.length, 0, 'dining philosophers has no feedback events');
  assert.deepEqual(errors, []);
  console.log(
    'Chrome: copied examples render; dining philosophers with three acquisition strategies, playback/rewind, local-only exploration + no annotation controls or events; Sentinel editable requests, QPS checks, time scrubbing, playback, strict expiration and lazy reset pass.',
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
