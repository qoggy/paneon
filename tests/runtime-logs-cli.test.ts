import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  renameSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { LogResult, LogEvent } from '../src/cli/logs.js';
type Envelope = { ok: boolean; data: LogResult };
const exec = promisify(execFile);
const cli = new URL('../dist/cli/index.js', import.meta.url).pathname;
function fixture(t: import('node:test').TestContext) {
  const home = mkdtempSync(join(tmpdir(), 'paneon-log-cli-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const directory = join(home, '.paneon/logs');
  mkdirSync(directory, { recursive: true });
  return { home, directory, env: { ...process.env, HOME: home, PANEON_LOG_LEVEL: 'info' } };
}
function record(msg: string, extra: Record<string, unknown> = {}) {
  return (
    JSON.stringify({
      schemaVersion: 1,
      time: '2026-10-23T12:00:00.000Z',
      level: 30,
      runtimeId: 'runtime-one',
      msg,
      ...extra,
    }) + '\n'
  );
}
void test('logs command reads after shutdown, handles JSON/debug, never starts runtime and rejects tail/level mistakes', async (t) => {
  const { home, directory, env } = fixture(t);
  writeFileSync(join(directory, 'runtime-one.jsonl'), record('earlier') + record('latest'));
  const { stdout, stderr } = await exec(
    process.execPath,
    [cli, 'server', 'logs', '--tail', '1', '--json', '--debug'],
    { env },
  );
  const result = JSON.parse(stdout) as Envelope;
  assert.equal(result.ok, true);
  assert.equal(result.data.records[0].msg, 'latest');
  assert.equal(result.data.truncated, true);
  assert.match(stderr, /\[debug\]/);
  assert(!existsSync(join(home, '.paneon/runtime.json')));
  for (const args of [
    ['--tail', '0'],
    ['--tail', '10001'],
    ['--level', 'trace'],
  ])
    await assert.rejects(
      exec(process.execPath, [cli, 'server', 'logs', ...args, '--json'], { env }),
      (e) => Number((e as { code: number }).code) === 1,
    );
  writeFileSync(
    join(directory, 'runtime-one.jsonl'),
    record('error', {
      level: 50,
      err: {
        type: 'Error',
        message: 'outer',
        stack: 'Error: outer\n    at example:1',
        cause: { message: 'inner', stack: 'Error: inner\n    at example:2' },
      },
    }),
  );
  const human = await exec(process.execPath, [cli, 'server', 'logs'], { env });
  assert.match(human.stdout, /Error: outer\n {4}at example:1/);
  assert.match(human.stdout, /Caused by: Error: inner\n/);
  assert.equal(human.stderr, '');
});
void test('finite JSON stays under four MiB and an interrupted final line is warned without modifying the file', async (t) => {
  const { directory, env } = fixture(t);
  const path = join(directory, 'runtime-one.jsonl');
  writeFileSync(
    path,
    Array.from({ length: 200 }, (_, i) => record(String(i), { data: 'x'.repeat(30000) })).join('') +
      '{"schemaVersion":',
  );
  const before = readFileSync(path);
  const { stdout } = await exec(
    process.execPath,
    [cli, 'server', 'logs', '--tail', '10000', '--json'],
    { env, maxBuffer: 5 * 1024 * 1024 },
  );
  assert(Buffer.byteLength(stdout) <= 4 * 1024 * 1024);
  const result = JSON.parse(stdout) as Envelope;
  assert.equal(result.data.truncated, true);
  assert.equal(result.data.records.at(-1)?.msg, '199');
  assert.equal(result.data.warnings.length, 1);
  assert.deepEqual(readFileSync(path), before);
});
void test(
  'follow handles slow stdout and rotation, emits NDJSON envelopes and Ctrl+C only ends the reader',
  { timeout: 8000 },
  async (t) => {
    const { directory, env, home } = fixture(t);
    const path = join(directory, 'runtime-one.jsonl');
    writeFileSync(
      path,
      Array.from({ length: 100 }, (_, i) => record(String(i), { payload: 'x'.repeat(6000) })).join(
        '',
      ),
    );
    const child = spawn(
      process.execPath,
      [cli, 'server', 'logs', '--tail', '100', '--follow', '--json'],
      { env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const exited = once(child, 'exit');
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    });
    let errors = '';
    child.stderr.on('data', (b) => {
      errors += String(b);
    });
    // Wait until output begins, then pause so the pipe applies backpressure.
    child.stdout.setEncoding('utf8');
    const [first] = (await once(child.stdout, 'data')) as [string];
    child.stdout.pause();
    await delay(300);
    renameSync(path, join(directory, 'runtime-one.1.jsonl'));
    writeFileSync(path, record('rotated'));
    let text = first;
    let received = text.split('\n').length - 1;
    child.stdout.on('data', (chunk) => {
      text += chunk;
      received = text.split('\n').length - 1;
    });
    child.stdout.resume();
    const deadline = Date.now() + 4000;
    while (received < 101 && Date.now() < deadline) await delay(20);
    assert.equal(received, 101);
    child.kill('SIGINT');
    assert.deepEqual(await exited, [0, null]);
    assert.equal(errors, '');
    const values = text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { ok: boolean; data: LogEvent });
    assert(values.every((v) => v.ok && v.data.type === 'record'));
    assert.equal(
      new Set(values.flatMap((v) => (v.data.type === 'record' ? [v.data.record.msg] : []))).size,
      101,
    );
    assert(!existsSync(join(home, '.paneon/runtime.json')));
  },
);
void test(
  'early startup failure leaves a fatal error record and a nonzero exit',
  { timeout: 5000 },
  async (t) => {
    const { home, env } = fixture(t);
    writeFileSync(join(home, '.paneon/config.json'), 'broken json');
    const result = await exec(
      process.execPath,
      [new URL('../dist/runtime/index.js', import.meta.url).pathname],
      { env },
    ).then(
      () => null,
      (e) => e as Error & { code: number },
    );
    assert(result);
    assert.equal(result.code, 1);
    const logs = await exec(
      process.execPath,
      [cli, 'server', 'logs', '--level', 'fatal', '--json'],
      { env },
    );
    const records = (JSON.parse(logs.stdout) as Envelope).data.records;
    assert(records.length >= 1);
    const error = records[0].err as { message: string; stack: string };
    assert(error.message);
    assert(error.stack);
    assert(!existsSync(join(home, '.paneon/runtime.json')));
  },
);
void test(
  'status uses live writer failure instead of the initial descriptor; shutdown still succeeds',
  { timeout: 8000 },
  async (t) => {
    const { home, env } = fixture(t);
    const loggingUrl = new URL('../dist/runtime/logging.js', import.meta.url).href;
    const serverUrl = new URL('../dist/runtime/server.js', import.meta.url).href;
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
 import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {join} from 'node:path';import {homedir} from 'node:os';
 let fail=false;const original=fs.write;
 fs.write=(...args)=>{if(fail){queueMicrotask(()=>args.at(-1)(Object.assign(new Error('simulated disk I/O failure'),{code:'EIO'}),0));return;}return original(...args);};syncBuiltinESMExports();
 const {createRuntimeLogging}=await import(${JSON.stringify(loggingUrl)});const {startServer}=await import(${JSON.stringify(serverUrl)});
 const home=join(homedir(),'.paneon');const logging=createRuntimeLogging(home);await startServer(home,logging);await logging.flush();fail=true;logging.logger.info('Trigger disk failure');await logging.flush();console.log('ready');
 `,
      ],
      { env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const exited = once(child, 'exit');
    let errors = '';
    child.stderr.on('data', (b) => {
      errors += String(b);
    });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited;
    });
    await Promise.race([
      once(child.stdout, 'data'),
      exited.then(() => {
        throw new Error(errors || 'Test runtime exited before readiness');
      }),
    ]);
    const descriptor = JSON.parse(readFileSync(join(home, '.paneon/runtime.json'), 'utf8')) as {
      logging: { status: string };
      controlToken: string;
    };
    assert.equal(descriptor.logging.status, 'active');
    const status = await exec(process.execPath, [cli, 'server', 'status', '--json'], { env });
    const result = JSON.parse(status.stdout) as {
      data: {
        runtime: { logging: { status: string; lastErrorCode: string }; controlToken?: string };
      };
    };
    assert.equal(result.data.runtime.logging.status, 'unavailable');
    assert.equal(result.data.runtime.logging.lastErrorCode, 'EIO');
    assert.equal(result.data.runtime.controlToken, undefined);
    assert.match(status.stderr, /Runtime logging is unavailable/);
    assert(!status.stdout.includes(descriptor.controlToken));
    await exec(process.execPath, [cli, 'server', 'stop', '--json'], { env });
    assert.deepEqual(await exited, [0, null]);
    assert.match(errors, /simulated disk I\/O failure/);
  },
);
void test(
  'a stalled disk write cannot hold shutdown past its 500 ms flush budget',
  { timeout: 4000 },
  async (t) => {
    const { env } = fixture(t);
    const loggingUrl = new URL('../dist/runtime/logging.js', import.meta.url).href;
    const result = await exec(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
 import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';import{join}from'node:path';import{homedir}from'node:os';
 const original=fs.write;fs.write=(...args)=>{setTimeout(()=>original(...args),2000).unref();};syncBuiltinESMExports();
 const{createRuntimeLogging}=await import(${JSON.stringify(loggingUrl)});const logging=createRuntimeLogging(join(homedir(),'.paneon'));await logging.flush();logging.logger.info('Pending write');const began=Date.now();await logging.close();console.log(Date.now()-began);
 `,
      ],
      { env },
    );
    assert(Number(result.stdout) >= 450 && Number(result.stdout) < 1500);
    assert.match(result.stderr, /flush exceeded 500 ms/);
  },
);

void test(
  'Ctrl+C exits even while the follow output pipe remains blocked',
  { timeout: 4000 },
  async (t) => {
    const { directory, env } = fixture(t);
    writeFileSync(
      join(directory, 'runtime-one.jsonl'),
      Array.from({ length: 100 }, (_, i) => record(String(i), { payload: 'x'.repeat(6000) })).join(
        '',
      ),
    );
    const child = spawn(
      process.execPath,
      [cli, 'server', 'logs', '--tail', '100', '--follow', '--json'],
      { env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const exited = once(child, 'exit');
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited;
    });
    await once(child.stdout, 'data');
    child.stdout.pause();
    await delay(200);
    child.kill('SIGINT');
    assert.deepEqual(await exited, [0, null]);
  },
);
