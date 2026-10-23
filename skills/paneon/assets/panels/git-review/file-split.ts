import { useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent, RefObject } from 'react';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Change layout geometry without rerendering the source model or annotation subtree. */
export function useFileSplit(
  workspace: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  label: string,
) {
  const separator = useRef<HTMLDivElement>(null);
  const ratio = useRef<number | undefined>(undefined);
  const drag = useRef<{
    pointerId: number;
    element: HTMLDivElement;
    ratio: number | undefined;
    restore: () => void;
  } | null>(null);
  const geometry = () => {
    const width = Math.max(0, (workspace.current?.clientWidth ?? 0) - 1);
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const min = Math.min(9 * rem, width * 0.3);
    const max = Math.max(min, width - 20 * rem);
    return { width, min, max, initial: Math.max(13 * rem, width / 5) };
  };
  const apply = () => {
    const { width, min, max, initial } = geometry();
    if (!width || !workspace.current) return;
    const left = clamp(ratio.current === undefined ? initial : ratio.current * width, min, max);
    workspace.current.style.setProperty('--file-columns', `${left}px 1px minmax(0,1fr)`);
    separator.current?.setAttribute('aria-valuemin', String(Math.round(min)));
    separator.current?.setAttribute('aria-valuemax', String(Math.round(max)));
    separator.current?.setAttribute('aria-valuenow', String(Math.round(left)));
  };
  const finish = (cancel = false) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    if (cancel) {
      ratio.current = current.ratio;
      apply();
    }
    current.restore();
    current.element.removeAttribute('data-dragging');
    if (current.element.hasPointerCapture(current.pointerId))
      current.element.releasePointerCapture(current.pointerId);
  };
  useLayoutEffect(() => {
    if (!enabled || !workspace.current) return;
    const desktop = matchMedia('(min-width: 48rem)');
    const measure = () => {
      finish();
      if (desktop.matches) apply();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(workspace.current);
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
  return {
    ref: separator,
    role: 'separator',
    tabIndex: 0,
    'aria-label': label,
    'aria-orientation': 'vertical' as const,
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (event.button !== 0 || !geometry().width || !matchMedia('(min-width: 48rem)').matches)
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
        pointerId: event.pointerId,
        element,
        ratio: ratio.current,
        restore() {
          style.cursor = cursor;
          style.userSelect = userSelect;
        },
      };
      element.setAttribute('data-dragging', '');
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      if (drag.current?.pointerId !== event.pointerId) return;
      if (!event.buttons) return finish();
      const { width, min, max } = geometry();
      const x = event.clientX - (workspace.current?.getBoundingClientRect().left ?? 0);
      ratio.current = clamp(x, min, max) / width;
      apply();
    },
    onPointerUp: () => finish(),
    onPointerCancel: () => finish(true),
    onLostPointerCapture: () => finish(),
    onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      if (event.key === 'Escape') return finish(true);
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const { width, min, max, initial } = geometry();
      if (!width) return;
      const current = clamp(
        ratio.current === undefined ? initial : ratio.current * width,
        min,
        max,
      );
      const left =
        event.key === 'Home'
          ? min
          : event.key === 'End'
            ? max
            : current + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 48 : 16);
      ratio.current = clamp(left, min, max) / width;
      apply();
    },
  };
}
