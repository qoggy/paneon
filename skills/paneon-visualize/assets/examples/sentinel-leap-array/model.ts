// Teaching model checked against Alibaba Sentinel at SOURCE_COMMIT.
// It mirrors sequential BucketLeapArray access, not Java concurrency or performance.
export const SOURCE_COMMIT = 'a3f40ba8e900c8489bd520274739f17235a7721c';
export const SOURCE_ROOT = `https://github.com/alibaba/Sentinel/blob/${SOURCE_COMMIT}/sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic`;
export const SAMPLE_COUNT = 4;
export const INTERVAL_MS = 2000;
export const WINDOW_MS = INTERVAL_MS / SAMPLE_COUNT;
export type Bucket = { start: number; pass: number };
export type Slots = (Bucket | null)[];
export type Branch = 'create' | 'reuse' | 'reset' | 'detached' | 'invalid';
export function emptySlots(): Slots {
  return Array<Bucket | null>(SAMPLE_COUNT).fill(null);
}
export function mapping(time: number) {
  return { index: Math.floor(time / WINDOW_MS) % SAMPLE_COUNT, start: time - (time % WINDOW_MS) };
}
export function deprecated(time: number, bucket: Bucket) {
  return time - bucket.start > INTERVAL_MS;
}
export function values(slots: Slots, time: number) {
  return time < 0
    ? []
    : slots.filter((bucket): bucket is Bucket => bucket !== null && !deprecated(time, bucket));
}
export function windowValue(slots: Slots, time: number) {
  if (time < 0) return null;
  const bucket = slots[mapping(time).index];
  return bucket && bucket.start <= time && time < bucket.start + WINDOW_MS ? bucket.pass : null;
}
export function access(
  slots: Slots,
  time: number,
  pass = 0,
): { slots: Slots; branch: Branch; returned: Bucket | null } {
  if (!Number.isSafeInteger(time) || !Number.isSafeInteger(pass) || pass < 0)
    throw new Error('需要整数时间和非负样本。');
  if (time < 0) return { slots, branch: 'invalid', returned: null };
  const { index, start } = mapping(time);
  const old = slots[index];
  const branch = !old
    ? 'create'
    : start === old.start
      ? 'reuse'
      : start > old.start
        ? 'reset'
        : 'detached';
  const returned = { start, pass: (branch === 'reuse' && old ? old.pass : 0) + pass };
  if (branch === 'detached') return { slots, branch, returned };
  const next = slots.slice();
  next[index] = returned;
  return { slots: next, branch, returned };
}
export const BRANCH_TEXT: Record<Branch, string> = {
  create: '槽位为空：Java 用 CAS 安装新桶；这里顺序模拟成功安装。',
  reuse: 'windowStart 相同：返回已有桶，已有 PASS 计数保留。',
  reset:
    '新 windowStart 更大：Java 获取更新锁后 resetTo，并清零指标；这里只重置被访问的这一个槽位。',
  detached:
    '新 windowStart 更小：返回独立空桶，不写回环形数组。记录在这个返回桶上的样本也不进入环内统计。',
  invalid: '负时间：currentWindow 返回 null，values 返回空列表。',
};
