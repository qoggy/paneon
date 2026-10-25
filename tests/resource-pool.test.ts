import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
const { ResourcePool } = (await import(
  '../dist/runtime/' + 'resource-pool.js'
)) as typeof import('../src/runtime/resource-pool.js');

void test('LRU skips busy panels and counts retiring capacity until disposal finishes', async () => {
  const disposed: string[] = [];
  const errors: unknown[] = [];
  let finishRetirement = () => {};
  const retirement = new Promise<void>((resolve) => {
    finishRetirement = resolve;
  });
  const pool = new ResourcePool(
    2,
    async (key) => {
      disposed.push(key);
      if (key === 'b') await retirement;
    },
    (error) => errors.push(error),
  );
  const a = await pool.acquire('a');
  const sameA = await pool.acquire('a');
  const b = await pool.acquire('b');
  a.release();
  const waiting = pool.acquire('c');
  assert.equal(pool.queued, 1);
  b.release();
  await delay(5);
  assert.deepEqual(disposed, ['b']);
  assert.equal(pool.size, 2);
  assert.equal(pool.queued, 1);
  finishRetirement();
  const c = await waiting;
  assert.equal(pool.size, 2);
  assert.equal(sameA.signal.aborted, false);
  c.release();
  sameA.release();
  await pool.stop();
  assert.equal(pool.size, 0);
  assert.deepEqual(errors, []);
});

void test('bounded capacity waiting expires without later admission and rejects a full queue', async () => {
  const errors: unknown[] = [];
  const pool = new ResourcePool(
    1,
    async () => {},
    (error) => errors.push(error),
    1,
    25,
  );
  const busy = await pool.acquire('busy');
  let admitted = false;
  const waiting = pool.acquire('expired').then((lease) => {
    admitted = true;
    lease.release();
  });
  const expired = assert.rejects(waiting, { code: 'RUNTIME_BUSY' });
  await assert.rejects(pool.acquire('overflow'), { code: 'RUNTIME_BUSY' });
  await expired;
  busy.release();
  await delay(5);
  assert.equal(admitted, false);
  assert.equal(pool.queued, 0);
  await pool.stop();
  assert.deepEqual(errors, []);
});

void test('close and stop reject waiting admissions and abort active leases', async () => {
  const pool = new ResourcePool(
    1,
    async () => {},
    (error) => {
      throw error;
    },
  );
  const busy = await pool.acquire('busy');
  const closed = assert.rejects(pool.acquire('closed'), { code: 'PANEL_CLOSED' });
  await pool.remove('closed', Object.assign(new Error('closed'), { code: 'PANEL_CLOSED' }));
  await closed;
  const stopped = assert.rejects(pool.acquire('other'), { code: 'RUNTIME_UNAVAILABLE' });
  await pool.stop();
  await stopped;
  assert.equal(busy.signal.aborted, true);
  busy.release();
  await assert.rejects(pool.acquire('after-stop'), { code: 'RUNTIME_UNAVAILABLE' });
});

void test('nonresident permits serialize compilation and drain releases without lost wakeups', async () => {
  const errors: unknown[] = [];
  const pool = new ResourcePool(
    1,
    async () => {},
    (error) => errors.push(error),
    32,
    1000,
    false,
  );
  let active = 0;
  let maximum = 0;
  await Promise.all(
    Array.from({ length: 10 }, async (_, index) => {
      const lease = await pool.acquire(String(index));
      active++;
      maximum = Math.max(maximum, active);
      await delay(1);
      active--;
      lease.release();
    }),
  );
  await pool.stop();
  assert.equal(maximum, 1);
  assert.deepEqual(errors, []);
});
