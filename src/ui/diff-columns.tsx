import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './resizable';
import type { ResizablePanelGroupHandle } from './resizable';

type Layout = Record<string, number>;
type Props = {
  idPrefix: string;
  source: RefObject<HTMLDivElement | null>;
  layoutRef: RefObject<Layout | undefined>;
  label: string;
};

/**
 * One sizing track for all hunk tables and the path headers. The existing tables
 * keep their aligned rows and independent horizontal scrollports; the library's
 * panel sizes drive their shared CSS columns without rerendering source text.
 */
export function DiffColumns({ idPrefix, source, layoutRef, label }: Props) {
  const oldId = `${idPrefix}:old`;
  const newId = `${idPrefix}:new`;
  const track = useRef<HTMLDivElement>(null);
  const separator = useRef<HTMLDivElement>(null);
  const group = useRef<ResizablePanelGroupHandle>(null);
  const drag = useRef<{ layout: Layout; pointerId: number } | null>(null);
  const [minimum, setMinimum] = useState<string | null>(null);
  const initialized = useRef(false);
  // The track's own ref is ready here; its ancestor source ref may not be attached yet.
  useLayoutEffect(() => {
    const element = track.current;
    if (!element) return;
    const measure = () => {
      const width = track.current?.clientWidth ?? 0;
      if (width <= 1) return;
      // A container resize ends the current gesture, retaining its latest size.
      const current = drag.current;
      drag.current = null;
      if (current)
        separator.current?.dispatchEvent(
          new PointerEvent('pointercancel', { pointerId: current.pointerId, bubbles: true }),
        );
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      setMinimum(`${(Math.min(12 * rem, width * 0.35) / (width - 1)) * 100}%`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const blur = () => {
      drag.current = null;
    };
    window.addEventListener('blur', blur);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('blur', blur);
    };
  }, []);
  useLayoutEffect(() => {
    if (minimum === null || initialized.current || !group.current) return;
    // Restore after the measured constraints are installed, without reading refs in render.
    if (layoutRef.current) group.current.setLayout(layoutRef.current);
    else layoutRef.current = group.current.getLayout();
    initialized.current = true;
  }, [minimum, layoutRef]);

  return (
    <ResizablePanelGroup
      elementRef={track}
      groupRef={group}
      orientation="horizontal"
      resizeTargetMinimumSize={{ fine: 8, coarse: 24 }}
      className="pointer-events-none absolute inset-0 z-[5]"
      data-diff-column-layout=""
      onLayoutChange={(value) => {
        const width = track.current?.clientWidth ?? 0;
        if (!source.current || width <= 1) return;
        // Align the table boundary to the middle of the library's 1px separator.
        const left = ((width - 1) * value[oldId]) / 100 + 0.5;
        source.current.style.setProperty('--diff-columns', `${left}px minmax(0,1fr)`);
      }}
      onLayoutChanged={(_value, meta) => {
        if (initialized.current) layoutRef.current = meta.requestedLayout;
      }}
    >
      <ResizablePanel id={oldId} defaultSize="50%" minSize={minimum ?? '0%'} />
      <ResizableHandle
        elementRef={separator}
        aria-label={label}
        data-diff-divider=""
        disableDoubleClick
        className="pointer-events-auto cursor-col-resize after:w-2 hover:bg-muted-foreground/10 focus-visible:ring-2"
        onPointerDownCapture={(event) => {
          if (event.button === 0 && group.current)
            drag.current = { layout: group.current.getLayout(), pointerId: event.pointerId };
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          const previous = drag.current;
          drag.current = null;
          if (previous && group.current)
            layoutRef.current = group.current.setLayout(previous.layout);
        }}
        onKeyDownCapture={(event) => {
          if (event.key === 'Escape' && drag.current) {
            event.preventDefault();
            event.currentTarget.dispatchEvent(
              new PointerEvent('pointercancel', {
                pointerId: drag.current.pointerId,
                bubbles: true,
              }),
            );
            return;
          }
          if (
            !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) ||
            !track.current ||
            !group.current
          )
            return;
          event.preventDefault();
          const width = track.current.clientWidth - 1;
          const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
          const min = Math.min(12 * rem, (width + 1) * 0.35);
          const current = (group.current.getLayout()[oldId] / 100) * width;
          const left =
            event.key === 'Home'
              ? min
              : event.key === 'End'
                ? width - min
                : current + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 48 : 16);
          layoutRef.current = group.current.setLayout({
            [oldId]: (left / width) * 100,
            [newId]: 100 - (left / width) * 100,
          });
        }}
      />
      <ResizablePanel id={newId} defaultSize="50%" minSize={minimum ?? '0%'} />
    </ResizablePanelGroup>
  );
}
