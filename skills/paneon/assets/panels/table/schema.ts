import { annotationValueSchema, z } from '@qoggy/paneon/sdk';
import type { AnnotationTarget } from '@qoggy/paneon/sdk';
import { validSourceRange } from '../../shared/markdown-annotation-schema.ts';
const label = z.string().refine((value) => value.trim().length > 0, 'Must not be blank.');
const cell = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
// Preserve unrestricted own data keys, including __proto__, while keeping metadata serializable.
const rowSchema = z
  .unknown()
  .refine(
    (value) => {
      if (
        value === null ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      )
        return false;
      return Reflect.ownKeys(value).every((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return (
          typeof key === 'string' &&
          !!descriptor &&
          'value' in descriptor &&
          descriptor.enumerable &&
          cell.safeParse(descriptor.value).success
        );
      });
    },
    {
      message: 'Row must contain only own string, finite number, boolean or null data fields.',
      abort: true,
    },
  )
  .meta({ type: 'object', additionalProperties: z.toJSONSchema(cell) }) as z.ZodType<
  Record<string, z.infer<typeof cell>>
>;
export const tableParamsSchema = z
  .object({
    title: label,
    description: z.string().optional(),
    columns: z
      .array(
        z
          .object({ key: label, label, type: z.enum(['text', 'number', 'boolean']).optional() })
          .strict(),
      )
      .min(1),
    rows: z.array(rowSchema),
    pageSize: z.number().int().min(1).max(1000).optional(),
  })
  .strict()
  .superRefine((params, ctx) => {
    const keys = new Set<string>();
    params.columns.forEach((column, index) => {
      if (keys.has(column.key))
        ctx.addIssue({
          code: 'custom',
          path: ['columns', index, 'key'],
          message: 'Duplicate column key.',
        });
      keys.add(column.key);
      params.rows.forEach((row, rowIndex) => {
        const value = row[column.key];
        if (!Object.hasOwn(row, column.key))
          ctx.addIssue({
            code: 'custom',
            path: ['rows', rowIndex, column.key],
            message: 'Declared column must be an own field; use null for an empty value.',
          });
        else if (
          value !== null &&
          column.type &&
          column.type !== 'text' &&
          typeof value !== column.type
        )
          ctx.addIssue({
            code: 'custom',
            path: ['rows', rowIndex, column.key],
            message: `Expected ${column.type} or null.`,
          });
      });
    });
  });
export type TableParams = z.infer<typeof tableParamsSchema>;
export const tableRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('row'), rowIndex: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal('column'), columnKey: label }).strict(),
  z.object({ kind: z.literal('header'), columnKey: label }).strict(),
  z
    .object({ kind: z.literal('cell'), rowIndex: z.number().int().nonnegative(), columnKey: label })
    .strict(),
]);
export type TableRef = z.infer<typeof tableRefSchema>;
export const tableSubmittedSchema = annotationValueSchema(tableRefSchema).safeExtend({
  replacesEventId: z.number().int().positive().optional(),
});
export function tableTargetError(
  params: TableParams,
  target: AnnotationTarget<TableRef>,
): string | null {
  const ref = tableRefSchema.safeParse(target.ref);
  if (!ref.success) return 'Invalid table reference.';
  const value = ref.data;
  if ('rowIndex' in value && value.rowIndex >= params.rows.length)
    return 'Unknown original rowIndex.';
  if ('columnKey' in value && !params.columns.some((column) => column.key === value.columnKey))
    return 'Unknown column key.';
  if (target.text) {
    if (value.kind !== 'cell' && value.kind !== 'header')
      return 'Only header labels and string cells support text ranges.';
    const source =
      value.kind === 'header'
        ? params.columns.find((column) => column.key === value.columnKey)?.label
        : params.rows[value.rowIndex][value.columnKey];
    if (typeof source !== 'string' || !validSourceRange(source, target))
      return value.kind === 'header'
        ? 'Text range does not match the original header label.'
        : 'Text range does not match the original string cell.';
  }
  return null;
}
export function completeTableSchema(params: TableParams) {
  return tableSubmittedSchema.superRefine((value, ctx) => {
    value.annotations.forEach((entry, index) =>
      entry.targets.forEach((target, at) => {
        if (target.sourceRef !== undefined) return;
        const message = tableTargetError(params, target);
        if (message)
          ctx.addIssue({ code: 'custom', path: ['annotations', index, 'targets', at], message });
      }),
    );
    if (value.replacesEventId === undefined && !value.annotations.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Save at least one annotation before submitting.',
      });
  });
}
export const cellText = (value: TableParams['rows'][number][string]) =>
  value === null ? '' : String(value);
export type TableView = {
  search: string;
  filters: Record<string, string>;
  sort: { key: string; descending: boolean } | null;
};
export function visibleRows(params: TableParams, view: TableView) {
  const includes = (value: string, query: string) =>
    value.toLowerCase().includes(query.toLowerCase());
  const result = params.rows
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(
      ({ row }) =>
        params.columns.some((column) => includes(cellText(row[column.key]), view.search)) &&
        params.columns.every((column) =>
          includes(
            cellText(row[column.key]),
            Object.hasOwn(view.filters, column.key) ? view.filters[column.key] : '',
          ),
        ),
    );
  const sort = view.sort;
  if (sort) {
    const column = params.columns.find((item) => item.key === sort.key);
    if (column)
      result.sort((a, b) => {
        const left = a.row[column.key],
          right = b.row[column.key];
        if (left === null || right === null)
          return left === right ? a.rowIndex - b.rowIndex : left === null ? 1 : -1;
        const compare =
          column.type === 'number' || column.type === 'boolean'
            ? Number(left) - Number(right)
            : cellText(left).localeCompare(cellText(right));
        return (sort.descending ? -compare : compare) || a.rowIndex - b.rowIndex;
      });
  }
  return result;
}
