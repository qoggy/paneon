export const STRATEGIES = ['left', 'serial', 'ordered'] as const;
export type Strategy = (typeof STRATEGIES)[number];
export const PHILOSOPHERS = [0, 1, 2, 3, 4] as const;
export type Language = 'en' | 'zh-CN';
type Phase = 'outside' | 'ready' | 'holding' | 'holding-both' | 'eating' | 'leaving' | 'done';
export type Philosopher = { pc: number; phase: Phase; meals: number; blocked: boolean };
type Action =
  | { kind: 'initial' }
  | {
      kind: 'execute' | 'wait';
      philosopher: number;
      line: number;
      fork?: number;
      owner?: number;
    };
export type Snapshot = {
  strategy: Strategy;
  step: number;
  cursor: number;
  forks: (number | null)[];
  philosophers: Philosopher[];
  gate: number | null;
  action: Action;
};
export type SimulationRef =
  | { kind: 'summary'; strategy: Strategy; step: number }
  | { kind: 'philosopher'; strategy: Strategy; step: number; philosopher: number };

// This is the same six-line program displayed in the detail panel.
export function instructions(strategy: Strategy) {
  return [
    'enter(table);',
    strategy === 'ordered' ? 'take(min(left, right));' : 'take(left);',
    strategy === 'ordered' ? 'take(max(left, right));' : 'take(right);',
    'eat();',
    'put(left); put(right);',
    'leave(table);',
  ];
}
export function forkOrder(strategy: Strategy, philosopher: number) {
  const forks = [philosopher, (philosopher + 1) % 5];
  return strategy === 'ordered' ? forks.sort((a, b) => a - b) : forks;
}
export function nextFork(state: Snapshot, id: number) {
  const pc = state.philosophers[id].pc;
  return pc === 1 || pc === 2 ? forkOrder(state.strategy, id)[pc - 1] : null;
}
function blockedBy(state: Snapshot, id: number) {
  if (
    state.strategy === 'serial' &&
    state.philosophers[id].pc === 0 &&
    state.gate !== null &&
    state.gate !== id
  )
    return { owner: state.gate, fork: null };
  const fork = nextFork(state, id);
  const owner = fork === null ? null : state.forks[fork];
  return owner !== null && owner !== id ? { owner, fork } : null;
}
export function waitingFor(state: Snapshot, id: number) {
  return state.philosophers[id].blocked ? blockedBy(state, id) : null;
}
export function deadlockCycle(state: Snapshot): number[] {
  for (const start of PHILOSOPHERS) {
    const path: number[] = [];
    let current: number | undefined = start;
    while (current !== undefined) {
      const seen = path.indexOf(current);
      if (seen !== -1) return path.slice(seen);
      path.push(current);
      current = waitingFor(state, current)?.owner;
    }
  }
  return [];
}
export function completed(state: Snapshot) {
  return state.philosophers.every((philosopher) => philosopher.pc === 6);
}
export function initialState(strategy: Strategy): Snapshot {
  return {
    strategy,
    step: 0,
    cursor: 0,
    forks: PHILOSOPHERS.map(() => null),
    philosophers: PHILOSOPHERS.map(() => ({ pc: 0, phase: 'outside', meals: 0, blocked: false })),
    gate: null,
    action: { kind: 'initial' },
  };
}
// One turn attempts exactly one displayed source line. A blocked attempt keeps
// the program counter on that line; a successful attempt advances it by one.
// Blocked philosophers do not spin: they become runnable when the resource is released.
export function advance(previous: Snapshot): Snapshot {
  if (completed(previous) || deadlockCycle(previous).length) return previous;
  const state: Snapshot = {
    ...previous,
    step: previous.step + 1,
    forks: [...previous.forks],
    philosophers: previous.philosophers.map((philosopher) => ({ ...philosopher })),
  };
  let id = state.cursor;
  while (state.philosophers[id].pc === 6 || waitingFor(state, id)) id = (id + 1) % 5;
  state.cursor = (id + 1) % 5;
  const philosopher = state.philosophers[id];
  const line = philosopher.pc;
  const wait = blockedBy(state, id);
  if (wait) {
    philosopher.blocked = true;
    state.action = {
      kind: 'wait',
      philosopher: id,
      line,
      owner: wait.owner,
      fork: wait.fork ?? undefined,
    };
    return state;
  }
  philosopher.blocked = false;
  state.action = { kind: 'execute', philosopher: id, line };
  switch (line) {
    case 0:
      if (state.strategy === 'serial') state.gate = id;
      philosopher.phase = 'ready';
      break;
    case 1:
    case 2: {
      const fork = forkOrder(state.strategy, id)[line - 1];
      state.forks[fork] = id;
      state.action.fork = fork;
      philosopher.phase = line === 1 ? 'holding' : 'holding-both';
      break;
    }
    case 3:
      philosopher.meals++;
      philosopher.phase = 'eating';
      break;
    case 4:
      for (const fork of forkOrder(state.strategy, id)) state.forks[fork] = null;
      philosopher.phase = 'leaving';
      break;
    case 5:
      if (state.strategy === 'serial') state.gate = null;
      philosopher.phase = 'done';
      break;
  }
  philosopher.pc++;
  return state;
}
function buildTrace(strategy: Strategy) {
  let state = initialState(strategy);
  const trace = [state];
  while (!completed(state) && !deadlockCycle(state).length) {
    state = advance(state);
    trace.push(state);
  }
  return trace;
}
const traces = Object.fromEntries(
  STRATEGIES.map((strategy) => [strategy, buildTrace(strategy)]),
) as Record<Strategy, Snapshot[]>;
export function simulationTrace(strategy: Strategy): readonly Snapshot[] {
  return traces[strategy];
}
export function snapshotAt(strategy: Strategy, step: number): Snapshot {
  const state = traces[strategy][step];
  if (!state) throw new Error('Unknown simulation step.');
  return state;
}
export function phaseText(state: Snapshot, id: number, language: Language = 'zh-CN') {
  const wait = waitingFor(state, id);
  const phase = wait ? (wait.fork === null ? 'queued' : 'waiting') : state.philosophers[id].phase;
  const labels = {
    outside: ['准备入席', 'Ready to enter'],
    ready: ['准备取叉', 'Ready'],
    holding: ['持有一把叉', 'One fork held'],
    'holding-both': ['双叉就绪', 'Both forks held'],
    eating: ['吃饭中', 'Eating'],
    leaving: ['准备离席', 'Ready to leave'],
    done: ['已离席', 'Finished'],
    queued: ['等待名额', 'Queued'],
    waiting: ['等待中', 'Blocked'],
  };
  return labels[phase][language === 'zh-CN' ? 0 : 1];
}
export function actionText(state: Snapshot, language: Language = 'zh-CN') {
  const action = state.action;
  const zh = language === 'zh-CN';
  if (action.kind === 'initial')
    return zh ? '下一步：P0 · enter(table);' : 'Next: P0 · enter(table);';
  const { philosopher: id, line, fork, owner } = action;
  const code = instructions(state.strategy)[line];
  let result: string;
  if (action.kind === 'wait') {
    result =
      fork === undefined
        ? zh
          ? `等待就餐名额（P${owner} 占用）`
          : `Dining permit held by P${owner}`
        : zh
          ? `等待 F${fork}（P${owner} 占用）`
          : `F${fork} held by P${owner}`;
  } else {
    result = [
      zh ? '入席' : 'Entered',
      zh ? `拿起 F${fork}` : `Picked up F${fork}`,
      zh ? `拿起 F${fork}` : `Picked up F${fork}`,
      zh ? '吃饭' : 'Eating',
      zh ? '放下两把叉子' : 'Released both forks',
      zh ? '离席' : 'Left the table',
    ][line];
  }
  return `P${id} · ${code} · ${result}`;
}
export function simulationText(ref: SimulationRef, language: Language = 'zh-CN') {
  const state = snapshotAt(ref.strategy, ref.step);
  const zh = language === 'zh-CN';
  if (ref.kind === 'summary')
    return (
      actionText(state, language) +
      (deadlockCycle(state).length ? (zh ? ' · 死锁' : ' · Deadlock') : '')
    );
  const held = state.forks.flatMap((owner, fork) =>
    owner === ref.philosopher ? [`F${fork}`] : [],
  );
  const wait = waitingFor(state, ref.philosopher);
  return [
    `P${ref.philosopher} · ${phaseText(state, ref.philosopher, language)}`,
    held.length
      ? `${zh ? '持有' : 'Holding'} ${held.join('、')}`
      : zh
        ? '未持有叉子'
        : 'No forks held',
    wait
      ? wait.fork === null
        ? zh
          ? `等待就餐名额（P${wait.owner} 占用）`
          : `Waiting for the dining permit (P${wait.owner})`
        : `${zh ? '等待' : 'Waiting for'} F${wait.fork} (P${wait.owner})`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
