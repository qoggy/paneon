import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import type { RuntimeDescriptor } from '../src/shared/types.js';

const execute = promisify(execFile);

void test(
  'server stop exits with unfinished HTTP requests and an open WebSocket',
  {
    timeout: 15000,
  },
  async () => {
    const home = mkdtempSync(join(tmpdir(), 'paneon-stop-http-'));
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
    import {startServer} from ${JSON.stringify(new URL('./runtime-fixture.ts', import.meta.url).href)};
    await startServer();
    console.log('ready');
  `,
      ],
      { env: { ...process.env, HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const exited = once(child, 'exit');
    const sockets: Socket[] = [];
    let websocket: WebSocket | undefined;
    try {
      await once(child.stdout, 'data');
      const descriptor = JSON.parse(
        readFileSync(join(home, '.paneon/runtime.json'), 'utf8'),
      ) as RuntimeDescriptor;
      const origin = `http://127.0.0.1:${descriptor.port}`;
      websocket = new WebSocket(`${origin.replace('http:', 'ws:')}/api/preferences/stream`, {
        origin,
      });
      await once(websocket, 'open');
      for (const request of [
        `GET / HTTP/1.1\r\nHost: 127.0.0.1:${descriptor.port}\r\n`,
        `POST /api/panels HTTP/1.1\r\nHost: 127.0.0.1:${descriptor.port}\r\nAuthorization: Bearer ${descriptor.controlToken}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{`,
      ]) {
        const socket = connect(descriptor.port, '127.0.0.1');
        socket.on('error', () => {});
        sockets.push(socket);
        await once(socket, 'connect');
        socket.write(request);
      }
      // Round-trip through the same server after sending the incomplete requests.
      const health = await fetch(`${origin}/health`, {
        headers: { Authorization: `Bearer ${descriptor.controlToken}` },
      });
      assert.equal(health.status, 200);
      await health.arrayBuffer();
      const result = await execute(
        process.execPath,
        [new URL('../dist/cli/index.js', import.meta.url).pathname, 'server', 'stop', '--json'],
        {
          env: { ...process.env, HOME: home },
          timeout: 8000,
        },
      );
      const stopped = JSON.parse(result.stdout) as { ok: boolean };
      assert.equal(stopped.ok, true);
      assert.deepEqual(await exited, [0, null]);
      const status = await execute(
        process.execPath,
        [new URL('../dist/cli/index.js', import.meta.url).pathname, 'server', 'status', '--json'],
        {
          env: { ...process.env, HOME: home },
          timeout: 3000,
        },
      );
      const inspected = JSON.parse(status.stdout) as { data: { running: boolean } };
      assert.equal(inspected.data.running, false);
    } finally {
      for (const socket of sockets) socket.destroy();
      websocket?.terminate();
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited;
      rmSync(home, { recursive: true, force: true });
    }
  },
);
