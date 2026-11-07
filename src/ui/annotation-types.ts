import type {
  AnnotationValue,
  Annotation,
  AnnotationTarget,
  JsonValue,
  ElementAnnotationRef,
} from '../sdk/annotation.js';

export type AnnotationAdapter<TRef = JsonValue> = {
  locate(target: AnnotationTarget<TRef>): void | Promise<void>;
};
export type PageAnnotationOptions<TRef = JsonValue> = {
  onSubmit: (value: AnnotationValue<TRef | ElementAnnotationRef>) => Promise<unknown>;
  adapter?: AnnotationAdapter<TRef>;
  disabled?: boolean;
  allowEmptySubmit?: boolean;
  /** Re-enable editing after a page has locked its submitted feedback. */
  onRequestEdit?: () => void;
};
export type AnnotationTextProps<TRef = JsonValue> = {
  target: TRef;
  children: string;
  className?: string;
};
/** Renderer-owned display information, never included in submitted annotations. */
export type AnnotationPresentation = {
  summary?: string;
  anchor?: DOMRect;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
};
export type AnnotationTextRegistration<TRef = JsonValue> = {
  ref: TRef;
  sourceRef?: JsonValue;
  source: string;
  segments: { node: Text; sourceOffsets: (number | null)[] }[];
  /** Reveal renderer-owned content, including text hidden by collapsed context. */
  locate?: (target: AnnotationTarget<TRef>) => void | Promise<void>;
  presentation?: (targets: readonly AnnotationTarget<TRef>[]) => AnnotationPresentation | undefined;
};
export type AnnotationController<TRef = JsonValue> = {
  value: AnnotationValue<TRef>;
  activeAnnotationId: string | null;
  /** Current temporary text selection; saved active targets when no Surface editor is open. */
  selectionTargets: readonly AnnotationTarget<TRef>[];
  submitting: boolean;
  error: string | null;
  /** Open the shared editor, reusing an annotation with the same targets when one exists. */
  beginAnnotation(targets: AnnotationTarget<TRef>[]): void;
  createAnnotation(targets: AnnotationTarget<TRef>[], comment?: string): string;
  editAnnotation(id: string | null): void;
  updateAnnotation(id: string, value: Omit<Annotation<TRef>, 'id'>): void;
  removeAnnotation(id: string): void;
  /** Whether mounted renderers represent the target, including media still loading. */
  isTargetRendered(target: AnnotationTarget<TRef>): boolean;
  locate(target: AnnotationTarget<TRef>): Promise<void>;
  registerText: (registration: AnnotationTextRegistration<TRef>) => () => void;
  submit(): Promise<void>;
};

/** Internal UI drafts never enter the SDK feedback payload until Save. */
export type AnnotationEditor<TRef> = {
  id?: string;
  draftId: string;
  targets: AnnotationTarget<TRef>[];
  comment: string;
  anchor?: { marker: string } | DOMRect | 'bottom-right';
};
export type AnnotationUI<TRef> = {
  /** Bounded UI recoveries; each toast owns its own lifetime and action. */
  deletions: {
    id: string;
    number: number;
    description: string;
    undo(): boolean;
    discard(): void;
  }[];
  hoveredAnnotationId: string | null;
  focusedAnnotationId: string | null;
  pending: AnnotationTarget<TRef>[];
  editor: AnnotationEditor<TRef> | null;
  editorAttention: number;
  uiError: string | null;
};
