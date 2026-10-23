import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  utimesSync,
  statSync,
  readdirSync,
  renameSync,
  appendFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RuntimeDescriptor } from '../src/shared/types.js';
import type { LogEvent } from '../src/cli/logs.js';
type ErrorDetail = {
  message: string;
  code?: string;
  stack: string;
  cause: ErrorDetail;
  truncated?: boolean;
};
async function nextRecord(iterator: AsyncGenerator<LogEvent, void, unknown>) {
  const item = await iterator.next();
  assert(!item.done);
  assert(item.value.type === 'record');
  return item.value.record;
}
const { createRuntimeLogging, logFiles, LOG_FILE_BYTES, LOG_RECORD_BYTES, logLevel } =
  await import('../dist/runtime/logging.js');
const { readLogs, followLogs, formatRecord } = await import('../dist/cli/logs.js');
const { startServer } = await import('../dist/runtime/server.js');
function temporary(t: import('node:test').TestContext) {
  const home = mkdtempSync(join(tmpdir(), 'paneon-logging-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}
void test('root, child and Fastify share the runtime context; normal request logging stays off', async (t) => {
  const home = temporary(t);
  const log = createRuntimeLogging(home, { level: 'debug' });
  const server = await startServer(home, log);
  t.after(() => server.stop());
  log.logger.debug({ ordinaryNewField: 42 }, 'Selected developer context');
  server.app.log.child({ component: 'test', instanceId: 'instance-one' }).error(
    {
      err: Object.assign(new Error('outer', { cause: new Error('inner') }), {
        code: 'TEST_ERROR',
      }),
    },
    'Operation failed',
  );
  const health = await server.app.inject({
    url: '/health',
    headers: {
      host: `127.0.0.1:${server.descriptor.port}`,
      authorization: `Bearer ${server.descriptor.controlToken}`,
    },
  });
  assert.equal(health.statusCode, 200);
  const data = health.json<{ data: RuntimeDescriptor }>().data;
  assert(data.logging);
  assert.equal(data.runtimeId, log.runtimeId);
  assert.equal(data.logging.status, 'active');
  assert.equal(data.controlToken, undefined);
  await log.flush();
  const records = (await readLogs({ tail: 100 }, home)).records;
  assert(records.every((r) => r.runtimeId === data.runtimeId));
  assert(records.some((r) => r.ordinaryNewField === 42));
  const err = records.find((r) => r.msg === 'Operation failed')!;
  assert.equal(err.instanceId, 'instance-one');
  const detail = err.err as ErrorDetail;
  assert.equal(detail.message, 'outer');
  assert.equal(detail.code, 'TEST_ERROR');
  assert.match(detail.stack, /Error: outer/);
  assert.equal(detail.cause.message, 'inner');
  assert.match(formatRecord(err), /Caused by: Error: inner\n/);
  assert.equal(
    records.filter(
      (r) =>
        r.msg === 'incoming request' ||
        r.msg === 'request completed' ||
        r.msg === 'Server listening at',
    ).length,
    0,
  );
  assert(!readFileSync(log.status().currentFile!, 'utf8').includes(server.descriptor.controlToken));
  await server.stop();
  assert.equal((await readLogs({ tail: 1 }, home)).records[0].msg, 'Runtime stopped');
  assert.equal(statSync(join(home, 'logs')).mode & 0o777, 0o700);
  assert.equal(statSync(log.status().currentFile!).mode & 0o777, 0o600);
});
void test('levels, off, circular context, bounded errors and oversized records', async (t) => {
  const home = temporary(t);
  const log = createRuntimeLogging(home);
  log.logger.debug('Not collected');
  log.logger.info('Collected');
  const context: Record<string, unknown> = {};
  context.self = context;
  const err = new Error('huge ' + '字'.repeat(30000));
  err.cause = err;
  log.logger.error({ err, context }, 'Cyclic error');
  log.logger.info({ huge: 'x'.repeat(100000) }, 'Oversized context');
  log.logger
    .child({ runtimeId: 'wrong', time: 'wrong', level: 99 })
    .info({ runtimeId: 'wrong', time: 'wrong', level: 99 }, 'Reserved context');
  await log.close();
  const data = readFileSync(log.status().currentFile!, 'utf8');
  const lines = data.trim().split('\n');
  assert(lines.every((line) => Buffer.byteLength(line) + 1 <= LOG_RECORD_BYTES));
  const records = (await readLogs({ tail: 100 }, home)).records;
  assert(!records.some((r) => r.msg === 'Not collected'));
  assert.equal(records.find((r) => r.msg === 'Oversized context')!.truncated, true);
  const cyclic = records.find((r) => r.msg === 'Cyclic error')!;
  assert.equal((cyclic.err as ErrorDetail).truncated, true);
  assert.match(JSON.stringify(cyclic), /Circular/);
  const reserved = records.at(-1)!;
  assert.equal(reserved.runtimeId, log.runtimeId);
  assert.equal(reserved.level, 30);
  assert.notEqual(reserved.time, 'wrong');
  const offHome = join(home, 'off');
  const off = createRuntimeLogging(offHome, { level: 'off' });
  off.logger.fatal('Off');
  await off.close();
  assert.equal(logFiles(join(offHome, 'logs')).length, 0);
  assert.equal(off.status().status, 'off');
  assert.throws(() => logLevel('invalid'), /PANEON_LOG_LEVEL/);
});
void test('rotation keeps three bounded files; startup keeps current plus three histories under seven days', async (t) => {
  const home = temporary(t);
  const dir = join(home, 'logs');
  mkdirSync(dir);
  for (let i = 0; i < 5; i++) {
    const p = join(dir, `runtime-history${i}.jsonl`);
    writeFileSync(p, '');
    const age = (i === 0 ? 8 : 5 - i) * 86400000;
    utimesSync(p, new Date(Date.now() - age), new Date(Date.now() - age));
  }
  const log = createRuntimeLogging(home);
  await log.flush();
  assert.equal(logFiles(dir).length, 4);
  assert(!readdirSync(dir).includes('runtime-history0.jsonl'));
  assert(!readdirSync(dir).includes('runtime-history1.jsonl'));
  for (let batch = 0; batch < 90; batch++) {
    for (let i = 0; i < 10; i++)
      log.logger.info({ seq: batch * 10 + i, payload: 'x'.repeat(24000) }, 'Rotation');
    await log.flush();
  }
  await log.close();
  const files = logFiles(dir).filter((f) => f.runtimeId === log.runtimeId);
  assert.equal(files.length, 3);
  assert(files.every((f) => f.size <= LOG_FILE_BYTES));
  const records = (await readLogs({ tail: 10000, runtime: log.runtimeId }, home)).records;
  const seq = records.map((r) => r.seq as number);
  assert(seq[0] > 0);
  assert.equal(seq.at(-1), 899);
  assert(seq.every((n, i) => i === 0 || n === seq[i - 1] + 1));
});
void test('queue congestion is bounded and reported; write failure stays visible without throwing into callers', async (t) => {
  const home = temporary(t);
  const log = createRuntimeLogging(home);
  for (let i = 0; i < 300; i++) log.logger.info({ large: 'x'.repeat(16000) }, 'Burst');
  assert(log.status().droppedRecords > 0);
  await log.close();
  assert((await readLogs({ tail: 1000 }, home)).records.some((r) => Number(r.droppedRecords) > 0));
  const broken = join(home, 'broken');
  mkdirSync(broken);
  writeFileSync(join(broken, 'logs'), 'not a directory');
  const failed = createRuntimeLogging(broken);
  assert.equal(failed.status().status, 'unavailable');
  assert(failed.status().lastErrorCode);
  assert.doesNotThrow(() => failed.logger.info('Does not fail work'));
  await failed.close();
});
void test('reader combines filters, preserves partial tail and rejects malformed middle records', async (t) => {
  const home = temporary(t);
  const log = createRuntimeLogging(home, { level: 'debug' });
  log.logger.child({ instanceId: 'one' }).info('one-info');
  log.logger.child({ instanceId: 'two' }).error('two-error');
  log.logger.child({ instanceId: 'one' }).error('one-error');
  await log.close();
  const opts = { tail: 10, level: 'error' as const, instance: 'one', runtime: log.runtimeId };
  assert.deepEqual(
    (await readLogs(opts, home)).records.map((r) => r.msg),
    ['one-error'],
  );
  const path = log.status().currentFile!;
  appendFileSync(path, '{"schemaVersion":1');
  const before = readFileSync(path);
  assert.equal((await readLogs({ tail: 10 }, home)).warnings.length, 1);
  assert.deepEqual(readFileSync(path), before);
  appendFileSync(path, '\n');
  await assert.rejects(readLogs({ tail: 10 }, home), SyntaxError);
  writeFileSync(path, '{"schemaVersion":2}\n');
  await assert.rejects(readLogs({ tail: 10 }, home), /Unsupported log schema/);
});
void test(
  'follow waits for complete UTF-8 lines, follows rotation and new runtime without replay',
  { timeout: 5000 },
  async (t) => {
    const home = temporary(t);
    const dir = join(home, 'logs');
    mkdirSync(dir);
    const p = join(dir, 'runtime-first.jsonl');
    const record = (runtimeId: string, msg: string) =>
      JSON.stringify({
        schemaVersion: 1,
        time: new Date().toISOString(),
        runtimeId,
        level: 30,
        msg,
      }) + '\n';
    writeFileSync(p, record('runtime-first', 'first'));
    const stop = new AbortController();
    const iterator = followLogs({ tail: 10 }, stop.signal, home);
    assert.equal((await nextRecord(iterator)).msg, 'first');
    const line = Buffer.from(record('runtime-first', '中文'));
    appendFileSync(p, line.subarray(0, line.length - 3));
    const next = nextRecord(iterator);
    setTimeout(() => appendFileSync(p, line.subarray(line.length - 3)), 20);
    assert.equal((await next).msg, '中文');
    renameSync(p, join(dir, 'runtime-first.1.jsonl'));
    writeFileSync(p, record('runtime-first', 'rotated'));
    assert.equal((await nextRecord(iterator)).msg, 'rotated');
    writeFileSync(join(dir, 'runtime-second.jsonl'), record('runtime-second', 'restarted'));
    assert.equal((await nextRecord(iterator)).msg, 'restarted');
    stop.abort();
    assert.equal((await iterator.next()).done, true);
  },
);
