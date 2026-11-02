import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { annotationTargetKey } from '../sdk/annotation';
import type { ElementAnnotationRef } from '../sdk/annotation';
import { useAnnotationContext } from './annotation-context';
import { annotationOverlayStyle, createRectClipper } from './annotation-geometry';
import { elementAncestors, elementAnnotationRef } from './element-annotation';
import { Button } from './button';
import { Popover, PopoverContent } from './popover';
import { useUI } from './use-ui';
import { ElementPickerContext } from './element-annotation-context';

type Mode = 'browse' | 'pick' | 'review';

/** Private page tool; the original editor and directory remain the only draft UI. */
export function ElementAnnotationPicker({ children }: { children: ReactNode }) {
  const { store } = useAnnotationContext<ElementAnnotationRef>();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const { t } = useUI();
  const [mode, setMode] = useState<Mode>('browse');
  const [hovered, setHovered] = useState<Element | null>(null);
  const [chain, setChain] = useState<Element[]>([]);
  const [level, setLevel] = useState(0);
  const [launcher, setLauncher] = useState<HTMLElement | null>(null);
  const [bounds, setBounds] = useState<DOMRect | null>(null);
  const registrations = useRef(new Map<string, { element: Element; dispose: () => void }>());
  const root =
    store.overlayContainer?.closest('[role="dialog"]') ?? store.overlayContainer ?? document.body;
  const selected = mode === 'review' ? chain[level] : mode === 'pick' ? hovered : null;
  const blocked = store.disabled || snapshot.submitting || snapshot.editor !== null;
  const exit = useCallback(() => {
    setMode('browse');
    setHovered(null);
    setChain([]);
    setLevel(0);
  }, []);
  const enter = useCallback(() => {
    store.dismissSelection();
    document.getSelection()?.removeAllRanges();
    setMode('pick');
    setHovered(null);
    setChain([]);
    setLevel(0);
  }, [store]);
  const cancelRange = useCallback(() => {
    setMode('pick');
    setHovered(null);
    setChain([]);
    setLevel(0);
  }, []);
  const escape = useCallback(() => {
    if (mode === 'review') cancelRange();
    else exit();
  }, [mode, cancelRange, exit]);
  if (blocked && mode !== 'browse') exit();
  useEffect(() => {
    const entries = registrations.current;
    return () => {
      for (const entry of entries.values()) entry.dispose();
    };
  }, []);

  useLayoutEffect(() => {
    if (!selected) return;
    const measure = () => setBounds(selected.getBoundingClientRect());
    const observer = new ResizeObserver(measure);
    observer.observe(selected);
    observer.observe(document.body);
    window.addEventListener('resize', measure);
    document.addEventListener('scroll', measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      document.removeEventListener('scroll', measure, true);
    };
  }, [selected]);

  useEffect(() => {
    if (mode === 'browse') return;
    const previousCursor = document.body.style.cursor;
    if (mode === 'pick') document.body.style.cursor = 'crosshair';
    const contentNode = (event: Event) => {
      const node = event.target;
      return node instanceof Element &&
        root.contains(node) &&
        !node.closest('[data-annotation-controls]')
        ? node
        : null;
    };
    const hover = (event: PointerEvent) => {
      if (mode === 'pick') {
        const node = contentNode(event);
        setHovered(node);
        setBounds(node?.getBoundingClientRect() ?? null);
      }
    };
    const down = (event: PointerEvent) => {
      if (contentNode(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const click = (event: MouseEvent) => {
      const node = contentNode(event);
      if (!node) return;
      event.preventDefault();
      event.stopPropagation();
      if (mode === 'pick') {
        const ancestors = elementAncestors(node, root);
        setChain(ancestors);
        setLevel(0);
        setBounds(ancestors[0]?.getBoundingClientRect() ?? null);
        setMode('review');
      }
    };
    document.addEventListener('pointermove', hover, true);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('click', click, true);
    return () => {
      document.body.style.cursor = previousCursor;
      document.removeEventListener('pointermove', hover, true);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('click', click, true);
    };
  }, [mode, root]);

  const chooseLevel = useCallback(
    (value: number) => {
      setLevel(value);
      setBounds(chain[value].getBoundingClientRect());
    },
    [chain],
  );

  const annotate = useCallback(() => {
    if (!selected) return;
    const target = { ref: elementAnnotationRef(selected, document.body) };
    const key = annotationTargetKey(target);
    const previous = registrations.current.get(key);
    if (previous?.element !== selected) {
      previous?.dispose();
      registrations.current.set(key, {
        element: selected,
        dispose: store.registerObject({
          target,
          source: '',
          element: selected,
          summary: target.ref.element.excerpt || selected.localName,
        }),
      });
    }
    exit();
    store.beginAnnotation([target]);
  }, [selected, store, exit]);

  useEffect(() => {
    if (mode === 'browse') return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        escape();
        return;
      }
      if (mode !== 'review') return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        chooseLevel(
          Math.max(0, Math.min(chain.length - 1, level + (event.key === 'ArrowLeft' ? 1 : -1))),
        );
      } else if (event.key === 'Enter' && !event.repeat) {
        if (event.target instanceof Element && event.target.closest('[data-selection-cancel]'))
          return;
        event.preventDefault();
        event.stopPropagation();
        annotate();
      }
    };
    document.addEventListener('keydown', keyboard, true);
    return () => document.removeEventListener('keydown', keyboard, true);
  }, [mode, chain.length, level, chooseLevel, annotate, escape]);

  const anchor = useMemo(
    () => ({ current: { getBoundingClientRect: () => bounds ?? new DOMRect() } }),
    [bounds],
  );
  const outline = selected && bounds ? createRectClipper()(bounds, selected)?.rect : undefined;
  const name = (node: Element) => {
    const slots = {
      card: 'Card',
      'card-header': 'Card header',
      'card-title': 'Title',
      'card-description': 'Description',
      'card-content': 'Card content',
    } as const;
    const tags = {
      svg: 'SVG',
      g: 'SVG group',
      text: 'SVG text',
      button: 'Button',
      p: 'Paragraph',
    } as const;
    const slot = node.getAttribute('data-slot') as keyof typeof slots;
    const tag = node.localName as keyof typeof tags;
    return node === root
      ? t('Panel')
      : slots[slot]
        ? t(slots[slot])
        : tags[tag]
          ? t(tags[tag])
          : node.localName;
  };

  return (
    <ElementPickerContext.Provider
      value={{ active: mode !== 'browse', blocked, enter, exit, setLauncher }}
    >
      {children}
      {outline &&
        createPortal(
          <div
            aria-hidden="true"
            data-annotation-controls=""
            className="pointer-events-none fixed inset-0 z-50"
            style={annotationOverlayStyle(store.mediaViewActive ? store.overlayContainer : null)}
          >
            <div
              data-element-annotation-outline=""
              className="absolute rounded-sm outline-2 outline-primary"
              style={{
                left: outline.left,
                top: outline.top,
                width: outline.width,
                height: outline.height,
              }}
            />
          </div>,
          store.overlayContainer ?? document.body,
        )}
      {mode !== 'browse' && launcher && (
        <Popover
          open
          onOpenChange={(open, details) => {
            if (!open && details.reason === 'escape-key') escape();
            else if (!open) details.cancel();
          }}
        >
          <PopoverContent
            anchor={mode === 'review' ? anchor.current : launcher}
            container={store.overlayContainer ?? undefined}
            side={mode === 'review' ? 'bottom' : 'top'}
            align="end"
            sideOffset={8}
            collisionPadding={16}
            positionMethod="fixed"
            initialFocus={false}
            finalFocus={false}
            data-annotation-controls=""
            data-element-annotation-picker={mode}
            aria-label={t('Select annotation range')}
            className={
              mode === 'review'
                ? 'w-[28rem] max-w-[calc(100vw-2rem)] p-2'
                : 'w-auto max-w-[calc(100vw-2rem)] px-3 py-2'
            }
          >
            {mode === 'pick' ? (
              <p role="status" className="text-sm">
                {t('Click content to select a range · Esc to exit')}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1 pb-2 text-xs text-muted-foreground">
                  <span>{t('Select range')}</span>
                  <span>{t('← Expand · → Narrow · ↵ Annotate · Esc Cancel')}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {[...chain].reverse().map((node, index) => {
                    const value = chain.length - 1 - index;
                    return (
                      <Button
                        key={value}
                        size="sm"
                        variant={value === level ? 'secondary' : 'ghost'}
                        aria-pressed={value === level}
                        onClick={() => chooseLevel(value)}
                      >
                        {name(node)}
                      </Button>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-end gap-1 border-t pt-2">
                  <Button size="sm" variant="ghost" data-selection-cancel="" onClick={cancelRange}>
                    {t('取消')}
                  </Button>
                  <Button size="sm" onClick={annotate}>
                    {t('添加批注')}
                  </Button>
                </div>
              </>
            )}
          </PopoverContent>
        </Popover>
      )}
    </ElementPickerContext.Provider>
  );
}
