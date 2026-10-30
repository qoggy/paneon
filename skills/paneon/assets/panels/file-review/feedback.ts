import { linkedKey, snapshotKey } from './schema.ts';
import type { Evidence, FileFeedback, FileReviewSubmitted } from './schema.ts';

/** Keep manifest identities in drafts; publish each opinion under its original file. */
export function publicFileFeedback(
  feedback: FileFeedback,
  evidence: Evidence,
): FileReviewSubmitted {
  const files = new Map<string, FileReviewSubmitted['files'][number]>();
  const snapshots = new Map(evidence.files.map((file) => [snapshotKey(file), file]));
  for (const annotation of feedback.annotations) {
    const first = annotation.targets[0];
    const source = first.sourceRef as { path: string; snapshotId: string } | undefined;
    const key =
      source === undefined ? `main:${snapshotKey(first.ref)}` : `linked:${linkedKey(source)}`;
    const metadata = source ?? snapshots.get(snapshotKey(first.ref))!;
    let file = files.get(key);
    if (!file) {
      file = { path: metadata.path, snapshotId: metadata.snapshotId, annotations: [] };
      files.set(key, file);
    }
    file.annotations.push({
      targets: annotation.targets.map((target) =>
        target.ref.part === 'path'
          ? { path: { quote: target.text!.quote! } }
          : { text: target.text! },
      ),
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
