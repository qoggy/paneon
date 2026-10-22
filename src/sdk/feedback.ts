import { z } from 'zod';
import type { JsonValue } from '../shared/types.js';

export type { JsonValue } from '../shared/types.js';
export type FeedbackTextRange = { start: number; end: number; quote: string };
export type FeedbackTarget<TRef = JsonValue> = { ref: TRef; text?: FeedbackTextRange };
export type FeedbackAnnotation<TRef = JsonValue> = {
  id: string;
  targets: FeedbackTarget<TRef>[];
  comment: string;
};
export type Feedback<TRef = JsonValue> = {
  annotations: FeedbackAnnotation<TRef>[];
  comment?: string;
};

// Reject lossy JSON conversions (undefined, sparse arrays, symbols, getters and cycles).
export function isFeedbackJson(value: unknown, ancestors = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return false;
  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  const valid =
    keys.every((key) => {
      if (Array.isArray(value) && key === 'length') return true;
      if (typeof key !== 'string') return false;
      if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return (
        !!descriptor &&
        'value' in descriptor &&
        descriptor.enumerable === true &&
        isFeedbackJson(descriptor.value, ancestors)
      );
    }) &&
    (!Array.isArray(value) || keys.length === value.length + 1);
  ancestors.delete(value);
  return valid;
}

/** JSON object key order does not affect semantic target identity. */
export function feedbackKey(value: unknown): string {
  if (!isFeedbackJson(value)) throw new Error('Feedback references must be finite, acyclic JSON.');
  const sort = (item: JsonValue): JsonValue => {
    if (Array.isArray(item)) return item.map(sort);
    if (item !== null && typeof item === 'object')
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, sort(item[key])]),
      );
    return item;
  };
  return JSON.stringify(sort(value));
}

// Optional text is omitted from semantic identity, including explicit undefined from TS callers.
export function feedbackTargetKey(target: FeedbackTarget<unknown>): string {
  return feedbackKey({
    ref: target.ref,
    ...(target.text === undefined ? {} : { text: target.text }),
  });
}

export function feedbackSchema<TRef>(refSchema: z.ZodType<TRef>) {
  const reference = z
    .custom<unknown>(isFeedbackJson, 'Reference must be finite, acyclic JSON.')
    .pipe(refSchema);
  const text = z
    .object({
      start: z.number().int().nonnegative(),
      end: z.number().int().positive(),
      quote: z.string(),
    })
    .strict()
    .superRefine((range, ctx) => {
      if (range.end <= range.start)
        ctx.addIssue({
          code: 'custom',
          message: 'Text range end must exceed start.',
          path: ['end'],
        });
      if (range.quote.length !== range.end - range.start)
        ctx.addIssue({
          code: 'custom',
          message: 'Quote must match the UTF-16 range length.',
          path: ['quote'],
        });
    });
  const target = z.object({ ref: reference, text: text.optional() }).strict();
  const annotation = z
    .object({
      id: z.string().min(1),
      targets: z.array(target).min(1),
      comment: z.string(),
    })
    .strict()
    .superRefine((entry, ctx) => {
      const seen = new Set<string>();
      entry.targets.forEach((item, index) => {
        if (!isFeedbackJson(item.ref)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Reference must be JSON.',
            path: ['targets', index, 'ref'],
          });
          return;
        }
        const key = feedbackTargetKey(item);
        if (seen.has(key))
          ctx.addIssue({ code: 'custom', message: 'Duplicate target.', path: ['targets', index] });
        seen.add(key);
      });
    });
  return z
    .object({ annotations: z.array(annotation), comment: z.string().optional() })
    .strict()
    .superRefine((value, ctx) => {
      const seen = new Set<string>();
      value.annotations.forEach((entry, index) => {
        if (seen.has(entry.id))
          ctx.addIssue({
            code: 'custom',
            message: 'Duplicate annotation id.',
            path: ['annotations', index, 'id'],
          });
        seen.add(entry.id);
      });
    });
}
