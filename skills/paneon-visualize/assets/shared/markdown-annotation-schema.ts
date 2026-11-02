/** Offsets refer to the complete, unmodified source, and must not split a grapheme. */
export function validSourceRange(
  source: string,
  target: {
    type?: 'mermaid';
    text?: { start: number; end: number; quote?: string };
  },
) {
  if (!target.text) return true;
  const { start, end, quote } = target.text;
  const boundaries = new Set([0, source.length]);
  for (const part of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(source))
    boundaries.add(part.index);
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end > start &&
    end <= source.length &&
    boundaries.has(start) &&
    boundaries.has(end) &&
    (target.type === 'mermaid' || source.slice(start, end) === quote)
  );
}
