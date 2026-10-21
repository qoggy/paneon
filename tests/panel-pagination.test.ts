import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PanelInstance } from '../src/shared/types.js';

const { Store } = (await import(
  '../dist/runtime/' + 'store.js'
)) as typeof import('../src/runtime/store.js');
const { startServer } = (await import(
  '../dist/runtime/' + 'server.js'
)) as typeof import('../src/runtime/server.js');
const execute = promisify(execFile);

void test(
  'panel pagination bounds database, API and CLI results with stable ordering',
  { timeout: 30000 },
  async () => {
    const home = mkdtempSync(join(tmpdir(), 'paneon-pagination-'));
    const store = new Store(join(home, '.paneon'));
    assert.deepEqual(store.listPage(), {
      panels: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    // Deliberately reverse insertion order and tie all creation times.
    for (let i = 44; i >= 0; i--)
      store.save({
        instanceId: `instance-${String(i).padStart(2, '0')}`,
        definitionId: 'pagination',
        status: 'closed',
        entryPath: '/not-loaded.tsx',
        cwd: home,
        params: { private: 'not-in-list' },
        revision: 'saved',
        watch: false,
        createdAt: '2026-10-21T00:00:00.000Z',
        updatedAt: '2026-10-21T00:00:00.000Z',
        requires: { paneon: '0.0.0' },
        paneonVersion: '0.0.0',
      });
    const first = store.listPage();
    assert.equal(first.panels.length, 20);
    assert.equal(first.panels[0].instanceId, 'instance-00');
    assert.equal(first.panels.at(-1)?.instanceId, 'instance-19');
    assert.equal(first.total, 45);
    assert.equal(first.totalPages, 3);
    assert.equal('params' in first.panels[0], false);
    assert.equal(typeof first.panels[0].watch, 'boolean');
    const ids = [...first.panels, ...store.listPage(2).panels, ...store.listPage(3).panels].map(
      (p) => p.instanceId,
    );
    assert.equal(new Set(ids).size, 45);
    assert.equal(store.listPage(3).panels.length, 5);
    assert.deepEqual(store.listPage(4).panels, []);
    assert.equal(store.list().length, 45, 'Internal full-list callers remain unpaginated.');
    for (const [page, size] of [
      [0, 20],
      [1.5, 20],
      [1, 0],
      [1, 1001],
    ])
      assert.throws(() => store.listPage(page, size), { code: 'INVALID_ARGUMENT' });
    store.close();
    const service = await startServer(join(home, '.paneon'));
    const headers = { Authorization: `Bearer ${service.descriptor.controlToken}` };
    const origin = `http://127.0.0.1:${service.descriptor.port}`;
    type Page = {
      panels: PanelInstance[];
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
    const read = async (query = '') => {
      const response = await fetch(`${origin}/api/panels${query}`, { headers });
      return {
        status: response.status,
        body: (await response.json()) as { ok: boolean; data: Page; error?: { code: string } },
      };
    };
    const cli = async (...args: string[]) => {
      const { stdout } = await execute(
        process.execPath,
        [join(import.meta.dirname, '../dist/cli/index.js'), 'panel', 'list', ...args, '--json'],
        { env: { ...process.env, HOME: home }, timeout: 10000 },
      );
      return JSON.parse(stdout) as { ok: boolean; data: Page };
    };
    try {
      const initial = await read();
      assert.equal(initial.status, 200);
      assert.deepEqual(initial.body.data, first);
      const last = await read('?page=3');
      assert.equal(last.body.data.panels.length, 5);
      assert.equal(last.body.data.page, 3);
      const custom = await read('?page=2&pageSize=7');
      assert.deepEqual(
        custom.body.data.panels.map((p) => p.instanceId),
        ids.slice(7, 14),
      );
      assert.equal(custom.body.data.totalPages, 7);
      for (const query of [
        '?page=0',
        '?page=-1',
        '?page=1.5',
        '?page=2147483648',
        '?pageSize=0',
        '?pageSize=1001',
        '?pageSize=abc',
        '?page=1&page=2',
      ]) {
        const bad = await read(query);
        assert.equal(bad.status, 400, query);
        assert.equal(bad.body.error?.code, 'INVALID_ARGUMENT');
      }
      assert.deepEqual((await cli()).data, first);
      const second = await cli('--page', '2');
      assert.deepEqual(
        second.data.panels.map((p) => p.instanceId),
        ids.slice(20, 40),
      );
      assert.deepEqual((await cli('--page', '2', '--page-size', '7')).data, custom.body.data);
      for (const args of [
        ['--page', '0'],
        ['--page', '1.5'],
        ['--page-size', '1001'],
      ]) {
        await assert.rejects(cli(...args), (error: unknown) => {
          const failure = error as { code: number; stdout: string };
          const result = JSON.parse(failure.stdout) as { ok: boolean; error: { code: string } };
          return (
            failure.code === 1 && result.ok === false && result.error.code === 'INVALID_ARGUMENT'
          );
        });
      }
    } finally {
      await service.stop();
      rmSync(home, { recursive: true, force: true });
    }
  },
);
