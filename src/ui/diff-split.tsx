import { useId, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import type { DiffCell, DiffDisplayRow, DiffKind } from './diff-presentation';
import { diffVerticalViewport } from './diff-annotation';
import { useUI } from './use-ui';
import { DiffScrollbars } from './diff-scrollbars';
import type { DiffScrollbarsHandle } from './diff-scrollbars';

const sides = ['old', 'new'] as const;
export type DiffSplitRow = DiffDisplayRow & { hunk?: { index: number; label: string } };
const isContext = (row: DiffSplitRow) =>
  row.hunk !== undefined || (row.old ?? row.new)?.kind === 'context';

/** Continuous source columns share a scroll track, rather than padding missing lines.
 * The track retains the presentation's correspondences; each source moves through
 * it at its own pace. Only table positions and connector paths change on scroll.
 */
export function DiffSplit({
  rows,
  renderCell,
  layout,
}: {
  rows: DiffSplitRow[];
  renderCell: (side: 'old' | 'new', cell: DiffCell, endingNote: boolean) => ReactNode;
  layout: 'document' | 'bounded';
}) {
  const { t } = useUI();
  const sourceId = useId();
  const root = useRef<HTMLDivElement>(null);
  const scrollbars = useRef<DiffScrollbarsHandle>(null);
  const connections = useMemo(() => {
    const result: { start: number; end: number; kind: Exclude<DiffKind, 'context'> }[] = [];
    for (let i = 0; i < rows.length;) {
      if (isContext(rows[i])) {
        i++;
        continue;
      }
      const start = i;
      let old = false,
        next = false;
      while (i < rows.length && !isContext(rows[i])) {
        old ||= !!rows[i].old;
        next ||= !!rows[i].new;
        i++;
      }
      result.push({ start, end: i, kind: old && next ? 'modify' : old ? 'delete' : 'add' });
    }
    return result;
  }, [rows]);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const boundedViewport =
      layout === 'bounded'
        ? element.closest('[data-diff-source]')?.querySelector<HTMLElement>('[data-diff-viewport]')
        : undefined;
    const panes = Array.from(element.querySelectorAll<HTMLElement>('[data-diff-scroll]'));
    const tables = Array.from(element.querySelectorAll<HTMLTableElement>('[data-diff-table]'));
    const paths = element.querySelectorAll<SVGPathElement>('[data-diff-connector]');
    const edges = element.querySelectorAll<HTMLElement>('[data-diff-empty-edge]');
    let track: number[] = [],
      offsets: number[][] = [],
      scrollbarHeight = 0;

    const sync = () => {
      if (!track.length || !element.getClientRects().length) return;
      // A bounded viewport remains the owner even before its content overflows.
      // Document consumers may acquire a different scrolling ancestor after resize.
      const viewport = boundedViewport ?? diffVerticalViewport(element);
      if (!viewport) return;
      const documentViewport = viewport === document.scrollingElement;
      const header = element.closest('[data-diff-source]')?.querySelector('[data-diff-header]');
      const inset = header && viewport.contains(header) ? header.getBoundingClientRect().height : 0;
      const top = (documentViewport ? 0 : viewport.getBoundingClientRect().top) + inset;
      const available = Math.max(0, viewport.clientHeight - inset - scrollbarHeight);
      const position = Math.max(
        0,
        Math.min(
          top - element.getBoundingClientRect().top,
          Math.max(0, track[rows.length] - available),
        ),
      );
      // Find the corresponding source offsets at the visible track's top edge.
      let low = 0,
        high = rows.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (track[mid + 1] <= position) low = mid + 1;
        else high = mid;
      }
      const fraction =
        low < rows.length ? (position - track[low]) / (track[low + 1] - track[low]) : 0;
      const shifts = offsets.map((points, side) => {
        const source =
          points[low] + (low < rows.length ? (points[low + 1] - points[low]) * fraction : 0);
        const shift = position - Math.min(source, Math.max(0, points[rows.length] - available));
        tables[side].style.transform = `translateY(${shift}px)`;
        return shift;
      });
      connections.forEach(({ start, end }, index) => {
        const a = offsets[0][start] + shifts[0],
          b = offsets[0][end] + shifts[0],
          c = offsets[1][start] + shifts[1],
          d = offsets[1][end] + shifts[1];
        paths[index].setAttribute(
          'd',
          `M0,${a} C18,${a} 30,${c} 48,${c} L48,${d} C30,${d} 18,${b} 0,${b} Z`,
        );
      });
      edges.forEach((edge) => {
        const { start, kind } = connections[Number(edge.dataset.diffConnection)];
        const side = kind === 'add' ? 0 : 1;
        edge.style.top = `${offsets[side][start] + shifts[side] - 1}px`;
      });
      const bounds = element.getBoundingClientRect();
      const railTop = Math.max(top, bounds.top);
      scrollbars.current?.update({
        viewport,
        track,
        offsets,
        sourcePositions: shifts.map((shift) => position - shift),
        available,
        top: railTop - bounds.top,
        height: Math.max(0, Math.min(top + available, bounds.bottom - scrollbarHeight) - railTop),
        scrollStart: viewport.scrollTop - (top - bounds.top),
      });
      // Block annotation controls follow source geometry, including this translation.
      element.dispatchEvent(new Event('diff-layout', { bubbles: true }));
    };
    const measure = () => {
      // A collapsed ancestor has no geometry. Retain the measured track so
      // hiding and reopening the diff does not discard its scroll position.
      if (!element.getClientRects().length) return;
      const heights = tables.map((table) => {
        const result = Array<number>(rows.length).fill(0);
        table.querySelectorAll<HTMLTableRowElement>('tr').forEach((row) => {
          result[Number(row.dataset.diffRow)] = row.getBoundingClientRect().height;
        });
        return result;
      });
      scrollbarHeight = Math.max(...panes.map((pane) => pane.offsetHeight - pane.clientHeight));
      track = [0];
      offsets = [[0], [0]];
      for (let i = 0; i < rows.length; i++) {
        track.push(track[i] + Math.max(heights[0][i], heights[1][i]));
        sides.forEach((_, side) => offsets[side].push(offsets[side][i] + heights[side][i]));
      }
      tables.forEach((table) =>
        table.querySelectorAll<HTMLTableRowElement>('tr').forEach((row) => {
          const index = Number(row.dataset.diffRow);
          row.dataset.diffTrackTop = String(track[index]);
          row.dataset.diffTrackBottom = String(track[index + 1]);
        }),
      );
      // Native horizontal scrollbars occupy space below the complete source.
      element.style.height = `${track[rows.length] + scrollbarHeight}px`;
      sync();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (boundedViewport) observer.observe(boundedViewport);
    panes.forEach((pane) => observer.observe(pane));
    tables.forEach((table) => observer.observe(table));
    const scroll = (event: Event) => {
      const target = event.target;
      // Sibling scrollports and the sources' horizontal scroll do not change this track.
      if (target === document || (target instanceof Element && target.contains(element))) sync();
    };
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', measure);
    };
  }, [rows, connections, layout]);

  return (
    <div
      ref={root}
      className="relative grid min-w-0"
      style={{ gridTemplateColumns: 'var(--diff-columns, 50% 50%)' }}
      data-diff-split=""
    >
      {sides.map((side) => (
        <div
          key={side}
          className={`min-w-0 overflow-x-auto overflow-y-hidden ${side === 'old' ? 'pr-6 pl-3.5' : 'pr-3.5 pl-6'}`}
          data-diff-scroll={side}
          tabIndex={0}
          aria-label={t('{side} diff, scroll horizontally for long lines', {
            side: t(side === 'old' ? 'Old' : 'New'),
          })}
        >
          <table
            id={`${sourceId}-${side}`}
            className="w-max min-w-full border-collapse"
            data-diff-table={side}
          >
            <tbody>
              {rows.flatMap((row, index) =>
                row.hunk
                  ? [
                      <tr
                        key={index}
                        data-diff-row={index}
                        data-diff-hunk={side === 'old' ? row.hunk.index : undefined}
                        data-diff-hunk-header=""
                      >
                        <td className="bg-muted p-2 font-mono text-sm whitespace-nowrap">
                          {row.hunk.label}
                        </td>
                      </tr>,
                    ]
                  : row[side]
                    ? [
                        <tr key={index} data-diff-row={index}>
                          {renderCell(side, row[side], !row[side].line.text.endsWith('\n'))}
                        </tr>,
                      ]
                    : [],
              )}
            </tbody>
          </table>
        </div>
      ))}
      {connections.flatMap(({ kind }, index) =>
        kind === 'modify'
          ? []
          : [
              <div
                key={index}
                data-diff-empty-edge={kind}
                data-diff-empty-side={kind === 'add' ? 'old' : 'new'}
                data-diff-connection={index}
                className="pointer-events-none absolute z-[2] border-t-2"
                style={{
                  borderColor: `var(--diff-${kind}-text)`,
                  ...(kind === 'add'
                    ? { left: 0, width: 'calc(var(--diff-left, 50%) - 24px)' }
                    : { left: 'calc(var(--diff-left, 50%) + 24px)', right: 0 }),
                }}
              />,
            ],
      )}
      <svg
        data-diff-connectors=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 z-[2] h-full w-12 overflow-hidden border-x bg-background"
        style={{ left: 'calc(var(--diff-left, 50%) - 24px)' }}
      >
        {connections.map(({ kind }, index) => (
          <path
            key={index}
            data-diff-connector={kind}
            fill={`var(--diff-${kind})`}
            stroke={`var(--diff-${kind}-text)`}
            strokeWidth="1"
          />
        ))}
      </svg>
      <DiffScrollbars ref={scrollbars} rows={rows} sourceId={sourceId} />
    </div>
  );
}
