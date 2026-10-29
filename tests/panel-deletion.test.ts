import { PACKAGE_VERSION } from '../dist/shared/paths.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import type { StoredPanel } from '../src/shared/types.js';
import { startServer } from './runtime-fixture.ts';

const { Runtime } = (await import(
  '../dist/runtime/' + 'lifecycle.js'
)) as typeof import('../src/runtime/lifecycle.js');
const execute = promisify(execFile);
const source = (extra = '') =>
  `import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';${extra}function Panel(){return <div>Deletion fixture</div>}export default definePanel({id:'deletion',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),events:{feedback:z.object({text:z.string()})},render:Panel});`;
function stored(root: string, status: StoredPanel['status']): StoredPanel {
  const now = new Date().toISOString();
  return {
    instanceId: 'instance-' + randomUUID(),
    definitionId: 'deletion',
    status,
    entryPath: join(root, 'panel.tsx'),
    cwd: root,
    params: {},
    revision: 'saved',
    watch: false,
    createdAt: now,
    updatedAt: now,
    requires: { paneon: PACKAGE_VERSION },
    paneonVersion: PACKAGE_VERSION,
  };
}
async function until(check: () => boolean, message: string) {
  const deadline = Date.now() + 15000;
  while (!check() && Date.now() < deadline) await delay(20);
  assert.equal(check(), true, message);
}

void test('deletion uses the stored identity to retire resources, remove history and preserve other data', async () => {
  const root = mkdtempSync(join(tmpdir(), 'paneon-delete-runtime-'));
  const home = join(root, 'data');
  let runtime = new Runtime(home);
  const entry = join(root, 'panel.tsx');
  const effect = join(root, 'external-effect.txt');
  const started = join(root, 'action-started');
  const text = source(
    `import{writeFileSync}from'node:fs';export const hold=serverAction({input:z.object({}),handler:async()=>{writeFileSync(${JSON.stringify(effect)},'keep');writeFileSync(${JSON.stringify(started)},'ready');await new Promise(()=>{});return null;}});`,
  );
  writeFileSync(entry, text);
  try {
    const panel = await runtime.run(entry, root, {}, true);
    const event = await runtime.append(panel.instanceId, panel.revision, 'feedback', {
      text: 'not acknowledged',
    });
    assert.equal(
      (await runtime.events(panel.instanceId, 'reader', 100, 0)).events[0]?.id,
      event.id,
    );
    await runtime.events(panel.instanceId, 'waiting', 100, 0);
    runtime.store.ack(panel.instanceId, 'waiting', event.id);
    const other = stored(root, 'closed');
    runtime.store.save(other);
    const otherEvent = runtime.store.append(other.instanceId, 'saved', 'feedback', {
      text: 'keep',
    });
    runtime.store.read(other.instanceId, 'other-reader', 100);
    const waiting = assert.rejects(runtime.events(panel.instanceId, 'waiting', 100, 60000), {
      code: 'PANEL_NOT_FOUND',
    });
    const invocation = assert.rejects(
      runtime.invoke(panel.instanceId, panel.revision, 'panel.tsx#hold', {}),
    );
    await until(() => existsSync(started), 'action did not start');
    const notices: string[] = [];
    runtime.on('deleted', (id: string) => notices.push(id));
    assert.deepEqual(await runtime.deletePanel(panel.instanceId), { deleted: true });
    assert.deepEqual(notices, [panel.instanceId]);
    await Promise.all([waiting, invocation]);
    assert.equal(runtime.live.has(panel.instanceId), false);
    assert.equal(runtime.resourceUsage.residentPanels, 0);
    assert.equal(runtime.resourceUsage.workers, 0);
    assert.equal(runtime.resourceUsage.watchers, 0);
    assert.equal(existsSync(join(home, 'panels', panel.instanceId)), false);
    assert.equal(readFileSync(entry, 'utf8'), text);
    assert.equal(readFileSync(effect, 'utf8'), 'keep');
    for (const table of ['events', 'consumers']) {
      const row = runtime.store.db
        .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE instance_id = ?`)
        .get(panel.instanceId) as { count: number };
      assert.equal(row.count, 0, table);
    }
    assert.throws(() => runtime.inspect(panel.instanceId), { code: 'PANEL_NOT_FOUND' });
    await assert.rejects(runtime.reload(panel.instanceId), { code: 'PANEL_NOT_FOUND' });
    await assert.rejects(runtime.deletePanel(panel.instanceId), { code: 'PANEL_NOT_FOUND' });
    assert.equal(
      (await runtime.events(other.instanceId, 'other-reader', 100, 0)).events[0]?.id,
      otherEvent.id,
    );
    runtime.store.ack(other.instanceId, 'other-reader', otherEvent.id);
    await runtime.stop();
    runtime = new Runtime(home);
    assert.equal(runtime.store.find(panel.instanceId), undefined);
    assert.equal(runtime.store.listPage().total, 1);
    assert.equal((await runtime.events(other.instanceId, 'other-reader', 100, 0)).events.length, 0);
  } finally {
    await runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

void test(
  'API and CLI delete every status and notify an existing stream',
  { timeout: 30000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'paneon-delete-api-'));
    const service = await startServer(join(root, '.paneon'));
    const origin = `http://127.0.0.1:${service.descriptor.port}`;
    const headers = { authorization: `Bearer ${service.descriptor.controlToken}` };
    let socket: WebSocket | undefined;
    try {
      for (const status of ['running', 'unavailable', 'closed'] as const) {
        const panel = stored(root, status);
        service.runtime.store.save(panel);
        const event = service.runtime.store.append(panel.instanceId, 'saved', 'feedback', {
          text: status,
        });
        service.runtime.store.read(panel.instanceId, 'reader', 100);
        let notification: Promise<unknown> | undefined;
        if (status === 'running') {
          socket = new WebSocket(
            `${origin.replace('http:', 'ws:')}/api/panels/${panel.instanceId}/stream`,
            { origin },
          );
          await once(socket, 'message');
          const connection = socket;
          notification = new Promise((resolve) => {
            connection.on('message', (raw) => {
              const value = JSON.parse((raw as Buffer).toString('utf8')) as { type: string };
              if (value.type === 'deleted') resolve(value);
            });
          });
        }
        if (status === 'unavailable') {
          const { stdout } = await execute(
            process.execPath,
            [
              join(import.meta.dirname, '../dist/cli/index.js'),
              'panel',
              'delete',
              panel.instanceId,
              '--json',
            ],
            { env: { ...process.env, HOME: root }, timeout: 10000 },
          );
          assert.deepEqual(JSON.parse(stdout), { ok: true, data: { deleted: true } });
        } else {
          const response = await fetch(`${origin}/api/panels/${panel.instanceId}`, {
            method: 'DELETE',
            headers,
          });
          assert.equal(response.status, 200);
          assert.deepEqual(await response.json(), { ok: true, data: { deleted: true } });
        }
        if (notification) assert.deepEqual(await notification, { type: 'deleted' });
        socket?.close();
        const requests = [
          { method: 'GET', path: '' },
          { method: 'GET', path: '/events?consumer=reader' },
          { method: 'POST', path: '/acks', body: { consumer: 'reader', through: event.id } },
          { method: 'POST', path: '/actions/anything', body: { revision: 'saved', input: {} } },
          { method: 'DELETE', path: '' },
        ];
        for (const request of requests) {
          const response = await fetch(`${origin}/api/panels/${panel.instanceId}${request.path}`, {
            method: request.method,
            headers: {
              ...headers,
              ...(request.body ? { 'content-type': 'application/json' } : {}),
            },
            ...(request.body ? { body: JSON.stringify(request.body) } : {}),
          });
          const result = (await response.json()) as { ok: boolean; error: { code: string } };
          assert.equal(result.ok, false);
          assert.equal(result.error.code, 'PANEL_NOT_FOUND', request.method + request.path);
        }
      }
      assert.equal(service.runtime.store.listPage().total, 0);
    } finally {
      socket?.terminate();
      await service.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test(
  'deletion cancels an active reload without restoring records or generated output',
  { timeout: 30000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'paneon-delete-reload-'));
    const home = join(root, 'data');
    const runtime = new Runtime(home);
    const entry = join(root, 'panel.tsx');
    const marker = join(root, 'metadata-started');
    const release = join(root, 'release');
    try {
      writeFileSync(entry, source());
      const panel = await runtime.run(entry, root, {}, false);
      writeFileSync(
        entry,
        source(
          `import{writeFileSync,existsSync}from'node:fs';const gate=await new Promise<number>(resolve=>{writeFileSync(${JSON.stringify(marker)},'ready');const timer=setInterval(()=>{if(existsSync(${JSON.stringify(release)})){clearInterval(timer);resolve(1)}},10)});export const read=serverAction({input:z.object({}),handler:async()=>gate});`,
        ),
      );
      const reload = assert.rejects(runtime.reload(panel.instanceId), { code: 'BUILD_CANCELLED' });
      await until(() => existsSync(marker), 'reload metadata did not start');
      await runtime.deletePanel(panel.instanceId);
      await reload;
      assert.equal(runtime.store.find(panel.instanceId), undefined);
      assert.equal(existsSync(join(home, 'panels', panel.instanceId)), false);
      assert.equal(runtime.resourceUsage.compiling, 0);
      assert.equal(runtime.resourceUsage.workers, 0);
      assert.equal(runtime.resourceUsage.queued, 0);
    } finally {
      writeFileSync(release, 'cleanup');
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
