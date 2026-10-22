import { feedbackSchema, z } from 'paneon/sdk';
import { validSourceRange } from '../../shared/markdown-feedback-schema.ts';
export const reviewParamsSchema = z
  .object({
    title: z.string().refine((value) => !!value.trim(), 'Title must not be blank.'),
    markdown: z.string(),
  })
  .strict();
export type ReviewParams = z.infer<typeof reviewParamsSchema>;
export const reviewRefSchema = z.object({ kind: z.literal('document') }).strict();
export type ReviewRef = z.infer<typeof reviewRefSchema>;
export const reviewSubmittedSchema = feedbackSchema(reviewRefSchema).safeExtend({
  replacesEventId: z.number().int().positive().optional(),
});
export function completeReviewSchema(params: ReviewParams) {
  return reviewSubmittedSchema.superRefine((value, ctx) => {
    value.annotations.forEach((entry, index) =>
      entry.targets.forEach((target, at) => {
        if (!validSourceRange(params.markdown, target))
          ctx.addIssue({
            code: 'custom',
            path: ['annotations', index, 'targets', at],
            message: 'Text range does not match the original Markdown.',
          });
      }),
    );
    if (value.replacesEventId === undefined && !value.annotations.length && !value.comment?.trim())
      ctx.addIssue({
        code: 'custom',
        message: 'Select content or write feedback before submitting.',
      });
  });
}
