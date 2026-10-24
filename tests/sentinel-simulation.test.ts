import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compile,
  DEFAULT_CONFIG,
  mapTime,
  PRESETS,
  snapshotAt,
  validate,
} from '../skills/paneon/assets/examples/sentinel-leap-array/simulation.ts';

void test('each arrival in a burst is checked separately; blocks never increase PASS', () => {
  const trace = compile(DEFAULT_CONFIG, PRESETS.burst);
  assert.deepEqual(
    trace.events.map((e) => e.allowed),
    [true, true, true, true, true, false, false, false, true],
  );
  assert.equal(trace.events[5].passBefore, 5);
  assert.equal(trace.events[5].after.pass, 5);
  assert.equal(trace.events[5].after.blocked, 1);
  assert.deepEqual(snapshotAt(trace, 100).slots[0], { start: 0, pass: 5, blocked: 1 });
  assert.deepEqual([snapshotAt(trace, 100).passed, snapshotAt(trace, 100).blocked], [5, 1]);
});
void test('reading statistics first resets the requested slot; time alone does not erase it', () => {
  const trace = compile(DEFAULT_CONFIG, [
    { at: 0, count: 2 },
    { at: 250, count: 1 },
    { at: 1000, count: 1 },
  ]);
  const reset = trace.events.at(-1);
  assert.ok(reset);
  assert.equal(reset.branch, 'reset');
  assert.deepEqual(reset.before, { start: 0, pass: 2, blocked: 0 });
  assert.equal(reset.passBefore, 1, 'old slot zero was reset before summing other buckets');
  assert.deepEqual(reset.after, { start: 1000, pass: 1, blocked: 0 });
  assert.equal(snapshotAt(trace, 999).slots[0]?.start, 0);
  assert.equal(snapshotAt(trace, 2001).validPass, 0);
  assert.equal(snapshotAt(trace, 2001).slots[0]?.pass, 1, 'expired bucket remains stored');
});
void test('strict expiration boundary and skipped slots are preserved during idle periods', () => {
  const trace = compile(DEFAULT_CONFIG, PRESETS.idle);
  assert.equal(snapshotAt(trace, 1000).validPass, 3);
  assert.equal(snapshotAt(trace, 1001).validPass, 1);
  const state = snapshotAt(trace, 2500);
  assert.equal(trace.events.find((e) => e.at === 2500)?.branch, 'create');
  assert.equal(state.slots[0]?.start, 0, 'idle periods do not eagerly reset other slots');
  assert.equal(state.slots[3], null, 'skipped slot is never created');
  assert.equal(state.qps, 2);
});
void test('QPS uses interval seconds and the source integer truncation before adding one', () => {
  const trace = compile({ qps: 2, intervalMs: 2000, bucketCount: 4 }, [{ at: 0, count: 5 }]);
  assert.deepEqual(
    trace.events.map((e) => [e.qpsBefore, e.usedTokens, e.allowed]),
    [
      [0, 0, true],
      [0.5, 0, true],
      [1, 1, true],
      [1.5, 1, true],
      [2, 2, false],
    ],
  );
  assert.equal(snapshotAt(trace, 0).qps, 2);
  const fraction = compile({ ...DEFAULT_CONFIG, qps: 1.5 }, [{ at: 0, count: 3 }]);
  assert.deepEqual(
    fraction.events.map((e) => e.allowed),
    [true, false, false],
  );
});
void test('seeking restores exact immutable history, even with unordered input and equal timestamps', () => {
  const requests = [
    { at: 1200, count: 2 },
    { at: 0, count: 2 },
    { at: 100, count: 1 },
    { at: 0, count: 1 },
  ];
  const copy = structuredClone(requests);
  const trace = compile(DEFAULT_CONFIG, requests);
  const original = JSON.stringify(trace);
  assert.deepEqual(
    trace.events.map((e) => e.at),
    [0, 0, 0, 100, 1200, 1200],
  );
  const before = snapshotAt(trace, -1);
  assert.equal(before.processed, 0);
  assert.ok(before.slots.every((b) => b === null));
  const past = snapshotAt(trace, 100);
  snapshotAt(trace, trace.duration);
  assert.deepEqual(snapshotAt(trace, 100), past);
  assert.equal(past.passed, 4);
  assert.equal(
    snapshotAt(trace, 0, 1).passed,
    1,
    'individual requests at the same timestamp are inspectable',
  );
  assert.equal(snapshotAt(trace, 0, 2).passed, 2);
  assert.equal(JSON.stringify(trace), original);
  assert.deepEqual(requests, copy);
  assert.deepEqual(mapTime(1250, DEFAULT_CONFIG), { start: 1250, slot: 1, width: 250 });
});
void test('invalid inputs are rejected without unbounded replay', () => {
  for (const qps of [0, NaN, Infinity, 10001])
    assert.equal(validate({ ...DEFAULT_CONFIG, qps }, PRESETS.burst), 'qps');
  assert.equal(validate({ ...DEFAULT_CONFIG, intervalMs: 999 }, PRESETS.burst), 'buckets');
  for (const count of [0, -1, 1.5, 1001])
    assert.equal(validate(DEFAULT_CONFIG, [{ at: 0, count }]), 'requests');
  for (const at of [-1, 0.5, NaN, 60001])
    assert.equal(validate(DEFAULT_CONFIG, [{ at, count: 1 }]), 'requests');
  assert.equal(validate(DEFAULT_CONFIG, []), 'requests');
  assert.throws(() => compile(DEFAULT_CONFIG, [{ at: 0, count: 1001 }]));
  const trace = compile({ qps: 10000, intervalMs: 10000, bucketCount: 8 }, [
    { at: 60000, count: 1000 },
  ]);
  assert.equal(trace.events.length, 1000);
  assert.equal(snapshotAt(trace, trace.duration).passed, 1000);
  for (const time of [NaN, -2, trace.duration + 1]) assert.throws(() => snapshotAt(trace, time));
});
