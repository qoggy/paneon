import { annotationValueSchema, z } from '@qoggy/paneon/sdk';
import { validSourceRange } from '../../shared/markdown-annotation-schema.ts';
export const reviewParamsSchema = z
  .object({
    title: z.string().refine((value) => !!value.trim(), 'Title must not be blank.'),
    markdownFilePath: z
      .string()
      .refine((value) => !!value.trim(), 'Markdown file path must not be blank.'),
  })
  .strict();
export type ReviewParams = z.infer<typeof reviewParamsSchema>;
export const reviewRefSchema = z.object({ kind: z.literal('document') }).strict();
export type ReviewRef = z.infer<typeof reviewRefSchema>;
export const reviewSubmittedSchema = annotationValueSchema(reviewRefSchema).safeExtend({
  replacesEventId: z.number().int().positive().optional(),
});
export function completeReviewSchema(markdown: string) {
  return reviewSubmittedSchema.superRefine((value, ctx) => {
    value.annotations.forEach((entry, index) =>
      entry.targets.forEach((target, at) => {
        if (target.sourceRef !== undefined) return;
        if (!validSourceRange(markdown, target))
          ctx.addIssue({
            code: 'custom',
            path: ['annotations', index, 'targets', at],
            message: 'Text range does not match the original Markdown.',
          });
      }),
    );
    if (value.replacesEventId === undefined && !value.annotations.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Save at least one annotation before submitting.',
      });
  });
}
