import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { PACKAGE_VERSION } from '../dist/shared/paths.js';
import type { StoredPanel } from '../src/shared/types.js';

const { Store } = (await import(
  '../dist/runtime/' + 'store.js'
)) as typeof import('../src/runtime/store.js');
const { Runtime } = (await import(
  '../dist/runtime/' + 'lifecycle.js'
)) as typeof import('../src/runtime/lifecycle.js');

function draft(root: string): Omit<StoredPanel, 'instanceId'> {
  return {
    definitionId: 'ids',
    status: 'running',
    entryPath: join(root, 'panel.tsx'),
    cwd: root,
    params: {},
    revision: 'saved',
    watch: false,
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z',
    requires: { paneon: PACKAGE_VERSION },
    paneonVersion: PACKAGE_VERSION,
  };
}

void test('SQLite panel IDs remain strings and advance across connections, deletion and reopen', () => {
  const root = mkdtempSync(join(tmpdir(), 'paneon-panel-ids-store-'));
  let store = new Store(root);
  const other = new Store(root);
  try {
    const first = store.save(draft(root));
    const second = other.save(draft(root));
    assert.equal(first.instanceId, '1');
    assert.equal(second.instanceId, '2');
    assert.deepEqual(
      store.listPage().panels.map((panel) => panel.instanceId),
      ['2', '1'],
    );
    assert.equal(store.get(first.instanceId).instanceId, '1');
    const event = store.append(first.instanceId, first.revision, 'feedback', {});
    store.read(first.instanceId, 'agent', 100);
    store.save({ ...first, status: 'closed' });
    store.ack(first.instanceId, 'agent', event.id);
    store.delete(second.instanceId);
    other.close();
    store.close();
    store = new Store(root);
    const third = store.save(draft(root));
    assert.equal(third.instanceId, '3');
    assert.equal(store.get(first.instanceId).status, 'closed');
    assert.equal(store.read(first.instanceId, 'agent', 100).lastAckId, event.id);
    assert.deepEqual(store.db.pragma('foreign_key_check'), []);
  } finally {
    if (other.db.open) other.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('runtime allocates numeric IDs before concurrent builds and retains them through reload and restart', async () => {
  const root = mkdtempSync(join(tmpdir(), 'paneon-panel-ids-runtime-'));
  const home = join(root, 'data');
  const entry = join(root, 'panel.tsx');
  let runtime = new Runtime(home);
  writeFileSync(
    entry,
    `import{definePanel,z}from'@qoggy/paneon/sdk';export default definePanel({id:'ids',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:()=> <div>Numeric panel IDs</div>});`,
  );
  try {
    const pending = [runtime.run(entry, root, {}, false), runtime.run(entry, root, {}, false)];
    assert.deepEqual(
      runtime.store.all().map((panel) => panel.instanceId),
      ['1', '2'],
    );
    const [first, second] = await Promise.all(pending);
    assert.equal(first.instanceId, '1');
    assert.equal(second.instanceId, '2');
    await runtime.reload(first.instanceId);
    assert.equal(runtime.inspect(first.instanceId).instanceId, first.instanceId);
    await runtime.closePanel(first.instanceId);
    await runtime.deletePanel(second.instanceId);
    await runtime.stop();
    runtime = new Runtime(home);
    assert.equal(runtime.inspect(first.instanceId).instanceId, '1');
    assert.equal((await runtime.run(entry, root, {}, false)).instanceId, '3');
  } finally {
    await runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('closing or deleting during initial creation uses the stored ID and completes retirement', async (t) => {
  for (const operation of ['close', 'delete'] as const) {
    for (const compiling of [false, true]) {
      await t.test(
        `${operation}: ${compiling ? 'active compilation' : 'before compilation'}`,
        async () => {
          const root = mkdtempSync(join(tmpdir(), 'paneon-panel-ids-close-creation-'));
          const runtime = new Runtime(join(root, 'data'));
          const entry = join(root, 'panel.tsx');
          writeFileSync(
            entry,
            "import{definePanel,z}from'@qoggy/paneon/sdk';export default definePanel({id:'ids',requires:{paneon:'*'},input:z.object({}),render:()=> <div>Initial creation</div>});",
          );
          try {
            const creation = assert.rejects(runtime.run(entry, root, {}, false), {
              code: compiling ? 'BUILD_CANCELLED' : 'PANEL_CLOSED',
            });
            const id = runtime.store.all()[0].instanceId;
            if (compiling) {
              const deadline = Date.now() + 10000;
              while (!runtime.resourceUsage.compiling && Date.now() < deadline) await delay(10);
              assert.equal(runtime.resourceUsage.compiling, 1);
            }
            const notices: string[] = [];
            runtime.on(operation === 'close' ? 'state' : 'deleted', (instanceId: string) =>
              notices.push(instanceId),
            );
            if (operation === 'close')
              assert.deepEqual(await runtime.closePanel('0' + id), {
                status: 'closed',
                alreadyClosed: false,
              });
            else assert.deepEqual(await runtime.deletePanel('0' + id), { deleted: true });
            await creation;
            assert.equal(
              runtime.store.find(id)?.status,
              operation === 'close' ? 'closed' : undefined,
            );
            assert.deepEqual(notices, [id]);
            assert.equal(runtime.resourceUsage.residentPanels, 0);
            assert.equal(runtime.resourceUsage.workers, 0);
            assert.equal(runtime.resourceUsage.compiling, 0);
          } finally {
            await runtime.stop();
            rmSync(root, { recursive: true, force: true });
          }
        },
      );
    }
  }
});

void test('runtime aliases share execution, artifacts, notifications and resource retirement', async () => {
  const root = mkdtempSync(join(tmpdir(), 'paneon-panel-ids-alias-'));
  const runtime = new Runtime(join(root, 'data'));
  const entry = join(root, 'panel.tsx');
  writeFileSync(
    entry,
    "import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';export const read=serverAction({kind:'query',input:z.object({}),handler:()=>42});export default definePanel({id:'ids',requires:{paneon:'*'},input:z.object({}),events:{feedback:z.object({text:z.string()})},render:()=> <div>Stored identity</div>});",
  );
  try {
    const panel = await runtime.run(entry, root, {}, true);
    const id = panel.instanceId;
    const alias = '0' + id;
    assert.equal(
      runtime.artifact(alias, panel.revision)?.directory,
      runtime.artifact(id, panel.revision)?.directory,
    );
    assert.deepEqual(runtime.manifest(alias), runtime.manifest(id));
    assert.equal(await runtime.invoke(alias, panel.revision, 'panel.tsx#read', {}), 42);
    await runtime.observe(alias);
    assert.equal(runtime.resourceUsage.residentPanels, 1);
    assert.equal(runtime.resourceUsage.workers, 1);
    assert.equal(runtime.resourceUsage.watchers, 1);

    const notices: string[] = [];
    runtime.on('state', (instanceId: string) => notices.push(instanceId));
    for (const [reader, writer] of [
      [alias, id],
      [id, alias],
    ]) {
      const consumer = 'agent';
      const waiting = runtime.events(reader, consumer, 100, 1000);
      const event = await runtime.append(writer, panel.revision, 'feedback', { text: writer });
      const delivered = await waiting;
      assert.equal(delivered.timedOut, false);
      assert.equal(delivered.events[0]?.id, event.id);
      runtime.store.ack(reader, consumer, event.id);
    }
    await runtime.reload(alias);
    assert.equal(runtime.resourceUsage.residentPanels, 1);
    assert.equal(runtime.resourceUsage.workers, 1);
    assert.equal(runtime.resourceUsage.watchers, 1);
    assert.deepEqual(await runtime.closePanel(alias), { status: 'closed', alreadyClosed: false });
    assert.equal(runtime.resourceUsage.residentPanels, 0);
    assert.equal(runtime.resourceUsage.workers, 0);
    assert.equal(runtime.resourceUsage.watchers, 0);
    assert.ok(notices.length > 0);
    assert.ok(notices.every((instanceId) => instanceId === id));
  } finally {
    await runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});
