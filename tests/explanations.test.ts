import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  STRATEGIES,
  PHILOSOPHERS,
  advance,
  actionText,
  completed,
  deadlockCycle,
  forkOrder,
  initialState,
  instructions,
  nextFork,
  phaseText,
  simulationText,
  simulationTrace,
  waitingFor,
} from '../skills/paneon/assets/examples/dining-philosophers/model.ts';
import {
  access,
  deprecated,
  emptySlots,
  mapping,
  values,
  windowValue,
} from '../skills/paneon/assets/examples/sentinel-leap-array/model.ts';

void test('each successful turn executes exactly one of the six displayed lines', () => {
  for (const strategy of STRATEGIES) {
    assert.equal(instructions(strategy).length, 6);
    let state = initialState(strategy);
    const snapshots = [state];
    for (let line = 0; line < 6; line++) {
      const before = structuredClone(state);
      state = advance({ ...state, cursor: 0 });
      assert.deepEqual(snapshots.at(-1), before, 'previous snapshots remain immutable');
      assert.deepEqual(state.action.kind, 'execute');
      assert.equal(state.action.line, line);
      assert.equal(state.philosophers[0].pc, line + 1);
      snapshots.push(state);
    }
    assert.ok(
      snapshots[1].forks.every((owner) => owner === null),
      'enter does not take a fork',
    );
    assert.equal(snapshots[2].forks.filter((owner) => owner === 0).length, 1);
    assert.equal(snapshots[3].forks.filter((owner) => owner === 0).length, 2);
    assert.equal(snapshots[3].philosophers[0].phase, 'holding-both');
    assert.equal(snapshots[3].philosophers[0].meals, 0, 'taking both forks does not execute eat');
    assert.equal(snapshots[4].philosophers[0].phase, 'eating');
    assert.equal(snapshots[4].philosophers[0].meals, 1);
    assert.ok(snapshots[5].forks.every((owner) => owner === null));
    assert.equal(snapshots[5].philosophers[0].phase, 'leaving');
    assert.equal(snapshots[5].gate, strategy === 'serial' ? 0 : null, 'put does not execute leave');
    assert.equal(snapshots[6].gate, null);
    assert.equal(snapshots[6].philosophers[0].phase, 'done');
  }
});
void test('future take(right) intent becomes blocked only after that line is attempted', () => {
  const trace = simulationTrace('left');
  assert.equal(trace.length, 16);
  assert.equal(trace[10].forks[4], 4);
  assert.equal(trace[10].philosophers[4].pc, 2);
  assert.equal(phaseText(trace[10], 4), '持有一把叉');
  assert.equal(nextFork(trace[10], 4), 0);
  assert.equal(waitingFor(trace[10], 4), null);
  assert.match(actionText(trace[10]), /P4.*take\(left\).*拿起 F4/);
  for (let step = 11; step <= 15; step++) {
    const state = trace[step];
    const id = step - 11;
    assert.equal(state.action.kind, 'wait');
    assert.equal(state.action.philosopher, id);
    assert.equal(state.action.line, 2);
    assert.equal(state.philosophers[id].pc, 2, 'blocked instructions do not advance');
    assert.deepEqual(state.forks, trace[10].forks);
    assert.equal(PHILOSOPHERS.filter((person) => waitingFor(state, person)).length, id + 1);
    assert.deepEqual(deadlockCycle(state), step === 15 ? [0, 1, 2, 3, 4] : []);
  }
  assert.equal(advance(trace[15]), trace[15]);
  assert.match(actionText(trace[15]), /P4.*take\(right\).*等待 F0/);
});
void test('completed solutions execute all six lines once per philosopher', () => {
  for (const strategy of ['serial', 'ordered'] as const) {
    const trace = simulationTrace(strategy);
    assert.ok(completed(trace.at(-1)!));
    assert.ok(trace.every((state) => deadlockCycle(state).length === 0));
    assert.deepEqual(trace.at(-1)!.forks, [null, null, null, null, null]);
    assert.equal(trace.at(-1)!.gate, null);
    for (const id of PHILOSOPHERS) {
      const executions = trace.flatMap((state) =>
        state.action.kind === 'execute' && state.action.philosopher === id
          ? [state.action.line]
          : [],
      );
      assert.deepEqual(executions, [0, 1, 2, 3, 4, 5]);
      assert.equal(trace.at(-1)!.philosophers[id].meals, 1);
    }
    assert.equal(advance(trace.at(-1)!), trace.at(-1));
  }
});
void test('mutual exclusion and real ownership hold at every instruction boundary', () => {
  for (const strategy of STRATEGIES) {
    for (const state of simulationTrace(strategy)) {
      for (const id of PHILOSOPHERS) {
        const person = state.philosophers[id];
        const held = state.forks.flatMap((owner, fork) => (owner === id ? [fork] : []));
        assert.ok(held.every((fork) => forkOrder(strategy, id).includes(fork)));
        assert.equal(held.length, person.pc === 2 ? 1 : person.pc === 3 || person.pc === 4 ? 2 : 0);
        if (person.phase === 'eating') assert.equal(person.pc, 4);
        if (strategy === 'serial' && person.pc > 0 && person.pc < 6) assert.equal(state.gate, id);
        const wait = waitingFor(state, id);
        if (wait?.fork !== null && wait?.fork !== undefined) {
          assert.equal(state.forks[wait.fork], wait.owner);
          assert.equal(nextFork(state, id), wait.fork);
        }
      }
      if (strategy === 'serial')
        assert.ok(state.philosophers.filter((person) => person.phase === 'eating').length <= 1);
    }
  }
});
void test('ordered forks allow nonadjacent philosophers to execute eat without a global permit', () => {
  let state = initialState('ordered');
  for (const id of [0, 2])
    for (let line = 0; line < 4; line++) state = advance({ ...state, cursor: id });
  assert.equal(state.gate, null);
  assert.deepEqual(state.philosophers.filter((person) => person.phase === 'eating').length, 2);
});
void test('a permit wait can persist after put until the separate leave instruction', () => {
  const trace = simulationTrace('serial');
  const released = trace.find(
    (state) =>
      state.action.kind === 'execute' && state.action.philosopher === 0 && state.action.line === 4,
  )!;
  assert.ok(released.forks.every((owner) => owner === null));
  assert.deepEqual(waitingFor(released, 2), { owner: 0, fork: null });
  assert.equal(phaseText(released, 2), '等待名额');
  const left = trace.find(
    (state) =>
      state.action.kind === 'execute' && state.action.philosopher === 0 && state.action.line === 5,
  )!;
  assert.equal(waitingFor(left, 2), null);
  assert.match(
    simulationText({
      kind: 'philosopher',
      strategy: 'serial',
      step: released.step,
      philosopher: 2,
    }),
    /等待就餐名额（P0 占用）/,
  );
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
