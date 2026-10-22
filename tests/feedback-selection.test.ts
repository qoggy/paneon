import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const compiled = await build({
  entryPoints: [new URL('../src/ui/feedback-selection.ts', import.meta.url).pathname],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { graphemeRange, validTextRange } = (await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64')
)) as {
  graphemeRange: (source: string, start: number, end: number) => { start: number; end: number };
  validTextRange: (
    source: string,
    target: { ref: string; text: { start: number; end: number; quote: string } },
  ) => boolean;
};
void test('endpoint normalization preserves exact UTF-16 grapheme boundaries', () => {
  for (const source of ['', 'ASCII', 'é中文\r\n👨‍👩‍👧‍👦🇨🇳👍🏽\na']) {
    const boundaries = [
      0,
      ...Array.from(
        new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(source),
        (part) => part.index + part.segment.length,
      ),
    ];
    for (let start = 0; start <= source.length; start++)
      for (let end = start; end <= source.length; end++) {
        const expected = {
          start: boundaries.findLast((p) => p <= start),
          end: boundaries.find((p) => p >= end),
        };
        assert.deepEqual(
          graphemeRange(source, start, end),
          expected,
          `${JSON.stringify(source)} ${start}:${end}`,
        );
        if (end > start)
          assert.equal(
            validTextRange(source, {
              ref: 'text',
              text: { start, end, quote: source.slice(start, end) },
            }),
            expected.start === start && expected.end === end,
          );
      }
  }
  for (const [start, end] of [
    [-1, 1],
    [0, 100],
    [1.5, 3],
    [0, 1.5],
  ])
    assert.equal(validTextRange('abc', { ref: 'text', text: { start, end, quote: 'a' } }), false);
});

const indexCompiled = await build({
  entryPoints: [new URL('../src/ui/feedback-text-index.ts', import.meta.url).pathname],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
type TestSegment = { node: { label: string }; sourceOffsets: (number | null)[] };
const { indexTextSegments, textSegmentsInRange } = (await import(
  'data:text/javascript;base64,' +
    Buffer.from(indexCompiled.outputFiles[0].contents).toString('base64')
)) as {
  indexTextSegments: (segments: TestSegment[]) => unknown;
  textSegmentsInRange: (index: unknown, start: number, end: number) => TestSegment[];
};
void test('source interval index retains overlapping/discontinuous/null mappings and DOM order', () => {
  const segments: TestSegment[] = [
    [20, 21, 22],
    [0, 1, 2],
    [1, 2, 3],
    [null, 0, null, 5, null],
    [null, null],
    [4, 4],
    [2, 5, 8],
    [0, 1, 2],
  ].map((sourceOffsets, i) => ({ node: { label: `node-${i}` }, sourceOffsets }));
  const index = indexTextSegments(segments);
  for (let start = 0; start < 24; start++)
    for (let end = start + 1; end <= 25; end++) {
      const expected = segments.filter((segment) => {
        const bounds = segment.sourceOffsets.filter((offset) => offset !== null);
        const last = bounds.at(-1);
        return last !== undefined && last >= bounds[0] && last >= start && bounds[0] <= end;
      });
      assert.deepEqual(textSegmentsInRange(index, start, end), expected, `${start}:${end}`);
    }
});
