import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import type { RefObject } from 'react';
import { annotationTargetKey } from '../sdk/annotation';
import type { AnnotationTarget } from '../sdk/annotation';
import { AnnotationEnabledContext, AnnotationEnvironmentContext } from './annotation-environment';
import { AnnotationStore } from './annotation-store';

/** Internal renderer bridge shared by an inline object and its viewer. */
export type MediaAnnotation = {
  target: AnnotationTarget<unknown>;
  source: string;
  summary: string;
};
export const MediaAnnotationContext = createContext<MediaAnnotation | undefined>(undefined);
/** Default Markdown links provide an external host so image controls stay outside the link. */
export const MediaToolbarHostContext = createContext<HTMLElement | null | undefined>(undefined);
const subscribeNothing = () => () => {};
const emptySnapshot = () => undefined;

export function useMediaAnnotation(
  element: RefObject<HTMLElement | null>,
  options: {
    annotationTarget?: unknown;
    type?: 'mermaid';
    source: string;
    summary: string;
    ready?: boolean;
    error?: string;
  },
) {
  const inherited = useContext(MediaAnnotationContext);
  const enabled = useContext(AnnotationEnabledContext);
  const environment = useContext(AnnotationEnvironmentContext);
  const trigger = useRef<HTMLElement | null>(null);
  const explicit: AnnotationTarget<unknown> | undefined =
    options.annotationTarget === undefined
      ? undefined
      : options.type === 'mermaid'
        ? { ref: options.annotationTarget, type: 'mermaid' }
        : { ref: options.annotationTarget, src: options.source };
  const candidate = explicit
    ? { target: explicit, source: options.source, summary: options.summary }
    : inherited;
  const key = candidate ? annotationTargetKey(candidate.target) : undefined;
  const { source, summary } = candidate ?? options;
  const descriptor = useMemo(
    () =>
      key === undefined
        ? undefined
        : {
            target: JSON.parse(key) as AnnotationTarget<unknown>,
            source,
            summary,
          },
    [key, source, summary],
  );
  const store =
    enabled && descriptor ? environment?.getStore(() => new AnnotationStore<unknown>()) : undefined;
  useSyncExternalStore(
    store?.subscribe ?? subscribeNothing,
    store?.getSnapshot ?? emptySnapshot,
    store?.getSnapshot ?? emptySnapshot,
  );
  useLayoutEffect(() => {
    if (store && descriptor)
      return store.registerObject({
        ...descriptor,
        element: options.ready === false ? undefined : (element.current ?? undefined),
        error: options.error,
        anchor: () =>
          trigger.current?.isConnected ? trigger.current.getBoundingClientRect() : undefined,
      });
  }, [store, descriptor, element, options.ready, options.error]);
  if (!store || !descriptor) return undefined;
  return {
    descriptor,
    store,
    disabled: store.disabled,
    begin(button: HTMLElement) {
      trigger.current = button;
      store.beginAnnotation([descriptor.target]);
    },
  };
}
export type MediaAnnotationHandle = ReturnType<typeof useMediaAnnotation>;
