import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { SKILL_ROOT } from '../skill-paths.ts';
import { startServer } from '../runtime-fixture.ts';
import { startGithubPRFixture } from './github-pr-fixture.mjs';
import { selectAnnotationText, submitAnnotations } from './annotation-tools.mjs';

const execute = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'paneon-panel-annotation-submission-'));
const selected = 'Earlier selected content 🙂';
const comment = 'Keep the complete opinion.';
let service, github, browser;

// Exercise each real page's onSubmit, including its server actions and durable event storage.
// The test controller changes only saved coordinates/quote; it never replaces submission.
async function instrument(entry) {
  const source = await readFile(entry, 'utf8');
  const render = source.match(/render:\s*(\w+),\s*\}\);?\s*$/);
  assert.ok(render, 'The real panel supplies its render component');
  await writeFile(
    entry,
    source.replace(render[0], render[0].replace(render[1], 'SubmissionProbePage')) +
      `
import {useAnnotations as useSubmissionProbe} from '@qoggy/paneon/ui';
function Probe() {
  const feedback = useSubmissionProbe();
  return <>
    <button onClick={() => {
      const annotation = feedback.value.annotations[0];
      feedback.updateAnnotation(annotation.id, {
        targets: annotation.targets.map(target => target.text && target.type !== 'mermaid'
          ? {...target, text: {...target.text, end: target.text.end + 10000, quote: ${JSON.stringify(selected)}}}
          : target),
        comment: annotation.comment,
      });
    }}>Change saved coordinates</button>
    <output data-probe hidden>{JSON.stringify({value: feedback.value, submitting: feedback.submitting, error: feedback.error})}</output>
  </>;
}
function SubmissionProbePage() {return <><${render[1]}/><Probe/></>;}
`,
  );
  return entry;
}

async function check(runtime, panel, selector, name) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const origin = `http://127.0.0.1:${runtime.descriptor.port}`;
    await page.goto(`${origin}/panels/${panel.instanceId}`);
    const frame = page.frameLocator('iframe');
    await selectAnnotationText(frame, selector, 0, 4);
    await frame.locator('[data-annotation-action]').click();
    await frame.locator('[data-annotation-editor] textarea').fill(comment);
    await frame.getByRole('button', { name: /^(Save|保存)$/, exact: true }).click();
    await frame.getByRole('button', { name: 'Change saved coordinates', exact: true }).click();
    const state = async () => JSON.parse(await frame.locator('[data-probe]').textContent());
    const before = (await state()).value;
    assert.equal(before.annotations[0].targets[0].text.quote, selected);

    const eventUrl = `${origin}/api/panels/${panel.instanceId}/events`;
    await page.route(eventUrl, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: false,
              error: { code: 'TEST_FAILURE', message: 'Test delivery failed' },
            }),
          })
        : route.continue(),
    );
    const failed = page.waitForResponse(
      (response) => response.url() === eventUrl && response.request().method() === 'POST',
    );
    await submitAnnotations(frame);
    assert.equal((await failed).status(), 500, `${name}: ranges must not prevent the actual send`);
    await frame.getByRole('alert').filter({ hasText: 'Test delivery failed' }).first().waitFor();
    assert.deepEqual((await state()).value, before, `${name}: failed delivery keeps the draft`);
    assert.equal((await state()).submitting, false);
    assert.equal(
      (await runtime.runtime.events(panel.instanceId, 'submission-regression', 100, 0)).events
        .length,
      0,
    );

    await page.unroute(eventUrl);
    const delivered = page.waitForResponse(
      (response) => response.url() === eventUrl && response.request().method() === 'POST',
    );
    await submitAnnotations(frame);
    assert.equal((await delivered).status(), 200);
    const events = (await runtime.runtime.events(panel.instanceId, 'submission-regression', 100, 0))
      .events;
    assert.equal(events.length, 1);
    assert.ok(
      JSON.stringify(events[0].payload).includes(selected),
      `${name}: saved quote survives publication`,
    );
    assert.ok(
      JSON.stringify(events[0].payload).includes(comment),
      `${name}: comment survives publication`,
    );
    assert.deepEqual((await state()).value, before);
    assert.deepEqual(errors, []);
    console.log(
      `${name}: unmatched quote/range delivered intact; failed send retained its draft and retry succeeded.`,
    );
  } finally {
    await page.close();
  }
}

try {
  const skill = join(root, 'skill');
  await cp(process.env.PANEON_TEST_SKILL_SOURCE ?? SKILL_ROOT, skill, { recursive: true });
  await writeFile(join(root, 'plan.ts'), 'export const value = 1;\n');
  await execute('git', ['init', '-q', root]);
  await execute('git', ['-C', root, 'add', 'plan.ts']);
  await execute('git', [
    '-C',
    root,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '-qm',
    'Original',
  ]);
  await writeFile(join(root, 'proposed.ts'), 'export const value = 2;\n');
  await writeFile(join(root, 'plan.ts'), 'export const value = 3;\n');
  service = await startServer(join(root, 'runtime'));
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  for (const [name, params, selector] of [
    ['file-review', { files: ['plan.ts'] }, '[data-file-review-viewport] [data-code-line="1"]'],
    [
      'diff-review',
      { files: [{ oldPath: 'plan.ts', newPath: 'proposed.ts' }] },
      '[data-code-side="new"][data-line="1"]',
    ],
    [
      'table',
      {
        title: 'Submission',
        columns: [{ key: 'name', label: 'Name' }],
        rows: [{ name: 'Original cell text' }],
      },
      'tbody [data-annotation-text]',
    ],
    [
      'git-review',
      {
        repositories: [root],
        initialView: { repositoryPath: root, type: 'changes', file: 'plan.ts' },
      },
      '[data-code-side="new"][data-line="1"]',
    ],
  ]) {
    const entry = await instrument(join(skill, `assets/panels/${name}/panel.tsx`));
    const panel = await service.runtime.run(entry, root, params, false);
    await check(service, panel, selector, name);
  }
  github = await startGithubPRFixture();
  const entry = await instrument(join(github.skill, 'assets/examples/github-pr/panel.tsx'));
  const panel = await github.service.runtime.run(entry, github.root, github.params, false);
  await check(github.service, panel, '[data-markdown-annotation] h1', 'github-pr');
} finally {
  await browser?.close();
  await github?.stop();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
