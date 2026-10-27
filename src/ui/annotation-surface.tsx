import { useUI } from './use-ui';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronUp, MessageSquareText, Pencil, Send, Trash2 } from 'lucide-react';
import { annotationTargetKey } from '../sdk/annotation.js';
import { useAnnotations, useAnnotationContext } from './annotation-context';
import { floatingPosition, markerPosition } from './annotation-geometry';
import { Button } from './button';
import { Textarea } from './textarea';
import { cn } from './utils';
import { Popover, PopoverTrigger, PopoverContent } from './popover';
import { Tooltip, TooltipTrigger, TooltipContent } from './tooltip';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './empty';
import { Spinner } from './spinner';

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
      const annotations = [...snapshot.value.annotations];
      if (snapshot.editor && !snapshot.editor.id)
        annotations.push({ ...snapshot.editor, id: snapshot.editor.draftId });
      for (const annotation of annotations) {
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
    measure();
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
  }, [store, state.editor?.draftId]);
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
            data-annotation-highlight=""
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
          onClick={() => {
            if (state.editor?.draftId === marker.id) input.current?.focus({ preventScroll: true });
            else store.openAnnotation(marker.id);
          }}
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
          className="pointer-events-auto absolute right-4 bottom-16 max-w-[calc(100%-32px)] rounded-md border bg-popover p-3 text-sm text-destructive shadow-md"
        >
          {state.uiError ? message(state.uiError) : state.error}
        </p>
      )}
      {state.editor && (
        <Popover
          open
          modal={false}
          onOpenChange={(open, details) => {
            if (open) return;
            if (blocked) {
              details.cancel();
              return;
            }
            if (details.reason === 'escape-key') close();
            else if (details.reason === 'outside-press') {
              if (!state.editor?.id) {
                store.changeEditor('');
                store.saveEditor();
              } else close();
            } else details.cancel();
          }}
        >
          <PopoverContent
            data-annotation-controls=""
            data-annotation-editor=""
            aria-label={t('编辑批注')}
            side="top"
            positionMethod="fixed"
            align="start"
            sideOffset={28}
            collisionPadding={8}
            anchor={editorAnchor.current}
            className="pointer-events-auto max-h-[min(calc(100dvh-16px),var(--available-height))] w-[min(22.5rem,calc(100vw-1rem))] overflow-auto rounded-2xl p-1.5 focus-within:border-ring"
            initialFocus={() => {
              returnFocus.current =
                document.activeElement instanceof HTMLElement ? document.activeElement : null;
              const textarea = input.current;
              textarea?.focus({ preventScroll: true });
              textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
              return false;
            }}
            finalFocus={returnFocus}
          >
            <div className="flex items-end gap-1">
              <Textarea
                ref={input}
                rows={1}
                className="min-h-8 min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 leading-5 shadow-none focus-visible:ring-0 md:text-sm dark:bg-transparent"
                aria-label={t('批注内容')}
                placeholder={t('添加批注（可留空）')}
                disabled={blocked}
                value={state.editor.comment}
                onChange={(event) => store.changeEditor(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!blocked) store.saveEditor();
                  }
                }}
              />
              {state.editor.id && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="shrink-0 rounded-full text-muted-foreground"
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
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      className="shrink-0 rounded-full"
                      aria-label={t('保存')}
                      disabled={blocked}
                      onClick={() => store.saveEditor()}
                    >
                      <Check aria-hidden="true" />
                    </Button>
                  }
                />
                <TooltipContent
                  sideOffset={6}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-2"
                >
                  <span>{t('保存')}</span>
                  <kbd
                    aria-label="Enter"
                    className="rounded bg-background/15 px-1.5 text-center font-sans"
                  >
                    ↵
                  </kbd>
                  <span>{t('换行')}</span>
                  <kbd
                    aria-label="Shift+Enter"
                    className="rounded bg-background/15 px-1.5 text-center font-sans"
                  >
                    ⇧↵
                  </kbd>
                </TooltipContent>
              </Tooltip>
            </div>
            {state.uiError && (
              <p role="alert" className="px-2 py-1 text-sm text-destructive">
                {message(state.uiError)}
              </p>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>,
    document.body,
  );
}

function AnnotationSubmitButton({
  className,
  children,
  variant,
}: {
  className?: string;
  children?: ReactNode;
  variant?: ComponentProps<typeof Button>['variant'];
}) {
  const { t } = useUI();
  const feedback = useAnnotations();
  const { disabled } = useAnnotationContext();
  return (
    <Button
      type="button"
      className={className}
      variant={variant}
      disabled={disabled || feedback.submitting}
      onClick={() => {
        void feedback.submit().catch(() => {});
      }}
    >
      {feedback.submitting ? (
        <>
          <Spinner aria-hidden="true" />
          {t('提交中…')}
        </>
      ) : (
        (children ?? t('提交批注'))
      )}
    </Button>
  );
}

type LauncherPosition = { left: number; top: number };

function clampLauncherPosition(element: HTMLElement, position: LauncherPosition): LauncherPosition {
  return {
    left: Math.max(16, Math.min(position.left, window.innerWidth - element.offsetWidth - 16)),
    top: Math.max(16, Math.min(position.top, window.innerHeight - element.offsetHeight - 16)),
  };
}

/** Internal: the page's single floating annotation directory. */
export function AnnotationMenu() {
  const { t } = useUI();
  const { store, disabled } = useAnnotationContext();
  const feedback = useAnnotations();
  const { allowEmptySubmit = false, onRequestEdit } = store.configuration ?? {};
  const empty = feedback.value.annotations.length === 0;
  const blocked = disabled || feedback.submitting;
  const [menuOpen, setMenuOpen] = useState(false);
  const [position, setPosition] = useState<LauncherPosition | null>(null);
  const [dragging, setDragging] = useState(false);
  const launcher = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    origin: LauncherPosition;
  } | null>(null);
  const suppressClick = useRef(false);
  const suppressHover = useRef(false);
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
  useLayoutEffect(() => {
    const element = launcher.current;
    if (!element) return;
    const constrain = () => {
      setPosition((current) => {
        if (!current) return current;
        const next = clampLauncherPosition(element, current);
        return next.left === current.left && next.top === current.top ? current : next;
      });
    };
    const observer = new ResizeObserver(constrain);
    observer.observe(element);
    window.addEventListener('resize', constrain);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', constrain);
    };
  }, []);
  const finishDrag = () => {
    drag.current = null;
    setDragging(false);
  };
  return createPortal(
    <div
      ref={launcher}
      data-annotation-controls=""
      data-annotation-launcher=""
      className="pointer-events-auto fixed right-4 bottom-4 z-50"
      style={position ? { ...position, right: 'auto', bottom: 'auto' } : undefined}
    >
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
              className={cn(
                'touch-none rounded-full bg-popover text-popover-foreground shadow-md select-none dark:bg-popover',
                dragging ? 'cursor-grabbing' : 'cursor-grab',
              )}
              disabled={feedback.submitting}
              onPointerDown={(event) => {
                const element = launcher.current;
                if (event.button !== 0 || !event.isPrimary || !element) return;
                const rect = element.getBoundingClientRect();
                suppressClick.current = false;
                drag.current = {
                  pointerId: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  origin: { left: rect.left, top: rect.top },
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const current = drag.current;
                const element = launcher.current;
                if (!current || current.pointerId !== event.pointerId || !element) return;
                if ((event.buttons & 1) === 0) {
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  finishDrag();
                  return;
                }
                const dx = event.clientX - current.x;
                const dy = event.clientY - current.y;
                if (!suppressClick.current) {
                  if (Math.hypot(dx, dy) < 4) return;
                  suppressClick.current = true;
                  suppressHover.current = true;
                  setDragging(true);
                  close();
                }
                setPosition(
                  clampLauncherPosition(element, {
                    left: current.origin.left + dx,
                    top: current.origin.top + dy,
                  }),
                );
              }}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              onLostPointerCapture={finishDrag}
              onMouseMove={(event) => {
                if (event.buttons !== 0 || drag.current || suppressHover.current) return;
                cancelClose();
                if (menuOpen) return;
                hoverOpened.current = true;
                setMenuOpen(true);
              }}
              onMouseLeave={() => {
                suppressHover.current = false;
                scheduleClose();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.preventBaseUIHandler();
                if (suppressClick.current && event.detail !== 0) {
                  suppressClick.current = false;
                  return;
                }
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
              <ChevronUp aria-hidden="true" />
            </Button>
          }
        />
        <PopoverContent
          ref={content}
          align="end"
          side="top"
          positionMethod="fixed"
          sideOffset={8}
          collisionPadding={16}
          className={cn(
            'flex max-h-[min(32rem,var(--available-height))] w-[28rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0',
            empty && 'w-[21rem]',
          )}
          data-annotation-controls=""
          aria-label={t('批注目录')}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          initialFocus={() => !hoverOpened.current}
        >
          {empty && (
            <Empty className="flex-none flex-row items-start justify-start gap-3 rounded-none p-4 text-left text-wrap">
              <EmptyMedia variant="icon" className="mb-0 text-muted-foreground">
                <MessageSquareText aria-hidden="true" />
              </EmptyMedia>
              <EmptyHeader className="min-w-0 items-start gap-1">
                <EmptyTitle>{t('No annotations yet')}</EmptyTitle>
                <EmptyDescription className="text-xs leading-5">
                  {t('Select text on the page, then click “Annotation” to add one.')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
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
                    {entry.comment !== '' && (
                      <span className="block space-y-1">
                        <span className="block text-muted-foreground">{t('User annotation:')}</span>
                        <span className="block min-h-5 wrap-anywhere whitespace-pre-wrap">
                          {entry.comment}
                        </span>
                      </span>
                    )}
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
          {disabled && onRequestEdit ? (
            <div className="shrink-0 border-t p-1" data-annotation-correction="">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2.5 rounded-sm"
                disabled={feedback.submitting}
                onClick={() => {
                  close();
                  store.configuration?.onRequestEdit?.();
                }}
              >
                <Pencil aria-hidden="true" className="text-muted-foreground" />
                {t('修改反馈')}
              </Button>
            </div>
          ) : (
            (!empty || allowEmptySubmit) && (
              <div className="shrink-0 border-t p-1" data-annotation-submit="" onClick={close}>
                <AnnotationSubmitButton
                  variant="ghost"
                  className="w-full justify-start gap-2.5 rounded-sm"
                >
                  <Send aria-hidden="true" className="text-muted-foreground" />
                  <span>{t('提交批注')}</span>
                  <span
                    aria-hidden="true"
                    className="ml-auto text-xs font-normal text-muted-foreground tabular-nums"
                  >
                    {t(
                      feedback.value.annotations.length === 1
                        ? '{count} annotation'
                        : '{count} annotations',
                      { count: feedback.value.annotations.length },
                    )}
                  </span>
                </AnnotationSubmitButton>
              </div>
            )
          )}
        </PopoverContent>
      </Popover>
    </div>,
    document.body,
  );
}
