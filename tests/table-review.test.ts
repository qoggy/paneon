import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'paneon/sdk';
import {
  tableParamsSchema,
  completeTableSchema,
  tableTargetError,
  visibleRows,
} from '../skills/paneon/assets/panels/table/schema.ts';
import {
  reviewParamsSchema,
  completeReviewSchema,
} from '../skills/paneon/assets/panels/review/schema.ts';
import { markdownOffsets } from '../skills/paneon/assets/shared/markdown-feedback-mapper.ts';
const table = () =>
  tableParamsSchema.parse({
    title: 'Table',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'n', label: 'Number', type: 'number' },
      { key: 'b', label: 'Boolean', type: 'boolean' },
    ],
    rows: [
      { name: 'repeat 中文🙂 repeat', n: 2, b: false },
      { name: 'equal', n: 1, b: true },
      { name: 'equal', n: 1, b: null },
      { name: 'last', n: null, b: null },
    ],
    pageSize: 2,
  });
void test('table input is strict, finite, typed, own-field based with unique columns and bounded pageSize', () => {
  const params = table();
  for (const patch of [
    { title: ' ' },
    { columns: [] },
    { columns: [...params.columns, params.columns[0]] },
    { pageSize: 0 },
    { pageSize: 1001 },
    { rowKey: 'id' },
    { rows: [{ name: 'x', n: Infinity, b: false }] },
    { rows: [{ name: 'x', n: '1', b: false }] },
    { rows: [{ name: 'x', n: 1, b: 0 }] },
    { rows: [{ name: 'x', n: 1 }] },
  ])
    assert.equal(tableParamsSchema.safeParse({ ...params, ...patch }).success, false);
  assert.equal(tableParamsSchema.safeParse({ ...params, rows: [] }).success, true);
  assert.equal(
    tableParamsSchema.safeParse({ ...params, rows: [{ ...params.rows[0], extra: 'allowed' }] })
      .success,
    true,
  );
});
void test('table sorting is stable, null-last in both directions; filters preserve original identities', () => {
  const params = table(),
    initial = structuredClone(params);
  const view = { search: '', filters: {}, sort: { key: 'n', descending: false } };
  assert.deepEqual(
    visibleRows(params, view).map((item) => item.rowIndex),
    [1, 2, 0, 3],
  );
  assert.deepEqual(
    visibleRows(params, { ...view, sort: { key: 'n', descending: true } }).map(
      (item) => item.rowIndex,
    ),
    [0, 1, 2, 3],
  );
  assert.deepEqual(
    visibleRows(params, { ...view, search: 'EQUAL', filters: { n: '1' } }).map(
      (item) => item.rowIndex,
    ),
    [1, 2],
  );
  assert.deepEqual(params, initial);
});
void test('table complete result validates mixed targets, independent entries, original quotes and revisions', () => {
  const params = table(),
    schema = completeTableSchema(params);
  const first = {
    id: 'a',
    targets: [
      { ref: { kind: 'row', rowIndex: 1 } },
      { ref: { kind: 'column', columnKey: 'n' } },
      {
        ref: { kind: 'cell', rowIndex: 0, columnKey: 'name' },
        text: { start: 14, end: 20, quote: 'repeat' },
      },
    ],
    comment: '',
  };
  // The second occurrence is distinguished by its actual UTF-16 source offset.
  const source = params.rows[0].name as string;
  const start = source.lastIndexOf('repeat');
  first.targets[2].text = { start, end: source.length, quote: 'repeat' };
  assert.equal(
    schema.safeParse({ annotations: [first, { ...first, id: 'b', comment: 'Separate opinion' }] })
      .success,
    true,
  );
  assert.equal(schema.safeParse({ annotations: [] }).success, false);
  assert.equal(schema.safeParse({ annotations: [], replacesEventId: 1 }).success, true);
  assert.equal(schema.safeParse({ annotations: [], comment: 'overall' }).success, true);
  for (const target of [
    { ref: { kind: 'row', rowIndex: 4 } },
    { ref: { kind: 'column', columnKey: 'unknown' } },
    { ref: { kind: 'cell', rowIndex: 0, columnKey: 'n' }, text: { start: 0, end: 1, quote: '2' } },
    {
      ref: { kind: 'cell', rowIndex: 0, columnKey: 'name' },
      text: { start: 9, end: 10, quote: source.slice(9, 10) },
    },
  ])
    assert.notEqual(
      tableTargetError(params, target as Parameters<typeof tableTargetError>[1]),
      null,
    );
});
void test('review uses one complete raw document and validates grapheme boundaries and clearing revisions', () => {
  const params = reviewParamsSchema.parse({
    title: 'Review',
    markdown: '**中文🙂** repeat repeat',
  });
  const schema = completeReviewSchema(params);
  const target = { ref: { kind: 'document' }, text: { start: 2, end: 6, quote: '中文🙂' } };
  assert.equal(
    schema.safeParse({ annotations: [{ id: 'a', targets: [target], comment: '' }] }).success,
    true,
  );
  assert.equal(
    schema.safeParse({
      annotations: [
        {
          id: 'a',
          targets: [{ ...target, text: { start: 2, end: 5, quote: '中文\ud83d' } }],
          comment: '',
        },
      ],
    }).success,
    false,
  );
  assert.equal(schema.safeParse({ annotations: [] }).success, false);
  assert.equal(schema.safeParse({ annotations: [], replacesEventId: 2 }).success, true);
  assert.equal(
    reviewParamsSchema.safeParse({ title: 'x', markdown: '', sections: [] }).success,
    false,
  );
});
void test('Markdown mapping is parser-range based for escapes, entities, code and Unicode without first-match search', () => {
  const raw = 'repeat **repeat** &amp; \\* 中文🙂';
  assert.deepEqual(markdownOffsets(raw, 9, 15, 'repeat'), [9, 10, 11, 12, 13, 14, 15]);
  const offsets = markdownOffsets(raw, 17, raw.length, ' & * 中文🙂', 'text', (entity) =>
    entity === '&amp;' ? '&' : entity,
  );
  assert.ok(offsets);
  assert.equal(offsets[2], 23);
  assert.equal(offsets[4], 26);
  assert.deepEqual(markdownOffsets('` a\nb `', 0, 7, 'a b', 'inlineCode'), [2, 3, 4, 5]);
  assert.deepEqual(markdownOffsets('```js\nx<y\n```', 0, 13, 'x<y\n', 'code'), [6, 7, 8, 9, 10]);
  assert.equal(markdownOffsets('same same', 5, 9, 'different'), null);
});

void test('special own keys survive schema metadata and Markdown containers preserve source positions', () => {
  const params = tableParamsSchema.parse(
    JSON.parse(
      '{"title":"keys","columns":[{"key":"__proto__","label":"Key"}],"rows":[{"__proto__":"value"}]}',
    ),
  );
  assert.equal(Object.hasOwn(params.rows[0], '__proto__'), true);
  assert.equal(params.rows[0]['__proto__'], 'value');
  assert.doesNotThrow(() => z.toJSONSchema(tableParamsSchema));
  assert.deepEqual(
    markdownOffsets('> first\n> second', 2, 16, 'first\nsecond'),
    [2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15, 16],
  );
  assert.deepEqual(
    markdownOffsets('```\n> literal\n```', 0, 17, '> literal\n', 'code'),
    [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  );
  assert.deepEqual(markdownOffsets('```\nx', 0, 5, 'x\n', 'code'), [4, 5, 5]);
});
