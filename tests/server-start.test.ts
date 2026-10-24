import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import type { RuntimeDescriptor } from '../src/shared/types.js';
import type { serverStatus, stopServer } from '../src/cli/client.js';

const execute = promisify(execFile);

void test(
  'server start starts a background service without a panel and reuses it',
  { timeout: 30000 },
  async () => {
    const home = mkdtempSync(join(tmpdir(), 'paneon-server-start-'));
    const cli = fileURLToPath(new URL('../dist/cli/index.js', import.meta.url));
    const sourceCli = fileURLToPath(new URL('../src/cli/index.ts', import.meta.url));
    const run = async <T = Awaited<ReturnType<typeof serverStatus>>>(
      entry: string,
      ...args: string[]
    ) => {
      const result = await execute(process.execPath, [entry, ...args, '--json'], {
        env: { ...process.env, HOME: home },
        timeout: 15000,
      });
      const envelope = JSON.parse(result.stdout) as { ok: boolean; data: T };
      assert.equal(envelope.ok, true, result.stdout);
      return envelope.data;
    };
    try {
      assert.deepEqual(await run(cli, 'server', 'status'), { running: false, runtime: null });
      const started = await run(cli, 'server', 'start');
      assert.equal(started.running, true);
      assert.ok(started.runtime);
      assert.ok(started.runtime.pid > 0);
      assert.equal(started.runtime.port, 49321);
      assert.equal(started.runtime.host, '127.0.0.1');
      assert.equal('controlToken' in started.runtime, false);
      assert.deepEqual(await run(cli, 'server', 'status'), started);
      const reused = await run(sourceCli, 'server', 'start');
      assert.ok(reused.runtime);
      assert.equal(reused.runtime.runtimeId, started.runtime.runtimeId);
      assert.equal(reused.runtime.pid, started.runtime.pid);
      const panels = await run<{ total: number }>(cli, 'panel', 'list');
      assert.equal(panels.total, 0);
      const stopped = await run<Awaited<ReturnType<typeof stopServer>>>(cli, 'server', 'stop');
      assert.equal(stopped.stopped, true);
      assert.equal(stopped.runtimeId, started.runtime.runtimeId);
      assert.deepEqual(await run(cli, 'server', 'status'), { running: false, runtime: null });
    } finally {
      try {
        const descriptor = JSON.parse(
          readFileSync(join(home, '.paneon/runtime.json'), 'utf8'),
        ) as RuntimeDescriptor;
        process.kill(descriptor.pid, 'SIGKILL');
      } catch (error) {
        assert.ok(
          ['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? ''),
          String(error),
        );
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    }
  },
);

void test(
  'configured port survives restarts and an occupied port fails without switching ports',
  { timeout: 30000 },
  async () => {
    const home = mkdtempSync(join(tmpdir(), 'paneon-fixed-port-'));
    const cli = fileURLToPath(new URL('../dist/cli/index.js', import.meta.url));
    const directory = join(home, '.paneon');
    const blocker = createServer();
    const run = async (...args: string[]) => {
      const result = await execute(process.execPath, [cli, ...args, '--json'], {
        env: { ...process.env, HOME: home },
        timeout: 10000,
      });
      return JSON.parse(result.stdout) as {
        ok: boolean;
        data: Awaited<ReturnType<typeof serverStatus>>;
      };
    };
    try {
      blocker.listen(0, '127.0.0.1');
      await once(blocker, 'listening');
      const address = blocker.address();
      assert.ok(address && typeof address !== 'string');
      const port = address.port;
      mkdirSync(directory);
      writeFileSync(join(directory, 'config.json'), JSON.stringify({ server: { port } }));
      await assert.rejects(run('server', 'start'), (error) => {
        const result = JSON.parse((error as Error & { stdout: string }).stdout) as {
          ok: boolean;
          error: { code: string; message: string; details: { port: number } };
        };
        assert.equal(result.ok, false);
        assert.equal(result.error.code, 'SERVER_PORT_IN_USE');
        assert.equal(result.error.details.port, port);
        assert.match(result.error.message, /Free the port or change server.port/);
        return true;
      });
      assert.equal(existsSync(join(directory, 'runtime.json')), false);
      assert.equal(existsSync(join(directory, 'startup.lock')), false);
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
      const first = await run('server', 'start');
      assert.equal(first.data.runtime?.port, port);
      await run('config', 'set', 'ui.theme', 'dark');
      await run('server', 'stop');
      const restarted = await run('server', 'start');
      assert.equal(restarted.data.runtime?.port, port);
      assert.notEqual(restarted.data.runtime?.runtimeId, first.data.runtime?.runtimeId);
      assert.deepEqual(JSON.parse(readFileSync(join(directory, 'config.json'), 'utf8')), {
        server: { port },
        ui: { theme: 'dark', language: 'en' },
      });
      await run('server', 'stop');
    } finally {
      if (blocker.listening) await new Promise<void>((resolve) => blocker.close(() => resolve()));
      if (existsSync(join(directory, 'runtime.json'))) {
        const descriptor = JSON.parse(
          readFileSync(join(directory, 'runtime.json'), 'utf8'),
        ) as RuntimeDescriptor;
        process.kill(descriptor.pid, 'SIGKILL');
      }
      rmSync(home, { recursive: true, force: true });
    }
  },
);
