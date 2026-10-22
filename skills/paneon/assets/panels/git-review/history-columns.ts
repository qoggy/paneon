import { useLocale } from '../../shared/i18n';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The two column boundaries share one measured workspace and retain session proportions. */
export function useHistoryColumns(enabled: boolean) {
  const { t } = useLocale();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ available: 0, rem: 16, wide: false });
  const [ratios, setRatios] = useState<[number, number]>();
  const drag = useRef<{
    index: number;
    pointerId: number;
    element: HTMLDivElement;
    x: number;
    widths: [number, number];
    restore: () => void;
  } | null>(null);
  const [dragging, setDragging] = useState<number>();
  function finish(event?: { pointerId: number }) {
    const current = drag.current;
    if (!current || (event && event.pointerId !== current.pointerId)) return;
    drag.current = null;
    current.restore();
    if (current.element.hasPointerCapture(current.pointerId))
      current.element.releasePointerCapture(current.pointerId);
    setDragging(undefined);
  }
  useEffect(() => {
    if (!enabled || !workspaceRef.current) return;
    const workspace = workspaceRef.current;
    const desktop = matchMedia('(min-width: 48rem)');
    let width = 0;
    const measure = () => {
      if (!desktop.matches || width !== workspace.clientWidth) finish();
      width = workspace.clientWidth;
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      setSize({
        available: Math.max(0, width - 2),
        rem,
        wide: matchMedia('(min-width: 80rem)').matches,
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    desktop.addEventListener('change', measure);
    const blur = () => finish();
    window.addEventListener('blur', blur);
    measure();
    return () => {
      observer.disconnect();
      desktop.removeEventListener('change', measure);
      window.removeEventListener('blur', blur);
      finish();
    };
  }, [enabled]);
  const minLeft = 9 * size.rem,
    minRight = 12 * size.rem,
    minMiddle = 16 * size.rem;
  const left = clamp(
    ratios ? ratios[0] * size.available : (size.wide ? 13 : 10) * size.rem,
    minLeft,
    Math.max(minLeft, size.available - minMiddle - minRight),
  );
  const right = clamp(
    ratios
      ? ratios[1] * size.available
      : size.wide
        ? Math.max(14 * size.rem, ((size.available - left) * 0.35) / 1.35)
        : 14 * size.rem,
    minRight,
    Math.max(minRight, size.available - minMiddle - left),
  );
  const widths: [number, number] = [left, right];
  function move(index: number, value: number, original = widths) {
    if (!size.available) return;
    const next: [number, number] = [...original];
    next[index] = clamp(
      value,
      index === 0 ? minLeft : minRight,
      size.available - minMiddle - original[1 - index],
    );
    setRatios([next[0] / size.available, next[1] / size.available]);
  }
  return {
    workspaceRef,
    workspaceStyle: {
      columnGap: 0,
      '--history-columns': size.available
        ? `${left}px 1px minmax(0,1fr) 1px ${right}px`
        : '10rem 1px minmax(0,1fr) 1px 14rem',
    } as CSSProperties,
    dividerProps: ([0, 1] as const).map((index) => ({
      role: 'separator',
      tabIndex: 0,
      'aria-label': index === 0 ? t('调整分支栏宽度') : t('调整文件区宽度'),
      'aria-orientation': 'vertical' as const,
      'aria-valuemin': Math.round(index === 0 ? minLeft : minRight),
      'aria-valuemax': Math.round(
        Math.max(index === 0 ? minLeft : minRight, size.available - minMiddle - widths[1 - index]),
      ),
      'aria-valuenow': Math.round(widths[index]),
      'aria-valuetext': t('{area} width {width} pixels', {
        area: t(index === 0 ? 'Branch column' : 'File area'),
        width: Math.round(widths[index]),
      }),
      'data-dragging': dragging === index || undefined,
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (event.button !== 0 || !size.available || !matchMedia('(min-width: 48rem)').matches)
          return;
        event.preventDefault();
        finish();
        const element = event.currentTarget;
        element.focus({ preventScroll: true });
        element.setPointerCapture(event.pointerId);
        const style = document.documentElement.style;
        const cursor = style.cursor,
          userSelect = style.userSelect;
        style.cursor = 'col-resize';
        style.userSelect = 'none';
        drag.current = {
          index,
          pointerId: event.pointerId,
          element,
          x: event.clientX,
          widths,
          restore() {
            style.cursor = cursor;
            style.userSelect = userSelect;
          },
        };
        setDragging(index);
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const current = drag.current;
        if (current?.pointerId === event.pointerId && event.buttons === 0) finish();
        else if (current?.pointerId === event.pointerId)
          move(
            current.index,
            current.widths[current.index] +
              (event.clientX - current.x) * (current.index === 0 ? 1 : -1),
            current.widths,
          );
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        move(
          index,
          widths[index] + (event.key === 'ArrowRight' ? 16 : -16) * (index === 0 ? 1 : -1),
        );
      },
    })),
  };
}
