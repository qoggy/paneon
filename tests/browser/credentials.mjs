import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startServer } from '../../dist/runtime/server.js';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = await mkdtemp(join(tmpdir(), 'paneon-host-credentials-'));
const entry = join(root, 'panel.tsx');
const data = join(root, 'data');
const source = await readFile(join(repository, 'tests/browser/credential-panel.txt'), 'utf8');
await writeFile(entry, source);
const plaintext = `dummy-${randomUUID()}\nquote-"-apostrophe-'`;
const shortPlaintext = `short-${randomUUID()}`;
let service;
let browser;
const evidence = [];
async function scan(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) await scan(path);
    else if (item.isFile()) {
      const bytes = await readFile(path);
      for (const secret of [plaintext, shortPlaintext]) {
        assert.equal(
          bytes.includes(Buffer.from(secret)),
          false,
          'Framework files must not contain credential plaintext.',
        );
        assert.equal(
          bytes.includes(Buffer.from(JSON.stringify(secret).slice(1, -1))),
          false,
          'Framework files must not contain serialized credential plaintext.',
        );
      }
    }
  }
}
try {
  service = await startServer(data);
  let panel = await service.runtime.run(entry, root, {}, true);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (window === window.top) {
      window.__paneonMessages = [];
      window.addEventListener('message', (event) => {
        if (event.data?.paneon === true) window.__paneonMessages.push(event.data);
      });
    }
  });
  const visit = () =>
    page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  await visit();
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'Credential runtime test', exact: true }).waitFor();
  const frameCanReadHost = await frame.locator('body').evaluate(() => {
    try {
      void parent.document.body;
      return true;
    } catch {
      return false;
    }
  });
  assert.equal(frameCanReadHost, false);
  evidence.push('Actual sandboxed iframe cannot read trusted host DOM.');
  const result = frame.getByLabel('Action result');
  async function provide(button, value, multiline = false) {
    await frame.getByRole('button', { name: button, exact: true }).click();
    await page.getByRole('dialog').waitFor();
    const dialogText = await page.getByRole('dialog').textContent();
    assert.ok(dialogText.includes(panel.revision));
    assert.ok(
      dialogText.includes(
        button === 'Request short credential'
          ? 'panel.tsx#shortAction'
          : 'panel.tsx#protectedAction',
      ),
    );
    if (button === 'Request short credential') assert.ok(dialogText.includes('1 second'));
    assert.equal(await frame.getByRole('dialog').count(), 0);
    if (multiline)
      await page
        .getByRole('switch', { name: 'Multiline input (shown as text)', exact: true })
        .click();
    const input = page.getByLabel('Credential', { exact: true });
    const handle = await input.elementHandle();
    await input.fill(value);
    await page.getByRole('button', { name: 'Provide', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(
      await handle.evaluate((node) => node.value),
      '',
      'Submitted/unmounted input is cleared.',
    );
    await result.filter({ hasText: 'ready' }).waitFor();
    const ref = await frame
      .getByLabel(
        button === 'Request short credential'
          ? 'Short credential reference'
          : 'Credential reference',
        { exact: true },
      )
      .textContent();
    assert.match(ref, /^[0-9a-f-]{36}$/);
    const messages = JSON.stringify(await page.evaluate(() => window.__paneonMessages));
    assert.equal(
      messages.includes(value) || messages.includes(JSON.stringify(value).slice(1, -1)),
      false,
      'Bridge messages must contain references rather than plaintext.',
    );
    assert.equal((await frame.locator('body').textContent()).includes(value), false);
    return ref;
  }
  await frame.getByRole('button', { name: 'Request credential', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  const cancelled = await page.getByLabel('Credential', { exact: true }).elementHandle();
  await page.getByLabel('Credential', { exact: true }).fill('cancelled-dummy');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await result.filter({ hasText: 'CREDENTIAL_CANCELLED' }).waitFor();
  assert.equal(await cancelled.evaluate((node) => node.value), '');
  evidence.push('Cancel clears the host input and sends only a cancellation error to the panel.');
  const observed = await page.evaluate(() =>
    window.__paneonMessages.find(
      (message) => message.direction === 'request' && message.method === 'credential',
    ),
  );
  assert.ok(observed);
  await page.evaluate(
    (message) => window.postMessage({ ...message, requestId: 'forged-parent-source' }, '*'),
    observed,
  );
  for (const changes of [
    { channelId: 'forged-channel' },
    { instanceId: 'different-instance' },
    { revision: 'old-revision' },
    { requestId: '../invalid' },
  ]) {
    await frame
      .locator('body')
      .evaluate(
        (_node, { message, changes }) =>
          parent.postMessage({ ...message, requestId: crypto.randomUUID(), ...changes }, '*'),
        { message: observed, changes },
      );
  }
  await delay(200);
  assert.equal(await page.getByRole('dialog').count(), 0);
  const directCredentialAccess = await frame.locator('body').evaluate(async (_node, origin) => {
    try {
      const response = await fetch(origin + '/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'not-a-real-credential' }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }, `http://127.0.0.1:${service.descriptor.port}`);
  assert.equal(directCredentialAccess, false);
  evidence.push(
    'Forged source/channel/instance/revision/request IDs cannot open credential UI; opaque iframe cannot directly access host credential API.',
  );

  let ref = await provide('Request credential', plaintext, true);
  await frame.getByRole('button', { name: 'Use credential', exact: true }).click();
  await result.filter({ hasText: 'length' }).waitFor();
  const used = JSON.parse(await result.textContent());
  assert.equal(used.length, plaintext.length);
  assert.equal(used.newline, true);
  assert.equal(used.quote, true);
  await frame.getByRole('button', { name: 'Wrong action', exact: true }).click();
  await result.filter({ hasText: 'CREDENTIAL_BINDING_MISMATCH' }).waitFor();
  await frame.getByRole('button', { name: 'Leak credential', exact: true }).click();
  await result.filter({ hasText: 'SECRET_OUTPUT_BLOCKED' }).waitFor();
  assert.equal((await page.locator('body').textContent()).includes(plaintext), false);
  evidence.push(
    'A multiline quoted value is preserved for the bound function; another action is rejected and returning plaintext is blocked.',
  );
  await page.getByRole('button', { name: 'Revoke', exact: true }).last().click();
  await page.getByText('revoked', { exact: true }).waitFor();
  await frame.getByRole('button', { name: 'Use credential', exact: true }).click();
  await result.filter({ hasText: 'CREDENTIAL_EXPIRED' }).waitFor();
  await provide('Request short credential', shortPlaintext);
  await page.getByText('expired', { exact: true }).waitFor({ timeout: 5000 });
  await frame.getByRole('button', { name: 'Use short credential', exact: true }).click();
  await result.filter({ hasText: 'CREDENTIAL_EXPIRED' }).waitFor();
  evidence.push(
    'User revocation and declared TTL invalidate subsequent use and are shown by the host.',
  );
  const inUseRef = await provide('Request short credential', shortPlaintext);
  const inUseResult = service.runtime.invoke(
    panel.instanceId,
    panel.revision,
    'panel.tsx#shortAction',
    { credential: inUseRef, leak: true, hold: true },
  );
  let entered = false;
  for (let i = 0; i < 100; i++) {
    try {
      entered = (await readFile(join(root, 'in-use.txt'), 'utf8')) === 'entered';
      if (entered) break;
    } catch {}
    await delay(10);
  }
  assert.equal(
    entered,
    true,
    'The actual author callback must enter before checking retained output protection.',
  );
  await delay(1100);
  await assert.rejects(
    service.runtime.append(panel.instanceId, panel.revision, 'feedback', { text: shortPlaintext }),
    { code: 'SECRET_OUTPUT_BLOCKED' },
  );
  await assert.rejects(inUseResult, { code: 'SECRET_OUTPUT_BLOCKED' });
  assert.doesNotThrow(() => service.runtime.credentials.check({ text: shortPlaintext }));
  evidence.push(
    'An expired in-flight use keeps protecting event/result boundaries until callback completion, then releases its output-check reference.',
  );
  ref = await provide('Request credential', plaintext, true);
  const previousRevision = panel.revision;
  await writeFile(entry, source.replace("paneon:'0.0.0'", "paneon:'>=99.0.0'"));
  await page.getByText('PANEON_VERSION_UNSUPPORTED', { exact: true }).waitFor({ timeout: 60000 });
  await frame.getByRole('heading', { name: 'Credential runtime test', exact: true }).waitFor();
  assert.equal(service.runtime.inspect(panel.instanceId).revision, previousRevision);
  await frame.getByRole('button', { name: 'Use credential', exact: true }).click();
  await result.filter({ hasText: 'length' }).waitFor();
  await writeFile(
    entry,
    source.replace('Credential runtime test', 'Updated credential runtime test'),
  );
  try {
    await frame
      .getByRole('heading', { name: 'Updated credential runtime test', exact: true })
      .waitFor({ timeout: 60000 });
  } catch (error) {
    const current = service.runtime.inspect(panel.instanceId);
    console.error(
      JSON.stringify({
        phase: 'successful-revision-after-build-error',
        previousRevision,
        revision: current.revision,
        status: current.status,
        diagnostic: current.diagnostic,
        errors,
        frameSource: await page.locator('iframe').getAttribute('src'),
        headings: await frame.getByRole('heading').allTextContents(),
      }),
    );
    throw error;
  }
  panel = service.runtime.inspect(panel.instanceId);
  assert.notEqual(panel.revision, previousRevision);
  await assert.rejects(
    service.runtime.invoke(panel.instanceId, panel.revision, 'panel.tsx#protectedAction', {
      credential: ref,
      leak: false,
    }),
    { code: 'CREDENTIAL_EXPIRED' },
  );
  evidence.push(
    'WebSocket shows a failed source update while retaining the old usable frame, then loads a successful revision and invalidates its old credential.',
  );
  const closingRef = await provide('Request credential', plaintext, true);
  await frame.getByRole('button', { name: 'Request credential', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('switch', { name: 'Multiline input (shown as text)', exact: true }).click();
  const closingInput = await page.getByLabel('Credential', { exact: true }).elementHandle();
  await page.getByLabel('Credential', { exact: true }).fill(plaintext);
  await service.runtime.closePanel(panel.instanceId);
  await page.getByRole('heading', { name: 'Panel closed', exact: true }).waitFor();
  assert.equal(
    await closingInput.evaluate((node) => node.value),
    '',
    'Closing the panel clears a still-pending credential input.',
  );
  assert.throws(
    () =>
      service.runtime.credentials.get(closingRef, {
        instanceId: panel.instanceId,
        revision: panel.revision,
        actionId: 'panel.tsx#protectedAction',
      }),
    { code: 'CREDENTIAL_EXPIRED' },
  );
  evidence.push('Closing the panel removes its frame and invalidates stored references.');
  panel = await service.runtime.run(entry, root, {}, false);
  await visit();
  await frame
    .getByRole('heading', { name: 'Updated credential runtime test', exact: true })
    .waitFor();
  const restartRef = await provide('Request credential', plaintext, true);
  await scan(root);
  let stopDeadline;
  try {
    await Promise.race([
      service.stop(),
      new Promise((_, reject) => {
        stopDeadline = setTimeout(
          () => reject(new Error('Service stop must close its open WebSocket.')),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(stopDeadline);
  }
  service = undefined;
  service = await startServer(data);
  const restored = service.runtime.inspect(panel.instanceId);
  assert.equal(restored.status, 'running');
  await assert.rejects(
    service.runtime.invoke(panel.instanceId, restored.revision, 'panel.tsx#protectedAction', {
      credential: restartRef,
      leak: false,
    }),
    { code: 'CREDENTIAL_EXPIRED' },
  );
  await visit();
  await frame
    .getByRole('heading', { name: 'Updated credential runtime test', exact: true })
    .waitFor();
  assert.equal(await page.getByText('Temporary credentials', { exact: true }).count(), 0);
  await scan(root);
  assert.deepEqual(errors, []);
  evidence.push(
    'Restart restores panel configuration without credentials; framework files contain neither plaintext nor its JSON serialization.',
  );
  console.log(JSON.stringify({ ok: true, evidence }, null, 2));
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
