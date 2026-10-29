import { useImperativeHandle, useMemo, useRef } from 'react';
import type { Ref } from 'react';
import type { DiffKind } from './diff-presentation';
import type { DiffSplitRow } from './diff-split';
import { useUI } from './use-ui';

type Layout = {
  viewport: HTMLElement;
  track: number[];
  offsets: number[][];
  sourcePositions: number[];
  available: number;
  top: number;
  height: number;
  scrollStart: number;
};
export type DiffScrollbarsHandle = { update(layout: Layout): void };
const sides = ['old', 'new'] as const;

/** Two source overviews control the same correspondence track. Marks are decorative;
 * pointer gestures belong to the scrollbar, including when a mark is underneath.
 */
export function DiffScrollbars({
  ref,
  rows,
  sourceId,
}: {
  ref: Ref<DiffScrollbarsHandle>;
  rows: DiffSplitRow[];
  sourceId: string;
}) {
  const { t } = useUI();
  const rails = useRef<HTMLDivElement[]>([]);
  const thumbs = useRef<HTMLDivElement[]>([]);
  const layout = useRef<Layout | null>(null);
  const drag = useRef<{ side: number; grab: number } | null>(null);
  const markers = useMemo(
    () =>
      sides.map((side) => {
        const result: { start: number; end: number; kind: Exclude<DiffKind, 'context'> }[] = [];
        rows.forEach((row, index) => {
          const kind = row.hunk ? 'context' : (row[side] ?? row.old ?? row.new)?.kind;
          if (!kind || kind === 'context') return;
          const previous = result.at(-1);
          if (previous?.kind === kind && previous.end === index) previous.end++;
          else result.push({ start: index, end: index + 1, kind });
        });
        return result;
      }),
    [rows],
  );

  useImperativeHandle(
    ref,
    () => ({
      update(next) {
        layout.current = next;
        const last = next.track.length - 1;
        sides.forEach((_, side) => {
          const rail = rails.current[side];
          const points = next.offsets[side];
          const total = points[last];
          const maximum = Math.max(0, total - next.available);
          const current = next.sourcePositions[side];
          rail.style.top = `${next.top}px`;
          rail.style.height = `${next.height}px`;
          rail.style.visibility = next.height > 0 ? 'visible' : 'hidden';
          rail.tabIndex = maximum > 0 ? 0 : -1;
          rail.setAttribute('aria-valuemax', String(Math.round(maximum)));
          rail.setAttribute('aria-valuenow', String(Math.round(current)));
          const thumb = thumbs.current[side];
          const size = Math.min(next.height, Math.max(24, (next.height * next.height) / total));
          thumb.style.height = `${size}px`;
          thumb.style.top = `${maximum > 0 ? (current / maximum) * (next.height - size) : 0}px`;
          thumb.hidden = maximum === 0;
          const marks = rail.querySelectorAll<HTMLElement>('[data-diff-scrollbar-mark]');
          markers[side].forEach(({ start, end }, index) => {
            const height = Math.max(2, ((points[end] - points[start]) / total) * next.height);
            marks[index].style.top =
              `${Math.min((points[start] / total) * next.height, next.height - height)}px`;
            marks[index].style.height = `${height}px`;
          });
        });
      },
    }),
    [markers],
  );

  const scrollToSource = (side: number, source: number) => {
    if (!layout.current) return;
    const { viewport, track, offsets, available, scrollStart } = layout.current;
    const points = offsets[side];
    const last = track.length - 1;
    const maximum = Math.max(0, points[last] - available);
    if (maximum === 0) return;
    const target = Math.max(0, Math.min(source, maximum));
    let position: number;
    if (target === 0) position = 0;
    else if (target >= maximum) position = Math.max(0, track[last] - available);
    else {
      let low = 0,
        high = last;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (points[mid + 1] <= target) low = mid + 1;
        else high = mid;
      }
      position =
        track[low] +
        ((target - points[low]) / (points[low + 1] - points[low])) * (track[low + 1] - track[low]);
    }
    viewport.scrollTop = scrollStart + position;
  };
  const move = (side: number, clientY: number, grab: number) => {
    if (!layout.current) return;
    const rail = rails.current[side];
    const thumb = thumbs.current[side];
    const travel = rail.clientHeight - thumb.getBoundingClientRect().height;
    if (travel <= 0) return;
    const maximum = Math.max(
      0,
      layout.current.offsets[side][rows.length] - layout.current.available,
    );
    scrollToSource(side, ((clientY - rail.getBoundingClientRect().top - grab) / travel) * maximum);
  };

  return sides.map((side, index) => (
    <div
      key={side}
      ref={(element) => {
        if (element) rails.current[index] = element;
      }}
      data-diff-scrollbar={side}
      role="scrollbar"
      aria-label={t('{side} diff, scroll vertically', { side: t(side === 'old' ? 'Old' : 'New') })}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-controls={`${sourceId}-${side}`}
      tabIndex={-1}
      className={`invisible absolute z-[7] w-3.5 touch-none outline-none select-none focus-visible:ring-2 focus-visible:ring-ring ${side === 'old' ? 'left-0' : 'right-0'}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        const thumb = thumbs.current[index];
        const grab =
          event.target === thumb
            ? event.clientY - thumb.getBoundingClientRect().top
            : thumb.getBoundingClientRect().height / 2;
        drag.current = { side: index, grab };
        if (event.target !== thumb) move(index, event.clientY, grab);
      }}
      onPointerMove={(event) => {
        if (drag.current) move(drag.current.side, event.clientY, drag.current.grab);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        if (!layout.current) return;
        const current = layout.current.sourcePositions[index];
        const maximum = Math.max(
          0,
          layout.current.offsets[index][rows.length] - layout.current.available,
        );
        const targets: Record<string, number> = {
          ArrowUp: current - 24,
          ArrowDown: current + 24,
          PageUp: current - layout.current.available,
          PageDown: current + layout.current.available,
          Home: 0,
          End: maximum,
        };
        if (event.key in targets) {
          event.preventDefault();
          scrollToSource(index, targets[event.key]);
        }
      }}
    >
      <div
        ref={(element) => {
          if (element) thumbs.current[index] = element;
        }}
        data-diff-scrollbar-thumb=""
        className="absolute inset-x-1 z-[1] rounded-full bg-foreground/35 hover:bg-foreground/50"
      />
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {markers[index].map(({ kind }, marker) => (
          <div
            key={marker}
            data-diff-scrollbar-mark={kind}
            className="absolute inset-x-0.5"
            style={{ backgroundColor: `var(--diff-${kind}-text)` }}
          />
        ))}
      </div>
    </div>
  ));
}
