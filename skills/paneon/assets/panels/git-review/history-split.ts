import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';

const INITIAL_RATIO = 0.8 / 2.8;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Page-local layout state; never replaces the history or diff subtree. */
export function useHistorySplit(enabled: boolean) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(INITIAL_RATIO);
  const [size, setSize] = useState({ available: 0, min: 0, max: 0, handle: 1 });
  const drag = useRef<{
    pointerId: number;
    element: HTMLDivElement;
    y: number;
    top: number;
    restore: () => void;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  function finish(event?: { pointerId: number }) {
    const current = drag.current;
    if (!current || (event && current.pointerId !== event.pointerId)) return;
    drag.current = null;
    current.restore();
    if (current.element.hasPointerCapture(current.pointerId))
      current.element.releasePointerCapture(current.pointerId);
    setDragging(false);
  }
  useEffect(() => {
    if (!enabled) return;
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const desktop = matchMedia('(min-width: 48rem)');
    const measure = () => {
      if (!desktop.matches) finish();
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      const handle = 1;
      const available = Math.max(0, workspace.clientHeight - handle);
      // Retain room for the file list, message and their compact separation.
      // The desktop workspace itself keeps these minima, allowing page scrolling in short windows.
      setSize({ available, min: 12.75 * rem, max: available - 15 * rem, handle });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    desktop.addEventListener('change', measure);
    measure();
    return () => {
      observer.disconnect();
      desktop.removeEventListener('change', measure);
      finish();
    };
  }, [enabled]);
  const top = clamp(size.available * ratio, size.min, size.max);
  function move(value: number) {
    if (size.available) setRatio(clamp(value, size.min, size.max) / size.available);
  }
  const workspaceStyle = {
    '--history-rows': size.available
      ? `${top}px ${size.handle}px minmax(0,1fr)`
      : 'minmax(10rem,0.8fr) 1px minmax(15rem,2fr)',
  } as CSSProperties;
  return {
    workspaceRef,
    workspaceStyle,
    dividerProps: {
      role: 'separator',
      tabIndex: 0,
      'aria-label': '调整提交历史与文件差异高度',
      'aria-orientation': 'horizontal' as const,
      'aria-valuemin': Math.round(size.min),
      'aria-valuemax': Math.round(size.max),
      'aria-valuenow': Math.round(top),
      'aria-valuetext': `提交历史高度 ${Math.round(top)} 像素`,
      'data-dragging': dragging || undefined,
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (event.button !== 0 || !size.available || !matchMedia('(min-width: 48rem)').matches)
          return;
        event.preventDefault();
        finish();
        const element = event.currentTarget;
        element.focus({ preventScroll: true });
        element.setPointerCapture(event.pointerId);
        const style = document.documentElement.style;
        const cursor = style.cursor;
        const userSelect = style.userSelect;
        style.cursor = 'row-resize';
        style.userSelect = 'none';
        drag.current = {
          pointerId: event.pointerId,
          element,
          y: event.clientY,
          top,
          restore() {
            style.cursor = cursor;
            style.userSelect = userSelect;
          },
        };
        setDragging(true);
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const current = drag.current;
        if (current?.pointerId === event.pointerId) move(current.top + event.clientY - current.y);
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        move(top + (event.key === 'ArrowUp' ? -16 : 16));
      },
    },
  };
}
