import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { prepareRuntimeHome } from './runtime-fixture.ts';

export const execute = promisify(execFile);
export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function startHttp(script, cwd, port = 0) {
  const child = spawn(process.execPath, [script, String(port)], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = await new Promise((resolveUrl, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error('Demo HTTP service did not start.')), 10_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', () => {
      clearTimeout(timeout);
      reject(new Error('Demo HTTP service exited before listening.'));
    });
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      if (!buffer.includes('\n')) return;
      try {
        const data = JSON.parse(buffer.slice(0, buffer.indexOf('\n')));
        clearTimeout(timeout);
        resolveUrl(data.url);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  });
  return { child, url };
}
async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolveExit) => {
    child.once('exit', resolveExit);
    child.kill('SIGTERM');
  });
}
async function waitForText(locator, text) {
  await locator
    .getByText(text, { exact: false })
    .first()
    .waitFor({ state: 'visible', timeout: 60_000 });
}

export async function acceptance({ cliPath, fixturesPath, label = 'repository' }) {
  const scratch = await mkdtemp(join(tmpdir(), 'paneon-acceptance-'));
  const home = join(scratch, 'home');
  const workspace = join(scratch, 'workspace');
  const artifacts =
    process.env.PANEON_TEST_ARTIFACTS || (await mkdtemp(join(tmpdir(), 'paneon-evidence-')));
  await Promise.all([mkdir(home), mkdir(workspace), mkdir(artifacts, { recursive: true })]);
  await cp(fixturesPath, join(workspace, 'fixtures/panels'), { recursive: true });
  const env = { ...process.env, HOME: home };
  // HOME isolates os.homedir(); this does not add a Paneon storage override.
  delete env.PANEON_HOME;
  const command = async (...args) => {
    const { stdout, stderr } = await execute(process.execPath, [cliPath, ...args, '--json'], {
      cwd: workspace,
      env,
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true, `${args.join(' ')}: ${stderr}`);
    return result.data;
  };
  const run = (file, params = {}, ...options) =>
    command(
      'panel',
      'run',
      join(workspace, 'fixtures/panels', file),
      '--cwd',
      workspace,
      '--params',
      JSON.stringify(params),
      ...options,
    );
  let browser;
  let http;
  const evidence = [];
  let failure;
  try {
    assert.equal((await command('server', 'status')).running, false);
    prepareRuntimeHome(join(home, '.paneon'));
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PANEON_TEST_BROWSER
        ? { executablePath: process.env.PANEON_TEST_BROWSER }
        : {}),
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(60_000);
    const runtime = await run('release-panel.tsx');
    await page.goto(runtime.url);
    const panel = page.frameLocator('iframe');
    await panel.getByRole('heading', { name: 'Release workspace' }).waitFor();
    await waitForText(panel, 'feature/search');
    await panel.getByLabel('Branch to integrate').fill('feature/browser-proof');
    await panel.getByRole('button', { name: 'Add branch', exact: true }).click();
    await waitForText(panel, 'Branch added to the demo integration area.');
    await waitForText(panel, 'feature/browser-proof');
    await panel.getByRole('button', { name: 'Advance demo step' }).click();
    await waitForText(panel, 'Demo step completed.');
    await waitForText(panel, 'Completed step 1');
    await panel.getByRole('button', { name: 'Ask AI to analyze' }).click();
    await waitForText(panel, 'Submitted to AI.');
    const first = await command('panel', 'events', runtime.instanceId, '--consumer', 'acceptance');
    assert.equal(first.events.length, 1);
    assert.equal(first.events[0].type, 'analyze-requested');
    assert.equal(first.events[0].payload.environment, 'staging');
    const repeated = await command(
      'panel',
      'events',
      runtime.instanceId,
      '--consumer',
      'acceptance',
    );
    assert.deepEqual(repeated.events, first.events, 'Reading must not acknowledge.');
    await command(
      'panel',
      'ack',
      runtime.instanceId,
      '--consumer',
      'acceptance',
      '--through',
      String(first.events[0].id),
    );
    assert.deepEqual(
      (await command('panel', 'events', runtime.instanceId, '--consumer', 'acceptance')).events,
      [],
    );
    await page.screenshot({ path: join(artifacts, `${label}-cli-panel.png`), fullPage: true });
    evidence.push(
      'CLI example: real iframe click, application-owned execFile, result, history, event redelivery and explicit ack',
    );

    http = await startHttp(join(workspace, 'fixtures/panels/demo-http-server.mjs'), workspace);
    const counter = await run('http-panel.tsx', { baseUrl: http.url });
    await page.goto(counter.url);
    await panel.getByRole('heading', { name: 'HTTP counter' }).waitFor();
    await waitForText(panel, 'Counter: 0');
    await panel.getByLabel('Increment amount').fill('3');
    await panel.getByRole('button', { name: 'Increment directly' }).click();
    await waitForText(panel, 'Counter updated to 3.');
    await waitForText(panel, 'Counter: 3');
    await panel.getByRole('button', { name: 'Ask AI about counter' }).click();
    await waitForText(panel, 'Submitted to AI.');
    const counterEvents = await command(
      'panel',
      'events',
      counter.instanceId,
      '--consumer',
      'acceptance',
    );
    assert.equal(counterEvents.events[0].payload.counter, 3);
    await stopProcess(http.child);
    await panel.getByRole('button', { name: 'Refresh counter' }).click();
    await waitForText(panel, 'Start the demo HTTP server');
    await page.screenshot({ path: join(artifacts, `${label}-http-error.png`), fullPage: true });
    evidence.push(
      'HTTP example: author fetch mutation, query refresh, explicit event and failed-backend feedback',
    );

    const decision = await run('decision-panel.tsx');
    await page.goto(decision.url);
    await panel.getByRole('heading', { name: 'Compare architecture options' }).waitFor();
    await panel.getByRole('button', { name: 'Calculate example load' }).click();
    await waitForText(panel, 'Origin requests for 100 reads: 20.');
    await panel.getByRole('switch', { name: 'Enable cache in the diagram' }).click();
    await panel.getByRole('img', { name: 'Client directly to origin', exact: true }).waitFor();
    await panel.getByLabel('Feedback for AI').fill('请补充失败恢复方案\n然后再讨论');
    await panel.getByRole('button', { name: 'Submit decision to AI' }).click();
    await waitForText(panel, 'Submitted to AI.');
    const decisionEvents = await command(
      'panel',
      'events',
      decision.instanceId,
      '--consumer',
      'acceptance',
    );
    assert.equal(decisionEvents.events[0].payload.comment, '请补充失败恢复方案\n然后再讨论');
    const decisionFile = join(workspace, 'fixtures/panels/decision-panel.tsx');
    const original = await readFile(decisionFile, 'utf8');
    await writeFile(
      decisionFile,
      original
        .replace('Compare architecture options', 'Updated architecture options')
        .replace('input.requests * 0.2', 'input.requests * 0.5'),
    );
    await panel
      .getByRole('heading', { name: 'Updated architecture options' })
      .waitFor({ timeout: 120_000 });
    await panel.getByRole('button', { name: 'Calculate example load' }).click();
    await waitForText(panel, 'Origin requests for 100 reads: 50.');
    const updated = await command('panel', 'inspect', decision.instanceId);
    assert.notEqual(updated.revision, decision.revision);
    assert.equal(updated.watch, true);
    assert.equal(
      (await command('panel', 'events', decision.instanceId, '--consumer', 'acceptance')).events[0]
        .id,
      decisionEvents.events[0].id,
    );
    await page.screenshot({
      path: join(artifacts, `${label}-updated-svg-panel.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join(artifacts, `${label}-narrow-panel.png`), fullPage: true });
    evidence.push(
      'Pure function, custom SVG interaction, multiline Chinese event, actual frontend and Node action source update',
    );

    const manual = await run('table-panel.tsx', {}, '--no-watch');
    const tableFile = join(workspace, 'fixtures/panels/table-panel.tsx');
    await writeFile(
      tableFile,
      (await readFile(tableFile, 'utf8')).replace('Table with actions', 'Manually updated table'),
    );
    assert.equal((await command('panel', 'inspect', manual.instanceId)).watch, false);
    const reloaded = await command('panel', 'reload', manual.instanceId);
    assert.equal(reloaded.watch, false);
    assert.equal(reloaded.changed, true);
    await page.goto((await command('panel', 'inspect', manual.instanceId)).url);
    await panel.getByRole('heading', { name: 'Manually updated table' }).waitFor();
    await panel.getByLabel('Filter options').fill('no such option');
    await waitForText(panel, 'No matching options.');
    await panel.getByLabel('Filter options').fill('Option 12');
    assert.equal(
      await panel.getByRole('link', { name: 'Go to next page' }).getAttribute('aria-disabled'),
      'true',
    );
    evidence.push(
      'Explicit no-watch retained through manual reload, empty and single-page table states',
    );

    await command('server', 'stop');
    assert.equal((await command('server', 'status')).running, false);
    // Starting another instance restarts the service and restores compatible instances.
    await run('form-panel.tsx');
    const restored = await command('panel', 'inspect', decision.instanceId);
    assert.equal(restored.instanceId, decision.instanceId);
    assert.equal(restored.watch, true);
    assert.equal(
      (await command('panel', 'events', runtime.instanceId, '--consumer', 'acceptance')).lastAckId,
      first.events[0].id,
    );
    assert.equal(
      (await command('panel', 'events', decision.instanceId, '--consumer', 'acceptance')).events[0]
        .id,
      decisionEvents.events[0].id,
    );
    await page.goto(restored.url);
    await panel.getByRole('heading', { name: 'Updated architecture options' }).waitFor();
    await command(
      'panel',
      'ack',
      decision.instanceId,
      '--consumer',
      'acceptance',
      '--through',
      String(decisionEvents.events[0].id),
    );
    await command('panel', 'close', manual.instanceId);
    assert.equal((await command('panel', 'inspect', manual.instanceId)).status, 'closed');
    evidence.push(
      'Independent CLI processes, service restart, existing instance URL recovery, saved event and ack position recovery',
    );

    const files = await execute(process.execPath, [
      '-e',
      "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);console.log(JSON.stringify(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").all()));",
      join(home, '.paneon/runtime.sqlite'),
    ]);
    const tables = JSON.parse(files.stdout).map((row) => row.name);
    assert.deepEqual(
      tables.filter((name) => name !== 'sqlite_sequence'),
      ['consumers', 'events', 'panels', 'schema_meta'],
    );
    const report = { label, evidence, artifacts, tables };
    await writeFile(join(artifacts, `${label}-report.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return report;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    await browser?.close();
    await stopProcess(http?.child);
    try {
      await command('server', 'stop');
    } catch (cleanupError) {
      if (!failure) throw cleanupError;
      console.error('Runtime cleanup also failed:', cleanupError.message);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }
}
