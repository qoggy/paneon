import type { AnnotationTextRange } from '@qoggy/paneon/sdk';

/** Locate a raw-source range using the same explicit boundary map used for selection. */
export function locateMarkdownAnnotation(root: HTMLElement, text?: AnnotationTextRange) {
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
