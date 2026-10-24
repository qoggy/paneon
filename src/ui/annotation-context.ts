import { createContext, useContext, useSyncExternalStore } from 'react';
import type { AnnotationStore } from './annotation-store';
import type { AnnotationController } from './annotation-types';
import type { JsonValue } from '../sdk/annotation.js';

export const AnnotationContext = createContext<{
  store: AnnotationStore<unknown>;
  disabled: boolean;
} | null>(null);
export function useAnnotationContext<TRef = JsonValue>() {
  const context = useContext(AnnotationContext);
  if (!context) throw new Error('Annotation components must be inside AnnotationRoot.');
  return { ...context, store: context.store as unknown as AnnotationStore<TRef> };
}
export function useAnnotations<TRef = JsonValue>(): AnnotationController<TRef> {
  const { store } = useAnnotationContext<TRef>();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
