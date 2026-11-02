import { z } from '@qoggy/paneon/sdk';

const nonblank = z.string().refine((value) => value.trim().length > 0, 'Must not be blank.');
const optionSchema = z.strictObject({
  id: nonblank,
  label: nonblank,
  description: z.string().optional(),
  details: z.string().optional(),
  recommended: z.boolean().optional(),
});
export const chooseQuestionSchema = z
  .strictObject({
    id: nonblank,
    title: nonblank,
    description: z.string().optional(),
    mode: z.enum(['single', 'multiple']).optional(),
    options: z.array(optionSchema).min(1),
    selectedIds: z.array(nonblank).optional(),
  })
  .superRefine((question, ctx) => {
    const ids = question.options.map((option) => option.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Option IDs must be unique within the question.',
      });
    const selected = question.selectedIds ?? [];
    if (new Set(selected).size !== selected.length || selected.some((id) => !ids.includes(id)))
      ctx.addIssue({
        code: 'custom',
        path: ['selectedIds'],
        message: 'Initial selections must be unique IDs from this question.',
      });
    if (question.mode !== 'multiple' && selected.length > 1)
      ctx.addIssue({
        code: 'custom',
        path: ['selectedIds'],
        message: 'Select at most one initial option.',
      });
  });
export const chooseParamsSchema = z
  .strictObject({
    title: nonblank,
    description: z.string().optional(),
    questions: z.array(chooseQuestionSchema).min(1),
  })
  .superRefine((params, ctx) => {
    if (new Set(params.questions.map((question) => question.id)).size !== params.questions.length)
      ctx.addIssue({
        code: 'custom',
        path: ['questions'],
        message: 'Question IDs must be unique.',
      });
  });
export type ChooseParams = z.infer<typeof chooseParamsSchema>;
export type ChooseQuestion = ChooseParams['questions'][number];
export const choiceSelectionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('option'), optionId: nonblank, comment: z.string() }),
  z.strictObject({ kind: z.literal('custom'), text: nonblank }),
]);
export type ChoiceSelection = z.infer<typeof choiceSelectionSchema>;
export const choiceAnswerSchema = z.strictObject({
  questionId: nonblank,
  selections: z.array(choiceSelectionSchema).min(1),
});
export type ChoiceAnswer = z.infer<typeof choiceAnswerSchema>;
export const answersSubmittedSchema = z.strictObject({
  answers: z.array(choiceAnswerSchema).min(1),
  replacesEventId: z.number().int().positive().optional(),
});
export type AnswersSubmitted = z.infer<typeof answersSubmittedSchema>;

export function answerSchema(question: ChooseQuestion) {
  return choiceAnswerSchema
    .superRefine((answer, ctx) => {
      if (answer.questionId !== question.id)
        ctx.addIssue({ code: 'custom', message: 'Answer must reference this question.' });
      const optionIds = answer.selections.flatMap((selection) =>
        selection.kind === 'option' ? [selection.optionId] : [],
      );
      if (
        new Set(optionIds).size !== optionIds.length ||
        optionIds.some((id) => !question.options.some((option) => option.id === id))
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Select unique options belonging to this question.',
        });
      if (answer.selections.filter((selection) => selection.kind === 'custom').length > 1)
        ctx.addIssue({ code: 'custom', message: 'Include at most one custom answer.' });
      if (question.mode !== 'multiple' && answer.selections.length !== 1)
        ctx.addIssue({ code: 'custom', message: 'Select exactly one answer.' });
    })
    .transform((answer): ChoiceAnswer => ({
      questionId: answer.questionId,
      selections: [
        ...question.options.flatMap((option) =>
          answer.selections.filter(
            (selection) => selection.kind === 'option' && selection.optionId === option.id,
          ),
        ),
        ...answer.selections.filter((selection) => selection.kind === 'custom'),
      ],
    }));
}
export function completeAnswersSchema(params: ChooseParams) {
  return answersSubmittedSchema
    .superRefine((result, ctx) => {
      if (
        result.answers.length !== params.questions.length ||
        new Set(result.answers.map((answer) => answer.questionId)).size !== result.answers.length
      )
        ctx.addIssue({
          code: 'custom',
          path: ['answers'],
          message: 'Submit exactly one answer for every question.',
        });
      for (const [index, answer] of result.answers.entries()) {
        const question = params.questions.find((candidate) => candidate.id === answer.questionId);
        if (!question)
          ctx.addIssue({ code: 'custom', path: ['answers', index], message: 'Unknown question.' });
        else
          for (const issue of answerSchema(question).safeParse(answer).error?.issues ?? [])
            ctx.addIssue({
              code: 'custom',
              path: ['answers', index, ...issue.path],
              message: issue.message,
            });
      }
    })
    .transform((result): AnswersSubmitted => ({
      answers: params.questions.map((question) =>
        answerSchema(question).parse(
          result.answers.find((answer) => answer.questionId === question.id),
        ),
      ),
      ...(result.replacesEventId === undefined ? {} : { replacesEventId: result.replacesEventId }),
    }));
}
