import type { ComponentType } from 'react';
import { z } from 'zod';
export { z };
export type ActionContext = {
  signal: AbortSignal;
  secrets: { use<T>(ref: string, callback: (value: string) => T | Promise<T>): Promise<T> };
};
export type Action<
  I = unknown,
  O = unknown,
  K extends 'query' | 'mutation' = 'query' | 'mutation',
> = ((input: I) => Promise<O>) & {
  kind: K;
  input: z.ZodType<I>;
  handler: (ctx: ActionContext, input: I) => O | Promise<O>;
  credential?: { label: string; ttlSeconds?: number };
  actionId?: string;
};
export function serverAction<I, O, K extends 'query' | 'mutation' = 'mutation'>(options: {
  kind?: K;
  input: z.ZodType<I>;
  handler: (ctx: ActionContext, input: I) => O | Promise<O>;
  credential?: { label: string; ttlSeconds?: number };
}): Action<I, O, K> {
  const call = Object.assign(
    (_input: I): Promise<O> =>
      Promise.reject(new Error('Actions must be invoked through a running Paneon panel.')),
    options,
    { kind: options.kind ?? 'mutation' },
  );
  return call;
}
export type PanelDefinition<I = unknown> = {
  id: string;
  requires: { paneon: string };
  input: z.ZodType<I>;
  events?: Record<string, z.ZodType>;
  render: ComponentType;
};
export function definePanel<I>(definition: PanelDefinition<I>): PanelDefinition<I> {
  return definition;
}
export { feedbackSchema } from './feedback.js';
export type {
  Feedback,
  FeedbackTarget,
  FeedbackAnnotation,
  FeedbackTextRange,
  JsonValue,
} from './feedback.js';
