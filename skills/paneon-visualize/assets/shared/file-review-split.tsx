import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@qoggy/paneon/ui';
import type { ResizablePanelGroupHandle } from '@qoggy/paneon/ui';

export type FileReviewLayout = Record<string, number>;
type Props = {
  sidebar: ReactNode;
  children: ReactNode;
  separatorLabel: string;
  showContent?: boolean;
  /** Parent-owned memory survives a Git view switch; this is not persisted storage. */
  layoutRef?: RefObject<FileReviewLayout | undefined>;
};

/** Built-in file-review composition; resizing is owned by shadcn's panel primitives. */
export function FileReviewSplit({
  sidebar,
  children,
  separatorLabel,
  showContent = true,
  layoutRef,
}: Props) {
  const ownLayout = useRef<FileReviewLayout | undefined>(undefined);
  const saved = layoutRef ?? ownLayout;
  const group = useRef<ResizablePanelGroupHandle>(null);
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ layout: FileReviewLayout; pointerId: number } | null>(null);
  const [desktop, setDesktop] = useState(() => matchMedia('(min-width: 48rem)').matches);
  useEffect(() => {
    const media = matchMedia('(min-width: 48rem)');
    const update = () => setDesktop(media.matches);
    media.addEventListener('change', update);
    const blur = () => {
      drag.current = null;
    };
    window.addEventListener('blur', blur);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('blur', blur);
    };
  }, []);
  useLayoutEffect(() => {
    if (!desktop || !showContent || !root.current || !group.current) return;
    let layout = saved.current;
    if (!layout) {
      const width = root.current.clientWidth - 1;
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      const left = Math.max(13 * rem, width / 5);
      layout = { sidebar: (left / width) * 100, content: 100 - (left / width) * 100 };
    }
    saved.current = group.current.setLayout(layout);
  }, [desktop, showContent, saved]);

  // Retain the existing stacked layout below the desktop breakpoint.
  if (!desktop)
    return (
      <div className="grid min-h-0 flex-1 gap-3">
        {sidebar}
        {children}
      </div>
    );
  return (
    <ResizablePanelGroup
      elementRef={root}
      groupRef={group}
      orientation="horizontal"
      defaultLayout={saved.current}
      disabled={!showContent}
      resizeTargetMinimumSize={{ fine: 12, coarse: 24 }}
      onLayoutChanged={(_layout, meta) => {
        if (showContent && meta.isUserInteraction) saved.current = meta.requestedLayout;
      }}
      className="min-h-0 min-w-0 flex-1"
      data-file-review-split=""
    >
      <ResizablePanel
        id="sidebar"
        minSize="9rem"
        defaultSize="20%"
        className="flex h-full min-h-0 min-w-0 flex-col [&>*]:flex-1"
      >
        {sidebar}
      </ResizablePanel>
      <ResizableHandle
        aria-label={separatorLabel}
        disabled={!showContent}
        disableDoubleClick
        className={showContent ? 'z-10 after:w-3 focus-visible:ring-2' : 'hidden'}
        onPointerDownCapture={(event) => {
          if (event.button === 0 && group.current)
            drag.current = { layout: group.current.getLayout(), pointerId: event.pointerId };
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          const previous = drag.current;
          drag.current = null;
          if (previous && group.current) saved.current = group.current.setLayout(previous.layout);
        }}
        onKeyDownCapture={(event) => {
          if (event.key === 'Escape' && drag.current) {
            event.preventDefault();
            // End the library-owned pointer interaction, then restore its starting layout.
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
            !root.current ||
            !group.current
          )
            return;
          event.preventDefault();
          const width = root.current.clientWidth - 1;
          const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
          const current = (group.current.getLayout().sidebar / 100) * width;
          const left =
            event.key === 'Home'
              ? 9 * rem
              : event.key === 'End'
                ? width - 20 * rem
                : current + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 48 : 16);
          saved.current = group.current.setLayout({
            sidebar: (left / width) * 100,
            content: 100 - (left / width) * 100,
          });
        }}
      />
      <ResizablePanel
        id="content"
        minSize={showContent ? '20rem' : 0}
        maxSize={showContent ? undefined : 0}
        className="flex h-full min-h-0 min-w-0 flex-col [&>*]:flex-1"
      >
        {children}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
