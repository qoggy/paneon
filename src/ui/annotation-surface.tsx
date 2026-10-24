import { useUI } from './use-ui';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { annotationTargetKey } from '../sdk/annotation.js';
import { useAnnotations, useAnnotationContext } from './annotation-context';
import { floatingPosition, markerPosition } from './annotation-geometry';
import { Button } from './button';
import { Textarea } from './textarea';
import { cn } from './utils';
import { Popover, PopoverTrigger, PopoverContent } from './popover';
import { Tooltip, TooltipTrigger, TooltipContent } from './tooltip';

type Marker = { id: string; number: number; target: string; rect: DOMRect };
type Geometry = {
  markers: Marker[];
  highlights: DOMRect[];
  anchor?: DOMRect;
  pendingAnchor?: DOMRect;
};
const serialize = (value: unknown) => JSON.stringify(value);

/** Internal: mounted exactly once by AnnotationRoot, never by content or menu components. */
export function AnnotationSurface() {
  const { t, message } = useUI();
  const { store, disabled } = useAnnotationContext();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [geometry, setGeometry] = useState<Geometry>({ markers: [], highlights: [] });
  const input = useRef<HTMLTextAreaElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const blocked = disabled || state.submitting;
  const editing = state.editor !== null;
  const editorAnchor = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () => geometry.anchor ?? new DOMRect(window.innerWidth - 8, 8, 0, 0),
      },
    }),
    [geometry.anchor],
  );
  useLayoutEffect(() => store.mountSurface(), [store]);
  useLayoutEffect(() => {
    let frame = 0;
    let registryDirty = true;
    const measure = () => {
      // A view rebuild unregisters and registers multiple sources in one turn.
      // Measure only the settled registry, never each incomplete intermediate state.
      if (registryDirty) {
        resize.disconnect();
        resize.observe(document.body);
        for (const element of store.registeredElements()) resize.observe(element);
        registryDirty = false;
      }
      const markers: Marker[] = [];
      const highlights: DOMRect[] = [];
      const placed: DOMRect[] = [];
      const snapshot = store.getSnapshot();
      for (const annotation of snapshot.value.annotations) {
        for (const target of annotation.targets) {
          const rects = store.targetRects(target);
          highlights.push(...rects.map((item) => item.rect));
          const last = rects.at(-1);
          if (!last) continue;
          const position = markerPosition(last, placed);
          if (!position) continue;
          placed.push(position);
          markers.push({
            id: annotation.id,
            number: store.numberFor(annotation.id),
            target: annotationTargetKey(target),
            rect: position,
          });
        }
      }
      const targets = snapshot.editor?.targets ?? snapshot.pending;
      const firstRect = (targets: typeof snapshot.pending) => {
        for (const target of targets) {
          const rect = store.targetRects(target, true)[0];
          if (rect) return rect.rect;
        }
      };
      const anchor = firstRect(targets);
      const pendingAnchor = snapshot.editor ? firstRect(snapshot.pending) : anchor;
      const next = { markers, highlights, anchor, pendingAnchor };
      setGeometry((current) => (serialize(current) === serialize(next) ? current : next));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    const observe = () => {
      registryDirty = true;
      schedule();
    };
    const mutations = new MutationObserver((changes) => {
      if (
        changes.some(
          (change) =>
            !(
              change.target instanceof Element ? change.target : change.target.parentElement
            )?.closest('[data-annotation-controls]'),
        )
      )
        schedule();
    });
    mutations.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
    });
    const unregister = store.subscribeRegistry(observe);
    const unsubscribe = store.subscribe(schedule);
    observe();
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      unregister();
      unsubscribe();
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [store, state.editor?.id]);
  useEffect(() => {
    if (!editing) return;
    input.current?.focus();
  }, [editing, state.editor?.id]);
  const close = () => {
    store.cancelEditor();
  };
  return createPortal(
    <div
      data-annotation-controls=""
      data-annotation-surface=""
      className="pointer-events-none fixed inset-0 z-50"
    >
      <div aria-hidden="true">
        {geometry.highlights.map((rect, index) => (
          <div
            key={index}
            className="absolute bg-primary/10"
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          />
        ))}
      </div>
      {geometry.markers.map((marker) => (
        <Button
          key={`${marker.id}:${marker.target}`}
          type="button"
          size="icon-xs"
          data-annotation-marker={marker.id}
          data-annotation-number={marker.number}
          aria-label={t('Annotation {number}', { number: marker.number })}
          disabled={blocked}
          className="pointer-events-auto absolute rounded-full transition-colors"
          style={{ left: marker.rect.left, top: marker.rect.top }}
          onClick={() => store.openAnnotation(marker.id)}
        >
          {marker.number}
        </Button>
      ))}
      {state.pending.length > 0 && geometry.pendingAnchor && !blocked && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-annotation-action=""
          className="pointer-events-auto absolute z-10 bg-popover shadow-md transition-colors"
          style={{
            ...floatingPosition(geometry.pendingAnchor, 72, 32),
            ...(state.editor
              ? { top: Math.min(geometry.pendingAnchor.bottom + 8, window.innerHeight - 40) }
              : {}),
          }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => store.openAnnotation()}
        >
          {t('批注')}
        </Button>
      )}
      {!state.editor && (state.uiError || state.error) && (
        <p
          role="alert"
          className="pointer-events-auto absolute right-2 bottom-2 max-w-[calc(100%-16px)] rounded-md border bg-popover p-3 text-sm text-destructive shadow-md"
        >
          {state.uiError ? message(state.uiError) : state.error}
        </p>
      )}
      {state.editor && (
        <Popover
          open
          modal={false}
          onOpenChange={(open, details) => {
            if (!open && details.reason === 'escape-key' && !blocked) close();
          }}
        >
          <PopoverContent
            data-annotation-controls=""
            data-annotation-editor=""
            aria-label={t('编辑批注')}
            side="top"
            align="start"
            sideOffset={8}
            collisionPadding={8}
            anchor={editorAnchor.current}
            className="pointer-events-auto max-h-[min(calc(100dvh-16px),var(--available-height))] w-[min(22.5rem,calc(100vw-1rem))] space-y-3 overflow-auto p-3"
            initialFocus={() => {
              returnFocus.current =
                document.activeElement instanceof HTMLElement ? document.activeElement : null;
              return input.current;
            }}
            finalFocus={returnFocus}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                if (!blocked) store.saveEditor();
              }
            }}
          >
            <Textarea
              ref={input}
              aria-label={t('批注内容')}
              placeholder={t('添加批注（可留空）')}
              disabled={blocked}
              value={state.editor.comment}
              onChange={(event) => store.changeEditor(event.target.value)}
            />
            {state.uiError && (
              <p role="alert" className="text-sm text-destructive">
                {message(state.uiError)}
              </p>
            )}
            <div className="flex justify-end gap-2">
              {state.editor.id && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="mr-auto text-muted-foreground"
                        aria-label={t('删除批注')}
                        disabled={blocked}
                        onClick={() => store.deleteEditor()}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    }
                  />
                  <TooltipContent>{t('删除批注')}</TooltipContent>
                </Tooltip>
              )}
              <Button type="button" size="sm" variant="outline" disabled={blocked} onClick={close}>
                {t('取消')}
              </Button>
              <Button type="button" size="sm" disabled={blocked} onClick={() => store.saveEditor()}>
                {t('保存')}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>,
    document.body,
  );
}

export function AnnotationSubmitButton({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useUI();
  const feedback = useAnnotations();
  const { disabled } = useAnnotationContext();
  return (
    <Button
      type="button"
      className={className}
      disabled={disabled || feedback.submitting}
      onClick={() => {
        void feedback.submit().catch(() => {});
      }}
    >
      {feedback.submitting ? t('提交中…') : (children ?? t('提交批注'))}
    </Button>
  );
}

/** Annotation directory with a default submit action; page layout belongs to its author. */
export function AnnotationMenu({
  className,
  showSubmit = true,
}: {
  className?: string;
  showSubmit?: boolean;
}) {
  const { t } = useUI();
  const { store, disabled } = useAnnotationContext();
  const feedback = useAnnotations();
  const blocked = disabled || feedback.submitting;
  const [menuOpen, setMenuOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pinned = useRef(false);
  const hoverOpened = useRef(false);
  const content = useRef<HTMLDivElement>(null);
  const cancelClose = () => clearTimeout(closeTimer.current);
  const close = () => {
    cancelClose();
    pinned.current = false;
    setMenuOpen(false);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (!pinned.current && !content.current?.contains(document.activeElement)) setMenuOpen(false);
    }, 180);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  return (
    <div data-annotation-controls="" className={cn('flex flex-wrap items-center gap-2', className)}>
      <Popover
        open={menuOpen}
        onOpenChange={(open) => {
          if (!open) close();
          else setMenuOpen(true);
        }}
      >
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              disabled={feedback.submitting}
              onMouseMove={(event) => {
                if (event.buttons !== 0) return;
                cancelClose();
                if (menuOpen) return;
                hoverOpened.current = true;
                setMenuOpen(true);
              }}
              onMouseLeave={scheduleClose}
              onClick={(event) => {
                event.preventDefault();
                event.preventBaseUIHandler();
                cancelClose();
                if (pinned.current) close();
                else {
                  pinned.current = true;
                  hoverOpened.current = false;
                  setMenuOpen(true);
                }
              }}
            >
              {t('Annotations')} ({feedback.value.annotations.length})
              <ChevronDown aria-hidden="true" />
            </Button>
          }
        />
        <PopoverContent
          ref={content}
          align="end"
          className="flex max-h-[min(32rem,var(--available-height))] w-[28rem] flex-col overflow-hidden p-0"
          data-annotation-controls=""
          aria-label={t('批注目录')}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          initialFocus={() => !hoverOpened.current}
        >
          <div className="min-h-0 overflow-y-auto overscroll-contain">
            {feedback.value.annotations.map((entry) => (
              <div
                key={entry.id}
                data-annotation-id={entry.id}
                className="relative border-b text-sm last:border-b-0"
              >
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-4 py-4 pr-24 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                  disabled={feedback.submitting}
                  aria-label={t('Locate annotation {number}', {
                    number: store.numberFor(entry.id),
                  })}
                  onClick={() => {
                    close();
                    void feedback.locate(entry.targets[0]).catch(() => {});
                  }}
                >
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {store.numberFor(entry.id)}.
                  </span>
                  <span className="min-w-0 flex-1 space-y-3">
                    <span className="block space-y-1">
                      <span className="block text-muted-foreground">{t('Selected text:')}</span>
                      {entry.targets.map((target) => (
                        <span
                          key={annotationTargetKey(target)}
                          className="line-clamp-3 font-medium wrap-anywhere whitespace-pre-wrap"
                        >
                          {target.text?.quote ?? t('Annotation target')}
                        </span>
                      ))}
                    </span>
                    <span className="block space-y-1">
                      <span className="block text-muted-foreground">{t('User annotation:')}</span>
                      <span className="block min-h-5 wrap-anywhere whitespace-pre-wrap">
                        {entry.comment}
                      </span>
                    </span>
                  </span>
                </button>
                <div className="absolute top-3 right-3 flex items-start gap-1">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground"
                          aria-label={`${t('编辑批注')} ${store.numberFor(entry.id)}`}
                          disabled={blocked}
                          onClick={() => {
                            close();
                            void feedback
                              .locate(entry.targets[0])
                              .then(() => store.openAnnotation(entry.id))
                              .catch(() => {});
                          }}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                      }
                    />
                    <TooltipContent>{t('编辑批注')}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`${t('删除批注')} ${store.numberFor(entry.id)}`}
                          disabled={blocked}
                          onClick={() => feedback.removeAnnotation(entry.id)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      }
                    />
                    <TooltipContent>{t('删除批注')}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
          {showSubmit && (
            <div
              className="flex shrink-0 justify-end border-t p-3"
              data-annotation-footer=""
              onClick={close}
            >
              <AnnotationSubmitButton />
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
