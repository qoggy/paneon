import { useContext, useLayoutEffect } from 'react';
import { autoUpdate, computePosition, flip, offset, platform, shift, size } from '@floating-ui/dom';
import { AnnotationFloatingContext } from './annotation-environment';

const GAP = 8;
const EDGE = 16;

/** Preserve an exit frame independently of the remaining stack and directory. */
export function freezeToastExit(element: HTMLDivElement) {
  const viewport = element.closest<HTMLElement>('[data-slot="toast-viewport"]');
  const toast = element.querySelector<HTMLElement>('[data-slot="toast"]');
  if (!viewport || !toast) return;
  const rect = viewport.getBoundingClientRect();
  const style = getComputedStyle(viewport);
  // Expanded siblings have different offsets. Exit from this toast's painted
  // transform rather than travelling back towards the front of the stack.
  const transform = getComputedStyle(toast).transform;
  Object.assign(element.style, {
    display: 'block',
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: '0px',
  });
  element.style.setProperty(
    '--toast-exit-transform',
    `${transform === 'none' ? '' : transform} ${style.getPropertyValue('--toast-exit-transform') || 'translateY(150%)'}`,
  );
  return () => element.removeAttribute('style');
}

/** Move the existing stack, preserving toast identity, timers, focus and actions. */
export function useToastAvoidance() {
  const elements = useContext(AnnotationFloatingContext)?.elements;
  useLayoutEffect(() => {
    const viewport = elements?.viewport;
    const anchor = elements?.directory ?? elements?.launcher;
    if (!viewport || !anchor || !elements?.toastGeometry) return;
    const view = window;
    const properties = [
      'left',
      'right',
      'top',
      'bottom',
      'max-width',
      '--toast-exit-transform',
    ] as const;
    const original = properties.map(
      (name) =>
        [
          name,
          viewport.style.getPropertyValue(name),
          viewport.style.getPropertyPriority(name),
        ] as const,
    );
    const written = new Map<string, string>();
    const restore = (onlyOwned = false) => {
      for (const [name, value, priority] of original) {
        // React may already have applied a new caller style before effect cleanup.
        if (onlyOwned && viewport.style.getPropertyValue(name) !== written.get(name)) continue;
        if (value) viewport.style.setProperty(name, value, priority);
        else viewport.style.removeProperty(name);
      }
      written.clear();
    };
    const write = (name: string, value: string) => {
      viewport.style.setProperty(name, value);
      written.set(name, viewport.style.getPropertyValue(name));
    };
    const reference = {
      contextElement: anchor,
      getBoundingClientRect() {
        const rects = [elements?.launcher, elements?.directory].flatMap((element) =>
          element?.isConnected ? [element.getBoundingClientRect()] : [],
        );
        const left = Math.min(...rects.map((rect) => rect.left));
        const top = Math.min(...rects.map((rect) => rect.top));
        return new DOMRect(
          left,
          top,
          Math.max(...rects.map((rect) => rect.right)) - left,
          Math.max(...rects.map((rect) => rect.bottom)) - top,
        );
      },
    };
    // Reserve the expanded stack, so hovering a notification does not move its actions.
    const stackHeight = () => {
      const toasts = [
        ...viewport.querySelectorAll<HTMLElement>(
          '[data-slot="toast"]:not([data-limited]):not([data-ending-style])',
        ),
      ];
      const gap = parseFloat(view.getComputedStyle(viewport).rowGap);
      return (
        toasts.reduce((height, element) => {
          const measured = parseFloat(
            view.getComputedStyle(element).getPropertyValue('--toast-height'),
          );
          return height + (measured || element.offsetHeight);
        }, 0) +
        Math.max(0, toasts.length - 1) * gap
      );
    };
    let disposed = false;
    let revision = 0;
    const update = async () => {
      const current = ++revision;
      restore();
      const origin = viewport.getBoundingClientRect();
      const obstacle = reference.getBoundingClientRect();
      const height = stackHeight();
      const intersects =
        origin.left < obstacle.right + GAP &&
        origin.right > obstacle.left - GAP &&
        origin.bottom > obstacle.top - GAP &&
        origin.bottom - height < obstacle.bottom + GAP;
      if (!height || !intersects) return;
      const position = await computePosition(reference, viewport, {
        strategy: 'fixed',
        placement: 'top-end',
        platform: {
          ...platform,
          async getDimensions(element) {
            const dimensions = await platform.getDimensions(element);
            return element === viewport ? { ...dimensions, height: stackHeight() } : dimensions;
          },
        },
        middleware: [
          offset(GAP),
          flip({ padding: EDGE, fallbackPlacements: ['left-end', 'right-end', 'bottom-end'] }),
          shift({ padding: EDGE }),
          size({
            padding: EDGE,
            apply({ availableWidth }) {
              if (!disposed && current === revision) {
                write('max-width', `${Math.max(0, Math.min(origin.width, availableWidth))}px`);
              }
            },
          }),
        ],
      });
      if (disposed || current !== revision) return;
      // Children are absolute and grow upwards from this zero-height viewport.
      write('left', `${position.x}px`);
      write('top', `${position.y + stackHeight()}px`);
      write('right', 'auto');
      write('bottom', 'auto');
      const side = position.placement.split('-')[0];
      write(
        '--toast-exit-transform',
        side === 'top'
          ? 'translateY(-150%)'
          : side === 'left'
            ? 'translateX(-150%)'
            : side === 'right'
              ? 'translateX(150%)'
              : 'translateY(150%)',
      );
    };
    const stop = autoUpdate(
      reference,
      viewport,
      () => {
        void update().catch((error: unknown) =>
          console.error('Could not position notifications.', error),
        );
      },
      { animationFrame: true },
    );
    return () => {
      disposed = true;
      stop();
      restore(true);
    };
  }, [elements]);
}
