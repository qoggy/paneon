import { useLayoutEffect, useMemo, useRef } from 'react';
import { annotationKey } from '../sdk/annotation.js';
import type { JsonValue } from '../sdk/annotation.js';
import { useAnnotationContext } from './annotation-context';
import type { AnnotationTextProps } from './annotation-types';

export function AnnotationText<TRef = JsonValue>({
  target,
  children,
  className,
}: AnnotationTextProps<TRef>) {
  const { store } = useAnnotationContext<TRef>();
  const element = useRef<HTMLSpanElement>(null);
  const key = annotationKey(target);
  const reference = useMemo(() => JSON.parse(key) as TRef, [key]);
  useLayoutEffect(() => {
    const node = element.current?.firstChild;
    if (node?.nodeType === Node.TEXT_NODE)
      return store.registerText({
        ref: reference,
        source: children,
        segments: [
          {
            node: node as Text,
            sourceOffsets: Array.from({ length: children.length + 1 }, (_, index) => index),
          },
        ],
      });
  }, [store, reference, children]);
  return (
    <span ref={element} className={className} data-annotation-text="">
      {children}
    </span>
  );
}
