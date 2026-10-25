import type { AnnotationTextRange } from '../sdk/annotation';
import type { DiffModel } from '../shared/diff-model';
import { validTextRange } from './annotation-selection';

/** Display coordinates only; the owning page resolves business references. */
export type DiffLocation =
  | { kind: 'file' }
  | { kind: 'hunk'; index: number }
  | ({ kind: 'text'; side: 'old' | 'new' } & AnnotationTextRange);

/** Exact DOM geometry for full-source text coordinates.
 * The same mapping powers location and contextual markers, without registering
 * overlapping text sources or searching repeated quotes. */
export function diffLocationRanges(
  root: HTMLElement,
  model: DiffModel,
  location: DiffLocation,
): Range[] {
  if (location.kind !== 'text') return [];
  const text = location.side === 'old' ? model.oldText : model.newText;
  if (text === undefined || !validTextRange(text, { ref: null, text: location })) return [];
  const { start, end } = location;
  const ranges: Range[] = [];
  root.querySelectorAll<HTMLElement>(`[data-code-side="${location.side}"]`).forEach((element) => {
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
export function revealDiffLocation(root: HTMLElement, model: DiffModel, location: DiffLocation) {
  const ranges = diffLocationRanges(root, model, location);
  const first =
    location.kind === 'file'
      ? root.querySelector<HTMLElement>('[data-diff-header]')
      : location.kind === 'hunk'
        ? root.querySelector<HTMLElement>(`[data-diff-hunk="${location.index}"]`)
        : ranges[0]?.startContainer.parentElement;
  if (first) revealDiffElement(first);
  // Run after the public controller's default highlight. Separate ranges avoid
  // highlighting the opposite column between consecutive same-side rows.
  let highlight: Highlight | undefined;
  let shouldReveal = true;
  const paint = () => {
    if (!root.isConnected) return;
    if (highlight && CSS.highlights?.get('paneon-diff-location') !== highlight) return;
    // Syntax highlighting replaces Text nodes asynchronously. Always rebuild
    // ranges from source coordinates rather than retaining detached DOM ranges.
    const ranges = diffLocationRanges(root, model, location);
    // A source span can be wider than its pane: reveal the selected fragment,
    // rather than merely scrolling the whole line's start into view.
    const viewport =
      ranges[0]?.startContainer.parentElement?.closest<HTMLElement>('[data-diff-scroll]');
    const bounds = ranges[0]?.getBoundingClientRect();
    if (shouldReveal && viewport && bounds) {
      const clip = viewport.getBoundingClientRect();
      if (bounds.left < clip.left || bounds.right > clip.right)
        viewport.scrollLeft += bounds.left - clip.left - 16;
    }
    if (shouldReveal) document.getSelection()?.removeAllRanges();
    shouldReveal = false;
    if (location.kind === 'text' && CSS.highlights && typeof Highlight !== 'undefined') {
      highlight = new Highlight(...ranges);
      CSS.highlights.set('paneon-diff-location', highlight);
    }
  };
  let frame = requestAnimationFrame(paint);
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(paint);
  });
  if (location.kind === 'text')
    observer.observe(root, { childList: true, characterData: true, subtree: true });
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    if (highlight && CSS.highlights?.get('paneon-diff-location') === highlight)
      CSS.highlights.delete('paneon-diff-location');
  };
}
