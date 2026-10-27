import { useContext, useSyncExternalStore } from 'react';
import { AnnotationEnvironmentContext } from './annotation-environment';
import { AnnotationStore } from './annotation-store';
import type { AnnotationController } from './annotation-types';
import type { JsonValue } from '../sdk/annotation.js';

export function useAnnotationContext<TRef = JsonValue>() {
  const environment = useContext(AnnotationEnvironmentContext);
  if (!environment) throw new Error('Annotation components need the Paneon page environment.');
  const store = environment.getStore(
    () => new AnnotationStore<unknown>(),
  ) as unknown as AnnotationStore<TRef>;
  return { store, environment, disabled: store.disabled };
}
export function useAnnotations<TRef = JsonValue>(): AnnotationController<TRef> {
  const { store } = useAnnotationContext<TRef>();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
