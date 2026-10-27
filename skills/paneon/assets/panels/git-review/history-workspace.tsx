import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@qoggy/paneon/ui';
import type { ResizablePanelGroupHandle } from '@qoggy/paneon/ui';
import { useLocale } from '../../shared/i18n';

type Layout = Record<string, number>;
export type HistoryLayout = { columns?: Layout; rows?: Layout };
type ColumnsProps = {
  branches: ReactNode;
  commits: ReactNode;
  files: ReactNode;
  layoutRef: RefObject<HistoryLayout>;
};
type Props = ColumnsProps & { diff: ReactNode; showDiff: boolean };
const paneClass = 'flex h-full min-h-0 min-w-0 flex-col [&>*]:flex-1';
const columnHandleClass = 'z-10 after:w-3 focus-visible:ring-2';
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The library owns the pointer gesture; the inactive side is frozen to preserve the old constraint. */
function HistoryColumns({ branches, commits, files, layoutRef }: ColumnsProps) {
  const { t } = useLocale();
  const root = useRef<HTMLDivElement>(null);
  const group = useRef<ResizablePanelGroupHandle>(null);
  const handles = useRef<(HTMLDivElement | null)[]>([]);
  const gesture = useRef<{ index: number; pointerId: number } | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const finish = () => {
    gesture.current = null;
    setActive(null);
  };
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    let previousWidth = 0;
    let restored = false;
    const measure = () => {
      const width = element.clientWidth;
      if (width <= 2 || !group.current) return;
      if (previousWidth && previousWidth !== width && gesture.current) {
        const current = gesture.current;
        handles.current[current.index]?.dispatchEvent(
          new PointerEvent('pointercancel', { pointerId: current.pointerId, bubbles: true }),
        );
      }
      previousWidth = width;
      if (layoutRef.current.columns) {
        if (!restored) group.current.setLayout(layoutRef.current.columns);
      } else if (!gesture.current) {
        const available = width - 2;
        const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
        const wide = matchMedia('(min-width: 80rem)').matches;
        const left = clamp(
          wide ? Math.min(27 * rem, available * 0.22) : 14 * rem,
          9 * rem,
          Math.max(9 * rem, available - 28 * rem),
        );
        const right = clamp(
          wide ? Math.max(14 * rem, ((available - left) * 0.35) / 1.35) : 14 * rem,
          12 * rem,
          Math.max(12 * rem, available - 16 * rem - left),
        );
        group.current.setLayout({
          branches: (left / available) * 100,
          files: (right / available) * 100,
          commits: ((available - left - right) / available) * 100,
        });
      }
      restored = true;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const blur = () => {
      gesture.current = null;
      setActive(null);
    };
    window.addEventListener('blur', blur);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('blur', blur);
    };
  }, [layoutRef]);
  const handle = (index: number) => (
    <ResizableHandle
      key={index}
      elementRef={(element) => {
        handles.current[index] = element;
      }}
      aria-label={index === 0 ? t('调整分支栏宽度') : t('调整文件区宽度')}
      className={columnHandleClass}
      disableDoubleClick
      onPointerDownCapture={(event) => {
        if (event.button !== 0) return;
        gesture.current = { index, pointerId: event.pointerId };
        setActive(index);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onKeyDownCapture={(event) => {
        if (
          !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) ||
          !root.current ||
          !group.current
        )
          return;
        event.preventDefault();
        const available = root.current.clientWidth - 2;
        const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
        const current = group.current.getLayout();
        const side = index === 0 ? 'branches' : 'files';
        const other = index === 0 ? 'files' : 'branches';
        const min = (index === 0 ? 9 : 12) * rem;
        const max = available - 16 * rem - (current[other] / 100) * available;
        const delta = (event.key === 'ArrowRight' ? 16 : -16) * (index === 0 ? 1 : -1);
        const requested =
          event.key === 'Home'
            ? index === 0
              ? min
              : max
            : event.key === 'End'
              ? index === 0
                ? max
                : min
              : (current[side] / 100) * available + delta;
        const value = (clamp(requested, min, max) / available) * 100;
        layoutRef.current.columns = group.current.setLayout({
          ...current,
          [side]: value,
          commits: 100 - value - current[other],
        });
      }}
    />
  );
  return (
    <ResizablePanelGroup
      elementRef={root}
      groupRef={group}
      orientation="horizontal"
      className="min-h-0 min-w-0 gap-0"
      data-history-workspace=""
      resizeTargetMinimumSize={{ fine: 12, coarse: 24 }}
      onLayoutChanged={(_value, meta) => {
        if (meta.isUserInteraction) layoutRef.current.columns = meta.requestedLayout;
      }}
    >
      <ResizablePanel id="branches" minSize="9rem" disabled={active === 1} className={paneClass}>
        {branches}
      </ResizablePanel>
      {handle(0)}
      <ResizablePanel id="commits" minSize="16rem" className={paneClass}>
        {commits}
      </ResizablePanel>
      {handle(1)}
      <ResizablePanel id="files" minSize="12rem" disabled={active === 0} className={paneClass}>
        {files}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

/** Two nested native panel groups retain the history content while only geometry changes. */
export function HistoryWorkspace({ branches, commits, files, diff, showDiff, layoutRef }: Props) {
  const { t } = useLocale();
  const group = useRef<ResizablePanelGroupHandle>(null);
  const [desktop, setDesktop] = useState(() => matchMedia('(min-width: 48rem)').matches);
  useEffect(() => {
    const media = matchMedia('(min-width: 48rem)');
    const update = () => setDesktop(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useLayoutEffect(() => {
    if (desktop && showDiff && group.current) {
      group.current.setLayout(
        layoutRef.current.rows ?? { overview: (0.8 / 2.8) * 100, diff: (2 / 2.8) * 100 },
      );
    }
  }, [desktop, showDiff, layoutRef]);
  if (!desktop)
    return (
      <div className="grid min-h-0 gap-3">
        <div data-history-workspace="" className="grid min-h-0 gap-3">
          {branches}
          {commits}
          {files}
        </div>
        {diff}
      </div>
    );
  return (
    <ResizablePanelGroup
      groupRef={group}
      orientation="vertical"
      className="min-h-0 min-w-0 gap-0"
      data-history-split=""
      disabled={!showDiff}
      resizeTargetMinimumSize={{ fine: 12, coarse: 24 }}
      onLayoutChanged={(_value, meta) => {
        if (showDiff && meta.isUserInteraction) layoutRef.current.rows = meta.requestedLayout;
      }}
    >
      <ResizablePanel
        id="overview"
        minSize="12.75rem"
        defaultSize={`${(0.8 / 2.8) * 100}%`}
        className={paneClass}
      >
        <HistoryColumns branches={branches} commits={commits} files={files} layoutRef={layoutRef} />
      </ResizablePanel>
      <ResizableHandle
        aria-label={t('调整提交历史与文件差异高度')}
        className={showDiff ? 'z-10 after:h-3 focus-visible:ring-2' : 'hidden'}
        disabled={!showDiff}
        disableDoubleClick
        onKeyDownCapture={(event) => {
          if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || !group.current)
            return;
          event.preventDefault();
          const element = event.currentTarget.parentElement;
          if (!element) return;
          const available = element.clientHeight - 1;
          const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
          const current = (group.current.getLayout().overview / 100) * available;
          const requested =
            event.key === 'Home'
              ? 12.75 * rem
              : event.key === 'End'
                ? available - 15 * rem
                : current + (event.key === 'ArrowUp' ? -16 : 16);
          const value = (clamp(requested, 12.75 * rem, available - 15 * rem) / available) * 100;
          layoutRef.current.rows = group.current.setLayout({ overview: value, diff: 100 - value });
        }}
      />
      <ResizablePanel
        id="diff"
        minSize={showDiff ? '15rem' : 0}
        maxSize={showDiff ? undefined : 0}
        className={paneClass}
      >
        {diff}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
