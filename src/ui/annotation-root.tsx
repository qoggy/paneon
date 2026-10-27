import { useState, useSyncExternalStore } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { AnnotationEnabledContext, AnnotationEnvironmentContext } from './annotation-environment';
import type { AnnotationEnvironment } from './annotation-environment';

/** Internal: UIProvider owns the page scope without loading unused annotation code. */
export function AnnotationRoot({ children }: { children: ReactNode }) {
  const [environment] = useState<AnnotationEnvironment>(() => {
    const listeners = new Set<() => void>();
    let controls: ReactElement | null = null;
    let store: ReturnType<AnnotationEnvironment['getStore']> | undefined;
    return {
      openFile: (reference, trigger, ref) => store?.openFile(reference, ref, trigger),
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
        {children}
        {controls}
      </AnnotationEnabledContext.Provider>
    </AnnotationEnvironmentContext.Provider>
  );
}
