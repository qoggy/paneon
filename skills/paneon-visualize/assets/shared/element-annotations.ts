import { elementAnnotationRefSchema, isElementAnnotationRef, z } from '@qoggy/paneon/sdk';
import type {
  Annotation,
  AnnotationTarget,
  AnnotationValue,
  ElementAnnotationRef,
} from '@qoggy/paneon/sdk';

/** Page-element opinions have no file/source identity; retain their agreed target shape. */
export const publishedElementAnnotationsSchema = z.array(
  z.object({
    targets: z.array(z.object({ ref: elementAnnotationRefSchema })),
    comment: z.string(),
  }),
);

export function splitElementAnnotations<TRef>(value: AnnotationValue<TRef | ElementAnnotationRef>) {
  const source: Annotation<TRef>[] = [];
  const elements: Annotation<ElementAnnotationRef>[] = [];
  for (const entry of value.annotations) {
    const elementTargets = entry.targets.filter(
      (target): target is AnnotationTarget<ElementAnnotationRef> =>
        isElementAnnotationRef(target.ref),
    );
    const sourceTargets = entry.targets.filter(
      (target): target is AnnotationTarget<TRef> => !isElementAnnotationRef(target.ref),
    );
    if (elementTargets.length) elements.push({ ...entry, targets: elementTargets });
    if (sourceTargets.length) source.push({ ...entry, targets: sourceTargets });
  }
  return {
    source,
    elements,
    published: elements.map(({ targets, comment }) => ({ targets, comment })),
  };
}
