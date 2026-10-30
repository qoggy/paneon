import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measureTestStep, readTestTimings, summarizeTestTimings } from './test-timing.ts';

void test('test timing preserves task results and the original rejection', async (context) => {
  const previous = process.env.PANEON_TEST_TIMINGS;
  const output: string[] = [];
  context.mock.method(process.stdout, 'write', (value: string) => {
    output.push(value);
    return true;
  });
  try {
    process.env.PANEON_TEST_TIMINGS = '1';
    const value = {};
    assert.equal(await measureTestStep('success', () => Promise.resolve(value)), value);
    const error = new Error('fixture failed');
    await assert.rejects(
      measureTestStep('failure', () => Promise.reject(error)),
      (caught) => caught === error,
    );
    const timings = readTestTimings(output.join(''));
    assert.deepEqual(
      timings.map(({ step, success }) => ({ step, success })),
      [
        { step: 'success', success: true },
        { step: 'failure', success: false },
      ],
    );
    assert.ok(timings.every((timing) => timing.milliseconds >= 0));
    process.env.PANEON_TEST_TIMINGS = '0';
    await measureTestStep('disabled', () => Promise.resolve());
    assert.equal(readTestTimings(output.join('')).length, 2);
  } finally {
    if (previous === undefined) delete process.env.PANEON_TEST_TIMINGS;
    else process.env.PANEON_TEST_TIMINGS = previous;
  }
});

void test('timings survive nested suite/TAP output and retain failures in cumulative stage totals', () => {
  const timings = readTestTimings(
    [
      'ordinary test output',
      'PANEON_TEST_TIMING {"step":"package.install","milliseconds":12.5,"success":true}',
      '# PANEON_TEST_TIMING {"step":"panel.run","milliseconds":3,"success":true}',
      'PANEON_TEST_TIMING {"step":"panel.run","milliseconds":2,"success":false}',
    ].join('\n'),
  );
  assert.deepEqual(summarizeTestTimings(timings), [
    { step: 'package.install', calls: 1, milliseconds: 12.5, failures: 0 },
    { step: 'panel.run', calls: 2, milliseconds: 5, failures: 1 },
  ]);
  assert.throws(
    () => readTestTimings('PANEON_TEST_TIMING {"step":"bad","milliseconds":-1,"success":true}'),
    /Invalid test timing/,
  );
});
