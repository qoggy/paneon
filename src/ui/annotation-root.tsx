import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { AnnotationContext } from './annotation-context';
import { AnnotationStore } from './annotation-store';
import { AnnotationSurface } from './annotation-surface';
import { textControlSelector } from './annotation-selection';
import type { AnnotationRootProps } from './annotation-types';
import type { JsonValue } from '../sdk/annotation.js';

/** Owns one annotation session and its single contextual UI; it adds no layout wrapper. */
export function AnnotationRoot<TRef = JsonValue>({
  children,
  onSubmit,
  adapter,
  disabled = false,
}: AnnotationRootProps<TRef>) {
  const [store] = useState(() => new AnnotationStore<TRef>({ onSubmit, adapter, disabled }));
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
    () => ({ store: store as unknown as AnnotationStore<unknown>, disabled }),
    [store, disabled],
  );
  return (
    <AnnotationContext.Provider value={context}>
      {children}
      <AnnotationSurface />
    </AnnotationContext.Provider>
  );
}
