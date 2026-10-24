import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Preferences } from '../dist/runtime/preferences.js';
import { startServer } from '../dist/runtime/server.js';
import WebSocket from 'ws';

void test('UI config merges atomically, preserves unrelated keys, and retains state after a failed save', async () => {
  const home = await mkdtemp(join(tmpdir(), 'paneon-preferences-'));
  try {
    const initial = new Preferences(home);
    assert.deepEqual(initial.ui, { theme: 'light', language: 'en' });
    assert.equal(initial.port, 49321);
    await writeFile(
      join(home, 'config.json'),
      JSON.stringify({
        server: { port: 49322 },
        other: { keep: true },
        ui: { extension: 42, theme: 'dark' },
      }),
    );
    const config = new Preferences(home);
    assert.equal(config.port, 49322);
    config.save({ language: 'zh-CN' });
    assert.deepEqual(JSON.parse(await readFile(join(home, 'config.json'), 'utf8')), {
      server: { port: 49322 },
      other: { keep: true },
      ui: { extension: 42, theme: 'dark', language: 'zh-CN' },
    });
    assert.deepEqual(new Preferences(home).ui, { theme: 'dark', language: 'zh-CN' });
    assert.throws(() => config.save({ theme: 'system' }), /light\/dark/);
    await rm(join(home, 'config.json'));
    await mkdir(join(home, 'config.json'));
    assert.throws(() => config.save({ theme: 'light' }));
    assert.deepEqual(config.ui, { theme: 'dark', language: 'zh-CN' });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
void test('preference API/stream keeps existing origin protections and publishes complete snapshots after persistence', async () => {
  const home = await mkdtemp(join(tmpdir(), 'paneon-preferences-server-'));
  const service = await startServer(home);
  const origin = `http://127.0.0.1:${service.descriptor.port}`;
  const headers = {
    host: `127.0.0.1:${service.descriptor.port}`,
    authorization: `Bearer ${service.descriptor.controlToken}`,
  };
  let socket: WebSocket | undefined;
  try {
    const invalid = await service.app.inject({
      method: 'POST',
      url: '/api/preferences',
      headers: { host: headers.host, origin: 'http://other.example' },
      payload: { ui: { theme: 'dark' } },
    });
    assert.equal(invalid.json<{ error: { code: string } }>().error.code, 'INVALID_ORIGIN');
    const messages: { type: string; ui: { theme: string; language: string } }[] = [];
    socket = new WebSocket(`${origin.replace('http:', 'ws:')}/api/preferences/stream`, { origin });
    const stream = socket;
    const received = new Promise<void>((resolve) =>
      stream.on('message', (data) => {
        messages.push(
          JSON.parse(
            Buffer.isBuffer(data) ? data.toString('utf8') : '',
          ) as (typeof messages)[number],
        );
        if (messages.length === 2) resolve();
      }),
    );
    await new Promise<void>((resolve) => stream.on('open', resolve));
    const result = await service.app.inject({
      method: 'POST',
      url: '/api/preferences',
      headers,
      payload: { ui: { theme: 'dark' } },
    });
    assert.deepEqual(result.json<{ data: unknown }>().data, {
      ui: { theme: 'dark', language: 'en' },
    });
    await received;
    assert.deepEqual(messages, [
      { type: 'preferences', ui: { theme: 'light', language: 'en' } },
      { type: 'preferences', ui: { theme: 'dark', language: 'en' } },
    ]);
    const html = await service.app.inject({
      method: 'GET',
      url: '/',
      headers: { host: headers.host },
    });
    assert.match(html.body, /<html lang="en" class="dark"/);
    assert.match(html.body, /color-scheme:dark/);
    assert.match(String(html.headers['content-security-policy']), /script-src 'self';/);
  } finally {
    socket?.terminate();
    await service.stop();
    await rm(home, { recursive: true, force: true });
  }
});

void test('source and installed-style CLI config commands share the runtime and preserve English diagnostics', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { fileURLToPath } = await import('node:url');
  const execute = promisify(execFile);
  const home = await mkdtemp(join(tmpdir(), 'paneon-preferences-cli-'));
  const cli = fileURLToPath(new URL('../dist/cli/index.js', import.meta.url));
  const source = fileURLToPath(new URL('../src/cli/index.ts', import.meta.url));
  const run = async (entry: string, ...args: string[]) =>
    JSON.parse(
      (
        await execute(process.execPath, [entry, ...args, '--json'], {
          env: { ...process.env, HOME: home },
          timeout: 30000,
        })
      ).stdout,
    ) as { ok: boolean; data: unknown };
  try {
    assert.deepEqual((await run(cli, 'config', 'get')).data, {
      ui: { theme: 'light', language: 'en' },
    });
    await run(cli, 'config', 'set', 'ui.theme', 'dark');
    assert.deepEqual((await run(source, 'config', 'set', 'ui.language', 'zh-CN')).data, {
      ui: { theme: 'dark', language: 'zh-CN' },
    });
    assert.deepEqual(JSON.parse(await readFile(join(home, '.paneon/config.json'), 'utf8')), {
      ui: { theme: 'dark', language: 'zh-CN' },
    });
    await assert.rejects(
      () => run(cli, 'config', 'set', 'ui.theme', 'system'),
      (error) => /light\/dark/.test((error as Error & { stdout: string }).stdout),
    );
  } finally {
    await run(cli, 'server', 'stop');
    await rm(home, { recursive: true, force: true });
  }
});
