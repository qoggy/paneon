import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { deduplicateJobs, runJobs } from './release-support.ts';

void test('release jobs overlap independent work while serializing shared resources', async () => {
  const active = new Set<string>();
  const order: string[] = [];
  let peak = 0;
  await runJobs(
    [
      { name: 'first', resources: ['clipboard'] },
      { name: 'second', resources: ['clipboard'] },
      { name: 'independent', resources: [] },
    ],
    2,
    async (job) => {
      assert.ok(!(job.resources.includes('clipboard') && active.has('clipboard')));
      for (const resource of job.resources) active.add(resource);
      order.push(`start:${job.name}`);
      peak = Math.max(
        peak,
        order.filter((item) => item.startsWith('start:')).length -
          order.filter((item) => item.startsWith('end:')).length,
      );
      await delay(10);
      order.push(`end:${job.name}`);
      for (const resource of job.resources) active.delete(resource);
    },
  );
  assert.equal(peak, 2);
  assert.ok(order.indexOf('start:independent') < order.indexOf('end:first'));
  assert.ok(order.indexOf('start:second') > order.indexOf('end:first'));
});

void test('release cancellation stops admission and waits for active cleanup', async () => {
  let stopped = false;
  const completed: string[] = [];
  await runJobs(
    [{ name: 'first' }, { name: 'queued' }],
    1,
    async (job) => {
      stopped = true;
      await delay(5);
      completed.push(job.name);
    },
    () => stopped,
  );
  assert.deepEqual(completed, ['first']);
});

void test('unexpected runner errors drain active jobs and propagate without unhandled rejection', async () => {
  let cleaned = false;
  await assert.rejects(
    runJobs([{ name: 'fail' }, { name: 'active' }, { name: 'queued' }], 2, async (job) => {
      if (job.name === 'fail') throw new Error('spawn failed');
      await delay(5);
      cleaned = true;
    }),
    /spawn failed/,
  );
  assert.equal(cleaned, true);
});

void test('full layout is omitted only when its complete caller is selected', () => {
  const layout = { name: 'git-review-layout' };
  const review = { name: 'git-review', covers: [layout.name] };
  const unique = { name: 'git-history-resizable' };
  assert.deepEqual(deduplicateJobs([review, layout, unique]), [review, unique]);
  assert.deepEqual(deduplicateJobs([layout, unique]), [layout, unique]);
});
