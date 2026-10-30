import { annotationValueSchema, z } from '@qoggy/paneon/sdk';
import { validSourceRange } from '../../shared/markdown-annotation-schema.ts';

const nonblank = z.string().refine((value) => !!value.trim(), 'Must not be blank.');
export const fileReviewParamsSchema = z
  .object({ title: nonblank.optional(), files: z.array(nonblank).min(1) })
  .strict();
export type FileReviewParams = z.infer<typeof fileReviewParamsSchema>;
export const fileRefSchema = z
  .object({
    fileIndex: z.number().int().nonnegative(),
    snapshotId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    part: z.literal('path').optional(),
  })
  .strict();
export type FileRef = z.infer<typeof fileRefSchema>;
export const snapshotSchema = z
  .object({
    fileIndex: fileRefSchema.shape.fileIndex,
    snapshotId: fileRefSchema.shape.snapshotId,
    path: z.string(),
    text: z.string(),
  })
  .strict();
export type Snapshot = z.infer<typeof snapshotSchema>;
export const fileFeedbackSchema = annotationValueSchema(fileRefSchema).safeExtend({
  replacesEventId: z.number().int().positive().optional(),
});
export type FileFeedback = z.infer<typeof fileFeedbackSchema>;
export const linkedSourceSchema = z.object({ path: z.string(), snapshotId: z.string() }).strict();
export const evidenceSchema = z.object({ files: z.array(snapshotSchema) }).strict();
export type Evidence = z.infer<typeof evidenceSchema>;
const target = fileFeedbackSchema.shape.annotations.element.shape.targets.element;
export const fileReviewSubmittedSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      snapshotId: z.string(),
      annotations: z.array(
        z.object({
          targets: z.array(
            z.union([
              z.object({ text: target.shape.text.unwrap().safeExtend({ quote: z.string() }) }),
              z.object({
                type: z.literal('mermaid'),
                text: z.object({
                  start: target.shape.text.unwrap().shape.start,
                  end: target.shape.text.unwrap().shape.end,
                }),
              }),
              z.object({ path: z.object({ quote: z.string() }) }),
            ]),
          ),
          comment: z.string(),
        }),
      ),
    }),
  ),
  replacesEventId: fileFeedbackSchema.shape.replacesEventId,
});
export type FileReviewSubmitted = z.infer<typeof fileReviewSubmittedSchema>;
export const snapshotKey = (ref: FileRef) => `${ref.fileIndex}:${ref.snapshotId}`;
export const linkedKey = (source: { path: string; snapshotId: string }) =>
  JSON.stringify([source.path, source.snapshotId]);

/** All evidence is explicit: workers need neither previous query state nor current disk text. */
export function validateRanges(feedback: FileFeedback, evidence: Evidence, paths: string[]) {
  const files = new Map(evidence.files.map((file) => [snapshotKey(file), file]));
  if (files.size !== evidence.files.length) throw new Error('Duplicate snapshot evidence.');
  for (const annotation of feedback.annotations) {
    for (const target of annotation.targets) {
      const main = files.get(snapshotKey(target.ref));
      if (!main) throw new Error('Missing original file snapshot. Draft retained.');
      // The shared annotation session validates retained linked-file sources before onSubmit.
      if (target.sourceRef !== undefined) {
        linkedSourceSchema.parse(target.sourceRef);
        if (!target.text) throw new Error('A file annotation requires a text range.');
        continue;
      }
      const source = target.ref.part === 'path' ? paths[main.fileIndex] : main.text;
      if (!target.text || !validSourceRange(source, target))
        throw new Error('Text range does not match its original file snapshot.');
    }
  }
  if (feedback.replacesEventId === undefined && !feedback.annotations.length)
    throw new Error('Save at least one annotation before submitting.');
  return feedback;
}
