import { annotationKey, annotationTargetKey } from '../sdk/annotation.js';
import type { AnnotationTarget } from '../sdk/annotation.js';
import type { AnnotationTextRegistration } from './annotation-types';

export const interactiveSelector =
  'button,a,input,textarea,select,option,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="link"],[role="textbox"],[data-annotation-controls]';

// Explicit text registrations may include link labels; clicking links remains interactive.
export const textControlSelector =
  'button,input,textarea,select,option,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="textbox"],[data-annotation-controls]';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
type Segments = ReturnType<Intl.Segmenter['segment']>;
function containingRange(source: string, segments: Segments, start: number, end: number) {
  // Inspect only the containing endpoint graphemes. A Diff registration maps
  // many syntax Text nodes to one full source, which must not be resegmented.
  const first = segments.containing(Math.max(0, start));
  const last = segments.containing(Math.max(0, end));
  return {
    start: first?.index ?? source.length,
    end:
      end <= 0
        ? 0
        : last
          ? last.index === end
            ? end
            : last.index + last.segment.length
          : source.length,
  };
}
export function graphemeRange(source: string, start: number, end: number) {
  return containingRange(source, segmenter.segment(source), start, end);
}

export function validTextRange(source: string, target: AnnotationTarget<unknown>) {
  if (!target.text) return true;
  const { start, end, quote } = target.text;
  const normalized = graphemeRange(source, start, end);
  return (
    start >= 0 &&
    end > start &&
    end <= source.length &&
    normalized.start === start &&
    normalized.end === end &&
    source.slice(start, end) === quote
  );
}

/** Read only explicitly registered Text nodes; never search for a matching quote. */
export function selectedTextTargets<TRef>(
  selection: Selection,
  registrations: Iterable<AnnotationTextRegistration<TRef>>,
): AnnotationTarget<TRef>[] {
  if (selection.isCollapsed || selection.rangeCount !== 1) return [];
  const range = selection.getRangeAt(0);
  const document = range.startContainer.ownerDocument;
  if (!document) return [];
  const indexed = new Map<
    Text,
    { registration: AnnotationTextRegistration<TRef>; offsets: (number | null)[] }
  >();
  for (const registration of registrations)
    for (const segment of registration.segments)
      indexed.set(segment.node, { registration, offsets: segment.sourceOffsets });
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const groups: {
    ref: TRef;
    source: string;
    start: number;
    end: number;
    registration: AnnotationTextRegistration<TRef>;
  }[] = [];
  const segmented = new Map<string, Segments>();
  const normalize = (source: string, start: number, end: number) => {
    let segments = segmented.get(source);
    if (!segments) {
      segments = segmenter.segment(source);
      segmented.set(source, segments);
    }
    return containingRange(source, segments, start, end);
  };
  let previous: (typeof groups)[number] | undefined;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!range.intersectsNode(node)) continue;
    const textNode = node as Text;
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : textNode.length;
    if (start === end) continue;
    const mapping = indexed.get(textNode);
    if (!mapping || textNode.parentElement?.closest(textControlSelector)) {
      previous = undefined;
      continue;
    }
    const sourceStart = mapping.offsets[start];
    const sourceEnd = mapping.offsets[end];
    if (sourceStart == null || sourceEnd == null || sourceEnd <= sourceStart) {
      previous = undefined;
      continue;
    }
    const normalized = normalize(mapping.registration.source, sourceStart, sourceEnd);
    const key = annotationKey(mapping.registration.ref);
    if (
      previous &&
      previous.registration === mapping.registration &&
      annotationKey(previous.ref) === key &&
      previous.source === mapping.registration.source &&
      normalized.start >= previous.start
    ) {
      previous.end = Math.max(previous.end, normalized.end);
    } else {
      previous = {
        ref: mapping.registration.ref,
        source: mapping.registration.source,
        registration: mapping.registration,
        ...normalized,
      };
      groups.push(previous);
    }
  }
  const targets = groups.map(({ ref, source, start, end, registration }) => ({
    ref,
    ...(registration.sourceRef === undefined ? {} : { sourceRef: registration.sourceRef }),
    text: { start, end, quote: source.slice(start, end) },
  }));
  return [...new Map(targets.map((target) => [annotationTargetKey(target), target])).values()];
}
