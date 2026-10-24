import { useCallback, useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Resize only CSS geometry: no source model, highlighting or text-registration rebuild per pixel. */
export function useDiffSplit(enabled: boolean, label: string) {
  const root = useRef<HTMLDivElement>(null);
  const separator = useRef<HTMLDivElement>(null);
  const ratio = useRef(0.5);
  const drag = useRef<{
    pointerId: number;
    element: HTMLDivElement;
    ratio: number;
    restore: () => void;
  } | null>(null);
  const geometry = useCallback(() => {
    const width = root.current?.clientWidth ?? 0;
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const min = Math.min(12 * rem, width * 0.35);
    return { width, min, max: width - min };
  }, []);
  const apply = useCallback(
    (value = ratio.current) => {
      const { width, min, max } = geometry();
      if (!width || !root.current) return;
      const left = clamp(value * width, min, max);
      root.current.style.setProperty('--diff-left', `${left}px`);
      root.current.style.setProperty('--diff-columns', `${left}px minmax(0, 1fr)`);
      separator.current?.setAttribute('aria-valuemin', String(Math.round(min)));
      separator.current?.setAttribute('aria-valuemax', String(Math.round(max)));
      separator.current?.setAttribute('aria-valuenow', String(Math.round(left)));
    },
    [geometry],
  );
  const finish = useCallback(
    (cancel = false) => {
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
    },
    [apply],
  );
  useLayoutEffect(() => {
    const element = root.current;
    if (!element || !enabled) return;
    const observer = new ResizeObserver(() => {
      finish();
      apply();
    });
    observer.observe(element);
    const blur = () => finish();
    window.addEventListener('blur', blur);
    apply();
    return () => {
      observer.disconnect();
      window.removeEventListener('blur', blur);
      finish();
    };
  }, [enabled, finish, apply]);
  const attachRoot = useCallback((element: HTMLDivElement | null) => {
    root.current = element;
  }, []);
  return {
    attachRoot,
    separatorProps: {
      ref: separator,
      role: 'separator',
      tabIndex: 0,
      'aria-label': label,
      'aria-orientation': 'vertical' as const,
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': 50,
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (event.button !== 0 || !geometry().width) return;
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
        if (!event.buttons) {
          finish();
          return;
        }
        const { width, min, max } = geometry();
        const x = event.clientX - (root.current?.getBoundingClientRect().left ?? 0);
        ratio.current = clamp(x, min, max) / width;
        apply();
      },
      onPointerUp() {
        finish();
      },
      onPointerCancel() {
        finish(true);
      },
      onLostPointerCapture() {
        finish();
      },
      onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === 'Escape') {
          finish(true);
          return;
        }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const { width, min, max } = geometry();
        if (!width) return;
        const current = clamp(ratio.current * width, min, max);
        const left =
          event.key === 'Home'
            ? min
            : event.key === 'End'
              ? max
              : current + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 48 : 16);
        ratio.current = clamp(left, min, max) / width;
        apply();
      },
    },
  };
}
