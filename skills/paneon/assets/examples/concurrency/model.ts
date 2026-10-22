export const TASKS = [
  { id: 'a', label: '任务 A', durationMs: 4000 },
  { id: 'b', label: '任务 B', durationMs: 2000 },
  { id: 'c', label: '任务 C', durationMs: 3000 },
  { id: 'd', label: '任务 D', durationMs: 1000 },
] as const;

export function schedule(concurrency: number) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4)
    throw new Error('并发数须为 1–4 的整数。');
  const available = Array<number>(concurrency).fill(0);
  return TASKS.map((task) => {
    // Choosing the first earliest-free lane releases all equal-time completions
    // before the FIFO assignment. Tasks are never preempted.
    const startMs = Math.min(...available);
    const lane = available.indexOf(startMs);
    const endMs = startMs + task.durationMs;
    available[lane] = endMs;
    return { ...task, lane, startMs, endMs, waitMs: startMs };
  });
}
export function taskState(task: { startMs: number; endMs: number }, atMs: number) {
  return atMs < task.startMs ? '等待中' : atMs < task.endMs ? '执行中' : '已完成';
}
export type SimulationRef =
  | { kind: 'task'; taskId: string; concurrency: number; atMs: number }
  | { kind: 'summary'; concurrency: number };
export function simulationText(ref: SimulationRef) {
  const tasks = schedule(ref.concurrency);
  if (ref.kind === 'summary')
    return `并发 ${ref.concurrency}：整批耗时 ${Math.max(...tasks.map((task) => task.endMs)) / 1000} 秒。`;
  const task = tasks.find((item) => item.id === ref.taskId);
  if (!task || !Number.isInteger(ref.atMs) || ref.atMs < 0 || ref.atMs > 10000)
    throw new Error('未知的模拟情境。');
  return `${task.label} · ${taskState(task, ref.atMs)} · 等待 ${task.waitMs / 1000} 秒 · 开始 ${task.startMs / 1000} 秒 · 结束 ${task.endMs / 1000} 秒`;
}
