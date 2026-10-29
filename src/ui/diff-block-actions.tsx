import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { useAnnotationContext, useAnnotations } from './annotation-context';
import { Button } from './button';
import { useUI } from './use-ui';
import { diffBlockAnchor } from './diff-block-annotations';
import type { DiffAnnotationBlock } from './diff-block-annotations';

export function DiffBlockActions<TRef>({
  blocks,
  body,
  gutters,
  split,
}: {
  blocks: readonly DiffAnnotationBlock<TRef>[];
  body: RefObject<HTMLDivElement | null>;
  gutters: RefObject<Map<string, HTMLElement>>;
  split: boolean;
}) {
  const { store } = useAnnotationContext<TRef>();
  const annotations = useAnnotations<TRef>();
  const { t } = useUI();
  const [positions, setPositions] = useState<{ index: number; left: number; top: number }[]>([]);
  // The ancestor body/gutter refs are attached after this child's layout phase.
  useEffect(() => {
    const element = body.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      const origin = element.getBoundingClientRect();
      const next = blocks.flatMap((block, index) => {
        const anchor = diffBlockAnchor(block, gutters.current, split);
        return anchor
          ? [
              {
                index,
                left: anchor.left - origin.left,
                top: anchor.top - origin.top,
              },
            ]
          : [];
      });
      setPositions((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(element);
    for (const gutter of gutters.current.values()) {
      if (gutter.parentElement) resize.observe(gutter.parentElement);
      // Long code can keep the table width fixed while its visible pane is resized.
      const scrollport = gutter.closest<HTMLElement>('[data-diff-scroll]');
      if (scrollport) resize.observe(scrollport);
    }
    const mutations = new MutationObserver(schedule);
    mutations.observe(element, { childList: true, characterData: true, subtree: true });
    element.addEventListener('scroll', schedule, true);
    element.addEventListener('diff-layout', schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      element.removeEventListener('scroll', schedule, true);
      element.removeEventListener('diff-layout', schedule);
    };
  }, [blocks, body, gutters, split]);
  return (
    <div className="pointer-events-none absolute inset-0 z-[6]" data-diff-block-actions="">
      {positions.map(({ index, left, top }) => (
        <Button
          key={index}
          type="button"
          size="icon-xs"
          variant="outline"
          className={`pointer-events-auto absolute rounded-full transition-colors ${split ? '' : 'size-4'}`}
          style={{ left, top }}
          data-diff-block-action={index}
          aria-label={t('批注第 {number} 处改动', { number: index + 1 })}
          title={t('批注改动块')}
          disabled={store.disabled || annotations.submitting}
          onClick={() => annotations.beginAnnotation(blocks[index].targets)}
        >
          <MessageSquarePlus aria-hidden="true" />
        </Button>
      ))}
    </div>
  );
}
