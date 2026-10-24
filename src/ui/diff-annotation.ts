import type { AnnotationTarget as Target } from '../sdk/annotation';
import type { DiffModel, DiffRef } from '../shared/diff-model';
import { sourceLines } from '../shared/diff-model';

/** Exact DOM geometry for saved line-interval references.
 * The same mapping powers location and contextual markers, without registering
 * overlapping text sources or searching repeated quotes. */
export function diffTargetRanges(model: DiffModel, target: Target<DiffRef>): Range[] {
  if (target.ref.kind !== 'lines' || !target.text) return [];
  const ref = target.ref,
    text = ref.side === 'old' ? model.oldText : model.newText;
  if (text === undefined) return [];
  const line = sourceLines(text)[ref.startLine - 1];
  if (!line) return [];
  const start = line.start + target.text.start,
    end = line.start + target.text.end;
  const root = document.querySelector<HTMLElement>(
    `[data-diff-source="${CSS.escape(ref.sourceId)}"]`,
  );
  if (!root) return [];
  const expected = text.slice(start, end);
  if (expected !== target.text.quote) return [];
  const ranges: Range[] = [];
  root.querySelectorAll<HTMLElement>(`[data-code-side="${ref.side}"]`).forEach((element) => {
    let offset = Number(element.dataset.sourceStart);
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const value = node as Text,
        next = offset + value.length;
      if (next > start && offset < end) {
        const range = document.createRange();
        range.setStart(value, Math.max(0, start - offset));
        range.setEnd(value, Math.min(value.length, end - offset));
        ranges.push(range);
      }
      offset = next;
    }
  });
  return ranges;
}

/** Use the nearest vertical viewport; standalone document diffs own their page scroll. */
export function revealDiffElement(element: HTMLElement) {
  let viewport = element.parentElement;
  while (viewport) {
    const overflow = getComputedStyle(viewport).overflowY;
    if (/(auto|scroll)/.test(overflow) && viewport.scrollHeight > viewport.clientHeight + 1) break;
    viewport = viewport.parentElement;
  }
  viewport ??= document.scrollingElement as HTMLElement | null;
  if (!viewport) return;
  const clip =
    viewport === document.scrollingElement ? { top: 0 } : viewport.getBoundingClientRect();
  const header = element.closest('[data-diff-source]')?.querySelector('[data-diff-header]');
  // Only a header inside this viewport overlays its scroll content. Bounded
  // layouts keep headers outside the code viewport, so there is no inset.
  const inset = header && viewport.contains(header) ? header.getBoundingClientRect().height : 0;
  const bounds = element.getBoundingClientRect();
  viewport.scrollTop +=
    bounds.top -
    clip.top -
    inset -
    Math.max(0, (viewport.clientHeight - inset - bounds.height) / 2);
}

/** Reveal the actual selected source fragment in its own scroll pane. */
export function locateDiffTarget(model: DiffModel, target: Target<DiffRef>) {
  const ranges = diffTargetRanges(model, target);
  const first = ranges[0]?.startContainer.parentElement;
  if (first) revealDiffElement(first);
  // Run after the public controller's default highlight. Separate ranges avoid
  // highlighting the opposite column between consecutive same-side rows.
  requestAnimationFrame(() => {
    // A source span can be wider than its pane: reveal the selected fragment,
    // rather than merely scrolling the whole line's start into view.
    const viewport = first?.closest<HTMLElement>('[data-diff-scroll]');
    const bounds = ranges[0]?.getBoundingClientRect();
    if (viewport && bounds) {
      const clip = viewport.getBoundingClientRect();
      if (bounds.left < clip.left || bounds.right > clip.right)
        viewport.scrollLeft += bounds.left - clip.left - 16;
    }
    document.getSelection()?.removeAllRanges();
    if (CSS.highlights && typeof Highlight !== 'undefined')
      CSS.highlights.set('paneon-diff-location', new Highlight(...ranges));
  });
}
