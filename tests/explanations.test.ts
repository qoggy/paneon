import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  schedule,
  simulationText,
  taskState,
} from '../skills/paneon/assets/examples/concurrency/model.ts';
import {
  access,
  deprecated,
  emptySlots,
  mapping,
  values,
  windowValue,
} from '../skills/paneon/assets/examples/sentinel-leap-array/model.ts';

void test('FIFO fixed-duration schedule matches all four accepted results', () => {
  const expected = [
    [
      [0, 4],
      [4, 6],
      [6, 9],
      [9, 10],
    ],
    [
      [0, 4],
      [0, 2],
      [2, 5],
      [4, 5],
    ],
    [
      [0, 4],
      [0, 2],
      [0, 3],
      [2, 3],
    ],
    [
      [0, 4],
      [0, 2],
      [0, 3],
      [0, 1],
    ],
  ];
  for (let c = 1; c <= 4; c++) {
    const tasks = schedule(c);
    assert.deepEqual(
      tasks.map((task) => [task.startMs / 1000, task.endMs / 1000]),
      expected[c - 1],
    );
    for (let t = 0; t <= 10000; t += 100)
      assert.ok(tasks.filter((task) => taskState(task, t) === '执行中').length <= c);
  }
  assert.equal(taskState(schedule(2)[2], 1999), '等待中');
  assert.equal(taskState(schedule(2)[2], 2000), '执行中');
  assert.equal(taskState(schedule(2)[2], 5000), '已完成');
  for (const c of [0, 1.5, 5, NaN]) assert.throws(() => schedule(c));
});
void test('feedback context can be reconstructed after changing playback', () => {
  const original = { kind: 'task' as const, taskId: 'c', concurrency: 2, atMs: 1000 };
  assert.match(simulationText(original), /等待中.*开始 2 秒/);
  assert.match(simulationText({ ...original, concurrency: 4 }), /执行中.*开始 0 秒/);
  assert.match(simulationText(original), /等待中/);
});
void test('Sentinel maps half-open windows to a ring and does not fill skipped slots', () => {
  assert.deepEqual(mapping(499), { index: 0, start: 0 });
  assert.deepEqual(mapping(500), { index: 1, start: 500 });
  assert.deepEqual(mapping(2000), { index: 0, start: 2000 });
  const first = access(emptySlots(), 0, 1);
  assert.equal(first.branch, 'create');
  const same = access(first.slots, 499, 2);
  assert.equal(same.branch, 'reuse');
  assert.equal(same.returned?.pass, 3);
  assert.equal(windowValue(same.slots, 499), 3);
  assert.equal(windowValue(same.slots, 500), null);
  const jump = access(same.slots, 1500, 1);
  assert.equal(jump.slots[1], null);
  assert.equal(jump.slots[2], null);
  assert.equal(jump.slots[3]?.start, 1500);
});
void test('expiration is strict > interval; values filters without clearing; access resets one slot', () => {
  let slots = access(emptySlots(), 0, 2).slots;
  slots = access(slots, 500, 1).slots;
  assert.ok(slots[0]);
  assert.equal(deprecated(2000, slots[0]), false);
  assert.equal(
    values(slots, 2000).reduce((n, bucket) => n + bucket.pass, 0),
    3,
  );
  assert.equal(deprecated(2001, slots[0]), true);
  assert.equal(
    values(slots, 2001).reduce((n, bucket) => n + bucket.pass, 0),
    1,
  );
  assert.equal(slots[0]?.pass, 2, 'reading values must not clear storage');
  const reset = access(slots, 2001, 1);
  assert.equal(reset.branch, 'reset');
  assert.deepEqual(reset.slots[0], { start: 2000, pass: 1 });
  assert.equal(reset.slots[1], slots[1], 'other slots are untouched');
  assert.equal(
    values(reset.slots, 2001).reduce((n, bucket) => n + bucket.pass, 0),
    2,
  );
  const longJump = access(reset.slots, 10000);
  assert.equal(longJump.slots[1]?.start, 500, 'even expired slots are only reset on access');
});
void test('rollback returns a detached bucket, values does not exclude future buckets, negative time is rejected', () => {
  const future = access(emptySlots(), 2001, 4).slots;
  const rollback = access(future, 100, 1);
  assert.equal(rollback.branch, 'detached');
  assert.deepEqual(rollback.returned, { start: 0, pass: 1 });
  assert.equal(rollback.slots, future);
  assert.equal(values(future, 100)[0].pass, 4, 'source has no future-window filter');
  assert.equal(
    windowValue(future, 100),
    null,
    'getWindowValue separately checks half-open containment',
  );
  assert.equal(access(future, -1).returned, null);
  assert.equal(access(future, -1).branch, 'invalid');
  assert.deepEqual(values(future, -1), []);
});
