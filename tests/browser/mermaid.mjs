import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startMermaidFixture } from './mermaid-fixture.mjs';

async function until(check, message) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(50);
  }
  throw new Error(message);
}

const fixture = await startMermaidFixture();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  const pageErrors = [];
  const externalRequests = [];
  const failedResponses = [];
  const origin = new URL(fixture.url).origin;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin)
      externalRequests.push(request.url());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(fixture.url);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'Mermaid acceptance', exact: true }).waitFor();
  const diagram = (name) => frame.locator(`[data-testid="${name}"]`);
  for (const name of ['standalone-flow', 'standalone-sequence', 'editable', 'toggled'])
    await diagram(name).locator('svg[id^="mermaid-"]').waitFor({ state: 'visible' });
  await until(
    async () => (await diagram('markdown-diagrams').locator('svg[id^="mermaid-"]').count()) === 4,
    'All four Markdown diagrams, including a list and quote, must render.',
  );
  for (const svg of await diagram('markdown-diagrams').locator('svg[id^="mermaid-"]').all())
    assert.equal(await svg.isVisible(), true);

  assert.equal(
    await frame.locator('pre svg').count(),
    0,
    'Diagrams must replace code block wrappers.',
  );
  assert.equal(await frame.locator('li svg[id^="mermaid-"]').count(), 1);
  assert.equal(await frame.locator('blockquote svg[id^="mermaid-"]').count(), 1);
  assert.equal(
    await frame.locator('pre code.language-typescript').textContent(),
    'const text = "ordinary code";\n',
  );
  assert.equal(
    await frame
      .locator('code')
      .filter({ hasText: /^mermaid$/ })
      .count(),
    1,
  );

  const contentFrame = page.frames().find((candidate) => candidate.url().endsWith('/frame.html'));
  assert.ok(contentFrame);
  async function checkDocument() {
    await until(
      async () => (await frame.getByRole('status').count()) === 0,
      'All active diagram renders must settle.',
    );
    await until(
      () =>
        contentFrame.evaluate(() =>
          [...document.body.children].every(
            (element) => element.id === 'root' || element.tagName === 'SCRIPT',
          ),
        ),
      'Temporary rendering containers must eventually be removed.',
    );
    const state = await contentFrame.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
      return {
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
        outsideRoot: [...document.body.children]
          .filter((element) => element.id !== 'root' && element.tagName !== 'SCRIPT')
          .map((element) => element.outerHTML),
        markdownExecuted: window.__markdownExecuted === true,
      };
    });
    assert.deepEqual(state.duplicateIds, [], 'All graph and marker IDs must be unique.');
    assert.deepEqual(
      state.outsideRoot,
      [],
      'Mermaid must clean up temporary rendering/error containers.',
    );
    assert.equal(state.markdownExecuted, false);
  }
  await checkDocument();
  await frame.getByRole('button', { name: 'Update Markdown', exact: true }).click();
  await until(
    async () => (await diagram('markdown-diagrams').textContent()).includes('MarkdownUpdated'),
    'Markdown diagrams must update with their source.',
  );

  await frame.getByRole('button', { name: 'Invalid diagram', exact: true }).click();
  await diagram('editable').getByRole('alert').waitFor();
  assert.equal(await diagram('editable').locator('svg[id^="mermaid-"]').count(), 0);
  assert.equal(await diagram('standalone-flow').locator('svg[id^="mermaid-"]').isVisible(), true);
  await checkDocument();
  await frame.getByRole('button', { name: 'Recover diagram', exact: true }).click();
  await diagram('editable').locator('svg[id^="mermaid-"]').waitFor({ state: 'visible' });
  await until(
    async () => (await diagram('editable').textContent()).includes('Recovered'),
    'Corrected source must recover without a reload.',
  );
  assert.equal(await diagram('editable').getByRole('alert').count(), 0);

  await frame
    .getByRole('textbox', { name: 'Diagram source' })
    .fill(
      [
        'flowchart LR',
        '  A["<img src=x onerror=window.__mermaidExecuted=true>"] --> B["Safe"]',
        '  click B "javascript:window.__mermaidExecuted=true"',
      ].join('\n'),
    );
  await until(
    async () => (await diagram('editable').textContent()).includes('Safe'),
    'Strict Mermaid input must render without executing HTML or unsafe links.',
  );
  await diagram('editable').locator('svg[id^="mermaid-"]').waitFor({ state: 'visible' });
  assert.equal(await contentFrame.evaluate(() => window.__mermaidExecuted === true), false);
  assert.equal(await diagram('editable').locator('script, [onerror]').count(), 0);
  const hrefs = await diagram('editable')
    .locator('[href], [xlink\\:href]')
    .evaluateAll((elements) =>
      elements.map(
        (element) => element.getAttribute('href') ?? element.getAttribute('xlink:href') ?? '',
      ),
    );
  assert.equal(
    hrefs.some((href) => /^\s*javascript:/i.test(href)),
    false,
  );
  await frame.getByRole('button', { name: 'Recover diagram', exact: true }).click();
  await until(
    async () => (await diagram('editable').textContent()).includes('Recovered'),
    'The diagram must remain editable after strict-mode rendering.',
  );

  await frame
    .getByRole('button', { name: 'Update lifecycle diagram', exact: true })
    .click({ clickCount: 12, delay: 1 });
  await frame.getByText('Lifecycle revision 12', { exact: true }).waitFor();
  await frame.getByRole('button', { name: 'Unmount diagram', exact: true }).click();
  assert.equal(await diagram('toggled').locator('svg[id^="mermaid-"]').count(), 0);
  assert.equal(await diagram('toggled').locator('svg[id^="mermaid-"]').count(), 0);
  await checkDocument();
  await frame.getByRole('button', { name: 'Mount diagram', exact: true }).click();
  await diagram('toggled').locator('svg[id^="mermaid-"]').waitFor({ state: 'visible' });
  await until(
    async () => (await diagram('toggled').textContent()).includes('Revision12'),
    'A remounted diagram must show the latest source.',
  );
  assert.equal((await diagram('toggled').textContent()).includes('Revision0'), false);
  await checkDocument();

  assert.deepEqual(externalRequests, [], 'Diagram assets must load locally without a CDN.');
  assert.deepEqual(failedResponses, []);
  assert.deepEqual(pageErrors, []);
  const artifacts = process.env.PANEON_TEST_ARTIFACTS;
  if (artifacts) {
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: join(artifacts, 'mermaid.png'), fullPage: true });
  }
  console.log(
    'Mermaid standalone and Markdown diagrams render locally; nesting, ordinary code, source updates, error recovery, unique IDs and unmount/remount pass.',
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
