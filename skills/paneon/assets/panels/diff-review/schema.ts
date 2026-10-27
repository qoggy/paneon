import { annotationValueSchema, z } from '@qoggy/paneon/sdk';
import { validSourceRange } from '../../shared/markdown-annotation-schema.ts';

const path = z.string().min(1);
export const comparisonSchema = z
  .object({
    displayPath: path.optional(),
    oldPath: path.nullable(),
    newPath: path.nullable(),
  })
  .strict()
  .refine((file) => file.oldPath !== null || file.newPath !== null, 'One file side is required.');
export const diffReviewParamsSchema = z
  .object({
    title: z.string().optional(),
    files: z.array(comparisonSchema).min(1),
  })
  .strict();
export type DiffReviewParams = z.infer<typeof diffReviewParamsSchema>;
export const diffRefSchema = z
  .object({
    fileIndex: z.number().int().nonnegative(),
    snapshotId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    side: z.enum(['old', 'new']),
  })
  .strict();
export type DiffRef = z.infer<typeof diffRefSchema>;
export const snapshotSchema = z
  .object({
    id: diffRefSchema.shape.snapshotId,
    oldText: z.string(),
    newText: z.string(),
  })
  .strict();
export type Snapshot = z.infer<typeof snapshotSchema>;
export const diffSourceSchema = z
  .object({
    fileIndex: z.number().int().nonnegative(),
    snapshotId: diffRefSchema.shape.snapshotId,
    displayPath: path.optional(),
    oldPath: path.nullable(),
    newPath: path.nullable(),
  })
  .strict();
export const diffReviewSubmittedSchema = annotationValueSchema(diffRefSchema).safeExtend({
  sources: z.array(diffSourceSchema),
  replacesEventId: z.number().int().positive().optional(),
});
export type DiffReviewSubmitted = z.infer<typeof diffReviewSubmittedSchema>;

/** Validate preserved text, never reread the current files to reinterpret an old annotation. */
export function validateRanges(
  params: DiffReviewParams,
  feedback: DiffReviewSubmitted,
  snapshots: Record<string, Snapshot>,
) {
  const seen = new Set<string>();
  for (const source of feedback.sources) {
    const key = `${source.fileIndex}:${source.snapshotId}`;
    const file = params.files[source.fileIndex];
    const snapshot = snapshots[key];
    if (
      seen.has(key) ||
      !file ||
      !snapshot ||
      snapshot.id !== source.snapshotId ||
      source.oldPath !== file.oldPath ||
      source.newPath !== file.newPath ||
      source.displayPath !== file.displayPath
    )
      throw new Error('Unknown or inconsistent comparison source.');
    seen.add(key);
  }
  for (const annotation of feedback.annotations) {
    for (const target of annotation.targets) {
      if (target.sourceRef !== undefined) continue;
      const { fileIndex, snapshotId, side } = target.ref;
      const key = `${fileIndex}:${snapshotId}`;
      const snapshot = snapshots[key];
      const file = params.files[fileIndex];
      if (!seen.has(key) || !snapshot || !file || file[`${side}Path`] === null)
        throw new Error('Missing original comparison snapshot. Draft retained.');
      if (!target.text || !validSourceRange(snapshot[`${side}Text`], target))
        throw new Error('Text range does not match its original comparison snapshot.');
    }
  }
  if (feedback.replacesEventId === undefined && !feedback.annotations.length)
    throw new Error('Save at least one annotation before submitting.');
  return feedback;
}
