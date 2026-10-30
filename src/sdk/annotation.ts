import { z } from 'zod';
import type { JsonValue } from '../shared/types.js';

export type { JsonValue } from '../shared/types.js';
export type AnnotationTextRange = { start: number; end: number; quote: string };
export type AnnotationTarget<TRef = JsonValue> = {
  ref: TRef;
  /** Original src supplied to a standalone Image. */
  src?: string;
  /** Optional source identity within the page-defined reference. */
  sourceRef?: JsonValue;
} & (
  | { type?: undefined; text?: AnnotationTextRange }
  | { type: 'mermaid'; text?: { start: number; end: number; quote?: never } }
);
export type Annotation<TRef = JsonValue> = {
  id: string;
  targets: AnnotationTarget<TRef>[];
  comment: string;
};
export type AnnotationValue<TRef = JsonValue> = {
  annotations: Annotation<TRef>[];
};

// Reject lossy JSON conversions (undefined, sparse arrays, symbols, getters and cycles).
export function isAnnotationJson(
  value: unknown,
  ancestors = new Set<object>(),
): value is JsonValue {
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
        isAnnotationJson(descriptor.value, ancestors)
      );
    }) &&
    (!Array.isArray(value) || keys.length === value.length + 1);
  ancestors.delete(value);
  return valid;
}

/** JSON object key order does not affect semantic target identity. */
export function annotationKey(value: unknown): string {
  if (!isAnnotationJson(value))
    throw new Error('Annotation references must be finite, acyclic JSON.');
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
export function annotationTargetKey(target: {
  ref: unknown;
  src?: string;
  type?: 'mermaid';
  sourceRef?: JsonValue;
  text?: { start: number; end: number; quote?: string };
}): string {
  return annotationKey({
    ref: target.ref,
    ...(target.src === undefined ? {} : { src: target.src }),
    ...(target.type === undefined ? {} : { type: target.type }),
    ...(target.sourceRef === undefined ? {} : { sourceRef: target.sourceRef }),
    ...(target.text === undefined ? {} : { text: target.text }),
  });
}

export function annotationValueSchema<TRef>(refSchema: z.ZodType<TRef>) {
  const reference = z
    .custom<unknown>(isAnnotationJson, 'Reference must be finite, acyclic JSON.')
    .pipe(refSchema);
  const text = z
    .object({
      start: z.number().int().nonnegative(),
      end: z.number().int().positive(),
      quote: z.string().optional(),
    })
    .strict()
    .superRefine((range, ctx) => {
      if (range.end <= range.start)
        ctx.addIssue({
          code: 'custom',
          message: 'Text range end must exceed start.',
          path: ['end'],
        });
      if (range.quote !== undefined && range.quote.length !== range.end - range.start)
        ctx.addIssue({
          code: 'custom',
          message: 'Quote must match the UTF-16 range length.',
          path: ['quote'],
        });
    });
  const targetSchema = z
    .object({
      ref: reference,
      src: z.string().optional(),
      type: z.literal('mermaid').optional(),
      sourceRef: z
        .custom<JsonValue>(isAnnotationJson, 'Source reference must be JSON.')
        .pipe(z.json())
        .optional(),
      text: text.optional(),
    })
    .strict()
    .superRefine((target, ctx) => {
      if (target.text && target.type !== 'mermaid' && target.text.quote === undefined)
        ctx.addIssue({
          code: 'custom',
          message: 'A text target requires its original quote.',
          path: ['text', 'quote'],
        });
    });
  // Preserve object-shape composition while exposing the refined target union to consumers.
  const target = targetSchema as typeof targetSchema & z.ZodType<AnnotationTarget<TRef>>;
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
        if (!isAnnotationJson(item.ref)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Reference must be JSON.',
            path: ['targets', index, 'ref'],
          });
          return;
        }
        const key = annotationTargetKey(item);
        if (seen.has(key))
          ctx.addIssue({ code: 'custom', message: 'Duplicate target.', path: ['targets', index] });
        seen.add(key);
      });
    });
  return z
    .object({ annotations: z.array(annotation) })
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
