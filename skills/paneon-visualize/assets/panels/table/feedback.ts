import type { TableFeedback, TableSubmitted } from './schema.ts';

/** Publish opinions without editing ids, preserving each opinion's complete target list. */
export function publicTableFeedback(feedback: TableFeedback): TableSubmitted {
  return {
    ...feedback,
    annotations: feedback.annotations.map(({ targets, comment }) => ({ targets, comment })),
  };
}
