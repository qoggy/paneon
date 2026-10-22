import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'paneon/sdk';
import {
  chooseParamsSchema,
  completeAnswersSchema,
} from '../skills/paneon/assets/panels/choose/schema.ts';
import {
  collectForm,
  completeFormSchema,
  formParamsSchema,
  formSubmittedSchema,
  initialDraft,
} from '../skills/paneon/assets/panels/form/schema.ts';

const questions = [
  {
    id: 'single',
    title: 'Single',
    options: [
      { id: 'a', label: 'A', recommended: true },
      { id: 'b', label: 'B' },
    ],
  },
  {
    id: 'multi',
    title: 'Multiple',
    mode: 'multiple',
    options: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
  },
] as const;
const choose = () => chooseParamsSchema.parse({ title: 'Choices', questions });
void test('choice input rejects invalid scoped IDs, empty content and invalid initial selections', () => {
  assert.equal(
    choose().questions[0].selectedIds,
    undefined,
    'Recommendations are not initial answers.',
  );
  for (const patch of [
    { questions: [] },
    { title: ' ' },
    { questions: [questions[0], questions[0]] },
    {
      questions: [{ ...questions[0], options: [questions[0].options[0], questions[0].options[0]] }],
    },
    ...[['a', 'a'], ['foreign'], ['a', 'b']].map((selectedIds) => ({
      questions: [{ ...questions[0], selectedIds }],
    })),
  ])
    assert.equal(
      chooseParamsSchema.safeParse({ title: 'Choices', questions, ...patch }).success,
      false,
    );
});
void test('complete answers enforce coverage, single/multiple cardinality and canonical selection order', () => {
  const schema = completeAnswersSchema(choose());
  const first = {
    questionId: 'single',
    selections: [{ kind: 'custom', text: '  Different answer 中文🙂  ' }],
  };
  const a = { kind: 'option', optionId: 'a', comment: '' };
  const b = { kind: 'option', optionId: 'b', comment: '  Keep spacing  ' };
  const custom = { kind: 'custom', text: '  Another feature  ' };
  const second = { questionId: 'multi', selections: [custom, b, a] };
  assert.deepEqual(schema.parse({ answers: [second, first], replacesEventId: 4 }), {
    answers: [first, { ...second, selections: [a, b, custom] }],
    replacesEventId: 4,
  });
  for (const answers of [
    [],
    [first],
    [first, first],
    [first, { ...second, questionId: 'foreign' }],
    [first, { ...second, selections: [a, a] }],
    [first, { ...second, selections: [{ ...a, optionId: 'foreign' }] }],
    [first, { ...second, selections: [custom, custom] }],
    [first, { ...second, selections: [] }],
    [first, { ...second, selections: [{ kind: 'custom', text: '  ' }] }],
    [first, { ...second, selections: [{ kind: 'option', optionId: 'a' }] }],
    [first, { ...second, selections: [{ ...a, comment: 3 }] }],
    [first, { ...second, selections: [{ ...a, text: 'extra' }] }],
    [first, { ...second, selections: [{ ...custom, comment: '' }] }],
    [{ ...first, selectedIds: ['a'] }, second],
    [{ ...first, kind: 'custom' }, second],
    [{ ...first, selections: [a, b] }, second],
    [{ ...first, selections: [a, custom] }, second],
    [{ ...first, selections: [] }, second],
  ])
    assert.equal(schema.safeParse({ answers }).success, false, JSON.stringify(answers));
  assert.equal(schema.safeParse({ answers: [first, second], replacesEventId: 0 }).success, false);
  assert.equal(schema.safeParse({ answers: [first, second], extra: true }).success, false);
});
void test('option explanations stay independent and custom answers work alone or with multiple options', () => {
  const schema = completeAnswersSchema(choose());
  const first = {
    questionId: 'single',
    selections: [{ kind: 'option', optionId: 'a', comment: '  ' }],
  };
  for (const selections of [
    [{ kind: 'option', optionId: 'b', comment: '' }],
    [{ kind: 'custom', text: 'Custom alone' }],
    [
      { kind: 'option', optionId: 'b', comment: 'B note' },
      { kind: 'option', optionId: 'a', comment: 'A note' },
    ],
  ]) {
    const result = schema.parse({ answers: [first, { questionId: 'multi', selections }] });
    assert.deepEqual(
      result.answers[0],
      first,
      'Whitespace-only explanations retain original text.',
    );
    assert.deepEqual(
      result.answers[1].selections,
      selections[0].kind === 'custom'
        ? selections
        : [...selections].sort((a, b) =>
            ('optionId' in a ? a.optionId : '').localeCompare('optionId' in b ? b.optionId : ''),
          ),
    );
  }
  const scoped = chooseParamsSchema.parse({
    title: 'Scoped',
    questions: [{ ...questions[0], options: [{ id: 'local', label: 'Local' }] }],
  });
  assert.equal(completeAnswersSchema(scoped).safeParse({ answers: [first] }).success, false);
});
const fields = [
  { name: 'name', label: 'Name', type: 'text', required: true, minLength: 2, maxLength: 10 },
  { name: 'notes', label: 'Notes', type: 'textarea' },
  { name: 'number', label: 'Number', type: 'number', min: 0, max: 5, defaultValue: 0 },
  {
    name: 'select',
    label: 'Select',
    type: 'select',
    options: [{ value: 'a', label: 'A' }],
    defaultValue: 'a',
  },
  { name: 'radio', label: 'Radio', type: 'radio', options: [{ value: 'a', label: 'A' }] },
  { name: 'multi', label: 'Multi', type: 'multiselect', options: [{ value: 'a', label: 'A' }] },
  { name: 'check', label: 'Check', type: 'checkbox', required: true },
  { name: 'switch', label: 'Switch', type: 'switch' },
];
void test('form configuration rejects duplicate names/options, wrong defaults, invalid bounds and nonfinite numbers', () => {
  for (const input of [
    [],
    [fields[0], fields[0]],
    [{ ...fields[0], minLength: 4, maxLength: 2 }],
    [{ ...fields[2], min: 6, max: 5 }],
    [{ ...fields[2], defaultValue: -1 }],
    [{ ...fields[2], defaultValue: Infinity }],
    [{ ...fields[2], defaultValue: '0' }],
    [{ ...fields[3], defaultValue: 'foreign' }],
    [{ ...fields[3], defaultValue: '' }],
    [{ ...fields[0], required: false, defaultValue: '' }],
    [{ ...fields[0], required: false, maxLength: 2, defaultValue: '   ' }],
    [
      {
        ...fields[3],
        options: [
          { value: 'a', label: 'A' },
          { value: 'a', label: 'Again' },
        ],
      },
    ],
    [{ ...fields[5], defaultValue: ['a', 'a'] }],
    [{ ...fields[5], defaultValue: ['foreign'] }],
    [{ ...fields[0], defaultValue: ' ' }],
  ])
    assert.equal(formParamsSchema.safeParse({ title: 'Form', fields: input }).success, false);
});
void test('form collects full values, accepts required false/zero, omits optional empty values and retains original strings', () => {
  const params = formParamsSchema.parse({ title: 'Form', fields });
  const draft = initialDraft(params);
  assert.deepEqual(collectForm(params, draft).errors, { name: 'This field is required.' });
  draft.name = '  demo  ';
  const result = collectForm(params, draft);
  assert.deepEqual(result, {
    errors: {},
    values: { name: '  demo  ', number: 0, select: 'a', check: false, switch: false },
  });
  assert.deepEqual(completeFormSchema(params).parse({ values: result.values }), {
    values: result.values,
  });
  for (const value of [-1, 6, NaN, Infinity, '1', '', []])
    assert.equal(
      completeFormSchema(params).safeParse({ values: { ...result.values, number: value } }).success,
      false,
    );
  assert.equal(
    completeFormSchema(params).safeParse({ values: { ...result.values, extra: 1 } }).success,
    false,
  );
  assert.equal(
    completeFormSchema(params).safeParse({ values: { ...result.values, multi: ['a', 'a'] } })
      .success,
    false,
  );
  assert.equal(
    completeFormSchema(params).safeParse({ values: { ...result.values, select: 'foreign' } })
      .success,
    false,
  );
  draft.number = 'bad';
  assert.equal(collectForm(params, draft).errors.number, 'Enter a finite number.');
});
void test('field names are data keys, including prototype-related strings', () => {
  assert.doesNotThrow(() => z.toJSONSchema(formSubmittedSchema));
  const params = formParamsSchema.parse({
    title: 'Keys',
    fields: [
      { name: '__proto__', label: 'Value', type: 'text', required: true },
      { name: 'constructor', label: 'Other', type: 'checkbox' },
    ],
  });
  const draft = { ...initialDraft(params), ['__proto__']: 'safe' };
  const result = collectForm(params, draft);
  assert.equal(Object.hasOwn(result.values, '__proto__'), true);
  assert.equal(result.values['__proto__'], 'safe');
  assert.deepEqual(result.errors, {});
  assert.equal(
    completeFormSchema(params).parse({ values: result.values }).values['__proto__'],
    'safe',
  );
});
