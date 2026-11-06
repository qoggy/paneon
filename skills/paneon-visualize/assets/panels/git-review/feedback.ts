import type { AnnotationValue, ElementAnnotationRef } from '@qoggy/paneon/sdk';
import { splitElementAnnotations } from '../../shared/element-annotations.ts';
import { diffLineText, normalizeDiffTarget } from '../../shared/diff-schema.ts';
import type { GitSnapshot } from './git.ts';
import {
  gitConfigurationSchema,
  gitFeedbackResultSchema,
  gitReviewSubmittedSchema,
} from './schema.ts';
import type {
  GitRef,
  GitConfiguration,
  GitFeedbackResult,
  GitSnapshotSource,
  GitReviewSubmitted,
} from './schema.ts';

type Evidence = GitSnapshotSource['evidence'][number];
/** Build only the source fragments required by this explicit submission. Browser memory owns them. */
export function buildGitFeedback(
  feedback: AnnotationValue<GitRef | ElementAnnotationRef> & { replacesEventId?: number },
  snapshots: ReadonlyMap<string, GitSnapshot>,
): GitFeedbackResult {
  const sources: Record<string, GitSnapshotSource> = {};
  const { source: sourceAnnotations, elements } = splitElementAnnotations<GitRef>(feedback);
  const annotations = sourceAnnotations.map((annotation) => {
    const targets = annotation.targets.map((target) => {
      const snapshot = snapshots.get(target.ref.sourceId);
      if (!snapshot) throw new Error('Original snapshot is missing. Draft retained.');
      const normalized = normalizeDiffTarget(snapshot.model, target);
      const ref = normalized.ref;
      const source = (sources[snapshot.id] ??= { ...snapshot.source, evidence: [] });
      let evidence: Evidence | undefined;
      if (ref.kind === 'lines') {
        evidence = {
          kind: 'lines',
          side: ref.side,
          startLine: ref.startLine,
          endLine: ref.endLine,
          text: diffLineText(snapshot.model, ref),
        };
      }
      if (
        evidence &&
        !source.evidence.some((item) => JSON.stringify(item) === JSON.stringify(evidence))
      )
        source.evidence.push(evidence);
      return normalized;
    });
    return {
      ...annotation,
      targets: [...new Map(targets.map((target) => [JSON.stringify(target), target])).values()],
    };
  });
  return gitFeedbackResultSchema.parse({
    ...feedback,
    annotations: [...annotations, ...elements],
    sources,
  });
}
/** Pure validation: current event + fixed panel configuration, no Git/filesystem/cache lookup. */
export function validateGitFeedback(
  paramsValue: GitConfiguration,
  value: unknown,
): GitFeedbackResult {
  const params = gitConfigurationSchema.parse(paramsValue);
  const result = gitFeedbackResultSchema.parse(value);
  for (const source of Object.values(result.sources)) {
    if (!params.repositories.some((repository) => repository.id === source.repositoryId))
      throw new Error('Unknown source repository.');
  }
  for (const annotation of splitElementAnnotations<GitRef>(result).source)
    for (const target of annotation.targets) {
      const source = result.sources[target.ref.sourceId];
      if (!source) throw new Error('Missing original source. Draft retained.');
    }
  if (JSON.stringify(publicGitFeedback(result)).length > 65536)
    throw new Error(
      'Annotations exceed the 65536-character event limit. Draft retained; reduce selected content or annotations.',
    );
  return result;
}

/** Publish source metadata, saved quotes and comments without validating source locations. */
export function publicGitFeedback(feedback: GitFeedbackResult): GitReviewSubmitted {
  type File = GitReviewSubmitted['files'][number];
  type Target = File['annotations'][number]['targets'][number];
  const files = new Map<string, File>();
  const sourceFor = (id: string) => {
    const { repositoryId: _repositoryId, evidence: _evidence, ...source } = feedback.sources[id];
    return source;
  };
  const { source: annotations, published } = splitElementAnnotations<GitRef>(feedback);
  for (const annotation of annotations) {
    const first = annotation.targets[0];
    const key = first.ref.sourceId;
    let file = files.get(key);
    if (!file) {
      file = { ...sourceFor(key), annotations: [] };
      files.set(key, file);
    }
    const targets = annotation.targets.map((target): Target => {
      const { sourceId, ...ref } = target.ref;
      let published: Target;
      if (ref.kind === 'file') published = { kind: 'file' };
      else if (ref.kind === 'hunk') published = { kind: 'hunk', patch: ref.patch };
      else {
        const evidence = feedback.sources[sourceId].evidence.find(
          (item): item is Extract<Evidence, { kind: 'lines' }> =>
            item.kind === 'lines' &&
            item.side === ref.side &&
            item.startLine === ref.startLine &&
            item.endLine === ref.endLine,
        )!;
        const { start, end, quote } = target.text!;
        published = {
          ...ref,
          text: evidence.text,
          selection: {
            start,
            end,
            ...(quote === evidence.text || quote === evidence.text.replace(/\r?\n$/, '')
              ? {}
              : { quote }),
          },
        };
      }
      return sourceId === first.ref.sourceId
        ? published
        : { ...published, source: sourceFor(sourceId) };
    });
    file.annotations.push({ targets, comment: annotation.comment });
  }
  return gitReviewSubmittedSchema.parse({
    files: [...files.values()],
    ...(published.length ? { annotations: published } : {}),
    ...(feedback.replacesEventId === undefined
      ? {}
      : { replacesEventId: feedback.replacesEventId }),
  });
}
