import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { promisify } from 'node:util';

const { startServer } = (await import(
  '../dist/runtime/' + 'server.js'
)) as typeof import('../src/runtime/server.js');
const execute = promisify(execFile);
const cliEntry = join(import.meta.dirname, '../dist/cli/index.js');
type Envelope = {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
};
async function cli(home: string, cwd: string, ...args: string[]) {
  const options = {
    env: { ...process.env, HOME: home },
    cwd,
    encoding: 'utf8' as const,
    timeout: 40_000,
  };
  try {
    const result = await execute(process.execPath, [cliEntry, 'panel', ...args, '--json'], options);
    return { ...result, exitCode: 0, result: JSON.parse(result.stdout) as Envelope };
  } catch (error) {
    const failure = error as Error & { code: number; stdout: string; stderr: string };
    return { ...failure, exitCode: failure.code, result: JSON.parse(failure.stdout) as Envelope };
  }
}

void test(
  'file input validates before creation and persists snapshots across reload and restart',
  { timeout: 120_000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'paneon-file-input-'));
    const caller = join(home, 'caller');
    const actionCwd = join(home, 'actions');
    await mkdir(caller);
    await mkdir(actionCwd);
    const entry = join(home, 'panel.tsx');
    const paramsPath = join(caller, 'params.json');
    await writeFile(
      entry,
      `import {definePanel,z} from 'paneon/sdk';function Panel(){return <p>Input</p>}export default definePanel({id:'file-input',requires:{paneon:'0.0.0'},input:z.object({topic:z.string()}),render:Panel});`,
    );
    await writeFile(paramsPath, JSON.stringify({ topic: '原始问题' }));
    // The same relative filename in --cwd must never be mistaken for the caller's file.
    await writeFile(join(actionCwd, 'params.json'), JSON.stringify({ topic: '错误目录' }));
    const storage = join(home, '.paneon');
    let service = await startServer(storage);
    const run = (...flags: string[]) =>
      cli(home, caller, 'run', entry, '--cwd', actionCwd, '--no-watch', ...flags);
    const count = () => service.runtime.store.listPage(1, 100).total;
    try {
      const help = await execute(process.execPath, [cliEntry, 'panel', 'run', '--help'], {
        cwd: caller,
      });
      assert.match(help.stdout, /--params-file <path>/);
      assert.match(help.stdout, /--params <json>/);
      assert.doesNotMatch(help.stdout, /[\u4e00-\u9fff]/);
      for (const flags of [
        [],
        ['--params', '{}', '--params-file', 'params.json'],
        ['--params-file', 'missing.json'],
        ['--params-file', '.'],
      ]) {
        const outcome = await run(...flags);
        assert.equal(outcome.exitCode, 1);
        assert.equal(outcome.result.error?.code, 'INVALID_ARGUMENT');
        assert.equal(count(), 0);
      }
      const privateMarker = 'PRIVATE_BUSINESS_INPUT';
      await writeFile(paramsPath, `{"topic":"${privateMarker}", BROKEN`);
      const malformed = await run('--params-file', 'params.json', '--debug');
      assert.equal(malformed.result.error?.code, 'INVALID_ARGUMENT');
      assert.match(malformed.result.error?.message ?? '', /--params-file.*valid JSON/);
      assert.doesNotMatch(malformed.stdout + malformed.stderr, new RegExp(privateMarker));
      assert.equal(count(), 0);
      await writeFile(paramsPath, JSON.stringify({ topic: 7 }));
      const invalid = await run('--params-file', 'params.json');
      assert.equal(invalid.result.error?.code, 'INPUT_VALIDATION_FAILED');
      assert.equal(count(), 0);
      await writeFile(paramsPath, JSON.stringify({ topic: '原始问题' }));
      const created = await run('--params-file', 'params.json', '--debug');
      assert.equal(created.exitCode, 0, created.stdout + created.stderr);
      assert.deepEqual(Object.keys(created.result.data ?? {}).sort(), [
        'definitionId',
        'instanceId',
        'paneonVersion',
        'revision',
        'status',
        'url',
        'watch',
      ]);
      assert.doesNotMatch(created.stdout + created.stderr, /原始问题|paramsFile|params\.json/);
      const firstId = String(created.result.data?.instanceId);
      assert.deepEqual(service.runtime.inspect(firstId).params, { topic: '原始问题' });
      assert.equal(service.runtime.inspect(firstId).cwd, actionCwd);
      await writeFile(paramsPath, JSON.stringify({ topic: '第二轮问题' }));
      const changedReload = await cli(home, caller, 'reload', firstId);
      assert.equal(changedReload.exitCode, 0, changedReload.stdout);
      assert.deepEqual(service.runtime.inspect(firstId).params, { topic: '原始问题' });
      const second = await run('--params-file', 'params.json');
      assert.equal(second.exitCode, 0, second.stdout);
      const secondId = String(second.result.data?.instanceId);
      assert.notEqual(secondId, firstId);
      assert.deepEqual(service.runtime.inspect(secondId).params, { topic: '第二轮问题' });
      await rm(paramsPath);
      const removedReload = await cli(home, caller, 'reload', firstId);
      assert.equal(removedReload.exitCode, 0, removedReload.stdout);
      assert.deepEqual(service.runtime.inspect(firstId).params, { topic: '原始问题' });
      await service.stop();
      service = await startServer(storage);
      assert.equal(service.runtime.inspect(firstId).status, 'running');
      assert.equal(service.runtime.inspect(secondId).status, 'running');
      const inspected = await cli(home, caller, 'inspect', firstId);
      assert.equal(inspected.exitCode, 0, inspected.stdout);
      assert.deepEqual(inspected.result.data?.params, { topic: '原始问题' });
      assert.deepEqual(service.runtime.inspect(secondId).params, { topic: '第二轮问题' });
      const inline = await run('--params', '{"topic":"内联"}');
      assert.equal(inline.exitCode, 0, inline.stdout);
      assert.deepEqual(service.runtime.inspect(String(inline.result.data?.instanceId)).params, {
        topic: '内联',
      });
    } finally {
      await service.stop();
      await rm(home, { recursive: true, force: true });
    }
  },
);

void test('file creation preflights the complete envelope before runtime discovery', async () => {
  const home = await mkdtemp(join(tmpdir(), 'paneon-file-size-'));
  const entry = join(home, 'panel.tsx');
  const paramsPath = join(home, 'params.json');
  await writeFile(entry, '// No instance may reach compilation.');
  await mkdir(join(home, '.paneon'));
  await writeFile(join(home, '.paneon/runtime.json'), 'invalid descriptor');
  try {
    const envelope = { entryPath: entry, cwd: home, params: { topic: '' }, watch: false };
    const topic = 'x'.repeat(262144 - Buffer.byteLength(JSON.stringify(envelope)) + 1);
    const params = JSON.stringify({ topic });
    assert.ok(Buffer.byteLength(params) < 262144);
    assert.equal(Buffer.byteLength(JSON.stringify({ ...envelope, params: { topic } })), 262145);
    await writeFile(paramsPath, params);
    const outcome = await cli(
      home,
      home,
      'run',
      entry,
      '--cwd',
      home,
      '--no-watch',
      '--params-file',
      'params.json',
      '--debug',
    );
    assert.equal(outcome.exitCode, 1);
    assert.equal(outcome.result.error?.code, 'BODY_TOO_LARGE', outcome.stdout);
    assert.match(outcome.result.error?.message ?? '', /262144-byte UTF-8 limit/);
    assert.ok(outcome.stdout.length < 500);
    assert.doesNotMatch(outcome.stderr, /x{20}/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
