export type TestTiming = { step: string; milliseconds: number; success: boolean };

const prefix = 'PANEON_TEST_TIMING ';

/** Test-only diagnostics; results and failures pass through unchanged. */
export async function measureTestStep<T>(step: string, task: () => Promise<T>): Promise<T> {
  if (process.env.PANEON_TEST_TIMINGS !== '1') return task();
  const started = performance.now();
  let success = false;
  try {
    const value = await task();
    success = true;
    return value;
  } finally {
    const timing: TestTiming = {
      step,
      milliseconds: Math.round((performance.now() - started) * 100) / 100,
      success,
    };
    process.stdout.write(prefix + JSON.stringify(timing) + '\n');
  }
}

/** Child suites may be wrapped by Node's TAP reporter before reaching the release runner. */
export function readTestTimings(output: string): TestTiming[] {
  return [...output.matchAll(/^\s*(?:# )?PANEON_TEST_TIMING (.+)$/gm)].map((match) => {
    const value = JSON.parse(match[1]) as TestTiming;
    if (
      typeof value.step !== 'string' ||
      !Number.isFinite(value.milliseconds) ||
      value.milliseconds < 0 ||
      typeof value.success !== 'boolean'
    )
      throw new Error('Invalid test timing record.');
    return value;
  });
}

export function summarizeTestTimings(timings: TestTiming[]) {
  const groups = new Map<
    string,
    { step: string; calls: number; milliseconds: number; failures: number }
  >();
  for (const timing of timings) {
    const group = groups.get(timing.step) ?? {
      step: timing.step,
      calls: 0,
      milliseconds: 0,
      failures: 0,
    };
    group.calls++;
    group.milliseconds += timing.milliseconds;
    group.failures += Number(!timing.success);
    groups.set(timing.step, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    milliseconds: Math.round(group.milliseconds * 100) / 100,
  }));
}
