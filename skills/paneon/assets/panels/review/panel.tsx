import { Markdown, usePageAnnotations } from '@qoggy/paneon/ui';
import { useMemo, useState, useRef } from 'react';
import { agent, definePanel, serverAction, usePanelInput, z } from '@qoggy/paneon/sdk';
import type { AnnotationValue } from '@qoggy/paneon/sdk';
import { Page } from '@qoggy/paneon/ui';
import { locateMarkdownAnnotation } from '../../shared/markdown-annotation';
import { validSourceRange } from '../../shared/markdown-annotation-schema';
import { useSubmission } from '../../shared/submission';
import {
  completeReviewSchema,
  reviewParamsSchema,
  reviewSubmittedSchema,
  reviewRefSchema,
} from './schema';
import type { ReviewParams, ReviewRef } from './schema';

export const validateReview = serverAction({
  input: z.object({ snapshot: reviewParamsSchema, feedback: reviewSubmittedSchema }).strict(),
  handler: (_ctx, input) => completeReviewSchema(input.snapshot).parse(input.feedback),
});
function ReviewPanel() {
  const params = usePanelInput<ReviewParams>();
  const markdown = params.markdown;
  const [locked, setLocked] = useState(false);
  const documentRoot = useRef<HTMLDivElement>(null);
  const submission = useSubmission<AnnotationValue<ReviewRef>>(
    async (feedback) => {
      const validated = await validateReview({ snapshot: params, feedback });
      const receipt = await agent.emit('review-submitted', validated);
      setLocked(true);
      return receipt;
    },
    { successToast: 'Annotations submitted.' },
  );
  const adapter = useMemo(
    () => ({
      resolve(target: Parameters<typeof validSourceRange>[1]) {
        if (!reviewRefSchema.safeParse(target.ref).success)
          return { status: 'missing' as const, message: 'Unknown document reference.' };
        if (!validSourceRange(markdown, target))
          return {
            status: 'stale' as const,
            message: 'Markdown range no longer matches its snapshot.',
          };
        return { status: 'ready' as const, text: markdown };
      },
      locate(target: Parameters<typeof validSourceRange>[1]) {
        if (documentRoot.current) locateMarkdownAnnotation(documentRoot.current, target.text);
      },
    }),
    [markdown],
  );
  usePageAnnotations<ReviewRef>({
    adapter: adapter,
    disabled: locked,
    onSubmit: async (feedback) => {
      if (!submission.hasReceipt && !feedback.annotations.length) {
        submission.reject('Save at least one annotation before submitting.');
        return;
      }
      await submission.submit(feedback);
    },
    onRequestEdit: locked ? () => setLocked(false) : undefined,
    allowEmptySubmit: submission.hasReceipt,
  });
  return (
    <Page title={params.title}>
      <div ref={documentRoot}>
        <Markdown annotationTarget={{ kind: 'document' }}>{markdown}</Markdown>
      </div>

      {submission.message && (
        <p role={submission.failed ? 'alert' : 'status'}>{submission.message}</p>
      )}
    </Page>
  );
}
export default definePanel({
  id: 'review',
  requires: { paneon: '>=0.0.1 <0.1.0' },
  input: reviewParamsSchema,
  events: { 'review-submitted': reviewSubmittedSchema },
  render: ReviewPanel,
});
