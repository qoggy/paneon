import { z } from 'paneon/sdk';
const nonblank = z.string().refine((value) => value.trim().length > 0, 'Must not be blank.');
const base = {
  name: nonblank,
  label: nonblank,
  description: z.string().optional(),
  required: z.boolean().optional(),
};
const options = z.array(z.strictObject({ value: nonblank, label: nonblank })).min(1);
export const formFieldSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...base,
    type: z.enum(['text', 'textarea']),
    defaultValue: z.string().optional(),
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().nonnegative().optional(),
  }),
  z.strictObject({
    ...base,
    type: z.literal('number'),
    defaultValue: z.number().finite().optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  }),
  z.strictObject({
    ...base,
    type: z.enum(['select', 'radio']),
    options,
    defaultValue: z.string().optional(),
  }),
  z.strictObject({
    ...base,
    type: z.literal('multiselect'),
    options,
    defaultValue: z.array(z.string()).optional(),
  }),
  z.strictObject({
    ...base,
    type: z.enum(['checkbox', 'switch']),
    defaultValue: z.boolean().optional(),
  }),
]);
export type FormField = z.infer<typeof formFieldSchema>;
export type FormValue = string | number | boolean | string[];
export function valueError(field: FormField, value: unknown): string | undefined {
  const missing =
    value === undefined ||
    ((field.type === 'text' ||
      field.type === 'textarea' ||
      field.type === 'select' ||
      field.type === 'radio') &&
      typeof value === 'string' &&
      !value.trim()) ||
    (field.type === 'multiselect' && Array.isArray(value) && value.length === 0);
  if (missing) return field.required ? 'This field is required.' : undefined;
  switch (field.type) {
    case 'text':
    case 'textarea':
      if (typeof value !== 'string') return 'Enter text.';
      if (field.minLength !== undefined && value.length < field.minLength)
        return `Use at least ${field.minLength} characters.`;
      if (field.maxLength !== undefined && value.length > field.maxLength)
        return `Use at most ${field.maxLength} characters.`;
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'Enter a finite number.';
      if (field.min !== undefined && value < field.min)
        return `Use a number at least ${field.min}.`;
      if (field.max !== undefined && value > field.max) return `Use a number at most ${field.max}.`;
      break;
    case 'select':
    case 'radio':
      if (typeof value !== 'string' || !field.options.some((option) => option.value === value))
        return 'Select a listed option.';
      break;
    case 'multiselect':
      if (
        !Array.isArray(value) ||
        value.some(
          (item) =>
            typeof item !== 'string' || !field.options.some((option) => option.value === item),
        ) ||
        new Set(value).size !== value.length
      )
        return 'Select unique listed options.';
      break;
    case 'checkbox':
    case 'switch':
      if (typeof value !== 'boolean') return 'Use a boolean value.';
  }
}
export const formParamsSchema = z
  .strictObject({
    title: nonblank,
    description: z.string().optional(),
    fields: z.array(formFieldSchema).min(1),
  })
  .superRefine((params, ctx) => {
    const names = new Set<string>();
    for (const [index, field] of params.fields.entries()) {
      const issue = (message: string) =>
        ctx.addIssue({ code: 'custom', path: ['fields', index], message });
      if (names.has(field.name)) issue('Field names must be unique.');
      names.add(field.name);
      if (
        'options' in field &&
        new Set(field.options.map((option) => option.value)).size !== field.options.length
      )
        issue('Option values must be unique.');
      if (
        'minLength' in field &&
        field.minLength !== undefined &&
        field.maxLength !== undefined &&
        field.minLength > field.maxLength
      )
        issue('minLength must not exceed maxLength.');
      if (
        'min' in field &&
        field.min !== undefined &&
        field.max !== undefined &&
        field.min > field.max
      )
        issue('min must not exceed max.');
      if (field.defaultValue !== undefined) {
        const error = valueError(field, field.defaultValue);
        if (error) issue(`Invalid default: ${error}`);
        if (
          (field.type === 'select' || field.type === 'radio') &&
          !field.options.some((option) => option.value === field.defaultValue)
        )
          issue('Invalid default: select a listed option.');
        if (
          (field.type === 'text' || field.type === 'textarea') &&
          field.minLength !== undefined &&
          field.defaultValue.length < field.minLength
        )
          issue('Invalid default: text is shorter than minLength.');
        if (
          (field.type === 'text' || field.type === 'textarea') &&
          field.maxLength !== undefined &&
          field.defaultValue.length > field.maxLength
        )
          issue('Invalid default: text is longer than maxLength.');
      }
    }
  });
export type FormParams = z.infer<typeof formParamsSchema>;
const formValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(z.string()),
]);
// z.record drops __proto__; field names are unrestricted data keys in this contract.
const formValuesSchema = z
  .unknown()
  .refine(
    (value) =>
      value !== null &&
      typeof value === 'object' &&
      Object.prototype.toString.call(value) === '[object Object]' &&
      Object.values(value).every((item: unknown) => formValueSchema.safeParse(item).success),
    'Values must be an object containing strings, finite numbers, booleans or string arrays.',
  )
  .meta({ type: 'object', additionalProperties: z.toJSONSchema(formValueSchema) }) as z.ZodType<
  Record<string, FormValue>
>;
export const formSubmittedSchema = z.strictObject({
  values: formValuesSchema,
  replacesEventId: z.number().int().positive().optional(),
});
export type FormSubmitted = z.infer<typeof formSubmittedSchema>;
export function completeFormSchema(params: FormParams) {
  return formSubmittedSchema.superRefine((result, ctx) => {
    for (const name of Object.keys(result.values))
      if (!params.fields.some((field) => field.name === name))
        ctx.addIssue({ code: 'custom', path: ['values', name], message: 'Unknown field.' });
    for (const field of params.fields) {
      const error = valueError(
        field,
        Object.hasOwn(result.values, field.name) ? result.values[field.name] : undefined,
      );
      if (error) ctx.addIssue({ code: 'custom', path: ['values', field.name], message: error });
      if (
        (field.type === 'checkbox' || field.type === 'switch') &&
        !Object.hasOwn(result.values, field.name)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['values', field.name],
          message: 'Boolean fields must be included.',
        });
    }
  });
}
export type FormDraft = Record<string, string | boolean | string[]>;
export function initialDraft(params: FormParams): FormDraft {
  return Object.fromEntries(
    params.fields.map((field) => [
      field.name,
      field.type === 'checkbox' || field.type === 'switch'
        ? (field.defaultValue ?? false)
        : field.type === 'multiselect'
          ? (field.defaultValue ?? [])
          : field.defaultValue === undefined
            ? ''
            : String(field.defaultValue),
    ]),
  );
}
export function collectForm(params: FormParams, draft: FormDraft) {
  const values: Record<string, FormValue> = {};
  const errors: Record<string, string> = {};
  for (const field of params.fields) {
    const raw = draft[field.name];
    const empty =
      raw === undefined ||
      (typeof raw === 'string' && !raw.trim()) ||
      (Array.isArray(raw) && raw.length === 0);
    const value = empty ? undefined : field.type === 'number' ? Number(raw) : raw;
    const error = valueError(field, value);
    if (error) Object.defineProperty(errors, field.name, { value: error, enumerable: true });
    else if (!empty) Object.defineProperty(values, field.name, { value, enumerable: true });
  }
  return { values, errors };
}
