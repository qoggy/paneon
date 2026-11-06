import type { PRFeedbackSubmitted, PRPublishedTarget, PRResolvedFeedback } from './schema.ts';
import type { PRRef, PRSource } from './schema.ts';
import { prFeedbackSubmittedSchema, prResolvedFeedbackSchema } from './schema.ts';
import type { AnnotationTarget, AnnotationValue, ElementAnnotationRef } from '@qoggy/paneon/sdk';
import { isElementAnnotationRef } from '@qoggy/paneon/sdk';
import { splitElementAnnotations } from '../../shared/element-annotations.ts';
import { normalizeDiffTarget } from '../../shared/diff-schema.ts';
import type { PRSnapshot } from './github.ts';

/** Build feedback from browser-owned metadata; location and source integrity are not prerequisites. */
export function buildPRFeedback(
  repository: string,
  feedback: AnnotationValue<PRRef | ElementAnnotationRef>,
  snapshots: ReadonlyMap<string, PRSnapshot>,
): PRFeedbackSubmitted {
  if (!feedback.annotations.length)
    throw new Error('Save at least one annotation before submitting.');
  const sources: Record<string, PRSource> = {};
  const annotations = feedback.annotations.map((entry) => {
    const targets = entry.targets.map((target) => {
      if (target.sourceRef !== undefined || isElementAnnotationRef(target.ref)) return target;
      const snapshot = snapshots.get(target.ref.sourceId);
      if (!snapshot) throw new Error('Original PR snapshot is missing. Draft retained.');
      sources[snapshot.id] = snapshot.source;
      if (
        snapshot.source.kind === 'diff' &&
        snapshot.model &&
        (target.ref.kind === 'file' || target.ref.kind === 'hunk' || target.ref.kind === 'lines')
      )
        return normalizeDiffTarget(snapshot.model, { ...target, ref: target.ref });
      return target;
    });
    return {
      ...entry,
      targets: [...new Map(targets.map((target) => [JSON.stringify(target), target])).values()],
    };
  });
  const resolved = prResolvedFeedbackSchema.parse({
    repository,
    ...feedback,
    annotations,
    sources,
  });
  const result = prFeedbackSubmittedSchema.parse(publicPRFeedback(resolved));
  if (JSON.stringify(result).length > 65536)
    throw new Error('Annotations exceed the 65536-character event limit. Draft retained.');
  return result;
}

/** Publish opinions beside their source while retaining a single multi-source opinion. */
export function publicPRFeedback(feedback: PRResolvedFeedback): PRFeedbackSubmitted {
  type Source = PRFeedbackSubmitted['sources'][number];
  const sources = new Map<string, Source>();
  const sourceFor = (target: AnnotationTarget<PRRef>) => {
    if (target.sourceRef !== undefined) {
      const source = target.sourceRef as { path: string; snapshotId: string };
      return { key: JSON.stringify([source.path, source.snapshotId]), source };
    }
    return { key: target.ref.sourceId, source: feedback.sources[target.ref.sourceId] };
  };
  const { source: annotations, published } = splitElementAnnotations<PRRef>(feedback);
  for (const annotation of annotations) {
    const parent = sourceFor(annotation.targets[0]);
    let source = sources.get(parent.key);
    if (!source) {
      source = { ...parent.source, annotations: [] };
      sources.set(parent.key, source);
    }
    source.annotations.push({
      targets: annotation.targets.map((target): PRPublishedTarget => {
        const { sourceId, ...ref } = target.ref;
        const origin =
          target.sourceRef === undefined
            ? { key: sourceId, source: feedback.sources[sourceId] }
            : sourceFor(target);
        const location =
          target.sourceRef === undefined &&
          (ref.kind === 'file' || ref.kind === 'hunk' || ref.kind === 'lines')
            ? ref
            : {};
        return {
          ...location,
          ...(target.type === undefined ? {} : { type: target.type }),
          ...(target.text === undefined ? {} : { text: target.text }),
          ...(origin.key === parent.key ? {} : { source: origin.source }),
        };
      }),
      comment: annotation.comment,
    });
  }
  return {
    repository: feedback.repository,
    sources: [...sources.values()],
    ...(published.length ? { annotations: published } : {}),
  };
}
