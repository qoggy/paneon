import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { FeedbackContext } from './feedback-context';
import { FeedbackStore } from './feedback-store';
import { textControlSelector } from './feedback-selection';
import type { FeedbackProviderProps } from './feedback-types';
import type { JsonValue } from '../sdk/feedback.js';

export function FeedbackProvider<TRef = JsonValue>({
  children,
  onSubmit,
  adapter,
  disabled = false,
}: FeedbackProviderProps<TRef>) {
  const [store] = useState(() => new FeedbackStore<TRef>({ onSubmit, adapter, disabled }));
  useLayoutEffect(() => {
    store.setOptions({ onSubmit, adapter, disabled });
  }, [store, onSubmit, adapter, disabled]);
  useEffect(() => {
    const select = (event: MouseEvent | KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(textControlSelector)) return;
      if (
        event instanceof KeyboardEvent &&
        !event.shiftKey &&
        !['Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      )
        return;
      const selection = document.getSelection();
      if (selection) store.selectText(selection);
    };
    document.addEventListener('mouseup', select);
    document.addEventListener('keyup', select);
    return () => {
      document.removeEventListener('mouseup', select);
      document.removeEventListener('keyup', select);
    };
  }, [store]);
  const context = useMemo(
    () => ({ store: store as unknown as FeedbackStore<unknown>, disabled }),
    [store, disabled],
  );
  return <FeedbackContext.Provider value={context}>{children}</FeedbackContext.Provider>;
}
