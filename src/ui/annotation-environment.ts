import { createContext } from 'react';
import type { FileReferenceRequest } from '../shared/file-references';
import type { Dispatch, ReactElement, RefObject, SetStateAction } from 'react';
import type { AnnotationStore } from './annotation-store';
import type { ReadFileReference } from './file-reference-context';

/** Lightweight page scope; annotation code is supplied only by annotation consumers. */
export type ToastExitPositioner = (element: HTMLDivElement) => void | (() => void);
export type AnnotationEnvironment = {
  toastExit: RefObject<ToastExitPositioner | null>;
  openFile: (
    reference: FileReferenceRequest,
    trigger: HTMLElement,
    ref: unknown,
    reader?: ReadFileReference,
  ) => void;
  getStore: (create: () => AnnotationStore<unknown>) => AnnotationStore<unknown>;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ReactElement | null;
  setControls: (controls: ReactElement | null) => void;
};
export const AnnotationEnvironmentContext = createContext<AnnotationEnvironment | null>(null);
export const AnnotationEnabledContext = createContext(false);

export type AnnotationFloatingElements = {
  launcher: HTMLElement | null;
  directory: HTMLElement | null;
  viewport: HTMLDivElement | null;
  toastGeometry: string;
};
/** Shared geometry only; toast positioning does not load the annotation store. */
export const AnnotationFloatingContext = createContext<{
  elements: AnnotationFloatingElements;
  setElements: Dispatch<SetStateAction<AnnotationFloatingElements>>;
} | null>(null);
