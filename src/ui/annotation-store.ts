import { z } from 'zod';
import {
  annotationTargetKey,
  annotationValueSchema,
  isElementAnnotationRef,
} from '../sdk/annotation.js';
import type { AnnotationValue, AnnotationTarget, JsonValue } from '../sdk/annotation.js';
import type { FilePreview, FileReferenceRequest } from '../shared/file-references';
import type { ReadFileReference } from './file-reference-context';
import type {
  AnnotationController,
  AnnotationEditor,
  PageAnnotationOptions,
  AnnotationTextRegistration,
  AnnotationPresentation,
  AnnotationUI,
} from './annotation-types';
import { selectedTextTargets, validTextRange } from './annotation-selection';
import {
  createRectClipper,
  scrollElementAnnotationIntoView,
  waitForAnnotationLocation,
} from './annotation-geometry';
import type { AnnotationViewport, ClippedRect } from './annotation-geometry';
import { indexTextSegments, textSegmentsInRange } from './annotation-text-index';

export type FileSnapshot<TRef = unknown> = {
  ref: TRef;
  sourceRef: JsonValue;
  file: FilePreview;
};
type AnnotationTargetResolution =
  { status: 'ready'; text?: string } | { status: 'missing' | 'stale'; message: string };
export type FileAnnotationView<TRef = unknown> = {
  id: number;
  ref: TRef;
  reference: FileReferenceRequest;
  reader?: ReadFileReference;
  trigger?: HTMLElement;
  snapshot?: FileSnapshot<TRef>;
  open: boolean;
};

let schema: ReturnType<typeof annotationValueSchema> | undefined;
function getSchema() {
  return (schema ??= annotationValueSchema(z.unknown()));
}
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}
const copy = <T>(value: T): T => structuredClone(value);
const sourceKey = (target: AnnotationTarget<unknown>) =>
  annotationTargetKey({ ref: target.ref, sourceRef: target.sourceRef });
const targetsKey = (targets: readonly AnnotationTarget<unknown>[]) =>
  JSON.stringify(targets.map(annotationTargetKey).sort());

/** Renderer-owned media source and readiness; geometry is available after loading succeeds. */
export type AnnotationObjectRegistration<TRef> = {
  target: AnnotationTarget<TRef>;
  source: string;
  element?: Element;
  bounds?: () => DOMRect | undefined;
  error?: string;
  summary: string;
  anchor?: () => DOMRect | undefined;
};

export class AnnotationStore<TRef> {
  private listeners = new Set<() => void>();
  private texts = new Map<
    symbol,
    AnnotationTextRegistration<TRef> & {
      index: ReturnType<typeof indexTextSegments>;
    }
  >();
  private sources = new Map<string, string>();
  private objects = new Map<symbol, AnnotationObjectRegistration<TRef>>();
  /** Latest registered source per identity, kept after unmount so changes stay detectable. */
  private lastSources = new Map<string, string>();
  private fileSnapshots = new Map<string, FileSnapshot<TRef>>();
  private fileView: FileAnnotationView<TRef> | null = null;
  private fileSequence = 0;
  overlayContainer: HTMLElement | null = null;
  private mediaViewTarget: AnnotationTarget<TRef> | undefined;
  private fileReady: (() => void) | undefined;
  private locating = 0;
  private options: PageAnnotationOptions<TRef> | undefined;
  private state: AnnotationController<TRef> & AnnotationUI<TRef>;
  private surfaceCount = 0;
  private numbers = new Map<string, number>();
  private deletionOrder = new Map<string, number>();
  private stagedSources = new Map<string, string>();
  private editorSources = new Map<string, string>();
  private summaries = new Map<string, string>();
  private registryListeners = new Set<() => void>();
  private measurementRanges = new WeakMap<Document, Range>();

  constructor(options?: PageAnnotationOptions<TRef>) {
    this.options = options;
    this.state = {
      deletions: [],
      hoveredAnnotationId: null,
      focusedAnnotationId: null,
      pending: [],
      editor: null,
      editorAttention: 0,
      uiError: null,
      value: frozen({ annotations: [] }),
      activeAnnotationId: null,
      selectionTargets: [],
      submitting: false,
      error: null,
      beginAnnotation: this.beginAnnotation,
      createAnnotation: this.createAnnotation,
      editAnnotation: this.editAnnotation,
      updateAnnotation: this.updateAnnotation,
      removeAnnotation: this.removeAnnotation,
      isTargetRendered: this.isTargetRendered,
      locate: this.locate,
      registerText: this.registerText,
      submit: this.submit,
    };
  }
  getFileView = () => this.fileView;
  setOverlayContainer = (container: HTMLElement | null) => {
    if (this.overlayContainer === container) return;
    this.overlayContainer = container;
    this.publish({});
  };
  setMediaView = (target: AnnotationTarget<TRef> | undefined) => {
    this.mediaViewTarget = target;
    this.registryChanged();
  };
  get mediaViewActive() {
    return this.mediaViewTarget !== undefined;
  }
  openFile = (
    reference: FileReferenceRequest,
    ref: TRef,
    trigger?: HTMLElement,
    reader?: ReadFileReference,
  ) => {
    if (this.state.editor) {
      this.requestEditorAttention();
      return;
    }
    this.fileReady?.();
    this.fileReady = undefined;
    this.dismissSelection();
    this.fileView = {
      id: ++this.fileSequence,
      ref: copy(ref),
      reference,
      trigger,
      reader,
      open: true,
    };
    this.pruneFiles();
    this.publish({});
  };
  closeFile = () => {
    if (this.state.editor) {
      this.requestEditorAttention();
      return;
    }
    this.dismissSelection();
    if (this.fileView) this.fileView = { ...this.fileView, open: false };
    this.fileReady?.();
    this.fileReady = undefined;
    this.pruneFiles();
    this.publish({});
  };
  createFileSnapshot = async (file: FilePreview, ref: TRef): Promise<FileSnapshot<TRef>> => {
    const reference = copy(ref);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(file.text));
    const snapshotId =
      'sha256:' +
      Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return { file, ref: reference, sourceRef: { path: file.path, snapshotId } };
  };
  retainFile = (snapshot: FileSnapshot<TRef>) => {
    this.fileSnapshots.set(sourceKey(snapshot), snapshot);
    if (this.fileView) this.fileView = { ...this.fileView, snapshot };
    this.pruneFiles();
  };
  private pruneFiles() {
    const refs = new Set(
      [
        ...this.state.value.annotations.flatMap((entry) => entry.targets),
        ...(this.state.editor?.targets ?? []),
        ...this.state.pending,
      ].map(sourceKey),
    );
    if (this.fileView?.open && this.fileView.snapshot) refs.add(sourceKey(this.fileView.snapshot));
    for (const key of this.fileSnapshots.keys()) if (!refs.has(key)) this.fileSnapshots.delete(key);
  }
  fileMounted = (id: number) => {
    if (this.fileView?.id !== id) return;
    this.fileReady?.();
    this.fileReady = undefined;
  };
  private showFile(snapshot: FileSnapshot<TRef>): Promise<void> {
    this.fileReady?.();
    return new Promise((resolve) => {
      this.fileReady = resolve;
      this.fileView = {
        id: ++this.fileSequence,
        ref: snapshot.ref,
        reference: {
          href: 'file://' + snapshot.file.path.split('/').map(encodeURIComponent).join('/'),
        },
        snapshot,
        open: true,
      };
      this.publish({});
    });
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  setOptions = (options: PageAnnotationOptions<TRef> | undefined) => {
    const previous = this.options;
    this.options = options;
    if (
      !!previous !== !!options ||
      previous?.disabled !== options?.disabled ||
      previous?.allowEmptySubmit !== options?.allowEmptySubmit ||
      !!previous?.onRequestEdit !== !!options?.onRequestEdit
    )
      this.publish({});
  };
  get configuration() {
    return this.options;
  }
  get disabled() {
    return !this.options || this.options.disabled === true || this.state.submitting;
  }
  private publish(patch: Partial<AnnotationController<TRef> & AnnotationUI<TRef>>) {
    const next = { ...this.state, ...patch };
    next.selectionTargets = next.editor
      ? next.editor.targets
      : next.pending.length
        ? next.pending
        : (next.value.annotations.find((entry) => entry.id === next.activeAnnotationId)?.targets ??
          []);
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
  private assertEditable() {
    if (this.disabled)
      throw new Error('Annotations cannot be edited while disabled or submitting.');
  }
  private save(value: AnnotationValue<TRef>, activeAnnotationId = this.state.activeAnnotationId) {
    getSchema().parse(value);
    const groups = new Set<string>();
    for (const entry of value.annotations) {
      const key = targetsKey(entry.targets);
      groups.add(key);
      const summary = this.presentation(entry.targets)?.summary;
      if (summary !== undefined) this.summaries.set(key, summary);
    }
    for (const key of this.summaries.keys()) if (!groups.has(key)) this.summaries.delete(key);
    const retained = new Set(
      value.annotations.flatMap((entry) => entry.targets.map(annotationTargetKey)),
    );
    for (const key of this.sources.keys()) if (!retained.has(key)) this.sources.delete(key);
    this.numbers = new Map(
      value.annotations.map((annotation, index) => [annotation.id, index + 1]),
    );
    this.publish({ value: frozen(copy(value)), activeAnnotationId, error: null });
    this.pruneFiles();
  }
  private remember(targets: AnnotationTarget<TRef>[]) {
    for (const target of targets) {
      if (!target.text || this.sources.has(annotationTargetKey(target))) continue;
      const registration = [...this.texts.values()].find(
        (item) => sourceKey(item) === sourceKey(target),
      );
      if (registration) this.sources.set(annotationTargetKey(target), registration.source);
    }
  }
  createAnnotation: AnnotationController<TRef>['createAnnotation'] = (targets, comment = '') => {
    this.assertEditable();
    const id = crypto.randomUUID();
    const value = {
      ...this.state.value,
      annotations: [...this.state.value.annotations, { id, targets, comment }],
    };
    this.save(value, id);
    if (this.state.deletions.length) this.deletionOrder.set(id, this.deletionOrder.size);
    this.remember(targets);
    return id;
  };
  editAnnotation: AnnotationController<TRef>['editAnnotation'] = (id) => {
    this.assertEditable();
    if (id !== null && !this.state.value.annotations.some((entry) => entry.id === id))
      throw new Error('Unknown annotation.');
    this.publish({ activeAnnotationId: id, error: null });
  };
  updateAnnotation: AnnotationController<TRef>['updateAnnotation'] = (id, update) => {
    this.assertEditable();
    if (!this.state.value.annotations.some((entry) => entry.id === id))
      throw new Error('Unknown annotation.');
    this.save({
      ...this.state.value,
      annotations: this.state.value.annotations.map((entry) =>
        entry.id === id ? { ...update, id } : entry,
      ),
    });
    this.remember(update.targets);
  };
  removeAnnotation: AnnotationController<TRef>['removeAnnotation'] = (id) => {
    this.assertEditable();
    if (this.state.editor) {
      this.requestEditorAttention();
      return;
    }
    this.removeSavedAnnotation(id);
  };
  /** Shared controls offer undo; programmatic removals keep their existing behavior. */
  removeAnnotationWithUndo = (id: string) => {
    this.assertEditable();
    if (this.state.editor) {
      this.requestEditorAttention();
      return;
    }
    this.removeSavedAnnotation(id, true);
  };
  private removeSavedAnnotation(id: string, undoable = false) {
    const original = this.state.value.annotations;
    const index = original.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const annotation = original[index];
    let deletion: AnnotationUI<TRef>['deletions'][number] | undefined;
    if (undoable) {
      if (!this.state.deletions.length)
        this.deletionOrder = new Map(original.map((entry, position) => [entry.id, position]));
      // save() prunes deleted targets, so retain their exact evidence, not just the comment.
      const sources = new Map<string, string>();
      const files = new Map<string, FileSnapshot<TRef>>();
      for (const target of annotation.targets) {
        const key = annotationTargetKey(target);
        const source = this.sources.get(key);
        if (source !== undefined) sources.set(key, source);
        const file = this.fileSnapshots.get(sourceKey(target));
        if (file) files.set(sourceKey(target), file);
      }
      const summary = this.presentation(annotation.targets)?.summary;
      const recovery = {
        id: crypto.randomUUID(),
        number: this.numberFor(annotation.id),
        description: (
          annotation.comment.trim() ||
          summary ||
          annotation.targets[0]?.text?.quote ||
          ''
        )
          .replace(/\s+/g, ' ')
          .slice(0, 120),
        undo: () => {
          if (!this.state.deletions.includes(recovery) || this.disabled) return false;
          if (this.state.editor) {
            this.requestEditorAttention();
            return false;
          }
          const annotations = [...this.state.value.annotations];
          const rank = this.deletionOrder.get(annotation.id);
          const position = annotations.findIndex((entry) => {
            const current = this.deletionOrder.get(entry.id);
            return rank !== undefined && current !== undefined && current > rank;
          });
          annotations.splice(position < 0 ? annotations.length : position, 0, annotation);
          for (const [key, source] of sources) this.sources.set(key, source);
          for (const [key, file] of files) this.fileSnapshots.set(key, file);
          if (summary !== undefined) this.summaries.set(targetsKey(annotation.targets), summary);
          this.save({ annotations }, annotation.id);
          recovery.discard();
          return true;
        },
        discard: () => {
          if (!this.state.deletions.includes(recovery)) return;
          const deletions = this.state.deletions.filter((entry) => entry !== recovery);
          if (!deletions.length) this.deletionOrder.clear();
          this.publish({ deletions });
        },
      };
      deletion = recovery;
    }
    this.save(
      {
        ...this.state.value,
        annotations: this.state.value.annotations.filter((entry) => entry.id !== id),
      },
      this.state.activeAnnotationId === id ? null : this.state.activeAnnotationId,
    );
    if (deletion) this.publish({ deletions: [...this.state.deletions, deletion].slice(-3) });
  }
  registerText: AnnotationController<TRef>['registerText'] = (registration) => {
    sourceKey(registration);
    const nodes = new Set<Text>();
    for (const { node, sourceOffsets } of registration.segments) {
      if (node.nodeType !== 3 || nodes.has(node))
        throw new Error('Text segments must contain unique DOM Text nodes.');
      nodes.add(node);
      if (sourceOffsets.length !== node.data.length + 1)
        throw new Error('Text sourceOffsets must map every DOM UTF-16 boundary.');
      let previous = -1;
      for (const offset of sourceOffsets) {
        if (offset === null) continue;
        if (
          !Number.isInteger(offset) ||
          offset < 0 ||
          offset > registration.source.length ||
          offset < previous
        )
          throw new Error('Text sourceOffsets must be monotone source boundaries.');
        previous = offset;
      }
    }
    const id = Symbol();
    const segments = registration.segments.map((segment) => ({
      ...segment,
      sourceOffsets: [...segment.sourceOffsets],
    }));
    this.texts.set(id, {
      ref: copy(registration.ref),
      ...(registration.sourceRef === undefined ? {} : { sourceRef: copy(registration.sourceRef) }),
      source: registration.source,
      locate: registration.locate,
      presentation: registration.presentation,
      segments,
      index: indexTextSegments(segments),
    });
    this.lastSources.set(sourceKey(registration), registration.source);
    this.registryChanged();
    return () => {
      this.texts.delete(id);
      this.registryChanged();
    };
  };
  registerObject = (registration: AnnotationObjectRegistration<TRef>) => {
    const id = Symbol();
    this.objects.set(id, { ...registration, target: copy(registration.target) });
    this.lastSources.set(sourceKey(registration.target), registration.source);
    this.registryChanged();
    return () => {
      this.objects.delete(id);
      this.registryChanged();
    };
  };
  private objectPresentations(target: AnnotationTarget<TRef>) {
    const key = annotationTargetKey(target);
    const modal = this.overlayContainer?.closest('[role="dialog"]') ?? this.overlayContainer;
    return [...this.objects.values()].filter(
      (item): item is AnnotationObjectRegistration<TRef> & { element: Element } =>
        annotationTargetKey(item.target) === key &&
        !!item.element?.isConnected &&
        (!isElementAnnotationRef(target.ref) ||
          item.element.checkVisibility({ visibilityProperty: true })) &&
        (!modal || modal.contains(item.element)),
    );
  }
  private async locateObject(target: AnnotationTarget<TRef>, request: number) {
    const key = annotationTargetKey(target);
    const source = sourceKey(target);
    const start = target.text?.start;
    while (request === this.locating) {
      const object = this.objectPresentations(target)[0];
      // Earlier media can grow after this object is ready, invalidating scrollIntoView's
      // destination. Wait for those renderers in the same source before measuring it.
      const precedingMediaLoading =
        start !== undefined &&
        [...this.objects.values()].some(
          (item) =>
            sourceKey(item.target) === source &&
            item.target.text &&
            item.target.text.start < start &&
            !item.element &&
            !item.error,
        );
      if (object && !precedingMediaLoading) return object.element;
      const registrations = [...this.objects.values()].filter(
        (item) => annotationTargetKey(item.target) === key,
      );
      if (!registrations.length) {
        // Navigation removed the loading media. Invalidate this request instead of opening
        // its editor in the view the person has just switched to.
        this.locating++;
        return;
      }
      if (!object && !registrations.some((item) => !item.element && !item.error)) {
        const failed = registrations.find((item) => item.error);
        if (failed) throw new Error(failed.error);
        return;
      }
      // Loading media registers its identity before its DOM is ready. Resume after the renderer
      // reports success or failure; awaiting also lets cleanup/register pairs finish together.
      await new Promise<void>((resolve) => {
        const unsubscribe = this.subscribeRegistry(() => {
          unsubscribe();
          resolve();
        });
      });
    }
  }
  isMediaTarget = (target: AnnotationTarget<TRef>) => this.objectPresentations(target).length > 0;
  targetBorderRadius = (target: AnnotationTarget<TRef>) => {
    const element = this.objectPresentations(target)[0]?.element;
    return element ? getComputedStyle(element).borderRadius : '0px';
  };
  previewAnnotation = (id: string | null, source: 'hover' | 'focus') => {
    const key = source === 'hover' ? 'hoveredAnnotationId' : 'focusedAnnotationId';
    if (this.state[key] !== id) this.publish({ [key]: id });
  };
  /** Resolve live renderer geometry while retaining readable summaries after unmount. */
  presentation = (
    targets: readonly AnnotationTarget<TRef>[],
  ): AnnotationPresentation | undefined => {
    for (const target of targets) {
      const object = this.objectPresentations(target)[0];
      if (object)
        return {
          summary: object.summary,
          anchor: object.anchor?.() ?? object.element.getBoundingClientRect(),
          side: 'bottom',
          align: 'end',
        };
    }
    for (const registration of this.texts.values()) {
      const presentation = registration.presentation?.(targets);
      if (presentation) return presentation;
    }
    const summary = this.summaries.get(targetsKey(targets));
    return summary === undefined ? undefined : { summary };
  };
  /** Internal renderer bridge: keep the source being annotated until its drafts are removed. */
  retainedSource(ref: TRef): string | undefined {
    const key = sourceKey({ ref });
    const targets = [
      ...this.state.value.annotations.flatMap((entry) => entry.targets),
      ...(this.state.editor?.targets ?? []),
      ...this.state.pending,
    ];
    for (const target of targets) {
      if (!target.text || sourceKey(target) !== key) continue;
      const id = annotationTargetKey(target);
      const source =
        this.sources.get(id) ?? this.editorSources.get(id) ?? this.stagedSources.get(id);
      if (source !== undefined) return source;
    }
    return undefined;
  }
  selectText = (selection: Selection) => {
    if (this.disabled || !this.surfaceCount) return;
    const targets = selectedTextTargets(selection, this.texts.values());
    this.stageSources(targets);
    this.publish({
      pending: targets,
      uiError: null,
    });
    if (targets.length && this.state.editor) this.requestEditorAttention();
  };

  mountSurface = () => {
    this.surfaceCount++;
    return () => {
      this.surfaceCount--;
    };
  };
  subscribeRegistry = (listener: () => void) => {
    this.registryListeners.add(listener);
    return () => {
      this.registryListeners.delete(listener);
    };
  };
  /** A renderer animation can move text without a resize, scroll or DOM mutation. */
  refreshGeometry = () => this.registryChanged();
  private registryChanged() {
    this.registryListeners.forEach((listener) => listener());
  }
  registeredElements = () =>
    [
      ...new Set([
        ...[...this.objects.values()].map((item) => item.element),
        ...[...this.texts.values()].flatMap((item) =>
          item.segments.flatMap((segment) =>
            segment.node.parentElement ? [segment.node.parentElement] : [],
          ),
        ),
      ]),
    ].filter((element): element is Element => !!element?.isConnected);
  numberFor = (id: string) =>
    this.numbers.get(id) ??
    (this.state.editor && !this.state.editor.id && this.state.editor.draftId === id
      ? this.state.value.annotations.length + 1
      : 0);
  private stageSources(targets: AnnotationTarget<TRef>[]) {
    this.stagedSources.clear();
    for (const target of targets) {
      if (!target.text) continue;
      const source =
        this.objectPresentations(target)[0]?.source ??
        [...this.texts.values()].find(
          (item) =>
            sourceKey(item) === sourceKey(target) &&
            item.segments.some((segment) => segment.node.isConnected),
        )?.source;
      if (source !== undefined) this.stagedSources.set(annotationTargetKey(target), source);
    }
  }
  dismissSelection = () => {
    if (this.state.pending.length) this.publish({ pending: [] });
  };
  beginAnnotation: AnnotationController<TRef>['beginAnnotation'] = (targets) => {
    const key = targetsKey(targets);
    const existing = this.state.value.annotations.find(
      (entry) => targetsKey(entry.targets) === key,
    );
    this.openAnnotation(existing?.id, targets);
  };
  private requestEditorAttention() {
    this.publish({ editorAttention: this.state.editorAttention + 1, uiError: null });
  }
  openAnnotation = (
    id?: string,
    selected = this.state.pending,
    anchor?: AnnotationEditor<TRef>['anchor'],
  ) => {
    if (this.disabled) return;
    if (this.state.editor) {
      this.requestEditorAttention();
      return;
    }
    const annotation = id ? this.state.value.annotations.find((entry) => entry.id === id) : null;
    const targets = annotation?.targets ?? selected;
    if (!targets.length) return;
    if (!id && selected !== this.state.pending) this.stageSources(targets);
    this.editorSources = new Map(id ? [] : this.stagedSources);
    const draftId = id ?? crypto.randomUUID();
    this.publish({
      pending: [],
      activeAnnotationId: id ?? null,
      uiError: null,
      editor: {
        id,
        draftId,
        targets: copy(targets),
        comment: annotation?.comment ?? '',
        anchor,
      },
    });
  };
  changeEditor = (comment: string) => {
    this.assertEditable();
    if (this.state.editor)
      this.publish({ editor: { ...this.state.editor, comment }, uiError: null });
  };
  cancelEditor = () => {
    if (this.disabled) return;
    this.stagedSources.clear();
    this.editorSources.clear();
    this.publish({ editor: null, pending: [], activeAnnotationId: null, uiError: null });
  };
  saveEditor = () => {
    this.assertEditable();
    const editor = this.state.editor;
    if (!editor) return;
    if (!editor.targets.length) {
      this.publish({ uiError: '请至少选择一个位置。' });
      return;
    }
    if (editor.id)
      this.updateAnnotation(editor.id, { targets: editor.targets, comment: editor.comment });
    else
      this.save(
        {
          ...this.state.value,
          annotations: [
            ...this.state.value.annotations,
            { id: editor.draftId, targets: editor.targets, comment: editor.comment },
          ],
        },
        editor.draftId,
      );
    for (const target of editor.targets) {
      const source = this.editorSources.get(annotationTargetKey(target));
      if (source !== undefined) this.sources.set(annotationTargetKey(target), source);
    }
    this.cancelEditor();
  };
  deleteEditor = () => {
    this.assertEditable();
    const editor = this.state.editor;
    if (editor?.id) this.removeSavedAnnotation(editor.id, true);
    this.cancelEditor();
  };
  /** Actual registered DOM geometry, never an indexOf/quote search or inserted text node. */
  targetRects = (
    target: AnnotationTarget<TRef>,
    firstOnly = false,
    viewport?: AnnotationViewport,
  ): ClippedRect[] => {
    if (
      this.mediaViewTarget &&
      !isElementAnnotationRef(target.ref) &&
      annotationTargetKey(this.mediaViewTarget) !== annotationTargetKey(target)
    )
      return [];
    const key = sourceKey(target);
    if (
      this.fileView?.open &&
      !isElementAnnotationRef(target.ref) &&
      (!this.fileView.snapshot || key !== sourceKey(this.fileView.snapshot))
    )
      return [];
    const clipRect = createRectClipper(viewport);
    const object = this.objectPresentations(target)[0];
    if (object) {
      const bounds = object.bounds?.() ?? object.element.getBoundingClientRect();
      const visible = clipRect(bounds, object.element);
      return visible ? [visible] : [];
    }
    if (!target.text) return [];
    const text = target.text;
    const original =
      this.sources.get(annotationTargetKey(target)) ??
      this.editorSources.get(annotationTargetKey(target)) ??
      this.stagedSources.get(annotationTargetKey(target));
    const registrations = [...this.texts.values()].filter(
      (item) =>
        sourceKey(item) === key &&
        (original === undefined || item.source === original) &&
        validTextRange(item.source, target),
    );
    const rects: ClippedRect[] = [];
    for (const registration of registrations) {
      for (const segment of textSegmentsInRange(registration.index, text.start, text.end)) {
        if (!segment.node.isConnected) continue;
        const offsets = segment.sourceOffsets;
        const start = offsets.findIndex((offset) => offset !== null && offset >= text.start);
        let end = -1;
        for (let index = offsets.length - 1; index >= 0; index--) {
          const offset = offsets[index];
          if (offset !== null && offset <= target.text.end) {
            end = index;
            break;
          }
        }
        if (start < 0 || end <= start) continue;
        const document = segment.node.ownerDocument;
        let range = this.measurementRanges.get(document);
        if (!range) {
          range = document.createRange();
          this.measurementRanges.set(document, range);
        }
        range.setStart(segment.node, start);
        range.setEnd(segment.node, end);
        for (const rect of range.getClientRects()) {
          const element = segment.node.parentElement;
          const visible = element ? clipRect(rect, element) : null;
          if (visible) {
            rects.push(visible);
            if (firstOnly) return rects;
          }
        }
      }
    }
    return rects;
  };

  private resolve(target: AnnotationTarget<TRef>): AnnotationTargetResolution {
    const snapshot = this.fileSnapshots.get(sourceKey(target));
    if (snapshot) return { status: 'ready', text: snapshot.file.text };
    const key = sourceKey(target);
    const texts = [...this.texts.values()].filter(
      (item) =>
        item.segments.some((segment) => segment.node.isConnected) && sourceKey(item) === key,
    );
    if (target.text && texts.length > 0) {
      const sources = new Set(texts.map((item) => item.source));
      if (sources.size > 1)
        return {
          status: 'stale',
          message: 'The target has conflicting registered source text.',
        };
      return { status: 'ready', text: texts[0].source };
    }
    if (!target.text && texts.length) return { status: 'ready' };
    // Content may since have unmounted, such as an inactive tab: validate against the source it
    // last displayed, so a change made before unmounting is still reported as stale.
    const last = this.lastSources.get(key);
    if (last !== undefined)
      return target.text ? { status: 'ready', text: last } : { status: 'ready' };
    return {
      status: 'missing',
      message: 'The target is not registered.',
    };
  }
  private checkResolution(target: AnnotationTarget<TRef>, resolution: AnnotationTargetResolution) {
    if (resolution.status !== 'ready') throw new Error(resolution.message);
    if (!target.text) return;
    const original = this.sources.get(annotationTargetKey(target));
    if (
      resolution.text === undefined ||
      (original !== undefined && original !== resolution.text) ||
      !validTextRange(resolution.text, target)
    )
      throw new Error(
        'The target text is stale or its range no longer matches the original source.',
      );
  }
  locateAndEdit = async (id: string, target: AnnotationTarget<TRef>) => {
    if (isElementAnnotationRef(target.ref) && !this.objectPresentations(target).length) {
      this.openAnnotation(id, undefined, 'bottom-right');
      return;
    }
    const request = this.locating + 1;
    await this.locate(target);
    if (request === this.locating)
      this.openAnnotation(id, undefined, { marker: annotationTargetKey(target) });
  };
  locate: AnnotationController<TRef>['locate'] = async (target) => {
    if (this.state.editor) {
      this.requestEditorAttention();
      throw new Error('Cannot navigate while an annotation editor is open.');
    }
    const request = ++this.locating;
    try {
      const fileSnapshot = this.fileSnapshots.get(sourceKey(target));
      const resolution = this.resolve(target);
      this.checkResolution(target, resolution);
      const source = resolution.status === 'ready' ? resolution.text : undefined;
      if (request !== this.locating) return;
      if (fileSnapshot) await this.showFile(fileSnapshot);
      else if (!isElementAnnotationRef(target.ref)) {
        if (this.fileView?.open) this.closeFile();
        if (this.options?.adapter) await this.options.adapter.locate(copy(target));
        else {
          const registration = [...this.texts.values()].find(
            (item) => sourceKey(item) === sourceKey(target) && item.source === source,
          );
          await registration?.locate?.(copy(target));
        }
      }
      if (request !== this.locating) return;
      // Only media needs this wait. Yielding for text would let asynchronous highlighting
      // replace its Text nodes before the renderer has rebound their source registration.
      const objectKey = annotationTargetKey(target);
      const mediaTarget = [...this.objects.values()].some(
        (item) => annotationTargetKey(item.target) === objectKey,
      );
      const objectElement = mediaTarget ? await this.locateObject(target, request) : undefined;
      if (request !== this.locating) return;
      const key = sourceKey(target);
      const registrations = [...this.texts.values()].filter(
        (item) => sourceKey(item) === key && (!target.text || item.source === source),
      );
      // One source may be registered in several blocks; search all of them.
      const segments = registrations.flatMap((registration) =>
        target.text
          ? textSegmentsInRange(registration.index, target.text.start, target.text.end)
          : registration.segments,
      );
      const text = target.text;
      const textElement = segments.find(
        (segment) =>
          segment.node.isConnected &&
          (!text ||
            segment.sourceOffsets.some(
              (offset) => offset !== null && offset > text.start && offset <= text.end,
            )),
      )?.node.parentElement;
      const element = objectElement ?? textElement;
      // Without an adapter, Paneon cannot bring back content that the page unmounted.
      if (!element && !fileSnapshot && !this.options?.adapter)
        throw new Error(
          isElementAnnotationRef(target.ref)
            ? 'The annotated element is hidden or removed. Edit its annotation from the list.'
            : 'The target is not displayed. Supply an adapter whose locate shows its view.',
        );
      if (element && isElementAnnotationRef(target.ref)) {
        await scrollElementAnnotationIntoView(element, this.overlayContainer ?? undefined);
      } else {
        element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (target.text && !this.isMediaTarget(target)) this.highlightText(target, source);
        if (element) await waitForAnnotationLocation(element);
      }
      if (request !== this.locating) return;
      if (objectElement && !this.targetRects(target, true).length)
        throw new Error('The annotation target is outside the visible viewport.');
      element?.animate?.(
        [{ outline: '2px solid var(--ring)' }, { outline: '2px solid transparent' }],
        1200,
      );
      this.publish({ error: null });
    } catch (error) {
      if (request === this.locating)
        this.publish({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };
  isTargetRendered: AnnotationController<TRef>['isTargetRendered'] = (target) => {
    const key = annotationTargetKey(target);
    // A mounted media renderer owns its range while loading; locateObject waits for readiness.
    return (
      [...this.objects.values()].some((item) => annotationTargetKey(item.target) === key) ||
      this.textRange(target) !== undefined
    );
  };

  private textRange(target: AnnotationTarget<TRef>, source?: string) {
    if (!target.text) return;
    const registrations = [...this.texts.values()].filter(
      (item) =>
        sourceKey(item) === sourceKey(target) && (source === undefined || item.source === source),
    );
    const segments = registrations.flatMap((item) => item.segments);
    const start = segments.find(
      (segment) =>
        segment.node.isConnected &&
        segment.sourceOffsets.some(
          (offset, index) => offset === target.text?.start && index < segment.node.length,
        ),
    );
    const end = [...segments]
      .reverse()
      .find(
        (segment) =>
          segment.node.isConnected &&
          segment.sourceOffsets.some((offset, index) => offset === target.text?.end && index > 0),
      );
    if (!start || !end) return;
    const range = start.node.ownerDocument.createRange();
    range.setStart(start.node, start.sourceOffsets.indexOf(target.text.start));
    range.setEnd(end.node, end.sourceOffsets.indexOf(target.text.end));
    return range;
  }
  private highlightText(target: AnnotationTarget<TRef>, source: string | undefined) {
    const range = this.textRange(target, source);
    if (!range) return;
    const selection = range.startContainer.ownerDocument?.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  submit: AnnotationController<TRef>['submit'] = async () => {
    const options = this.options;
    if (!options || this.disabled) return;
    if (this.state.editor) {
      this.requestEditorAttention();
      return;
    }
    this.publish({ submitting: true, error: null, pending: [], uiError: null });
    const value = frozen(copy(this.state.value));
    try {
      getSchema().parse(value);
      await options.onSubmit(value);
    } catch (error) {
      this.publish({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      this.publish({ submitting: false });
    }
  };
}
