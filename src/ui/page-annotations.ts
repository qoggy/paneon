import { createElement, useLayoutEffect } from 'react';
import { useAnnotationContext } from './annotation-context';
import { AnnotationControls } from './annotation-controls';
import type { PageAnnotationOptions } from './annotation-types';
import type { JsonValue } from '../sdk/annotation.js';

const controls = /*#__PURE__*/ createElement(AnnotationControls);

/** Enable and configure the page's built-in annotation session. */
export function usePageAnnotations<TRef = JsonValue>(options: PageAnnotationOptions<TRef>) {
  const { store, environment } = useAnnotationContext<TRef>();
  useLayoutEffect(() => {
    store.setOptions(options);
    environment.setControls(controls);
  });
  useLayoutEffect(
    () => () => {
      store.setOptions(undefined);
      environment.setControls(null);
    },
    [store, environment],
  );
}
