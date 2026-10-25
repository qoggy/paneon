import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import pino from 'pino';
const { Runtime } = (await import(
  '../dist/runtime/' + 'lifecycle.js'
)) as typeof import('../src/runtime/lifecycle.js');
const logger = pino({ level: 'silent' });

function source(marker: string, label = 'original') {
  return `import{definePanel,serverAction,z}from'paneon/sdk';import{appendFileSync}from'node:fs';
const boot=(appendFileSync(${JSON.stringify(marker)},'boot\\n'),true);const state={count:0};
export const read=serverAction({input:z.object({delay:z.number().optional()}),handler:async(_ctx,input)=>{await new Promise(resolve=>setTimeout(resolve,input.delay??0));return{count:++state.count,boot,label:${JSON.stringify(label)},cwd:process.cwd()};}});
function Panel(){return <div>${label}</div>}
export default definePanel({id:'resource',requires:{paneon:'0.0.0'},input:z.object({}),events:{done:z.object({text:z.string().refine(text=>text!=='blocked')})},render:Panel});`;
}
async function until(check: () => boolean, timeout = 15000) {
  const end = Date.now() + timeout;
  while (!check() && Date.now() < end) await delay(10);
  assert.equal(check(), true);
}

void test('restore and indexed history reads do not evaluate any historical panel or unrelated params', async () => {
  const root = mkdtempSync(join(tmpdir(), 'paneon-lazy-history-'));
  const runtime = new Runtime(root, logger);
  try {
    const now = new Date().toISOString();
    for (let index = 0; index < 1000; index++)
      runtime.store.save({
        instanceId: 'history-' + index,
        definitionId: 'history',
        status: 'running',
        entryPath: join(root, 'missing.tsx'),
        cwd: root,
        params: {},
        watch: true,
        revision: 'old',
        createdAt: now,
        updatedAt: now,
        requires: { paneon: '0.0.0' },
        paneonVersion: '0.0.0',
      });
    runtime.store.db
      .prepare("UPDATE panels SET params_json = 'invalid JSON' WHERE id = 'history-999'")
      .run();
    runtime.store.append('history-0', 'old', 'done', { text: 'retained' });
    await runtime.restore();
    assert.equal(runtime.resourceUsage.residentPanels, 0);
    assert.equal(runtime.resourceUsage.workers, 0);
    assert.equal(runtime.resourceUsage.watchers, 0);
    assert.equal(runtime.inspect('history-0').status, 'running');
    assert.equal(runtime.store.listPage().total, 1000);
    const events = await runtime.events('history-0', 'agent', 100, 0);
    assert.equal(events.events.length, 1);
    assert.equal(existsSync(join(root, 'panels')), false);
  } finally {
    await runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

void test(
  'idle LRU wakes reuse artifacts, preserve concurrent calls and keep event schemas',
  { timeout: 90000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'paneon-lru-wake-'));
    const marker = join(root, 'boots');
    const entry = join(root, 'panel.tsx');
    const home = join(root, 'data');
    writeFileSync(entry, source(marker));
    let runtime = new Runtime(home, logger, { maxPanels: 2 });
    try {
      const first = await runtime.run(entry, root, {}, false);
      const firstChild = runtime.live.get(first.instanceId)?.execution?.child;
      assert.ok(firstChild);
      const second = await runtime.run(entry, root, {}, false);
      const invoke = (id: string, revision: string, input = {}) =>
        runtime.invoke(id, revision, 'panel.tsx#read', input);
      await invoke(first.instanceId, first.revision);
      const secondChild = runtime.live.get(second.instanceId)?.execution?.child;
      assert.ok(secondChild);
      const third = await runtime.run(entry, root, {}, false);
      assert.equal(runtime.live.has(second.instanceId), false);
      assert.notEqual(secondChild.exitCode ?? secondChild.signalCode, null);
      const boots = readFileSync(marker, 'utf8').split('\n').length;
      const result = await invoke(second.instanceId, second.revision);
      assert.equal((result as { label: string }).label, 'original');
      assert.equal(
        readFileSync(marker, 'utf8').split('\n').length,
        boots + 1,
        'wake must evaluate only execution, not metadata compilation',
      );
      await assert.rejects(
        runtime.append(second.instanceId, second.revision, 'done', { text: 'blocked' }),
        { code: 'INVALID_EVENT' },
      );
      await runtime.append(second.instanceId, second.revision, 'done', { text: 'retained' });
      // A short second call completes before the long first one: no per-panel serialization.
      const order: number[] = [];
      await Promise.all([
        invoke(second.instanceId, second.revision, { delay: 100 }).then(() => order.push(1)),
        invoke(second.instanceId, second.revision, { delay: 1 }).then(() => order.push(2)),
      ]);
      assert.deepEqual(order, [2, 1]);
      assert.ok(runtime.resourceUsage.workers <= 2);
      assert.ok(runtime.artifact(third.instanceId, third.revision));
      await runtime.stop();
      runtime = new Runtime(home, logger, { maxPanels: 2 });
      await runtime.restore();
      assert.equal(runtime.resourceUsage.workers, 0);
      assert.ok(runtime.inspect(first.instanceId).manifest);
      const originalBoots = readFileSync(marker, 'utf8');
      const cold = await invoke(second.instanceId, second.revision);
      assert.equal((cold as { count: number }).count, 1);
      assert.equal(readFileSync(marker, 'utf8'), originalBoots + 'boot\n');
      await runtime.reload(second.instanceId);
      const reloaded = await invoke(second.instanceId, second.revision);
      assert.equal((reloaded as { count: number }).count, 1);
    } finally {
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test(
  'busy capacity expires without running the rejected panel and close cancels queued activation',
  { timeout: 60000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'paneon-lru-busy-'));
    const entry = join(root, 'panel.tsx');
    writeFileSync(entry, source(join(root, 'boots')));
    const runtime = new Runtime(join(root, 'data'), logger, { maxPanels: 1, waitMs: 100 });
    try {
      const first = await runtime.run(entry, root, {}, false);
      const second = await runtime.run(entry, root, {}, false);
      const held = runtime.invoke(second.instanceId, second.revision, 'panel.tsx#read', {
        delay: 500,
      });
      const rejected = assert.rejects(
        runtime.invoke(first.instanceId, first.revision, 'panel.tsx#read', {}),
        { code: 'RUNTIME_BUSY' },
      );
      await rejected;
      assert.equal(runtime.live.has(first.instanceId), false);
      const closing = assert.rejects(
        runtime.invoke(first.instanceId, first.revision, 'panel.tsx#read', {}),
        { code: 'PANEL_CLOSED' },
      );
      await runtime.closePanel(first.instanceId);
      await closing;
      await held;
      assert.equal(runtime.live.has(first.instanceId), false);
      assert.equal(runtime.resourceUsage.residentPanels, 1);
    } finally {
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test(
  'bounded watch reactivation detects sleeping edits without starting an execution child',
  { timeout: 60000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'paneon-lru-watch-'));
    const entry = join(root, 'panel.tsx');
    const marker = join(root, 'boots');
    const home = join(root, 'data');
    writeFileSync(entry, source(marker));
    let runtime = new Runtime(home, logger, { maxPanels: 1 });
    try {
      const first = await runtime.run(entry, root, {}, true);
      await runtime.run(entry, root, {}, false);
      assert.equal(runtime.live.has(first.instanceId), false);
      writeFileSync(entry, source(marker, 'changed') + '\nconst invalid = ;');
      await assert.rejects(runtime.observe(first.instanceId), { code: 'BUILD_FAILED' });
      assert.equal(
        runtime.resourceUsage.watchers,
        1,
        'a cold failed build must keep watching for correction',
      );
      writeFileSync(entry, source(marker, 'changed'));
      await until(() => runtime.inspect(first.instanceId).revision !== first.revision);
      const current = runtime.inspect(first.instanceId);
      assert.notEqual(current.revision, first.revision);
      assert.equal(runtime.resourceUsage.workers, 0);
      assert.equal(runtime.resourceUsage.watchers, 1);
      await assert.rejects(runtime.invoke(first.instanceId, first.revision, 'panel.tsx#read', {}), {
        code: 'PANEL_REVISION_MISMATCH',
      });
      const result = await runtime.invoke(first.instanceId, current.revision, 'panel.tsx#read', {});
      assert.equal((result as { label: string }).label, 'changed');
      await runtime.stop();
      runtime = new Runtime(home, logger, { maxPanels: 1 });
      await runtime.restore();
      await runtime.observe(first.instanceId);
      assert.equal(runtime.resourceUsage.workers, 0);
      writeFileSync(entry, source(marker, 'watched'));
      await until(() => runtime.inspect(first.instanceId).revision !== current.revision);
      assert.equal(runtime.resourceUsage.workers, 0, 'watch-only updates must stay execution-cold');
    } finally {
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test(
  '1, 5 and 10 active identities saturate residency and compiler admission stays serial',
  { timeout: 90000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'paneon-residency-scale-'));
    const entry = join(root, 'panel.tsx');
    writeFileSync(entry, source(join(root, 'boots')));
    const home = join(root, 'data');
    const runtime = new Runtime(home, logger, { maxPanels: 3 });
    try {
      const pending = Array.from({ length: 3 }, () => runtime.run(entry, root, {}, false));
      let maximumBuilds = 0;
      const sample = setInterval(() => {
        maximumBuilds = Math.max(maximumBuilds, runtime.resourceUsage.compiling);
      }, 5);
      let panels;
      try {
        panels = await Promise.all(pending);
      } finally {
        clearInterval(sample);
      }
      assert.equal(maximumBuilds, 1);
      const original = runtime.store.get(panels[0].instanceId);
      for (let index = 0; index < 10; index++) {
        const id = 'scale-' + index;
        cpSync(join(home, 'panels', original.instanceId), join(home, 'panels', id), {
          recursive: true,
        });
        runtime.store.save({ ...original, instanceId: id });
      }
      for (const active of [1, 5, 10]) {
        for (let round = 0; round < 2; round++)
          for (let index = 0; index < active; index++) {
            await runtime.invoke('scale-' + index, original.revision, 'panel.tsx#read', {});
            assert.ok(runtime.resourceUsage.residentPanels <= 3);
            assert.ok(runtime.resourceUsage.workers <= 3);
          }
      }
    } finally {
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test(
  'no-watch cold execution uses saved source until explicit reload',
  { timeout: 60000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'paneon-cold-no-watch-'));
    const entry = join(root, 'panel.tsx');
    const marker = join(root, 'boots');
    const home = join(root, 'data');
    writeFileSync(entry, source(marker));
    let runtime = new Runtime(home, logger);
    try {
      const panel = await runtime.run(entry, root, {}, false);
      await runtime.stop();
      writeFileSync(entry, source(marker, 'edited'));
      runtime = new Runtime(home, logger);
      await runtime.restore();
      const before = readFileSync(marker, 'utf8');
      const result = await runtime.invoke(panel.instanceId, panel.revision, 'panel.tsx#read', {});
      assert.equal((result as { label: string }).label, 'original');
      assert.equal(readFileSync(marker, 'utf8'), before + 'boot\n');
      assert.equal(runtime.resourceUsage.watchers, 0);
      const reloaded = await runtime.reload(panel.instanceId);
      assert.notEqual(reloaded.revision, panel.revision);
      await assert.rejects(runtime.invoke(panel.instanceId, panel.revision, 'panel.tsx#read', {}), {
        code: 'PANEL_REVISION_MISMATCH',
      });
      const edited = await runtime.invoke(
        panel.instanceId,
        reloaded.revision,
        'panel.tsx#read',
        {},
      );
      assert.equal((edited as { label: string }).label, 'edited');
    } finally {
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test(
  'event persistence rechecks close and revision after worker validation',
  { timeout: 60000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'paneon-event-commit-race-'));
    const entry = join(root, 'panel.tsx');
    const marker = join(root, 'boots');
    writeFileSync(entry, source(marker));
    const runtime = new Runtime(join(root, 'data'), logger);
    try {
      for (const mode of ['close', 'reload']) {
        const panel = await runtime.run(entry, root, {}, false);
        const execution = runtime.live.get(panel.instanceId)?.execution;
        assert.ok(execution);
        const original = execution.request.bind(execution);
        let validated = () => {};
        let release = () => {};
        const ready = new Promise<void>((resolve) => {
          validated = resolve;
        });
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        execution.request = async (kind, payload) => {
          const result = await original(kind, payload);
          if (kind === 'validate-event') {
            validated();
            await gate;
          }
          return result;
        };
        const pending = assert.rejects(
          runtime.append(panel.instanceId, panel.revision, 'done', { text: 'never append' }),
          { code: mode === 'close' ? 'PANEL_CLOSED' : 'PANEL_REVISION_MISMATCH' },
        );
        await ready;
        try {
          if (mode === 'close') await runtime.closePanel(panel.instanceId);
          else {
            writeFileSync(entry, source(marker, 'new revision'));
            await runtime.reload(panel.instanceId);
          }
        } finally {
          release();
        }
        await pending;
        assert.equal((await runtime.events(panel.instanceId, 'agent', 100, 0)).events.length, 0);
      }
    } finally {
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test(
  'a crashed child releases calls and the next call gets a fresh child',
  { timeout: 60000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'paneon-lru-exit-'));
    const entry = join(root, 'panel.tsx');
    writeFileSync(entry, source(join(root, 'boots')));
    const runtime = new Runtime(join(root, 'data'), logger);
    try {
      const panel = await runtime.run(entry, root, {}, false);
      const child = runtime.live.get(panel.instanceId)?.execution?.child;
      assert.ok(child);
      const pending = assert.rejects(
        runtime.invoke(panel.instanceId, panel.revision, 'panel.tsx#read', { delay: 1000 }),
        { code: 'RESULT_UNKNOWN' },
      );
      await delay(30);
      child.kill('SIGKILL');
      await pending;
      assert.equal(runtime.resourceUsage.workers, 0);
      assert.deepEqual(
        await runtime.invoke(panel.instanceId, panel.revision, 'panel.tsx#read', {}),
        {
          count: 1,
          boot: true,
          label: 'original',
          cwd: realpathSync(root),
        },
      );
      assert.notEqual(runtime.live.get(panel.instanceId)?.execution?.child.pid, child.pid);
    } finally {
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test(
  'failed initial input validation releases the reserved panel position',
  { timeout: 60000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'paneon-invalid-reservation-'));
    const entry = join(root, 'panel.tsx');
    writeFileSync(entry, source(join(root, 'boots')));
    const runtime = new Runtime(join(root, 'data'), logger, { maxPanels: 1 });
    try {
      await assert.rejects(runtime.run(entry, root, [], false), {
        code: 'INPUT_VALIDATION_FAILED',
      });
      assert.equal(runtime.resourceUsage.residentPanels, 0);
      assert.equal(runtime.resourceUsage.workers, 0);
      assert.equal(runtime.store.listPage().total, 0);
    } finally {
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
