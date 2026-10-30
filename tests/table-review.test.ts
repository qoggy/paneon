import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from '@qoggy/paneon/sdk';
import {
  tableParamsSchema,
  completeTableSchema,
  tableTargetError,
  tableSubmittedSchema,
  visibleRows,
} from '../skills/paneon/assets/panels/table/schema.ts';
import { publicTableFeedback } from '../skills/paneon/assets/panels/table/feedback.ts';
import { markdownOffsets } from '../src/ui/markdown-annotation-mapper.ts';
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
    schema.safeParse({
      annotations: [first, { ...first, id: 'b', comment: 'Separate opinion' }],
    }).success,
    true,
  );
  assert.equal(schema.safeParse({ annotations: [] }).success, false);
  assert.equal(schema.safeParse({ annotations: [], replacesEventId: 1 }).success, true);
  assert.equal(
    schema.safeParse({ annotations: [], comment: 'removed page-level field' }).success,
    false,
  );
  for (const target of [
    { ref: { kind: 'row', rowIndex: 4 } },
    { ref: { kind: 'column', columnKey: 'unknown' } },
    {
      ref: { kind: 'cell', rowIndex: 0, columnKey: 'n' },
      text: { start: 0, end: 1, quote: '3' },
    },
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
void test('Table annotates displayed number and boolean text without changing input types', () => {
  const values = [120, 0, -12.5, true, false, '120'];
  const params = tableParamsSchema.parse({
    title: 'Cell types',
    columns: [{ key: 'value', label: 'Value' }],
    rows: [...values, null].map((value) => ({ value })),
  });
  const targets = values.map((value, rowIndex) => ({
    ref: { kind: 'cell' as const, rowIndex, columnKey: 'value' },
    text: { start: 0, end: String(value).length, quote: String(value) },
  }));
  // Selecting only part of a displayed value works just like selecting part of a string.
  targets.push({
    ref: { kind: 'cell', rowIndex: 0, columnKey: 'value' },
    text: { start: 1, end: 3, quote: '20' },
  });
  const published = publicTableFeedback(
    completeTableSchema(params).parse({
      annotations: [{ id: 'mixed', targets, comment: 'Check these values' }],
    }),
  );
  assert.deepEqual(tableSubmittedSchema.parse(published).annotations[0], {
    targets,
    comment: 'Check these values',
  });
  assert.deepEqual(
    params.rows.map((row) => row.value),
    [...values, null],
  );
});

void test('Table publishes header, cell and multi-cell opinions without editing ids', () => {
  const params = tableParamsSchema.parse({
    title: 'Services',
    columns: [
      { key: 'name', label: 'Service' },
      { key: 'description', label: '说明' },
    ],
    rows: [{ name: 'API', description: '同步请求🙂' }],
  });
  const name = {
    ref: { kind: 'cell' as const, rowIndex: 0, columnKey: 'name' },
    text: { start: 0, end: 3, quote: 'API' },
  };
  const description = {
    ref: { kind: 'cell' as const, rowIndex: 0, columnKey: 'description' },
    text: { start: 0, end: 6, quote: '同步请求🙂' },
  };
  const header = {
    ref: { kind: 'header' as const, columnKey: 'description' },
    text: { start: 0, end: 2, quote: '说明' },
  };
  const draft = completeTableSchema(params).parse({
    annotations: [
      { id: 'header', targets: [header], comment: '列名意见' },
      { id: 'cell', targets: [description], comment: '' },
      { id: 'multiple', targets: [name, description], comment: '同一条意见' },
      { id: 'independent', targets: [description], comment: '另一条独立意见' },
    ],
    replacesEventId: 12,
  });
  const original = structuredClone(draft);
  const published = publicTableFeedback(draft);
  assert.deepEqual(published, {
    annotations: [
      { targets: [header], comment: '列名意见' },
      { targets: [description], comment: '' },
      { targets: [name, description], comment: '同一条意见' },
      { targets: [description], comment: '另一条独立意见' },
    ],
    replacesEventId: 12,
  });
  assert.deepEqual(tableSubmittedSchema.parse(published), published);
  assert.deepEqual(draft, original, 'Publishing preserves draft ids for editing and navigation');
  assert.doesNotThrow(() => z.toJSONSchema(tableSubmittedSchema));
});

void test('Table publishes initial results and complete empty corrections', () => {
  const draft = completeTableSchema(table()).parse({
    annotations: [
      { id: 'header', targets: [{ ref: { kind: 'header', columnKey: 'name' } }], comment: '' },
    ],
  });
  assert.equal('replacesEventId' in publicTableFeedback(draft), false);
  const cleared = publicTableFeedback(
    completeTableSchema(table()).parse({ annotations: [], replacesEventId: 13 }),
  );
  assert.deepEqual(cleared, { annotations: [], replacesEventId: 13 });
  assert.deepEqual(tableSubmittedSchema.parse(cleared), cleared);
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

void test('table header references distinguish labels from full columns and preserve exact Unicode sources', () => {
  const params = tableParamsSchema.parse({
    title: 'Headers',
    columns: [
      { key: 'left', label: '说明 🙂 e\u0301' },
      { key: 'right', label: '说明 🙂 e\u0301' },
      { key: 'number', label: '123', type: 'number' },
    ],
    rows: [{ left: 'not the label', right: 'different source', number: 123 }],
  });
  const schema = completeTableSchema(params);
  const header = (columnKey: string, start: number, end: number, quote: string) => ({
    ref: { kind: 'header' as const, columnKey },
    text: { start, end, quote },
  });
  const valid = [
    header('left', 0, 2, '说明'),
    header('right', 3, 5, '🙂'),
    header('left', 6, 8, 'e\u0301'),
    header('number', 0, 3, '123'),
  ];
  for (const target of valid) assert.equal(tableTargetError(params, target), null);
  assert.equal(
    schema.safeParse({
      annotations: [{ id: 'headers', targets: valid, comment: 'Header text' }],
    }).success,
    true,
  );
  for (const target of [
    header('unknown', 0, 2, '说明'),
    header('left', -1, 2, '说明'),
    header('left', 0, 100, '说明'),
    header('left', 0, 2, '错误'),
    header('left', 3, 4, '\ud83d'),
    header('left', 6, 7, 'e'),
    header('left', 0.5, 2, '说明'),
    header('left', 2, 2, ''),
    header('left', 0, 13, 'not the label'),
  ])
    assert.notEqual(tableTargetError(params, target), null);
  for (const ref of [
    { kind: 'header', columnKey: 'left', rowIndex: 0 },
    { kind: 'header', label: '说明' },
    { kind: 'header', columnKey: '__proto__' },
    { kind: 'column', columnKey: 'left' },
    { kind: 'row', rowIndex: 0 },
  ]) {
    const result = schema.safeParse({
      annotations: [
        {
          id: 'forged',
          targets: [{ ref, text: { start: 0, end: 2, quote: '说明' } }],
          comment: '',
        },
      ],
    });
    assert.equal(result.success, false);
  }
  for (const ref of [
    { kind: 'row', rowIndex: 0 },
    { kind: 'column', columnKey: 'left' },
    { kind: 'cell', rowIndex: 0, columnKey: 'number' },
    { kind: 'header', columnKey: 'right' },
  ])
    assert.equal(
      schema.safeParse({ annotations: [{ id: 'object', targets: [{ ref }], comment: '' }] })
        .success,
      true,
    );
  assert.equal(schema.safeParse({ annotations: [], replacesEventId: 2 }).success, true);
});

void test('table rejects page-level comments even on corrections', () => {
  const schemas = [completeTableSchema(table())];
  for (const schema of schemas) {
    assert.equal(schema.safeParse({ annotations: [], comment: 'removed' }).success, false);
    assert.equal(
      schema.safeParse({ annotations: [], comment: '', replacesEventId: 1 }).success,
      false,
    );
    assert.equal(schema.safeParse({ annotations: [], replacesEventId: 1 }).success, true);
  }
});

void test('table validates page targets alongside page-defined local file targets', () => {
  const common = {
    ref: { kind: 'header', columnKey: 'name' },
    sourceRef: { path: '/local.txt', snapshotId: 'local' },
    text: { start: 0, end: 5, quote: 'local' },
  };
  const result = completeTableSchema(table()).parse({
    annotations: [
      {
        id: 'mixed',
        comment: '',
        targets: [
          { ref: { kind: 'header', columnKey: 'name' }, text: { start: 0, end: 4, quote: 'Name' } },
          common,
        ],
      },
    ],
  });
  assert.deepEqual(result.annotations[0].targets[1], common);
});
