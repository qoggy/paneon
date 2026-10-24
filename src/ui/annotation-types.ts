import type { ReactNode } from 'react';
import type {
  AnnotationValue,
  Annotation,
  AnnotationTarget,
  JsonValue,
} from '../sdk/annotation.js';

export type AnnotationTargetResolution =
  { status: 'ready'; text?: string } | { status: 'missing' | 'stale'; message: string };
export type AnnotationAdapter<TRef = JsonValue> = {
  resolve(
    target: AnnotationTarget<TRef>,
  ): AnnotationTargetResolution | Promise<AnnotationTargetResolution>;
  locate(target: AnnotationTarget<TRef>): void | Promise<void>;
  /** Optional synchronous source-to-DOM bridge for references represented by another registration. */
  targetRanges?(target: AnnotationTarget<TRef>): readonly Range[];
};
export type AnnotationRootProps<TRef = JsonValue> = {
  children: ReactNode;
  onSubmit: (value: AnnotationValue<TRef>) => Promise<unknown>;
  adapter?: AnnotationAdapter<TRef>;
  disabled?: boolean;
};
export type AnnotationTextProps<TRef = JsonValue> = {
  target: TRef;
  children: string;
  className?: string;
};
export type AnnotationTextRegistration<TRef = JsonValue> = {
  ref: TRef;
  source: string;
  segments: { node: Text; sourceOffsets: (number | null)[] }[];
};
export type AnnotationController<TRef = JsonValue> = {
  value: AnnotationValue<TRef>;
  activeAnnotationId: string | null;
  /** Current temporary text selection; saved active targets when no Surface editor is open. */
  selectionTargets: readonly AnnotationTarget<TRef>[];
  submitting: boolean;
  error: string | null;
  createAnnotation(targets: AnnotationTarget<TRef>[], comment?: string): string;
  editAnnotation(id: string | null): void;
  updateAnnotation(id: string, value: Omit<Annotation<TRef>, 'id'>): void;
  removeAnnotation(id: string): void;
  locate(target: AnnotationTarget<TRef>): Promise<void>;
  registerText: (registration: AnnotationTextRegistration<TRef>) => () => void;
  submit(): Promise<void>;
};

/** Internal UI drafts never enter the SDK feedback payload until Save. */
export type AnnotationEditor<TRef> = {
  id?: string;
  targets: AnnotationTarget<TRef>[];
  comment: string;
};
export type AnnotationUI<TRef> = {
  pending: AnnotationTarget<TRef>[];
  editor: AnnotationEditor<TRef> | null;
  uiError: string | null;
};
