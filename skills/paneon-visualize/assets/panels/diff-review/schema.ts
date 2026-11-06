import { annotationValueSchema, isElementAnnotationRef, z } from '@qoggy/paneon/sdk';
import { publishedElementAnnotationsSchema } from '../../shared/element-annotations.ts';

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
const annotationsSchema = annotationValueSchema(diffRefSchema);
export const diffFeedbackResultSchema = annotationsSchema.safeExtend({
  sources: z.array(diffSourceSchema),
  replacesEventId: z.number().int().positive().optional(),
});
export type DiffFeedbackResult = z.infer<typeof diffFeedbackResultSchema>;

const publishedSource = diffSourceSchema.omit({ fileIndex: true });
const targetShape = annotationsSchema.shape.annotations.element.shape.targets.element.shape;
export const diffReviewSubmittedSchema = z.object({
  annotations: publishedElementAnnotationsSchema.optional(),
  files: z.array(
    publishedSource.extend({
      annotations: z.array(
        z.object({
          targets: z.array(
            z.object({
              side: diffRefSchema.shape.side,
              text: targetShape.text,
              sourceRef: targetShape.sourceRef,
            }),
          ),
          comment: z.string(),
        }),
      ),
    }),
  ),
  replacesEventId: z.number().int().positive().optional(),
});
export type DiffReviewSubmitted = z.infer<typeof diffReviewSubmittedSchema>;

/** Source checks need only the path manifest and feedback, never complete file contents. */
export function validateSources(params: DiffReviewParams, feedback: DiffFeedbackResult) {
  const seen = new Set<string>();
  for (const source of feedback.sources) {
    const key = `${source.fileIndex}:${source.snapshotId}`;
    const file = params.files[source.fileIndex];
    if (
      seen.has(key) ||
      !file ||
      source.oldPath !== file.oldPath ||
      source.newPath !== file.newPath ||
      source.displayPath !== file.displayPath
    )
      throw new Error('Unknown or inconsistent comparison source.');
    seen.add(key);
  }
  for (const annotation of feedback.annotations) {
    for (const target of annotation.targets) {
      if (target.sourceRef !== undefined || isElementAnnotationRef(target.ref)) continue;
      const { fileIndex, snapshotId } = target.ref;
      const key = `${fileIndex}:${snapshotId}`;
      const file = params.files[fileIndex];
      if (!seen.has(key) || !file)
        throw new Error('Missing original comparison snapshot. Draft retained.');
    }
  }
  if (feedback.replacesEventId === undefined && !feedback.annotations.length)
    throw new Error('Save at least one annotation before submitting.');
  return feedback;
}
