import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactElement, ReactNode } from 'react';
import {
  AnnotationEnabledContext,
  AnnotationEnvironmentContext,
  AnnotationFloatingContext,
} from './annotation-environment';
import type {
  AnnotationEnvironment,
  AnnotationFloatingElements,
  ToastExitPositioner,
} from './annotation-environment';

/** Internal: UIProvider owns the page scope without loading unused annotation code. */
export function AnnotationRoot({ children }: { children: ReactNode }) {
  const toastExit = useRef<ToastExitPositioner | null>(null);
  const [elements, setElements] = useState<AnnotationFloatingElements>({
    launcher: null,
    directory: null,
    viewport: null,
    toastGeometry: '',
  });
  const floating = useMemo(() => ({ elements, setElements }), [elements]);
  const [environment] = useState<AnnotationEnvironment>(() => {
    const listeners = new Set<() => void>();
    let controls: ReactElement | null = null;
    let store: ReturnType<AnnotationEnvironment['getStore']> | undefined;
    return {
      toastExit,
      openFile: (reference, trigger, ref, reader) =>
        store?.openFile(reference, ref, trigger, reader),
      getStore: (create) => (store ??= create()),
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getSnapshot: () => controls,
      setControls(next) {
        if (controls === next) return;
        controls = next;
        listeners.forEach((listener) => listener());
      },
    };
  });
  const controls = useSyncExternalStore(
    environment.subscribe,
    environment.getSnapshot,
    environment.getSnapshot,
  );
  return (
    <AnnotationEnvironmentContext.Provider value={environment}>
      <AnnotationEnabledContext.Provider value={!!controls}>
        <AnnotationFloatingContext.Provider value={floating}>
          {children}
          {controls}
        </AnnotationFloatingContext.Provider>
      </AnnotationEnabledContext.Provider>
    </AnnotationEnvironmentContext.Provider>
  );
}
