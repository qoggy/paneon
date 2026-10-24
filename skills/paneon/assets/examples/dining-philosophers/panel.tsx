import { useLocale } from '../../shared/i18n';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw } from './icons';
import { z } from 'zod';
import { definePanel } from 'paneon/sdk';
import { Badge, Button } from 'paneon/ui';
import {
  PHILOSOPHERS,
  STRATEGIES,
  completed,
  deadlockCycle,
  forkOrder,
  instructions,
  nextFork,
  phaseText,
  simulationText,
  simulationTrace,
  snapshotAt,
  waitingFor,
} from './model';
import type { Language, SimulationRef, Snapshot, Strategy } from './model';
import { simulationCopy, strategyCopy } from './copy';

const position = (id: number, radius: number) => {
  const angle = ((-90 + id * 72) * Math.PI) / 180;
  return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius };
};
function Table({
  state,
  selected,
  select,
  language,
}: {
  state: Snapshot;
  selected: number | null;
  select: (id: number) => void;
  language: Language;
}) {
  const copy = simulationCopy(language);
  const cycle = deadlockCycle(state);
  const eating = state.philosophers.filter((person) => person.phase === 'eating').length;
  const markerId = useId();
  const tableRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(520);
  // Buttons are 80 CSS pixels wide; SVG coordinates scale with the table.
  // Include a small gap so the stroke itself stays outside the button border.
  const personRadius = (42 / tableWidth) * 100;
  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const observer = new ResizeObserver(([entry]) => setTableWidth(entry.contentRect.width));
    observer.observe(table);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={tableRef}
      className="relative mx-auto aspect-square w-full max-w-[520px]"
      data-dining-table
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden="true">
        <defs>
          {(['planned', 'blocked', 'deadlock'] as const).map((tone) => (
            <marker
              key={tone}
              id={`${markerId}-${tone}`}
              markerWidth="5"
              markerHeight="5"
              refX="4"
              refY="2.5"
              orient="auto"
              className={
                tone === 'deadlock'
                  ? 'text-destructive'
                  : tone === 'blocked'
                    ? 'text-amber-500'
                    : 'text-sky-500'
              }
            >
              <path d="M0,0 L5,2.5 L0,5" fill="currentColor" />
            </marker>
          ))}
        </defs>
        <circle cx="50" cy="50" r="24" className="fill-muted/40 stroke-border" strokeWidth="0.3" />
        {PHILOSOPHERS.map((id) => {
          const fork = nextFork(state, id);
          if (fork === null) return null;
          const blocked = waitingFor(state, id) !== null;
          const tone = cycle.includes(id) ? 'deadlock' : blocked ? 'blocked' : 'planned';
          const from = position(id, 38);
          const to = position(fork - 0.5, 29);
          const dx = to.x - from.x,
            dy = to.y - from.y;
          const distance = Math.hypot(dx, dy);
          const start = personRadius / distance;
          const end = 3.5 / distance;
          return (
            <line
              key={id}
              data-next-edge={id}
              data-next-fork={fork}
              data-edge-state={tone}
              x1={from.x + dx * start}
              y1={from.y + dy * start}
              x2={to.x - dx * end}
              y2={to.y - dy * end}
              stroke="currentColor"
              strokeWidth="0.6"
              strokeDasharray="1.2 1.2"
              markerEnd={`url(#${markerId}-${tone})`}
              className={
                tone === 'deadlock'
                  ? 'text-destructive'
                  : tone === 'blocked'
                    ? 'text-amber-500'
                    : 'text-sky-500'
              }
            />
          );
        })}
        {state.forks.map((owner, fork) => {
          const point = position(fork - 0.5, 29);
          const holder = owner === null ? null : position(owner, 38);
          const inset = holder
            ? personRadius / Math.hypot(point.x - holder.x, point.y - holder.y)
            : 0;
          return (
            <g key={fork} data-fork={fork} data-owner={owner ?? 'free'}>
              <title>{`F${fork} · ${owner === null ? copy.free : `${copy.heldBy} P${owner}`}`}</title>
              {holder && (
                <line
                  data-ownership-line={fork}
                  x1={point.x}
                  y1={point.y}
                  x2={holder.x + (point.x - holder.x) * inset}
                  y2={holder.y + (point.y - holder.y) * inset}
                  className="stroke-primary/40"
                  strokeWidth="0.6"
                />
              )}
              <circle
                cx={point.x}
                cy={point.y}
                r="3"
                className={
                  owner === null
                    ? 'fill-background stroke-border'
                    : 'fill-background stroke-primary'
                }
                strokeWidth="0.4"
              />
              <path
                d={`M${point.x - 0.8},${point.y - 1.5} v1.2 q0,.8 .8,.8 q.8,0 .8,-.8 v-1.2 M${point.x},${point.y - 1.5} v4`}
                fill="none"
                className={owner === null ? 'stroke-muted-foreground' : 'stroke-primary'}
                strokeWidth="0.4"
              />
              <text
                x={point.x + 4}
                y={point.y + 1}
                className="fill-muted-foreground"
                fontSize="2.5"
              >
                F{fork}
              </text>
            </g>
          );
        })}
      </svg>
      <div
        className="pointer-events-none absolute inset-[32%] flex flex-col items-center justify-center gap-2 text-center"
        aria-live="polite"
        data-testid="simulation-status"
      >
        <span className={`text-lg font-semibold ${cycle.length ? 'text-destructive' : ''}`}>
          {cycle.length
            ? copy.deadlock
            : completed(state)
              ? copy.complete
              : eating
                ? `${eating} ${copy.eating}`
                : copy.ready}
        </span>
        {state.strategy === 'serial' && (
          <span className="text-xs text-muted-foreground" data-testid="dining-permit">
            {state.gate === null
              ? copy.permitFree
              : copy.permitHeld.replace('{id}', String(state.gate))}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {state.philosophers.reduce((sum, person) => sum + person.meals, 0)} / 5 {copy.meals}
        </span>
      </div>
      {PHILOSOPHERS.map((id) => {
        const point = position(id, 38);
        const phase = state.philosophers[id].phase;
        const waiting = waitingFor(state, id);
        return (
          <Button
            key={id}
            variant="outline"
            data-philosopher={id}
            data-phase={phase}
            data-pc={state.philosophers[id].pc}
            aria-label={`P${id} · ${phaseText(state, id, language)}`}
            aria-pressed={selected === id}
            onClick={() => select(id)}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            className={`absolute size-20 -translate-x-1/2 -translate-y-1/2 flex-col gap-1 rounded-full bg-background px-1 text-xs shadow-none transition-none ${selected === id ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''} ${cycle.includes(id) ? 'border-destructive text-destructive hover:text-destructive dark:border-destructive' : phase === 'eating' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 hover:text-emerald-700 dark:border-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:text-emerald-300' : waiting ? 'border-amber-500 text-amber-700 hover:text-amber-700 dark:border-amber-500 dark:text-amber-300 dark:hover:text-amber-300' : ''}`}
          >
            <span className="text-lg font-semibold">P{id}</span>
            <span className="max-w-16 text-center text-[10px] leading-3 whitespace-normal">
              {phaseText(state, id, language)}
            </span>
            <span className="text-[10px] leading-3 text-muted-foreground">
              {state.philosophers[id].pc} / 6
            </span>
          </Button>
        );
      })}
    </div>
  );
}
function Details({
  state,
  selected,
  language,
  pause,
}: {
  state: Snapshot;
  selected: number | null;
  language: Language;
  pause: () => void;
}) {
  const copy = simulationCopy(language);
  const description = strategyCopy(state.strategy, language);
  const code = instructions(state.strategy);
  const active =
    selected === null || state.philosophers[selected].pc === 6
      ? -1
      : state.philosophers[selected].pc;
  const blocked = selected !== null && waitingFor(state, selected) !== null;
  const inCycle = selected !== null && deadlockCycle(state).includes(selected);
  const executed =
    state.action.kind === 'execute' && state.action.philosopher === selected
      ? state.action.line
      : -1;
  const ref: SimulationRef | null =
    selected === null
      ? null
      : { kind: 'philosopher', strategy: state.strategy, step: state.step, philosopher: selected };
  return (
    <aside
      className="flex flex-col gap-6 border-l p-5"
      aria-label={copy.details}
      onPointerDown={pause}
    >
      <div className="space-y-2">
        <h2 className="font-semibold">{description.label}</h2>
        <p className="text-sm text-muted-foreground">{description.description}</p>
      </div>
      {ref && selected !== null ? (
        <>
          <div className="space-y-3" data-testid="philosopher-details">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">P{selected}</h3>
              <Badge variant="secondary">{state.philosophers[selected].pc} / 6</Badge>
            </div>
            <p className="text-sm leading-6">{simulationText(ref, language)}</p>
            <div className="flex gap-2">
              {forkOrder(state.strategy, selected).map((fork) => (
                <Badge
                  key={fork}
                  variant="outline"
                  className={state.forks[fork] === selected ? 'border-primary' : ''}
                >
                  F{fork} · {state.forks[fork] === null ? copy.free : `P${state.forks[fork]}`}
                </Badge>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-xs text-muted-foreground">{copy.code}</h3>
            <pre className="overflow-x-auto rounded-md bg-muted/50 py-2 text-xs leading-7">
              {code.map((line, index) => (
                <span
                  key={line}
                  data-instruction={index}
                  data-active={active === index}
                  data-executed={executed === index}
                  data-blocked={active === index && blocked}
                  className={`block px-3 ${active === index ? (inCycle ? 'bg-destructive/10 font-semibold text-destructive' : blocked ? 'bg-amber-500/10 font-semibold text-amber-700 dark:text-amber-300' : 'bg-sky-500/10 font-semibold text-sky-700 dark:text-sky-300') : executed === index ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground'}`}
                >
                  <span className="mr-3 inline-block w-2">
                    {active === index ? '→' : executed === index ? '✓' : ' '}
                  </span>
                  {line}
                  {'\n'}
                </span>
              ))}
            </pre>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center text-sm leading-6 text-muted-foreground">
          {copy.inspect}
        </div>
      )}
      {deadlockCycle(state).length > 0 && <p className="text-sm text-destructive">{copy.cycle}</p>}
      {state.strategy === 'ordered' && (
        <p className="text-xs leading-5 text-muted-foreground">{copy.orderedNote}</p>
      )}
    </aside>
  );
}
function DiningPhilosophersPanel() {
  const { language } = useLocale();
  const copy = simulationCopy(language);
  const [strategy, setStrategy] = useState<Strategy>('left');
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const trace = simulationTrace(strategy);
  const state = snapshotAt(strategy, step);
  const focused = selected ?? (state.action.kind === 'initial' ? 0 : state.action.philosopher);
  const end = step === trace.length - 1;
  const moving = playing && !end;
  const summary: SimulationRef = { kind: 'summary', strategy, step };
  useEffect(() => {
    if (!moving) return;
    const timer = window.setInterval(
      () => setStep((value) => Math.min(trace.length - 1, value + 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [moving, trace]);
  const seek = (value: number) => {
    setPlaying(false);
    setStep(value);
  };
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-6">
      <header className="flex items-start justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex gap-1 rounded-lg bg-muted p-1"
          role="radiogroup"
          aria-label={copy.strategy}
        >
          {STRATEGIES.map((value) => (
            <Button
              key={value}
              role="radio"
              aria-checked={strategy === value}
              variant={strategy === value ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => {
                setStrategy(value);
                setStep(0);
                setPlaying(false);
              }}
            >
              {strategyCopy(value, language).label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStrategy('left');
              setStep(simulationTrace('left').length - 1);
              setPlaying(false);
            }}
          >
            {copy.reproduce}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title={copy.reset}
            aria-label={copy.reset}
            onClick={() => seek(0)}
          >
            <RotateCcw />
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (end) setStep(0);
              setPlaying(!moving);
            }}
          >
            {moving ? <Pause /> : <Play />}
            {moving ? copy.pause : copy.play}
          </Button>
        </div>
      </div>
      <section className="overflow-hidden rounded-xl border bg-background">
        <div className="grid grid-cols-[minmax(0,1fr)_300px]">
          <div className="px-6 py-3">
            <Table
              state={state}
              selected={focused}
              language={language}
              select={(id) => {
                setPlaying(false);
                setSelected(id);
              }}
            />
            <div className="flex flex-wrap justify-center gap-4 pb-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <i className="size-2 rounded-full bg-sky-500" />
                {copy.nextAction}
              </span>
              <span className="flex items-center gap-1.5">
                <i className="size-2 rounded-full bg-amber-500" />
                {copy.blocked}
              </span>
              <span className="flex items-center gap-1.5">
                <i className="size-2 rounded-full bg-destructive" />
                {copy.deadlock}
              </span>
              <span className="flex items-center gap-1.5">
                <i className="size-2 rounded-full bg-emerald-500" />
                {copy.eating}
              </span>
            </div>
          </div>
          <Details
            state={state}
            selected={focused}
            language={language}
            pause={() => setPlaying(false)}
          />
        </div>
        <footer
          className="space-y-3 border-t bg-muted/20 px-5 py-4"
          onPointerDown={() => setPlaying(false)}
        >
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={copy.previous}
              title={copy.previous}
              disabled={step === 0}
              onClick={() => seek(step - 1)}
            >
              <ArrowLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={copy.next}
              title={copy.next}
              disabled={end}
              onClick={() => seek(step + 1)}
            >
              <ArrowRight />
            </Button>
            <span
              className="min-w-16 text-xs text-muted-foreground tabular-nums"
              data-testid="step-counter"
            >
              {step} / {trace.length - 1}
            </span>
            <p className="min-w-0 text-sm" data-testid="step-description">
              {simulationText(summary, language)}
            </p>
          </div>
          <input
            type="range"
            min={0}
            max={trace.length - 1}
            value={step}
            step={1}
            aria-label={copy.timeline}
            className="block h-2 w-full cursor-pointer accent-foreground"
            onChange={(event) => seek(Number(event.target.value))}
          />
        </footer>
      </section>
      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex gap-5">
          <span>
            {copy.concurrent}{' '}
            <strong className="text-foreground" data-testid="diners">
              {state.philosophers.filter((person) => person.phase === 'eating').length}
            </strong>
          </span>
          <span>
            {copy.peak}{' '}
            <strong className="text-foreground" data-testid="peak-diners">
              {Math.max(
                ...trace
                  .slice(0, step + 1)
                  .map(
                    (snapshot) =>
                      snapshot.philosophers.filter((person) => person.phase === 'eating').length,
                  ),
              )}
            </strong>
          </span>
        </div>
        <span>{copy.premise}</span>
        <a
          className="underline underline-offset-4"
          href="https://pages.cs.wisc.edu/~solomon/cs537/html/deadlock.html"
          target="_blank"
          rel="noreferrer"
        >
          {copy.source} ↗
        </a>
      </div>
    </main>
  );
}
export default definePanel({
  id: 'dining-philosophers-explanation',
  requires: { paneon: '0.0.0' },
  input: z.object({}).strict(),
  render: DiningPhilosophersPanel,
});
