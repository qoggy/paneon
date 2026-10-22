import { createContext, useContext, useSyncExternalStore } from 'react';
import type { FeedbackStore } from './feedback-store';
import type { FeedbackController } from './feedback-types';
import type { JsonValue } from '../sdk/feedback.js';

export const FeedbackContext = createContext<{
  store: FeedbackStore<unknown>;
  disabled: boolean;
} | null>(null);
export function useFeedbackContext<TRef = JsonValue>() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('Feedback components must be inside FeedbackProvider.');
  return { ...context, store: context.store as unknown as FeedbackStore<TRef> };
}
export function useFeedback<TRef = JsonValue>(): FeedbackController<TRef> {
  const { store } = useFeedbackContext<TRef>();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
