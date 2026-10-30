import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { definePanel } from '@qoggy/paneon/sdk';
import { Badge, Button, Input, Label, Page } from '@qoggy/paneon/ui';
import { useLocale } from '../../shared/i18n';
import { SOURCE_COMMIT, SOURCE_ROOT } from './model';
import {
  compile,
  DEFAULT_CONFIG,
  isValid,
  mapTime,
  PRESETS,
  snapshotAt,
  validate,
} from './simulation';
import type { Bucket, Config, Preset, RequestBatch } from './simulation';
import { simulationCopy } from './copy';
import type { Copy } from './copy';

type Row = { at: string; count: string };
const rowsFor = (requests: RequestBatch[]): Row[] =>
  requests.map((r) => ({ at: String(r.at), count: String(r.count) }));
const number = (value: number) => Number(value.toFixed(2));
const tone = (allowed: boolean) =>
  allowed ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400';
function BucketValue({ bucket, copy }: { bucket: Bucket | null; copy: Copy }) {
  return bucket ? (
    <span>
      {copy.start} {bucket.start}ms · PASS {bucket.pass} · BLOCK {bucket.blocked}
    </span>
  ) : (
    <span>{copy.empty}</span>
  );
}
function SentinelPanel() {
  const { language } = useLocale();
  const c = simulationCopy(language);
  const [qps, setQps] = useState(String(DEFAULT_CONFIG.qps));
  const [interval, setInterval] = useState(String(DEFAULT_CONFIG.intervalMs));
  const [buckets, setBuckets] = useState(String(DEFAULT_CONFIG.bucketCount));
  const [rows, setRows] = useState<Row[]>(() => rowsFor(PRESETS.burst));
  const [scenario, setScenario] = useState<{ config: Config; requests: RequestBatch[] }>(() => ({
    config: DEFAULT_CONFIG,
    requests: PRESETS.burst,
  }));
  const trace = useMemo(() => compile(scenario.config, scenario.requests), [scenario]);
  const [cursor, setCursor] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<ReturnType<typeof validate>>(null);
  const [dirty, setDirty] = useState(false);
  const [focusRequest, setFocusRequest] = useState<number | undefined>(undefined);
  const state = useMemo(
    () => snapshotAt(trace, cursor, focusRequest),
    [trace, cursor, focusRequest],
  );
  const config = trace.config;
  const mapped = mapTime(Math.max(0, cursor), config);
  const latest = state.latest;
  const active = selected ?? mapped.slot;
  const selectedBucket = state.slots[active];
  const activeBuckets = state.slots.filter((b) => isValid(b, cursor, config));
  const visibleSegments = Array.from(
    { length: config.bucketCount + 2 },
    (_, i) =>
      Math.max(0, Math.floor(Math.max(0, cursor) / mapped.width) - config.bucketCount + 1) + i,
  );
  const segmentWidth = 1000 / visibleSegments.length;
  const currentSegment = visibleSegments.indexOf(Math.floor(Math.max(0, cursor) / mapped.width));
  const fromX = (currentSegment + 0.5) * segmentWidth;
  const toX = ((mapped.slot + 0.5) * 1000) / config.bucketCount;
  useEffect(() => {
    if (!playing) return;
    let previous: number | undefined;
    let frame: number;
    const tick = (now: number) => {
      // rAF timestamps can precede effect setup. Use the first frame as the
      // origin instead of subtracting performance.now() from a frame timestamp.
      if (previous !== undefined) {
        const delta = Math.min(now - previous, 100);
        setCursor((value) => Math.min(trace.duration, value + delta));
      }
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, trace.duration]);
  useEffect(() => {
    if (cursor >= trace.duration && playing) setPlaying(false);
  }, [cursor, trace.duration, playing]);
  function edit() {
    setPlaying(false);
    setDirty(true);
    setError(null);
  }
  function restart() {
    setPlaying(false);
    setCursor(-1);
    setSelected(null);
    setFocusRequest(undefined);
  }
  function apply() {
    const next = {
      qps: qps.trim() ? Number(qps) : NaN,
      intervalMs: Number(interval),
      bucketCount: Number(buckets),
    };
    const requests = rows.map((r) => ({
      at: r.at.trim() ? Number(r.at) : NaN,
      count: Number(r.count),
    }));
    const invalid = validate(next, requests);
    setError(invalid);
    if (invalid) return;
    setScenario({ config: next, requests });
    restart();
    setDirty(false);
  }
  function seek(time: number) {
    setPlaying(false);
    setSelected(null);
    setCursor(time);
    setFocusRequest(undefined);
  }
  return (
    <Page className="w-auto max-w-7xl space-y-5 p-6 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{c.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{c.subtitle}</p>
        </div>
        <Badge variant="secondary">Sentinel · LeapArray</Badge>
      </header>
      <div className="grid items-start gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="space-y-5 rounded-xl border p-4">
          <div className="space-y-2">
            <Label htmlFor="qps-limit">{c.qps}</Label>
            <Input
              id="qps-limit"
              type="number"
              min={1}
              max={10000}
              step="any"
              value={qps}
              onChange={(e) => {
                edit();
                setQps(e.target.value);
              }}
            />
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">{c.advanced}</summary>
            <div className="mt-3 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="interval">{c.interval}</Label>
                <Input
                  id="interval"
                  type="number"
                  min={100}
                  max={10000}
                  value={interval}
                  onChange={(e) => {
                    edit();
                    setInterval(e.target.value);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bucket-count">{c.buckets}</Label>
                <Input
                  id="bucket-count"
                  type="number"
                  min={2}
                  max={8}
                  value={buckets}
                  onChange={(e) => {
                    edit();
                    setBuckets(e.target.value);
                  }}
                />
              </div>
            </div>
          </details>
          <div className="space-y-3 border-t pt-4">
            <h2 className="text-sm font-semibold">{c.requests}</h2>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(PRESETS) as Preset[]).map((preset) => (
                <Button
                  key={preset}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    edit();
                    setRows(rowsFor(PRESETS[preset]));
                  }}
                >
                  {c[preset]}
                </Button>
              ))}
            </div>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-normal">{c.at}</th>
                    <th className="pb-2 font-normal">{c.count}</th>
                    <th>
                      <span className="sr-only">{c.remove}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index} data-request-row>
                      <td className="py-1 pr-2">
                        <Input
                          aria-label={`${c.at} ${index + 1}`}
                          type="number"
                          min={0}
                          max={60000}
                          value={row.at}
                          onChange={(e) => {
                            edit();
                            setRows(
                              rows.map((r, i) => (i === index ? { ...r, at: e.target.value } : r)),
                            );
                          }}
                        />
                      </td>
                      <td className="w-20 py-1">
                        <Input
                          aria-label={`${c.count} ${index + 1}`}
                          type="number"
                          min={1}
                          max={1000}
                          value={row.count}
                          onChange={(e) => {
                            edit();
                            setRows(
                              rows.map((r, i) =>
                                i === index ? { ...r, count: e.target.value } : r,
                              ),
                            );
                          }}
                        />
                      </td>
                      <td>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`${c.remove} ${index + 1}`}
                          title={c.remove}
                          onClick={() => {
                            edit();
                            setRows(rows.filter((_, i) => i !== index));
                          }}
                        >
                          <span aria-hidden="true">×</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={rows.length >= 100}
              onClick={() => {
                edit();
                setRows([...rows, { at: String(Number(rows.at(-1)?.at || 0) + 250), count: '1' }]);
              }}
            >
              <span aria-hidden="true">＋</span>
              {c.add}
            </Button>
            <p className="text-xs text-muted-foreground">{c.requestNote}</p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {
                {
                  qps: c.invalidQps,
                  interval: c.invalidInterval,
                  buckets: c.invalidBuckets,
                  requests: c.invalidRequests,
                }[error]
              }
            </p>
          )}
          <Button className="w-full" onClick={apply}>
            {c.apply}
          </Button>
          {dirty && <p className="text-xs text-muted-foreground">{c.pending}</p>}
        </aside>
        <section className="min-w-0 space-y-4">
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  if (cursor >= trace.duration) setCursor(-1);
                  setFocusRequest(undefined);
                  setSelected(null);
                  setPlaying(!playing);
                }}
              >
                {playing ? c.pause : c.play}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={c.restart}
                title={c.restart}
                onClick={restart}
              >
                <span aria-hidden="true">↺</span>
              </Button>
              <strong className="ml-auto font-mono tabular-nums" data-testid="sentinel-clock">
                {cursor < 0 ? c.ready : `${Math.floor(cursor)} ms`}
              </strong>
              <span className="text-xs text-muted-foreground tabular-nums">
                {state.processed} / {trace.events.length}
              </span>
            </div>
            <input
              className="block w-full accent-primary"
              type="range"
              min={-1}
              max={trace.duration}
              step={1}
              value={Math.floor(cursor)}
              aria-label={c.timeline}
              onChange={(e) => seek(Number(e.target.value))}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0ms</span>
              <span>{c.scrubNote}</span>
              <span>{trace.duration}ms</span>
            </div>
            <div className="relative h-4" aria-hidden="true">
              {scenario.requests.map((r, i) => (
                <span
                  key={i}
                  className="absolute top-0 h-2 w-1 rounded bg-primary/40"
                  style={{ left: `${(r.at / trace.duration) * 99}%` }}
                  title={`${r.at}ms ×${r.count}`}
                />
              ))}
            </div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <h2 className="font-semibold">{c.mapping}</h2>
              <span className="text-muted-foreground">
                {config.bucketCount} × {mapped.width}ms · {config.qps} QPS
              </span>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                <svg
                  viewBox="0 0 1000 120"
                  role="img"
                  aria-label={`${c.mapping}: ${Math.floor(Math.max(0, cursor))}ms → ${c.slot} ${mapped.slot}`}
                  className="mt-4 w-full"
                >
                  {visibleSegments.map((segment, i) => (
                    <g key={segment}>
                      <rect
                        x={i * segmentWidth + 3}
                        y={5}
                        width={segmentWidth - 6}
                        height={48}
                        rx={6}
                        fill={i === currentSegment ? 'var(--primary)' : 'var(--muted)'}
                        opacity={i === currentSegment ? 0.13 : 1}
                      />
                      <text
                        x={(i + 0.5) * segmentWidth}
                        y={25}
                        fill="currentColor"
                        textAnchor="middle"
                        fontSize={13}
                      >
                        {segment * mapped.width}–{(segment + 1) * mapped.width}
                      </text>
                      <text
                        x={(i + 0.5) * segmentWidth}
                        y={43}
                        fill="currentColor"
                        textAnchor="middle"
                        fontSize={12}
                      >
                        {c.slot} {segment % config.bucketCount}
                      </text>
                    </g>
                  ))}
                  <path
                    d={`M ${fromX} 58 C ${fromX} 90, ${toX} 72, ${toX} 105`}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth={2}
                  />
                  <path
                    d={`M ${toX - 5} 100 L ${toX} 106 L ${toX + 5} 100`}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth={2}
                  />
                  <text x={500} y={118} textAnchor="middle" fill="currentColor" fontSize={11}>
                    floor(t / {mapped.width}) % {config.bucketCount} = {mapped.slot}
                  </text>
                </svg>
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${config.bucketCount}, minmax(0, 1fr))` }}
                >
                  {state.slots.map((bucket, index) => {
                    const valid = isValid(bucket, cursor, config);
                    return (
                      <button
                        key={index}
                        data-slot={index}
                        type="button"
                        aria-pressed={active === index}
                        onClick={() => setSelected(index)}
                        className={`space-y-2 rounded-lg border p-3 text-left text-sm transition-colors ${active === index ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''} ${bucket && !valid ? 'text-muted-foreground' : ''}`}
                      >
                        <span className="block font-semibold">
                          {c.slot} {index}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {bucket ? `${bucket.start}–${bucket.start + mapped.width}ms` : c.empty}
                        </span>
                        <span className="block font-mono">PASS {bucket?.pass ?? '—'}</span>
                        <span className="block font-mono text-xs text-muted-foreground">
                          BLOCK {bucket?.blocked ?? '—'}
                        </span>
                        <span
                          className={`block text-xs ${valid ? 'text-emerald-700 dark:text-emerald-400' : ''}`}
                        >
                          {bucket ? (valid ? c.valid : c.expired) : '—'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <p data-testid="slot-detail" className="mt-3 text-xs text-muted-foreground">
              {c.inspect} {active} · <BucketValue bucket={selectedBucket} copy={c} />
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              [c.passed, state.passed, 'passed-total'],
              [c.blocked, state.blocked, 'blocked-total'],
              [c.currentQps, number(state.qps), 'current-qps'],
            ].map(([label, value, id]) => (
              <div key={id} className="rounded-lg border px-4 py-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <strong data-testid={id} className="mt-1 block text-2xl tabular-nums">
                  {value}
                </strong>
              </div>
            ))}
          </div>
          <div className="rounded-xl border p-4 text-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{c.sum}</h2>
              <span className="font-mono" data-testid="pass-total">
                {state.validPass} / {config.intervalMs / 1000}s = {number(state.qps)} QPS
              </span>
            </div>
            <p className="mt-2 font-mono text-xs">
              {activeBuckets.length ? activeBuckets.map((b) => b.pass).join(' + ') : '0'} ={' '}
              {state.validPass} PASS
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{c.sumNote}</p>
          </div>
          <div className="rounded-xl border p-4 text-sm" data-testid="latest-request">
            {latest ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">
                    {c.latest} #{latest.id} · {latest.at}ms
                  </h2>
                  <Badge variant="outline" className={tone(latest.allowed)}>
                    {latest.allowed ? c.allowed : c.rejected}
                  </Badge>
                </div>
                <p className="mt-3" data-testid="branch-message">
                  {c[latest.branch]}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {c.before}: <BucketValue bucket={latest.before} copy={c} />
                  </span>
                  <span aria-hidden="true">→</span>
                  <span>
                    {c.after}: <BucketValue bucket={latest.after} copy={c} />
                  </span>
                </div>
                <p className="mt-3 font-mono" data-testid="decision">
                  floor({number(latest.qpsBefore)}) + 1 {latest.allowed ? '≤' : '>'} {config.qps} →{' '}
                  {latest.allowed ? c.allowed : c.rejected}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.decision} · {latest.passBefore} PASS / {config.intervalMs / 1000}s ={' '}
                  {number(latest.qpsBefore)} QPS
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">{c.noRequest}</p>
            )}
          </div>
          <details className="rounded-xl border p-4 text-sm">
            <summary className="cursor-pointer font-medium">{c.recent}</summary>
            <div className="mt-3 max-h-48 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th>#</th>
                    <th>ms</th>
                    <th>{c.slot}</th>
                    <th>{c.request}</th>
                  </tr>
                </thead>
                <tbody>
                  {trace.events
                    .slice(Math.max(0, state.processed - 10), state.processed + 5)
                    .map((event) => (
                      <tr key={event.id} className="border-t">
                        <td className="py-1">
                          <Button
                            size="sm"
                            variant={event.id === latest?.id ? 'secondary' : 'ghost'}
                            aria-label={`${c.inspectRequest} ${event.id}`}
                            onClick={() => {
                              seek(event.at);
                              setFocusRequest(event.id);
                            }}
                          >
                            #{event.id}
                          </Button>
                        </td>
                        <td>{event.at}</td>
                        <td>{event.slot}</td>
                        <td className={tone(event.allowed)}>
                          {event.allowed ? c.allowed : c.rejected}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      </div>
      <details className="border-t pt-4 text-sm text-muted-foreground">
        <summary className="cursor-pointer">{c.more}</summary>
        <div className="mt-3 max-w-3xl space-y-3">
          <p>{c.explanation}</p>
          <p>{c.formula}</p>
          <p>{c.scope}</p>
          <p>
            t − start &gt; {config.intervalMs}ms → {c.expired}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {['base/LeapArray.java', 'metric/ArrayMetric.java'].map((file) => (
              <a
                key={file}
                className="underline"
                target="_blank"
                rel="noreferrer"
                href={`${SOURCE_ROOT}/${file}`}
              >
                {file.split('/').at(-1)}
              </a>
            ))}
            <a
              className="underline"
              target="_blank"
              rel="noreferrer"
              href={`https://github.com/alibaba/Sentinel/blob/${SOURCE_COMMIT}/sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/flow/controller/DefaultController.java`}
            >
              DefaultController.java
            </a>
          </div>
        </div>
      </details>
    </Page>
  );
}
export default definePanel({
  id: 'sentinel-leap-array-explanation',
  requires: { paneon: '>=0.1.0 <0.2.0' },
  input: z.object({}).strict(),
  render: SentinelPanel,
});
