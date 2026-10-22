import { useLayoutEffect, useMemo, useRef } from 'react';
import { Button, Markdown, useFeedback, type MarkdownProps } from 'paneon/ui';
import type { FeedbackTextRange } from 'paneon/sdk';
import { sourceMappingPlugin } from './markdown-feedback-mapper';

/** Reusable complete-source Markdown adapter. TRef is supplied by the owning page. */
export function MarkdownFeedback<TRef>({
  source,
  target,
  className,
  disabled = false,
}: {
  source: string;
  target: TRef;
  className?: string;
  disabled?: boolean;
}) {
  const feedback = useFeedback<TRef>();
  const root = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(target);
  const reference = useMemo(() => JSON.parse(key) as TRef, [key]);
  const plugins = useMemo(
    () => [
      sourceMappingPlugin(source, (entity) => {
        const decoder = document.createElement('textarea');
        decoder.innerHTML = entity;
        return decoder.value;
      }),
    ],
    [source],
  );
  useLayoutEffect(() => {
    if (!root.current) return;
    const segments = [...root.current.querySelectorAll<HTMLElement>('[data-source-leaf]')].flatMap(
      (element) => {
        const node = element.firstChild;
        if (node?.nodeType !== Node.TEXT_NODE) return [];
        return [
          {
            node: node as Text,
            sourceOffsets: JSON.parse(element.dataset.sourceOffsets ?? '[]') as (number | null)[],
          },
        ];
      },
    );
    return feedback.registerText({ ref: reference, source, segments });
  });
  const components: NonNullable<MarkdownProps['components']> = useMemo(
    () => ({
      p({ children, node, ...props }) {
        const start = node?.position?.start.offset,
          end = node?.position?.end.offset;
        return (
          <div className="space-y-1">
            {feedback.mode === 'select' && start !== undefined && end !== undefined && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || feedback.submitting}
                onClick={() =>
                  feedback.toggleTarget({
                    ref: reference,
                    text: { start, end, quote: source.slice(start, end) },
                  })
                }
              >
                选择此段
              </Button>
            )}
            <p {...props}>{children}</p>
          </div>
        );
      },
    }),
    [feedback.mode, feedback.submitting, disabled, reference, source],
  );
  return (
    <div ref={root} className={className} data-markdown-feedback="">
      <Markdown rehypePlugins={plugins} components={components}>
        {source}
      </Markdown>
    </div>
  );
}

/** Locate a raw-source range using the same explicit boundary map used for selection. */
export function locateMarkdownFeedback(root: HTMLElement, text?: FeedbackTextRange) {
  root.scrollIntoView({ block: 'start' });
  if (!text) {
    root.animate?.(
      [{ outline: '2px solid var(--ring)' }, { outline: '2px solid transparent' }],
      1500,
    );
    return;
  }
  const leaves = [...root.querySelectorAll<HTMLElement>('[data-source-leaf]')].flatMap(
    (element) => {
      const node = element.firstChild;
      if (node?.nodeType !== Node.TEXT_NODE) return [];
      const offsets = JSON.parse(element.dataset.sourceOffsets ?? '[]') as (number | null)[];
      return [{ node: node as Text, offsets }];
    },
  );
  const first = leaves
    .flatMap((leaf) => leaf.offsets.map((offset, index) => ({ ...leaf, offset, index })))
    .find((item) => item.offset !== null && item.offset >= text.start && item.offset < text.end);
  const last = leaves
    .flatMap((leaf) => leaf.offsets.map((offset, index) => ({ ...leaf, offset, index })))
    .findLast(
      (item) => item.offset !== null && item.offset > text.start && item.offset <= text.end,
    );
  if (!first || !last) return;
  const range = root.ownerDocument.createRange();
  range.setStart(first.node, first.index);
  range.setEnd(last.node, last.index);
  const selection = root.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  first.node.parentElement?.scrollIntoView({ block: 'center' });
}
