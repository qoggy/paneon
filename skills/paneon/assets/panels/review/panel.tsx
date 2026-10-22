import { useMemo, useState, useRef } from 'react';
import { agent, definePanel, serverAction, usePanelInput, z } from 'paneon/sdk';
import type { Feedback } from 'paneon/sdk';
import {
  Button,
  FeedbackSurface,
  FeedbackToolbar,
  FeedbackProvider,
  FeedbackTarget,
  Page,
} from 'paneon/ui';
import { MarkdownFeedback, locateMarkdownFeedback } from '../../shared/markdown-feedback';
import { validSourceRange } from '../../shared/markdown-feedback-schema';
import { useSubmission } from '../../shared/submission';
import {
  completeReviewSchema,
  reviewParamsSchema,
  reviewSubmittedSchema,
  reviewRefSchema,
} from './schema';
import type { ReviewParams, ReviewRef } from './schema';
import { useFeedback } from 'paneon/ui';

export const validateReview = serverAction({
  input: z.object({ snapshot: reviewParamsSchema, feedback: reviewSubmittedSchema }).strict(),
  handler: (_ctx, input) => completeReviewSchema(input.snapshot).parse(input.feedback),
});
function DocumentSelection({ disabled }: { disabled: boolean }) {
  const feedback = useFeedback<ReviewRef>();
  return feedback.mode === 'select' ? (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || feedback.submitting}
      onClick={() => feedback.toggleTarget({ ref: { kind: 'document' } })}
    >
      选择整篇文档
    </Button>
  ) : null;
}
function ReviewPanel() {
  const params = usePanelInput<ReviewParams>();
  const [locked, setLocked] = useState(false);
  const documentRoot = useRef<HTMLDivElement>(null);
  const submission = useSubmission<Feedback<ReviewRef>>(async (feedback) => {
    const validated = await validateReview({ snapshot: params, feedback });
    const receipt = await agent.emit('review-submitted', validated);
    setLocked(true);
    return receipt;
  });
  const adapter = useMemo(
    () => ({
      resolve(target: Parameters<typeof validSourceRange>[1]) {
        if (!reviewRefSchema.safeParse(target.ref).success)
          return { status: 'missing' as const, message: 'Unknown document reference.' };
        if (!validSourceRange(params.markdown, target))
          return {
            status: 'stale' as const,
            message: 'Markdown range no longer matches its snapshot.',
          };
        return { status: 'ready' as const, text: params.markdown };
      },
      locate(target: Parameters<typeof validSourceRange>[1]) {
        if (documentRoot.current) locateMarkdownFeedback(documentRoot.current, target.text);
      },
    }),
    [params],
  );
  return (
    <Page title={params.title}>
      <FeedbackProvider<ReviewRef>
        adapter={adapter}
        disabled={locked}
        onSubmit={async (feedback) => {
          if (!submission.hasReceipt && !feedback.annotations.length && !feedback.comment?.trim())
            throw new Error('请选择内容或填写意见后再提交。');
          await submission.submit(feedback);
        }}
      >
        <FeedbackSurface />
        <div className="flex flex-wrap items-center gap-2" aria-label="评论操作">
          <FeedbackToolbar />
          <DocumentSelection disabled={locked} />
          {locked && (
            <Button type="button" onClick={() => setLocked(false)}>
              修改反馈
            </Button>
          )}
        </div>
        <FeedbackTarget<ReviewRef> target={{ kind: 'document' }} asChild>
          <div ref={documentRoot}>
            <MarkdownFeedback
              source={params.markdown}
              target={{ kind: 'document' }}
              disabled={locked}
            />
          </div>
        </FeedbackTarget>
        {submission.message && (
          <p role={submission.failed ? 'alert' : 'status'}>{submission.message}</p>
        )}
      </FeedbackProvider>
    </Page>
  );
}
export default definePanel({
  id: 'review',
  requires: { paneon: '0.0.0' },
  input: reviewParamsSchema,
  events: { 'review-submitted': reviewSubmittedSchema },
  render: ReviewPanel,
});
