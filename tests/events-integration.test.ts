import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { promisify } from 'node:util';

const { startServer } =
  (await import('./runtime-fixture.ts')) as typeof import('../src/runtime/server.js');
const execute = promisify(execFile);
type Event = { id: number; type: string; payload: { text: string }; revision: string };
type ReadResult = {
  events: Event[];
  lastAckId: number;
  lastDeliveredId: number;
  hasMore: boolean;
  timedOut: boolean;
};
type CliEnvelope = {
  ok: boolean;
  data?: ReadResult | { lastAckId: number };
  error?: { code: string; message: string };
};

void test(
  'real CLI event waits, durable delivery, bounded pages, acknowledgements and shutdown',
  { timeout: 120_000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'paneon-cli-events-'));
    const storage = join(home, '.paneon');
    const entry = join(home, 'feedback.tsx');
    await writeFile(
      entry,
      `import {definePanel,z} from 'paneon/sdk';function Panel(){return <p>Feedback</p>}export default definePanel({id:'feedback',requires:{paneon:'0.0.0'},input:z.object({}),events:{feedback:z.object({text:z.string().min(1)})},render:Panel});`,
    );
    const started = await startServer(storage);
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: home };
    delete env.PANEON_HOME;
    const cli = async (...args: string[]) => {
      try {
        const output = await execute(
          process.execPath,
          [join(import.meta.dirname, '../dist/cli/index.js'), 'panel', ...args, '--json'],
          { env, encoding: 'utf8', timeout: 40_000 },
        );
        return { exitCode: 0, result: JSON.parse(output.stdout) as CliEnvelope };
      } catch (error) {
        const failure = error as Error & { code: number; stdout: string };
        return { exitCode: failure.code, result: JSON.parse(failure.stdout) as CliEnvelope };
      }
    };
    const read = async (instanceId: string, consumer: string, ...options: string[]) => {
      const outcome = await cli('events', instanceId, '--consumer', consumer, ...options);
      assert.equal(outcome.exitCode, 0);
      assert.equal(outcome.result.ok, true);
      return outcome.result.data as ReadResult;
    };
    const acknowledge = async (
      instanceId: string,
      consumer: string,
      through: number,
      succeeds = true,
    ) => {
      const outcome = await cli(
        'ack',
        instanceId,
        '--consumer',
        consumer,
        '--through',
        String(through),
      );
      assert.equal(outcome.exitCode, succeeds ? 0 : 1);
      assert.equal(outcome.result.ok, succeeds);
      if (succeeds) assert.deepEqual(outcome.result.data, { lastAckId: through });
      else assert.equal(outcome.result.error?.code, 'INVALID_ACK');
    };
    const waitUntilSubscribed = async (previousCount: number) => {
      const deadline = Date.now() + 10_000;
      while (started.runtime.listenerCount('event') <= previousCount && Date.now() < deadline)
        await delay(10);
      assert.ok(
        started.runtime.listenerCount('event') > previousCount,
        'the real CLI request must reach the runtime wait before triggering an event or stop',
      );
    };
    try {
      const panel = await started.runtime.run(entry, home, {}, false);
      const secondPanel = await started.runtime.run(entry, home, {}, false);

      const timeoutStart = performance.now();
      const empty = await read(panel.instanceId, 'timeout', '--wait-ms', '200');
      const timeoutDuration = performance.now() - timeoutStart;
      assert.deepEqual(empty, {
        events: [],
        lastAckId: 0,
        lastDeliveredId: 0,
        hasMore: false,
        timedOut: true,
      });
      assert.ok(
        timeoutDuration >= 180 && timeoutDuration < 5_000,
        `a 200ms wait must expire normally within a bounded interval; observed ${timeoutDuration}ms`,
      );
      for (const value of ['-1', '60001', 'invalid']) {
        const invalid = await cli(
          'events',
          panel.instanceId,
          '--consumer',
          'bounds',
          '--wait-ms',
          value,
        );
        assert.equal(invalid.exitCode, 1);
        assert.equal(invalid.result.error?.code, 'INVALID_ARGUMENT');
      }

      const previousListeners = started.runtime.listenerCount('event');
      const waitStart = performance.now();
      const waiting = read(panel.instanceId, 'agent', '--wait-ms', '30000');
      await waitUntilSubscribed(previousListeners);
      const first = await started.runtime.append(panel.instanceId, panel.revision, 'feedback', {
        text: '第一条反馈',
      });
      const database = new DatabaseSync(join(storage, 'runtime.sqlite'), { readOnly: true });
      try {
        const saved = database
          .prepare('SELECT payload_json FROM events WHERE id = ?')
          .get(first.id) as { payload_json: string };
        assert.deepEqual(JSON.parse(saved.payload_json) as unknown, { text: '第一条反馈' });
      } finally {
        database.close();
      }
      const delivered = await waiting;
      assert.ok(
        performance.now() - waitStart < 10_000,
        'a committed event must end the 30-second wait early',
      );
      assert.equal(delivered.timedOut, false);
      assert.equal(delivered.events[0]?.id, first.id);
      assert.equal(delivered.events[0]?.payload.text, '第一条反馈');
      assert.equal(delivered.lastAckId, 0);
      assert.deepEqual(
        (await read(panel.instanceId, 'agent')).events,
        delivered.events,
        'reading must not acknowledge',
      );

      const second = await started.runtime.append(panel.instanceId, panel.revision, 'feedback', {
        text: 'second',
      });
      const third = await started.runtime.append(panel.instanceId, panel.revision, 'feedback', {
        text: 'third',
      });
      const page = await read(panel.instanceId, 'agent', '--limit', '2');
      assert.deepEqual(
        page.events.map((event) => event.id),
        [first.id, second.id],
      );
      assert.equal(page.hasMore, true);
      assert.equal(page.lastDeliveredId, second.id);
      await acknowledge(panel.instanceId, 'agent', third.id, false);
      await acknowledge(panel.instanceId, 'agent', second.id);
      await acknowledge(panel.instanceId, 'agent', first.id, false);
      const finalPage = await read(panel.instanceId, 'agent', '--limit', '2');
      assert.deepEqual(
        finalPage.events.map((event) => event.id),
        [third.id],
      );
      assert.equal(finalPage.hasMore, false);
      await acknowledge(panel.instanceId, 'agent', third.id);
      await acknowledge(panel.instanceId, 'agent', third.id);
      assert.deepEqual((await read(panel.instanceId, 'agent')).events, []);

      const observer = await read(panel.instanceId, 'observer', '--limit', '1');
      assert.equal(observer.lastAckId, 0);
      assert.equal(observer.events[0]?.id, first.id);
      assert.equal(observer.hasMore, true);
      await acknowledge(panel.instanceId, 'observer', third.id, false);
      await acknowledge(panel.instanceId, 'observer', first.id);
      assert.deepEqual(
        (await read(panel.instanceId, 'observer')).events.map((event) => event.id),
        [second.id, third.id],
      );
      assert.equal((await read(panel.instanceId, 'agent')).lastAckId, third.id);

      const parallelPages = await Promise.all(
        [1, 2, 3].map((limit) => read(panel.instanceId, 'parallel', '--limit', String(limit))),
      );
      for (const [index, result] of parallelPages.entries())
        assert.deepEqual(
          result.events.map((event) => event.id),
          [first.id, second.id, third.id].slice(0, index + 1),
        );
      assert.equal((await read(panel.instanceId, 'parallel')).lastDeliveredId, third.id);
      const parallelAcks = await Promise.all(
        [second.id, third.id].map((through) =>
          cli('ack', panel.instanceId, '--consumer', 'parallel', '--through', String(through)),
        ),
      );
      assert.equal(parallelAcks[1]?.result.ok, true);
      if (!parallelAcks[0]?.result.ok)
        assert.equal(parallelAcks[0]?.result.error?.code, 'INVALID_ACK');
      const afterParallel = await read(panel.instanceId, 'parallel');
      assert.equal(afterParallel.lastAckId, third.id);
      assert.deepEqual(afterParallel.events, []);
      assert.equal((await read(panel.instanceId, 'agent')).lastAckId, third.id);

      const foreign = await started.runtime.append(
        secondPanel.instanceId,
        secondPanel.revision,
        'feedback',
        { text: 'other instance' },
      );
      await read(secondPanel.instanceId, 'agent');
      await acknowledge(panel.instanceId, 'agent', foreign.id, false);
      await assert.rejects(
        started.runtime.append(panel.instanceId, panel.revision, 'unknown', { text: 'rejected' }),
        { code: 'INVALID_EVENT' },
      );
      await assert.rejects(
        started.runtime.append(panel.instanceId, panel.revision, 'feedback', { text: 7 }),
        { code: 'INVALID_EVENT' },
      );
      await assert.rejects(
        started.runtime.append(panel.instanceId, panel.revision, 'feedback', {
          text: 'x'.repeat(65_537),
        }),
        { code: 'INVALID_EVENT' },
      );
      assert.deepEqual(
        (await read(panel.instanceId, 'history')).events.map((event) => event.id),
        [first.id, second.id, third.id],
      );

      await started.runtime.closePanel(panel.instanceId);
      const closedHistory = await read(panel.instanceId, 'history');
      assert.deepEqual(
        closedHistory.events.map((event) => event.id),
        [first.id, second.id, third.id],
      );
      await acknowledge(panel.instanceId, 'history', third.id);

      await read(secondPanel.instanceId, 'stop-wait');
      await acknowledge(secondPanel.instanceId, 'stop-wait', foreign.id);
      const beforeStopListeners = started.runtime.listenerCount('event');
      const interrupted = cli(
        'events',
        secondPanel.instanceId,
        '--consumer',
        'stop-wait',
        '--wait-ms',
        '30000',
      );
      await waitUntilSubscribed(beforeStopListeners);
      const stopStart = performance.now();
      await started.stop();
      const stoppedWait = await interrupted;
      assert.ok(
        performance.now() - stopStart < 5_000,
        'stopping must release pending event reads promptly',
      );
      assert.equal(stoppedWait.exitCode, 1);
      assert.equal(stoppedWait.result.ok, false);
      assert.equal(stoppedWait.result.error?.code, 'RUNTIME_UNAVAILABLE');
      assert.equal(
        stoppedWait.result.data,
        undefined,
        'service shutdown is an error, not an empty timed-out read',
      );
    } finally {
      await started.stop();
      await rm(home, { recursive: true, force: true });
    }
  },
);
