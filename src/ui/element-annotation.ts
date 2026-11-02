import type { ElementAnnotationRef } from '../sdk/annotation';

export const ELEMENT_ANNOTATION_EXCERPT_LENGTH = 30;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function elementExcerpt(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  let excerpt = '';
  let count = 0;
  for (const { segment } of segmenter.segment(normalized)) {
    if (count === ELEMENT_ANNOTATION_EXCERPT_LENGTH) return excerpt + '…';
    excerpt += segment;
    count++;
  }
  return excerpt;
}

export function elementAnnotationRef(node: Element, root: Element): ElementAnnotationRef {
  const parts: string[] = [];
  for (
    let current: Element = node;
    current !== root && current.parentElement;
    current = current.parentElement
  ) {
    const tag = current.localName;
    const peers = [...current.parentElement.children].filter((peer) => peer.localName === tag);
    parts.unshift(`${tag}:nth-of-type(${peers.indexOf(current) + 1})`);
  }
  return {
    element: {
      path: parts.length ? parts.join(' > ') : ':scope',
      tag: node.localName,
      excerpt: elementExcerpt(node.getAttribute('aria-label') || node.textContent || ''),
    },
  };
}

export function elementAncestors(node: Element, root: Element): Element[] {
  const ancestors: Element[] = [];
  for (let current: Element | null = node; current; current = current.parentElement) {
    const rect = current.getBoundingClientRect();
    const last = ancestors.at(-1)?.getBoundingClientRect();
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      (!last ||
        rect.x !== last.x ||
        rect.y !== last.y ||
        rect.width !== last.width ||
        rect.height !== last.height)
    )
      ancestors.push(current);
    if (current === root) break;
  }
  return ancestors;
}
