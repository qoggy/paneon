// Sequential, non-prioritized QPS fast rejection, checked at model.ts SOURCE_COMMIT:
// DefaultController.canPass/avgUsedTokens; StatisticNode.passQps;
// ArrayMetric.pass (currentWindow before values); LeapArray.currentWindow/values.
export type Config = { qps: number; intervalMs: number; bucketCount: number };
export type RequestBatch = { at: number; count: number };
export type Bucket = { start: number; pass: number; blocked: number };
export type RequestEvent = {
  id: number;
  at: number;
  slot: number;
  branch: 'create' | 'reuse' | 'reset';
  before: Bucket | null;
  after: Bucket;
  allowed: boolean;
  passBefore: number;
  qpsBefore: number;
  usedTokens: number;
  slots: (Bucket | null)[];
  passed: number;
  blocked: number;
};
export type Trace = { config: Config; events: RequestEvent[]; duration: number };
export const DEFAULT_CONFIG: Config = { qps: 5, intervalMs: 1000, bucketCount: 4 };
export const PRESETS = {
  steady: Array.from({ length: 12 }, (_, i) => ({ at: i * 250, count: 1 })),
  burst: [
    { at: 0, count: 3 },
    { at: 100, count: 3 },
    { at: 800, count: 2 },
    { at: 1200, count: 1 },
  ],
  idle: [
    { at: 0, count: 2 },
    { at: 250, count: 1 },
    { at: 2500, count: 2 },
  ],
} satisfies Record<string, RequestBatch[]>;
export type Preset = keyof typeof PRESETS;
export type ValidationError = 'qps' | 'interval' | 'buckets' | 'requests';
export function validate(config: Config, requests: RequestBatch[]): ValidationError | null {
  if (!Number.isFinite(config.qps) || config.qps < 1 || config.qps > 10000) return 'qps';
  if (!Number.isInteger(config.intervalMs) || config.intervalMs < 100 || config.intervalMs > 10000)
    return 'interval';
  if (
    !Number.isInteger(config.bucketCount) ||
    config.bucketCount < 2 ||
    config.bucketCount > 8 ||
    config.intervalMs % config.bucketCount !== 0
  )
    return 'buckets';
  if (
    !requests.length ||
    requests.length > 100 ||
    requests.some(
      ({ at, count }) =>
        !Number.isInteger(at) ||
        at < 0 ||
        at > 60000 ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > 1000,
    ) ||
    requests.reduce((sum, r) => sum + r.count, 0) > 1000
  )
    return 'requests';
  return null;
}
export function mapTime(time: number, config: Config) {
  const width = config.intervalMs / config.bucketCount;
  return {
    start: time - (time % width),
    slot: Math.floor(time / width) % config.bucketCount,
    width,
  };
}
export function isValid(bucket: Bucket | null, time: number, config: Config): bucket is Bucket {
  return bucket !== null && time - bucket.start <= config.intervalMs;
}
export function compile(config: Config, requests: RequestBatch[]): Trace {
  const error = validate(config, requests);
  if (error) throw new Error(`Invalid simulation: ${error}`);
  let slots: (Bucket | null)[] = Array<null>(config.bucketCount).fill(null);
  let passed = 0;
  let blocked = 0;
  const events: RequestEvent[] = [];
  // Equal timestamps preserve input order; each count means independent requests, not acquireCount.
  for (const request of [...requests].sort((a, b) => a.at - b.at)) {
    for (let i = 0; i < request.count; i++) {
      const { start, slot } = mapTime(request.at, config);
      const before = slots[slot];
      const branch = before === null ? 'create' : before.start === start ? 'reuse' : 'reset';
      const current = branch === 'reuse' && before ? { ...before } : { start, pass: 0, blocked: 0 };
      slots = slots.slice();
      slots[slot] = current;
      const passBefore = slots.reduce(
        (sum, b) => sum + (isValid(b, request.at, config) ? b.pass : 0),
        0,
      );
      const qpsBefore = passBefore / (config.intervalMs / 1000);
      const usedTokens = Math.floor(qpsBefore);
      const allowed = usedTokens + 1 <= config.qps;
      const after = {
        ...current,
        pass: current.pass + Number(allowed),
        blocked: current.blocked + Number(!allowed),
      };
      slots[slot] = after;
      passed += Number(allowed);
      blocked += Number(!allowed);
      events.push({
        id: events.length + 1,
        at: request.at,
        slot,
        branch,
        before,
        after,
        allowed,
        passBefore,
        qpsBefore,
        usedTokens,
        slots,
        passed,
        blocked,
      });
    }
  }
  return {
    config: { ...config },
    events,
    duration: (events.at(-1)?.at ?? 0) + config.intervalMs + 1,
  };
}
export function snapshotAt(trace: Trace, time: number, throughId = trace.events.length) {
  if (!Number.isFinite(time) || time < -1 || time > trace.duration)
    throw new Error('Invalid cursor');
  if (!Number.isInteger(throughId) || throughId < 0 || throughId > trace.events.length)
    throw new Error('Invalid request cursor');
  let low = 0;
  let high = throughId;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (trace.events[mid].at <= time) low = mid + 1;
    else high = mid;
  }
  const latest = trace.events[low - 1] ?? null;
  const slots = latest?.slots ?? Array<null>(trace.config.bucketCount).fill(null);
  const validPass = slots.reduce(
    (sum, b) => sum + (isValid(b, time, trace.config) ? b.pass : 0),
    0,
  );
  return {
    time,
    slots,
    latest,
    processed: low,
    passed: latest?.passed ?? 0,
    blocked: latest?.blocked ?? 0,
    validPass,
    qps: validPass / (trace.config.intervalMs / 1000),
  };
}
