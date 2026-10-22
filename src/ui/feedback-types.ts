import type { ReactNode } from 'react';
import type { Feedback, FeedbackAnnotation, FeedbackTarget, JsonValue } from '../sdk/feedback.js';

export type TargetResolution =
  { status: 'ready'; text?: string } | { status: 'missing' | 'stale'; message: string };
export type FeedbackAdapter<TRef = JsonValue> = {
  resolve(target: FeedbackTarget<TRef>): TargetResolution | Promise<TargetResolution>;
  locate(target: FeedbackTarget<TRef>): void | Promise<void>;
  /** Optional synchronous source-to-DOM bridge for references represented by another registration. */
  targetRanges?(target: FeedbackTarget<TRef>): readonly Range[];
};
export type FeedbackProviderProps<TRef = JsonValue> = {
  children: ReactNode;
  onSubmit: (value: Feedback<TRef>) => Promise<unknown>;
  adapter?: FeedbackAdapter<TRef>;
  disabled?: boolean;
};
export type FeedbackTargetProps<TRef = JsonValue> = {
  target: TRef;
  asChild?: boolean;
  children: ReactNode;
};
export type FeedbackTextProps<TRef = JsonValue> = {
  target: TRef;
  text: string;
  className?: string;
};
export type TextRegistration<TRef = JsonValue> = {
  ref: TRef;
  source: string;
  segments: { node: Text; sourceOffsets: (number | null)[] }[];
};
export type FeedbackController<TRef = JsonValue> = {
  mode: 'browse' | 'select';
  value: Feedback<TRef>;
  activeAnnotationId: string | null;
  /** Current temporary object selection; saved active targets when no Surface editor is open. */
  selectionTargets: readonly FeedbackTarget<TRef>[];
  submitting: boolean;
  error: string | null;
  setMode(mode: 'browse' | 'select'): void;
  createAnnotation(targets: FeedbackTarget<TRef>[], comment?: string): string;
  editAnnotation(id: string | null): void;
  updateAnnotation(id: string, value: Omit<FeedbackAnnotation<TRef>, 'id'>): void;
  removeAnnotation(id: string): void;
  toggleTarget(target: FeedbackTarget<TRef>): void;
  setComment(comment: string): void;
  locate(target: FeedbackTarget<TRef>): Promise<void>;
  registerText: (registration: TextRegistration<TRef>) => () => void;
  submit(): Promise<void>;
};

/** Internal UI drafts never enter the SDK feedback payload until Save. */
export type FeedbackEditor<TRef> = {
  kind: 'annotation' | 'overall';
  id?: string;
  targets: FeedbackTarget<TRef>[];
  comment: string;
};
export type FeedbackUI<TRef> = {
  pending: FeedbackTarget<TRef>[];
  pendingKind: 'text' | 'objects';
  editor: FeedbackEditor<TRef> | null;
  uiError: string | null;
};
