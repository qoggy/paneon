import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { HTMLAttributes, ReactNode, RefObject } from 'react';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from './popover';
import { Tree } from './tree';
import { useUI } from './use-ui';
import { cn } from './utils';

type Heading = {
  id: string;
  label: string;
  level: number;
  element: HTMLElement;
  children?: Heading[];
};
type Outline = { flat: Heading[]; tree: Heading[] };
type Placement = { left: number; top: number; height: number; width: number };

function outlineOf(content: HTMLElement, prefix: string): Outline {
  const flat = [...content.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')].map(
    (element, index) => ({
      id: element.id || `${prefix}-${index}`,
      label: element.textContent ?? '',
      level: Number(element.tagName.slice(1)),
      element,
    }),
  );
  const tree: Heading[] = [];
  const stack: Heading[] = [];
  for (const heading of flat) {
    while (stack.length && stack[stack.length - 1].level >= heading.level) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) (parent.children ??= []).push(heading);
    else tree.push(heading);
    stack.push(heading);
  }
  return { flat, tree };
}

export function MarkdownOutline({
  children,
  contentRef,
  className,
  annotated,
  ...events
}: Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  children: ReactNode;
  contentRef: RefObject<HTMLDivElement | null>;
  annotated?: boolean;
}) {
  const { t } = useUI();
  const prefix = useId();
  const scope = useRef<HTMLDivElement>(null);
  const lane = useRef<HTMLDivElement>(null);
  const fixedOrigin = useRef<HTMLSpanElement>(null);
  const scrollParent = useRef<HTMLElement | null>(null);
  const viewportTop = useRef(12);
  const jumpTarget = useRef<HTMLElement | null>(null);
  const [outline, setOutline] = useState<Outline>({ flat: [], tree: [] });
  const [wide, setWide] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const collect = () => setOutline(outlineOf(content, prefix));
    collect();
    const observer = new MutationObserver(collect);
    observer.observe(content, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [children, contentRef, prefix]);

  useLayoutEffect(() => {
    const root = scope.current;
    const content = contentRef.current;
    const origin = fixedOrigin.current;
    if (!root || !content || !origin) return;
    const ancestors: HTMLElement[] = [];
    for (let node: HTMLElement | null = root; node; node = node.parentElement) ancestors.push(node);
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      const body = content.getBoundingClientRect();
      let top = 12;
      let bottom = window.innerHeight - 12;
      let right = window.innerWidth;
      let left = 0;
      // Read 64px below the actual scroll viewport, not the moving document edge.
      let readingTop = 12;
      scrollParent.current = null;
      for (const node of ancestors) {
        // Body/document overflow is handled by the viewport, including Dialog's scroll lock.
        if (node === document.body || node === document.documentElement) continue;
        const style = getComputedStyle(node);
        const bounds = node.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          top = Math.max(top, bounds.top + node.clientTop + 8);
          bottom = Math.min(bottom, bounds.top + node.clientTop + node.clientHeight - 8);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          left = Math.max(left, bounds.left + node.clientLeft);
          right = Math.min(right, bounds.left + node.clientLeft + node.clientWidth);
        }
        if (
          !scrollParent.current &&
          /(auto|scroll)/.test(style.overflowY) &&
          node.scrollHeight > node.clientHeight
        ) {
          scrollParent.current = node;
          readingTop = Math.max(12, bounds.top + node.clientTop + 8);
        }
      }
      viewportTop.current = readingTop;
      const visibleTop = Math.max(body.top, top);
      const visibleBottom = Math.min(body.bottom, bottom);
      const isWide = rect.width >= 1088;
      setWide(isWide);
      const visible = visibleBottom > visibleTop && rect.right > left && rect.left < right;
      const sidebar = lane.current?.getBoundingClientRect();
      // A translated Dialog can establish the containing block for fixed descendants.
      const fixed = origin.getBoundingClientRect();
      setPlacement(
        visible
          ? {
              left:
                (isWide && sidebar ? sidebar.left : Math.min(rect.right, right) - 24) - fixed.left,
              top: visibleTop - fixed.top,
              height: visibleBottom - visibleTop,
              width: Math.max(0, Math.min(rect.right, right) - Math.max(rect.left, left)),
            }
          : null,
      );
      if (!visible || isWide) setOpen(false);
      let current = outline.flat[0];
      for (const heading of outline.flat) {
        // Scroll offsets round to pixels while heading boxes retain subpixel coordinates.
        if (heading.element.getBoundingClientRect().top <= readingTop + 65) current = heading;
        else break;
      }
      setActive(current?.id ?? null);
    };
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    const observer = new ResizeObserver(schedule);
    for (const node of [...ancestors, content]) observer.observe(node);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.addEventListener('animationend', schedule, true);
    update();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('animationend', schedule, true);
    };
  }, [outline, wide, contentRef]);

  function jump(id: string | null) {
    const heading = outline.flat.find((item) => item.id === id);
    if (!heading) return;
    const target = heading.element;
    jumpTarget.current = target;
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    const parent = scrollParent.current;
    const top =
      (parent?.scrollTop ?? window.scrollY) +
      target.getBoundingClientRect().top -
      viewportTop.current -
      64;
    (parent ?? window).scrollTo({
      top,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
    setActive(id);
    setOpen(false);
  }

  const hasHeadings = outline.flat.length > 0;
  const sidebar = wide && hasHeadings;
  const tree = (
    <Tree
      items={outline.tree}
      getItemId={(item) => item.id}
      getItemLabel={(item) => item.label}
      getItemChildren={(item) => item.children}
      isItemSelectable={() => true}
      selectedId={active}
      expandedIds={outline.flat.filter((item) => item.children).map((item) => item.id)}
      onSelectionChange={jump}
      getItemPresentation={(_item, state) => ({
        'data-toc-active': state.selected,
        className: state.selected
          ? 'font-semibold text-blue-600 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400'
          : 'text-muted-foreground',
        style: { backgroundColor: 'transparent' },
      })}
      aria-label={t('On this page')}
    />
  );
  return (
    <div
      ref={scope}
      className={cn('markdown-body min-w-0 overflow-x-auto', className)}
      data-toc-mode={hasHeadings ? (wide ? 'sidebar' : 'popup') : 'none'}
      style={
        sidebar
          ? {
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) 220px',
              columnGap: 24,
              alignItems: 'start',
            }
          : undefined
      }
    >
      <div
        ref={contentRef}
        data-markdown-content=""
        data-markdown-annotation={annotated ? '' : undefined}
        className="min-w-0"
        {...events}
      >
        {children}
      </div>
      <span
        ref={fixedOrigin}
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      />
      {sidebar && (
        <div ref={lane} className="min-w-0">
          {placement && (
            <nav
              aria-label={t('On this page')}
              data-toc-sidebar=""
              className="markdown-toc fixed z-20 w-55 overflow-y-auto overscroll-contain border-l bg-background pl-4"
              style={{ left: placement.left, top: placement.top, maxHeight: placement.height }}
            >
              <div className="mb-3 text-sm font-medium">{t('On this page')}</div>
              {tree}
            </nav>
          )}
        </div>
      )}
      {!wide && hasHeadings && placement && (
        <Popover
          open={open}
          onOpenChange={(value) => {
            if (value) jumpTarget.current = null;
            setOpen(value);
          }}
        >
          <PopoverTrigger
            openOnHover
            delay={250}
            aria-label={t('On this page')}
            data-toc-trigger=""
            className="fixed z-20 flex h-7 w-6 items-center justify-center rounded bg-background/90 text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2"
            style={{
              left: placement.left,
              top: placement.top + Math.max(0, (placement.height - 28) / 2),
            }}
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            >
              <path d="M3 4h10M3 8h7M3 12h9" />
            </svg>
          </PopoverTrigger>
          <PopoverContent
            side="left"
            align="center"
            sideOffset={0}
            collisionPadding={12}
            positionMethod="fixed"
            initialFocus={(type) => type === 'keyboard'}
            finalFocus={() => jumpTarget.current ?? true}
            data-toc-popup=""
            className="markdown-toc overflow-y-auto overscroll-contain"
            style={{
              width: Math.min(280, placement.width - 24),
              maxHeight: Math.min(360, placement.height),
            }}
          >
            <PopoverTitle className="mb-3 text-sm font-medium">{t('On this page')}</PopoverTitle>
            <nav aria-label={t('On this page')}>{tree}</nav>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
