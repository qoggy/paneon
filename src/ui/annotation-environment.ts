import { createContext } from 'react';
import type { ReactElement } from 'react';
import type { AnnotationStore } from './annotation-store';

/** Lightweight page scope; annotation code is supplied only by annotation consumers. */
export type AnnotationEnvironment = {
  getStore: (create: () => AnnotationStore<unknown>) => AnnotationStore<unknown>;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ReactElement | null;
  setControls: (controls: ReactElement | null) => void;
};
export const AnnotationEnvironmentContext = createContext<AnnotationEnvironment | null>(null);
export const AnnotationEnabledContext = createContext(false);
