import type {
  DiffFeedbackResult,
  DiffRef,
  DiffReviewParams,
  DiffReviewSubmitted,
} from './schema.ts';

/** Publish validated feedback next to its file, keeping draft identities internal. */
export function publicDiffFeedback(
  params: DiffReviewParams,
  feedback: DiffFeedbackResult,
): DiffReviewSubmitted {
  type File = DiffReviewSubmitted['files'][number];
  const files = new Map<string, File>();
  const key = (ref: DiffRef) => `${ref.fileIndex}:${ref.snapshotId}`;
  const source = (ref: DiffRef) => ({ ...params.files[ref.fileIndex], snapshotId: ref.snapshotId });
  for (const annotation of feedback.annotations) {
    const first = annotation.targets[0].ref;
    const fileKey = key(first);
    let file = files.get(fileKey);
    if (!file) {
      file = { ...source(first), annotations: [] };
      files.set(fileKey, file);
    }
    file.annotations.push({
      targets: annotation.targets.map(({ ref, ...target }) => ({
        side: ref.side,
        ...target,
      })),
      comment: annotation.comment,
    });
  }
  return {
    files: [...files.values()],
    ...(feedback.replacesEventId === undefined
      ? {}
      : { replacesEventId: feedback.replacesEventId }),
  };
}
