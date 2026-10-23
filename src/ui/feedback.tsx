import { useLayoutEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { Slot } from 'radix-ui';
import { feedbackKey } from '../sdk/feedback.js';
import type { JsonValue } from '../sdk/feedback.js';
import { useFeedback, useFeedbackContext } from './feedback-context';
import { interactiveSelector } from './feedback-selection';
import type { FeedbackTargetProps, FeedbackTextProps } from './feedback-types';
import { cn } from './utils';

export function FeedbackTarget<TRef = JsonValue>({
  target,
  asChild = false,
  children,
}: FeedbackTargetProps<TRef>) {
  const { store, disabled } = useFeedbackContext<TRef>();
  const feedback = useFeedback<TRef>();
  const key = feedbackKey(target);
  const reference = useMemo(() => JSON.parse(key) as TRef, [key]);
  const element = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (element.current) return store.registerObject(reference, element.current);
  }, [store, reference]);
  const selected =
    !!feedback.selectionTargets.some((item) => !item.text && feedbackKey(item.ref) === key) ||
    feedback.value.annotations.some((annotation) =>
      annotation.targets.some((item) => !item.text && feedbackKey(item.ref) === key),
    );
  const active = feedback.value.annotations
    .find((item) => item.id === feedback.activeAnnotationId)
    ?.targets.some((item) => !item.text && feedbackKey(item.ref) === key);
  const choose = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    if (feedback.mode !== 'select' || disabled || feedback.submitting || event.defaultPrevented)
      return;
    const origin = event.target as Element;
    if (
      origin.closest(interactiveSelector) ||
      origin.closest('[data-feedback-target]') !== event.currentTarget
    )
      return;
    if (!event.currentTarget.ownerDocument.getSelection()?.isCollapsed) return;
    event.preventDefault();
    event.stopPropagation();
    store.chooseObject({ ref: reference });
  };
  const props = {
    'data-feedback-target': '',
    'data-feedback-selected': selected ? 'true' : undefined,
    'data-feedback-active': active ? 'true' : undefined,
    tabIndex: feedback.mode === 'select' ? 0 : undefined,
    className: cn(selected && 'outline-2 outline-offset-2 outline-ring', active && 'bg-accent/50'),
    onClick: choose,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.target === event.currentTarget && (event.key === ' ' || event.key === 'Enter'))
        choose(event);
    },
  };
  return asChild ? (
    <Slot.Root {...props} ref={element}>
      {children}
    </Slot.Root>
  ) : (
    <div {...props} ref={element as React.RefObject<HTMLDivElement>}>
      {children}
    </div>
  );
}

export function FeedbackText<TRef = JsonValue>({
  target,
  text,
  className,
}: FeedbackTextProps<TRef>) {
  const { store } = useFeedbackContext<TRef>();
  const element = useRef<HTMLSpanElement>(null);
  const key = feedbackKey(target);
  const reference = useMemo(() => JSON.parse(key) as TRef, [key]);
  useLayoutEffect(() => {
    const node = element.current?.firstChild;
    if (node?.nodeType === Node.TEXT_NODE)
      return store.registerText({
        ref: reference,
        source: text,
        segments: [
          {
            node: node as Text,
            sourceOffsets: Array.from({ length: text.length + 1 }, (_, index) => index),
          },
        ],
      });
  }, [store, reference, text]);
  return (
    <span ref={element} className={className} data-feedback-text="">
      {text}
    </span>
  );
}

export {
  FeedbackSurface,
  FeedbackSubmitButton,
  FeedbackToolbar,
  FeedbackSelectionControls,
  FeedbackOverallAnnotationButton,
  FeedbackControls,
} from './feedback-surface';
