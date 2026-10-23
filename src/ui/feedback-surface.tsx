import { useUI } from './use-ui';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { feedbackTargetKey } from '../sdk/feedback.js';
import { useFeedback, useFeedbackContext } from './feedback-context';
import { floatingPosition, markerPosition } from './feedback-geometry';
import { Button } from './button';
import { Textarea } from './textarea';
import { cn } from './utils';
import { Popover, PopoverTrigger, PopoverContent } from './popover';

type Marker = { id: string; number: number; target: string; rect: DOMRect };
type Geometry = {
  markers: Marker[];
  highlights: DOMRect[];
  anchor?: DOMRect;
  pendingAnchor?: DOMRect;
};
const serialize = (value: unknown) => JSON.stringify(value);

/** Render once per provider. Portals keep valid table/Markdown DOM and source Text nodes intact. */
export function FeedbackSurface({ className }: { className?: string }) {
  const { t, message } = useUI();
  const { store, disabled } = useFeedbackContext();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [geometry, setGeometry] = useState<Geometry>({ markers: [], highlights: [] });
  const editorElement = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [editorHeight, setEditorHeight] = useState(230);
  const blocked = disabled || state.submitting;
  const editing = state.editor !== null;
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
            target: feedbackTargetKey(target),
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
      let anchor = firstRect(targets);
      if (snapshot.editor?.kind === 'overall' && store.overallAnchor?.isConnected)
        anchor = store.overallAnchor.getBoundingClientRect();
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
            )?.closest('[data-feedback-controls]'),
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
  }, [store, state.editor?.id, state.editor?.kind]);
  useEffect(() => {
    if (!editing) return;
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    input.current?.focus();
  }, [editing, state.editor?.id, state.editor?.kind]);
  useLayoutEffect(() => {
    const element = editorElement.current;
    if (!element) return;
    const measure = () => setEditorHeight(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [state.editor]);
  const close = () => {
    store.cancelEditor();
    returnFocus.current?.focus();
  };
  const editorWidth = Math.min(360, window.innerWidth - 16);
  const position = floatingPosition(
    geometry.anchor,
    state.editor ? editorWidth : 72,
    state.editor ? editorHeight : 32,
    !!state.editor && state.mode === 'select',
  );
  return createPortal(
    <div
      data-feedback-controls=""
      data-feedback-surface=""
      className={cn('pointer-events-none fixed inset-0 z-50', className)}
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
          data-feedback-marker={marker.id}
          data-feedback-number={marker.number}
          aria-label={t('Annotation {number}', { number: marker.number })}
          disabled={blocked}
          className="pointer-events-auto absolute rounded-full transition-colors"
          style={{ left: marker.rect.left, top: marker.rect.top }}
          onClick={() => store.openAnnotation(marker.id)}
        >
          {marker.number}
        </Button>
      ))}
      {state.pending.length > 0 &&
        geometry.pendingAnchor &&
        !blocked &&
        !(state.pendingKind === 'objects' && store.hasToolbar) && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-feedback-action=""
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
        <div
          ref={editorElement}
          role="dialog"
          aria-label={state.editor.kind === 'overall' ? t('整体批注') : t('编辑批注')}
          className="pointer-events-auto absolute max-h-[calc(100dvh-16px)] space-y-3 overflow-auto rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
          style={{ ...position, width: editorWidth }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              if (!blocked) close();
            }
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              if (!blocked) store.saveEditor();
            }
          }}
        >
          <div className="text-sm font-medium">
            {state.editor.kind === 'overall'
              ? t('整体批注')
              : state.editor.id
                ? t('Annotation {number}', { number: store.numberFor(state.editor.id) })
                : t('添加批注')}
          </div>
          <Textarea
            ref={input}
            aria-label={t('批注内容')}
            placeholder={t('添加批注（可留空）')}
            disabled={blocked}
            value={state.editor.comment}
            onChange={(event) => store.changeEditor(event.target.value)}
          />
          {state.editor.kind === 'annotation' && (
            <p className="text-xs text-muted-foreground">
              {t('Selected {count} locations', { count: state.editor.targets.length })}
              {state.mode === 'select' ? t(' · 点击对象可继续选择') : ''}
            </p>
          )}
          {state.uiError && (
            <p role="alert" className="text-sm text-destructive">
              {message(state.uiError)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            {(state.editor.id || state.editor.kind === 'overall') && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mr-auto"
                disabled={blocked}
                onClick={() => store.deleteEditor()}
              >
                {t('删除批注')}
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" disabled={blocked} onClick={close}>
              {t('取消')}
            </Button>
            <Button type="button" size="sm" disabled={blocked} onClick={() => store.saveEditor()}>
              {t('保存')}
            </Button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

export function FeedbackSubmitButton({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useUI();
  const feedback = useFeedback();
  const { disabled } = useFeedbackContext();
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

export function FeedbackOverallAnnotationButton() {
  const { t } = useUI();
  const { store, disabled } = useFeedbackContext();
  const feedback = useFeedback();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || feedback.submitting}
      onClick={(event) => store.openOverall(event.currentTarget)}
    >
      {t('整体批注')}
    </Button>
  );
}

/** Registers the page toolbar once; children may add an action after the selection toggle. */
export function FeedbackSelectionControls({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useUI();
  const { store, disabled } = useFeedbackContext();
  const feedback = useFeedback();
  const blocked = disabled || feedback.submitting;
  const [menuOpen, setMenuOpen] = useState(false);
  useLayoutEffect(() => store.mountToolbar(), [store]);
  return (
    <div data-feedback-controls="" className={cn('flex flex-wrap items-center gap-2', className)}>
      <Button
        type="button"
        variant="outline"
        disabled={blocked}
        aria-pressed={feedback.mode === 'select'}
        onClick={() => feedback.setMode(feedback.mode === 'browse' ? 'select' : 'browse')}
      >
        {feedback.mode === 'select' ? t('结束选择') : t('选择对象')}
      </Button>
      {children}
      {store.getSnapshot().pendingKind === 'objects' && store.getSnapshot().pending.length > 0 && (
        <Button
          type="button"
          variant="outline"
          disabled={blocked}
          onClick={() => store.openAnnotation()}
        >
          {t('批注')}
        </Button>
      )}
      {feedback.value.annotations.length > 0 && (
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" disabled={feedback.submitting}>
              {t('Annotations')} ({feedback.value.annotations.length})
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="max-h-80 w-80 space-y-3 overflow-auto"
            data-feedback-controls=""
            aria-label={t('批注目录')}
          >
            {feedback.value.annotations.map((entry) => (
              <div key={entry.id} data-annotation-id={entry.id} className="space-y-1 text-sm">
                <p className="truncate">
                  <strong>{store.numberFor(entry.id)}.</strong> {entry.comment || t('仅选择')}
                </p>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={blocked}
                    onClick={() => {
                      setMenuOpen(false);
                      void feedback
                        .locate(entry.targets[0])
                        .then(() => store.openAnnotation(entry.id))
                        .catch(() => {});
                    }}
                  >
                    {t('编辑批注')} {store.numberFor(entry.id)}
                  </Button>
                  {entry.targets.map((target, index) => (
                    <Button
                      key={feedbackTargetKey(target)}
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={feedback.submitting}
                      onClick={() => {
                        setMenuOpen(false);
                        void feedback.locate(target).catch(() => {});
                      }}
                    >
                      {t('Locate annotation {number}, location {index}', {
                        number: store.numberFor(entry.id),
                        index: index + 1,
                      })}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export function FeedbackToolbar({ className }: { className?: string }) {
  return (
    <div data-feedback-controls="" className={cn('flex flex-wrap items-center gap-2', className)}>
      <FeedbackSelectionControls className="contents">
        <FeedbackOverallAnnotationButton />
      </FeedbackSelectionControls>
      <FeedbackSubmitButton />
    </div>
  );
}

export function FeedbackControls() {
  return (
    <>
      <FeedbackSurface />
      <FeedbackToolbar />
    </>
  );
}
