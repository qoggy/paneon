import type { AnnotationTextRegistration } from './annotation-types';
type Segment = AnnotationTextRegistration<unknown>['segments'][number];
type Entry = { segment: Segment; start: number; end: number; maxEnd: number; order: number };

/** Bounds index only: the original null/discontinuous boundary map stays authoritative. */
export function indexTextSegments(segments: Segment[]): Entry[] {
  const entries = segments.flatMap((segment, order) => {
    const start = segment.sourceOffsets.find((offset) => offset !== null);
    const end = segment.sourceOffsets.findLast((offset) => offset !== null);
    return start == null || end == null || end < start
      ? []
      : [{ segment, start, end, maxEnd: end, order }];
  });
  entries.sort((a, b) => a.start - b.start || a.order - b.order);
  let maxEnd = -1;
  for (const entry of entries) entry.maxEnd = maxEnd = Math.max(maxEnd, entry.end);
  return entries;
}

/** Include overlapping/repeated source ranges, then preserve the registration's DOM order. */
export function textSegmentsInRange(index: Entry[], start: number, end: number): Segment[] {
  let low = 0,
    high = index.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (index[middle].maxEnd < start) low = middle + 1;
    else high = middle;
  }
  const matches: Entry[] = [];
  for (let i = low; i < index.length && index[i].start <= end; i++)
    if (index[i].end >= start) matches.push(index[i]);
  matches.sort((a, b) => a.order - b.order);
  return matches.map((entry) => entry.segment);
}
