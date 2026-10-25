import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../dist/runtime/server.js';

const root = await mkdtemp(join(tmpdir(), 'paneon-action-input-'));
const value = 'dummy-"key\\line\t中文';
let service, browser, page;
const errors = [];
const consoleErrors = [];
try {
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    `import { useState } from 'react';
import { createHash } from 'node:crypto';
import { definePanel, serverAction, agent, z } from 'paneon/sdk';
import { Input, Button } from 'paneon/ui';
export const authenticate = serverAction({
  input: z.object({ token: z.string().min(1) }),
  handler: async (_ctx, { token }) => ({ digest: createHash('sha256').update(token).digest('hex') }),
});
function Panel() {
  const [token, setToken] = useState('');
  const [digest, setDigest] = useState('');
  return <div>
    <Input aria-label="Token" type="password" required value={token} onChange={event => setToken(event.target.value)} />
    <Button onClick={async () => {
      const result = await authenticate({ token });
      setDigest(result.digest);
      setToken('');
    }}>Authenticate</Button>
    <output aria-label="Result">{digest}</output>
    <Button type="button" disabled={!digest} onClick={() => agent.emit('authenticated', { ok: true })}>Submit to agent</Button>
  </div>;
}
export default definePanel({
  id: 'action-input', requires: { paneon: '0.0.0' }, input: z.object({}),
  events: { authenticated: z.object({ ok: z.boolean() }) }, render: Panel,
});`,
  );
  service = await startServer(join(root, 'data'));
  const panel = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  page = await browser.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  await frame.getByLabel('Token', { exact: true }).fill(value);
  assert.equal(await frame.getByLabel('Token', { exact: true }).inputValue(), value);
  await frame.getByRole('button', { name: 'Authenticate', exact: true }).click();
  const digest = createHash('sha256').update(value).digest('hex');
  await frame.getByLabel('Result', { exact: true }).filter({ hasText: digest }).waitFor();
  assert.equal(await frame.getByLabel('Token', { exact: true }).inputValue(), '');
  const before = await service.runtime.events(panel.instanceId, 'test-agent', 100, 0);
  assert.deepEqual(before.events, []);
  await frame.getByRole('button', { name: 'Submit to agent', exact: true }).click();
  const submitted = await service.runtime.events(panel.instanceId, 'test-agent', 100, 10000);
  assert.equal(submitted.events.length, 1);
  assert.equal(submitted.events[0].type, 'authenticated');
  assert.deepEqual(submitted.events[0].payload, { ok: true });
  assert.deepEqual(errors, []);
  console.log(
    'Password input reaches a server action unchanged; action results and explicit agent events remain separate.',
  );
} catch (error) {
  console.error({ pageErrors: errors, consoleErrors });
  for (const frame of page?.frames() ?? [])
    console.error({ url: frame.url(), body: await frame.locator('body').innerText() });
  throw error;
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
