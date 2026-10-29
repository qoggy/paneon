import { z } from 'zod';
import { annotationTargetKey, annotationValueSchema } from '../sdk/annotation.js';
import type { AnnotationValue, AnnotationTarget, JsonValue } from '../sdk/annotation.js';
import type { FilePreview, FileReferenceRequest } from '../shared/file-references';
import type { ReadFileReference } from './file-reference-context';
import type {
  AnnotationController,
  AnnotationEditor,
  PageAnnotationOptions,
  AnnotationTextRegistration,
  AnnotationTargetResolution,
  AnnotationPresentation,
  AnnotationUI,
} from './annotation-types';
import { selectedTextTargets, validTextRange } from './annotation-selection';
import { createRectClipper } from './annotation-geometry';
import type { ClippedRect } from './annotation-geometry';
import { indexTextSegments, textSegmentsInRange } from './annotation-text-index';

export type FileSnapshot<TRef = unknown> = {
  ref: TRef;
  sourceRef: JsonValue;
  file: FilePreview;
};
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

export class AnnotationStore<TRef> {
  private listeners = new Set<() => void>();
  private texts = new Map<
    symbol,
    AnnotationTextRegistration<TRef> & {
      index: ReturnType<typeof indexTextSegments>;
    }
  >();
  private sources = new Map<string, string>();
  private fileSnapshots = new Map<string, FileSnapshot<TRef>>();
  private fileView: FileAnnotationView<TRef> | null = null;
  private fileSequence = 0;
  overlayContainer: HTMLElement | null = null;
  private fileReady: (() => void) | undefined;
  private locating = 0;
  private options: PageAnnotationOptions<TRef> | undefined;
  private state: AnnotationController<TRef> & AnnotationUI<TRef>;
  private surfaceCount = 0;
  private numbers = new Map<string, number>();
  private stagedSources = new Map<string, string>();
  private editorSources = new Map<string, string>();
  private summaries = new Map<string, string>();
  private registryListeners = new Set<() => void>();
  private measurementRanges = new WeakMap<Document, Range>();

  constructor(options?: PageAnnotationOptions<TRef>) {
    this.options = options;
    this.state = {
      pending: [],
      editor: null,
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
  openFile = (
    reference: FileReferenceRequest,
    ref: TRef,
    trigger?: HTMLElement,
    reader?: ReadFileReference,
  ) => {
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
    if (this.state.editor && !this.disabled) this.saveEditor();
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
    this.save(
      {
        ...this.state.value,
        annotations: this.state.value.annotations.filter((entry) => entry.id !== id),
      },
      this.state.activeAnnotationId === id ? null : this.state.activeAnnotationId,
    );
  };
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
      presentation: registration.presentation,
      segments,
      index: indexTextSegments(segments),
    });
    this.registryChanged();
    return () => {
      this.texts.delete(id);
      this.registryChanged();
    };
  };
  /** Resolve live renderer geometry while retaining readable summaries after unmount. */
  presentation = (
    targets: readonly AnnotationTarget<TRef>[],
  ): AnnotationPresentation | undefined => {
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
      uiError: targets.length && this.state.editor ? '请先保存或取消正在编辑的批注。' : null,
    });
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
        ...[...this.texts.values()].flatMap((item) =>
          item.segments.flatMap((segment) =>
            segment.node.parentElement ? [segment.node.parentElement] : [],
          ),
        ),
      ]),
    ].filter((element) => element?.isConnected);
  numberFor = (id: string) =>
    this.numbers.get(id) ??
    (this.state.editor && !this.state.editor.id && this.state.editor.draftId === id
      ? this.state.value.annotations.length + 1
      : 0);
  private stageSources(targets: AnnotationTarget<TRef>[]) {
    this.stagedSources.clear();
    for (const target of targets) {
      if (!target.text) continue;
      const source = [...this.texts.values()].find(
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
  openAnnotation = (
    id?: string,
    selected = this.state.pending,
    anchor?: AnnotationEditor<TRef>['anchor'],
  ) => {
    if (this.disabled) return;
    if (this.state.editor) {
      this.publish({ uiError: '请先保存或取消正在编辑的批注。' });
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
    if (editor?.id) this.removeAnnotation(editor.id);
    this.cancelEditor();
  };
  /** Actual registered DOM geometry, never an indexOf/quote search or inserted text node. */
  targetRects = (target: AnnotationTarget<TRef>, firstOnly = false): ClippedRect[] => {
    const key = sourceKey(target);
    if (
      this.fileView?.open &&
      (!this.fileView.snapshot || key !== sourceKey(this.fileView.snapshot))
    )
      return [];
    const clipRect = createRectClipper();
    if (!target.text) return this.adapterRects(target, firstOnly);
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
    let mapped = false;
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
        mapped = true;
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
    return mapped ? rects : this.adapterRects(target, firstOnly);
  };
  private adapterRects(target: AnnotationTarget<TRef>, firstOnly = false): ClippedRect[] {
    const rects: ClippedRect[] = [];
    const clipRect = createRectClipper();
    if (this.fileSnapshots.has(sourceKey(target))) return rects;
    for (const range of this.options?.adapter?.targetRanges?.(target) ?? []) {
      if (!range.startContainer.isConnected || !range.endContainer.isConnected) continue;
      const element =
        range.startContainer.nodeType === 1
          ? (range.startContainer as HTMLElement)
          : range.startContainer.parentElement;
      if (!element) continue;
      for (const rect of range.getClientRects()) {
        const visible = clipRect(rect, element);
        if (visible) {
          rects.push(visible);
          if (firstOnly) return rects;
        }
      }
    }
    return rects;
  }

  private async resolve(target: AnnotationTarget<TRef>): Promise<AnnotationTargetResolution> {
    const snapshot = this.fileSnapshots.get(sourceKey(target));
    if (snapshot) return { status: 'ready', text: snapshot.file.text };
    if (this.options?.adapter) return this.options.adapter.resolve(target);
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
    return {
      status: 'missing',
      message: 'The target is not mounted. Supply an adapter to validate and locate it.',
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
  locate: AnnotationController<TRef>['locate'] = async (target) => {
    const request = ++this.locating;
    try {
      const fileSnapshot = this.fileSnapshots.get(sourceKey(target));
      const resolution = await this.resolve(target);
      this.checkResolution(target, resolution);
      const source = resolution.status === 'ready' ? resolution.text : undefined;
      if (request !== this.locating) return;
      if (fileSnapshot) await this.showFile(fileSnapshot);
      else {
        if (this.fileView?.open) this.closeFile();
        if (this.options?.adapter) await this.options.adapter.locate(copy(target));
      }
      if (request !== this.locating) return;
      const key = sourceKey(target);
      const registration = [...this.texts.values()].find(
        (item) => sourceKey(item) === key && (!target.text || item.source === source),
      );
      const segments =
        registration && target.text
          ? textSegmentsInRange(registration.index, target.text.start, target.text.end)
          : registration?.segments;
      const text = target.text;
      const textElement = segments?.find(
        (segment) =>
          segment.node.isConnected &&
          (!text ||
            segment.sourceOffsets.some(
              (offset) => offset !== null && offset > text.start && offset <= text.end,
            )),
      )?.node.parentElement;
      const element = textElement;
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      element?.animate?.(
        [{ outline: '2px solid var(--ring)' }, { outline: '2px solid transparent' }],
        1200,
      );
      if (target.text) this.highlightText(target, source);
      this.publish({ error: null });
    } catch (error) {
      if (request === this.locating)
        this.publish({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };
  private highlightText(target: AnnotationTarget<TRef>, source: string | undefined) {
    if (!target.text) return;
    const registrations = [...this.texts.values()].filter(
      (item) => sourceKey(item) === sourceKey(target) && item.source === source,
    );
    const segments = registrations.flatMap((item) => item.segments);
    const start = segments.find(
      (segment) =>
        segment.node.isConnected && segment.sourceOffsets.includes(target.text?.start ?? -1),
    );
    const end = [...segments]
      .reverse()
      .find(
        (segment) =>
          segment.node.isConnected && segment.sourceOffsets.includes(target.text?.end ?? -1),
      );
    if (!start || !end) return;
    const range = start.node.ownerDocument.createRange();
    range.setStart(start.node, start.sourceOffsets.indexOf(target.text.start));
    range.setEnd(end.node, end.sourceOffsets.indexOf(target.text.end));
    const selection = start.node.ownerDocument.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  submit: AnnotationController<TRef>['submit'] = async () => {
    const options = this.options;
    if (!options || this.disabled) return;
    if (this.state.editor) {
      this.publish({ uiError: '请先保存或取消正在编辑的批注。' });
      return;
    }
    this.publish({ submitting: true, error: null, pending: [], uiError: null });
    const value = frozen(copy(this.state.value));
    try {
      getSchema().parse(value);
      for (const [annotationIndex, annotation] of value.annotations.entries())
        for (const [targetIndex, target] of annotation.targets.entries()) {
          try {
            this.checkResolution(target, await this.resolve(target));
          } catch (error) {
            throw new Error(
              `Annotation ${annotationIndex + 1}, target ${targetIndex + 1}: ${error instanceof Error ? error.message : String(error)}`,
              { cause: error },
            );
          }
        }
      await options.onSubmit(value);
    } catch (error) {
      this.publish({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      this.publish({ submitting: false });
    }
  };
}
