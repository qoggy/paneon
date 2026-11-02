import type { PRFeedbackSubmitted, PRPublishedTarget, PRResolvedFeedback } from './schema.ts';

/** Publish opinions beside their source while retaining a single multi-source opinion. */
export function publicPRFeedback(feedback: PRResolvedFeedback): PRFeedbackSubmitted {
  type Source = PRFeedbackSubmitted['sources'][number];
  const sources = new Map<string, Source>();
  const sourceFor = (target: PRResolvedFeedback['annotations'][number]['targets'][number]) => {
    if (target.sourceRef !== undefined) {
      const source = target.sourceRef as { path: string; snapshotId: string };
      return { key: JSON.stringify([source.path, source.snapshotId]), source };
    }
    return { key: target.ref.sourceId, source: feedback.sources[target.ref.sourceId] };
  };
  for (const annotation of feedback.annotations) {
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
  return { repository: feedback.repository, sources: [...sources.values()] };
}
