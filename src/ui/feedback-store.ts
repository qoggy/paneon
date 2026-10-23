import { z } from 'zod';
import { feedbackKey, feedbackTargetKey, feedbackSchema } from '../sdk/feedback.js';
import type { Feedback, FeedbackTarget } from '../sdk/feedback.js';
import type {
  FeedbackController,
  FeedbackProviderProps,
  TextRegistration,
  TargetResolution,
  FeedbackUI,
} from './feedback-types';
import { selectedTextTargets, validTextRange } from './feedback-selection';
import { createRectClipper } from './feedback-geometry';
import type { ClippedRect } from './feedback-geometry';
import { indexTextSegments, textSegmentsInRange } from './feedback-text-index';

const schema = feedbackSchema(z.unknown());
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}
const copy = <T>(value: T): T => structuredClone(value);

export class FeedbackStore<TRef> {
  private listeners = new Set<() => void>();
  private objects = new Map<symbol, { ref: TRef; element: HTMLElement }>();
  private texts = new Map<
    symbol,
    TextRegistration<TRef> & { index: ReturnType<typeof indexTextSegments> }
  >();
  private sources = new Map<string, string>();
  private locating = 0;
  private options: Omit<FeedbackProviderProps<TRef>, 'children'>;
  private state: FeedbackController<TRef> & FeedbackUI<TRef>;
  private surfaceCount = 0;
  private toolbarCount = 0;
  overallAnchor: HTMLElement | null = null;
  private numbers = new Map<string, number>();
  private nextNumber = 1;
  private stagedSources = new Map<string, string>();
  private editorSources = new Map<string, string>();
  private registryListeners = new Set<() => void>();
  private measurementRanges = new WeakMap<Document, Range>();

  constructor(options: Omit<FeedbackProviderProps<TRef>, 'children'>) {
    this.options = options;
    this.state = {
      mode: 'browse',
      pending: [],
      pendingKind: 'text',
      editor: null,
      uiError: null,
      value: frozen({ annotations: [] }),
      activeAnnotationId: null,
      selectionTargets: [],
      submitting: false,
      error: null,
      setMode: this.setMode,
      createAnnotation: this.createAnnotation,
      editAnnotation: this.editAnnotation,
      updateAnnotation: this.updateAnnotation,
      removeAnnotation: this.removeAnnotation,
      toggleTarget: this.toggleTarget,
      setOverallAnnotationText: this.setOverallAnnotationText,
      locate: this.locate,
      registerText: this.registerText,
      submit: this.submit,
    };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  setOptions = (options: Omit<FeedbackProviderProps<TRef>, 'children'>) => {
    this.options = options;
  };
  get disabled() {
    return this.options.disabled === true || this.state.submitting;
  }
  private publish(patch: Partial<FeedbackController<TRef> & FeedbackUI<TRef>>) {
    const next = { ...this.state, ...patch };
    next.selectionTargets =
      next.editor?.kind === 'annotation'
        ? next.editor.targets
        : next.pending.length
          ? next.pending
          : (next.value.annotations.find((entry) => entry.id === next.activeAnnotationId)
              ?.targets ?? []);
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
  private assertEditable() {
    if (this.disabled) throw new Error('Feedback cannot be edited while disabled or submitting.');
  }
  private save(value: Feedback<TRef>, activeAnnotationId = this.state.activeAnnotationId) {
    schema.parse(value);
    const retained = new Set(
      value.annotations.flatMap((entry) => entry.targets.map(feedbackTargetKey)),
    );
    for (const key of this.sources.keys()) if (!retained.has(key)) this.sources.delete(key);
    for (const annotation of value.annotations)
      if (!this.numbers.has(annotation.id)) this.numbers.set(annotation.id, this.nextNumber++);
    this.publish({ value: frozen(copy(value)), activeAnnotationId, error: null });
  }
  private remember(targets: FeedbackTarget<TRef>[]) {
    for (const target of targets) {
      if (!target.text || this.sources.has(feedbackTargetKey(target))) continue;
      const registration = [...this.texts.values()].find(
        (item) => feedbackKey(item.ref) === feedbackKey(target.ref),
      );
      if (registration) this.sources.set(feedbackTargetKey(target), registration.source);
    }
  }
  setMode: FeedbackController<TRef>['setMode'] = (mode) => {
    this.assertEditable();
    this.publish({ mode });
  };
  createAnnotation: FeedbackController<TRef>['createAnnotation'] = (targets, comment = '') => {
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
  editAnnotation: FeedbackController<TRef>['editAnnotation'] = (id) => {
    this.assertEditable();
    if (id !== null && !this.state.value.annotations.some((entry) => entry.id === id))
      throw new Error('Unknown annotation.');
    this.publish({ activeAnnotationId: id, error: null });
  };
  updateAnnotation: FeedbackController<TRef>['updateAnnotation'] = (id, update) => {
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
  removeAnnotation: FeedbackController<TRef>['removeAnnotation'] = (id) => {
    this.assertEditable();
    this.save(
      {
        ...this.state.value,
        annotations: this.state.value.annotations.filter((entry) => entry.id !== id),
      },
      this.state.activeAnnotationId === id ? null : this.state.activeAnnotationId,
    );
  };
  toggleTarget: FeedbackController<TRef>['toggleTarget'] = (target) => {
    this.assertEditable();
    if (this.surfaceCount) {
      this.chooseObject(target);
      return;
    }
    const entry = this.state.value.annotations.find(
      (item) => item.id === this.state.activeAnnotationId,
    );
    if (!entry) {
      this.createAnnotation([target]);
      return;
    }
    const key = feedbackTargetKey(target);
    const exists = entry.targets.some((item) => feedbackTargetKey(item) === key);
    const targets = exists
      ? entry.targets.filter((item) => feedbackTargetKey(item) !== key)
      : [...entry.targets, target];
    if (targets.length === 0) this.removeAnnotation(entry.id);
    else this.updateAnnotation(entry.id, { ...entry, targets });
  };
  setOverallAnnotationText: FeedbackController<TRef>['setOverallAnnotationText'] = (comment) => {
    this.assertEditable();
    this.save({ ...this.state.value, comment });
  };
  registerObject = (ref: TRef, element: HTMLElement) => {
    feedbackKey(ref);
    const id = Symbol();
    this.objects.set(id, { ref: copy(ref), element });
    this.registryChanged();
    return () => {
      this.objects.delete(id);
      this.registryChanged();
    };
  };
  registerText: FeedbackController<TRef>['registerText'] = (registration) => {
    feedbackKey(registration.ref);
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
      source: registration.source,
      segments,
      index: indexTextSegments(segments),
    });
    this.registryChanged();
    return () => {
      this.texts.delete(id);
      this.registryChanged();
    };
  };
  selectText = (selection: Selection) => {
    if (this.disabled) return;
    if (this.surfaceCount) {
      const targets = selectedTextTargets(selection, this.texts.values());
      if (!targets.length && this.state.pendingKind === 'objects') return;
      this.stageSources(targets);
      this.publish({
        pending: targets,
        pendingKind: 'text',
        uiError: targets.length && this.state.editor ? '请先保存或取消正在编辑的批注。' : null,
      });
      return;
    }
    if (this.state.mode !== 'select') return;
    const targets = selectedTextTargets(selection, this.texts.values());
    if (targets.length === 0) return;
    const entry = this.state.value.annotations.find(
      (item) => item.id === this.state.activeAnnotationId,
    );
    if (!entry) {
      this.createAnnotation(targets);
      return;
    }
    const combined = [...entry.targets];
    for (const target of targets)
      if (!combined.some((item) => feedbackTargetKey(item) === feedbackTargetKey(target)))
        combined.push(target);
    this.updateAnnotation(entry.id, { targets: combined, comment: entry.comment });
  };

  mountSurface = () => {
    this.surfaceCount++;
    return () => {
      this.surfaceCount--;
    };
  };
  get hasToolbar() {
    return this.toolbarCount > 0;
  }
  mountToolbar = () => {
    this.toolbarCount++;
    this.publish({});
    return () => {
      this.toolbarCount--;
      this.publish({});
    };
  };
  subscribeRegistry = (listener: () => void) => {
    this.registryListeners.add(listener);
    return () => {
      this.registryListeners.delete(listener);
    };
  };
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
    ].filter((element) => element?.isConnected);
  numberFor = (id: string) => this.numbers.get(id) ?? 0;
  private stageSources(targets: FeedbackTarget<TRef>[]) {
    this.stagedSources.clear();
    for (const target of targets) {
      if (!target.text) continue;
      const source = [...this.texts.values()].find(
        (item) =>
          feedbackKey(item.ref) === feedbackKey(target.ref) &&
          item.segments.some((segment) => segment.node.isConnected),
      )?.source;
      if (source !== undefined) this.stagedSources.set(feedbackTargetKey(target), source);
    }
  }
  dismissSelection = () => {
    if (this.state.pending.length) this.publish({ pending: [] });
  };
  openAnnotation = (id?: string) => {
    if (this.disabled) return;
    if (this.state.editor) {
      this.publish({ uiError: '请先保存或取消正在编辑的批注。' });
      return;
    }
    const annotation = id ? this.state.value.annotations.find((entry) => entry.id === id) : null;
    const targets = annotation?.targets ?? this.state.pending;
    if (!targets.length) return;
    this.editorSources = new Map(id ? [] : this.stagedSources);
    this.publish({
      pending: [],
      activeAnnotationId: id ?? null,
      uiError: null,
      editor: {
        kind: 'annotation',
        id,
        targets: copy(targets),
        comment: annotation?.comment ?? '',
      },
    });
  };
  openOverall = (anchor?: HTMLElement) => {
    this.overallAnchor = anchor ?? null;
    if (this.disabled) return;
    if (this.state.editor) {
      this.publish({ uiError: '请先保存或取消正在编辑的批注。' });
      return;
    }
    this.publish({
      pending: [],
      uiError: null,
      activeAnnotationId: null,
      editor: { kind: 'overall', targets: [], comment: this.state.value.comment ?? '' },
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
    if (editor.kind === 'overall') this.setOverallAnnotationText(editor.comment);
    else {
      if (!editor.targets.length) {
        this.publish({ uiError: '请至少选择一个位置。' });
        return;
      }
      if (editor.id)
        this.updateAnnotation(editor.id, { targets: editor.targets, comment: editor.comment });
      else this.createAnnotation(editor.targets, editor.comment);
      for (const target of editor.targets) {
        const source = this.editorSources.get(feedbackTargetKey(target));
        if (source !== undefined) this.sources.set(feedbackTargetKey(target), source);
      }
    }
    this.cancelEditor();
  };
  deleteEditor = () => {
    this.assertEditable();
    const editor = this.state.editor;
    if (editor?.kind === 'overall') this.setOverallAnnotationText('');
    else if (editor?.id) this.removeAnnotation(editor.id);
    this.cancelEditor();
  };
  chooseObject = (target: FeedbackTarget<TRef>) => {
    if (!this.surfaceCount) {
      this.toggleTarget(target);
      return;
    }
    this.assertEditable();
    const editor = this.state.editor;
    if (editor?.kind === 'overall') {
      this.publish({ uiError: '请先保存或取消正在编辑的整体批注。' });
      return;
    }
    const targets =
      editor?.targets ?? (this.state.pendingKind === 'objects' ? this.state.pending : []);
    const key = feedbackTargetKey(target);
    const selected = targets.some((item) => feedbackTargetKey(item) === key);
    if (!editor) {
      this.publish({
        pending: selected
          ? targets.filter((item) => feedbackTargetKey(item) !== key)
          : [...targets, copy(target)],
        pendingKind: 'objects',
        uiError: null,
      });
      return;
    }
    this.publish({
      pending: [],
      uiError: null,
      editor: {
        kind: 'annotation',
        id: editor?.id,
        comment: editor?.comment ?? '',
        targets: selected
          ? targets.filter((item) => feedbackTargetKey(item) !== key)
          : [...targets, copy(target)],
      },
    });
  };
  /** Actual registered DOM geometry, never an indexOf/quote search or inserted text node. */
  targetRects = (target: FeedbackTarget<TRef>, firstOnly = false): ClippedRect[] => {
    const key = feedbackKey(target.ref);
    const clipRect = createRectClipper();
    if (!target.text) {
      const rects = [...this.objects.values()]
        .filter((item) => item.element.isConnected && feedbackKey(item.ref) === key)
        .flatMap((item) =>
          [...item.element.getClientRects()].flatMap((rect) => {
            const visible = clipRect(rect, item.element);
            return visible ? [visible] : [];
          }),
        );
      return rects.length ? rects : this.adapterRects(target, firstOnly);
    }
    const text = target.text;
    const original =
      this.sources.get(feedbackTargetKey(target)) ??
      this.editorSources.get(feedbackTargetKey(target)) ??
      this.stagedSources.get(feedbackTargetKey(target));
    const registrations = [...this.texts.values()].filter(
      (item) =>
        feedbackKey(item.ref) === key &&
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
  private adapterRects(target: FeedbackTarget<TRef>, firstOnly = false): ClippedRect[] {
    const rects: ClippedRect[] = [];
    const clipRect = createRectClipper();
    for (const range of this.options.adapter?.targetRanges?.(target) ?? []) {
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

  private async resolve(target: FeedbackTarget<TRef>): Promise<TargetResolution> {
    if (this.options.adapter) return this.options.adapter.resolve(target);
    const key = feedbackKey(target.ref);
    const objects = [...this.objects.values()].filter(
      (item) => item.element.isConnected && feedbackKey(item.ref) === key,
    );
    const texts = [...this.texts.values()].filter(
      (item) =>
        item.segments.some((segment) => segment.node.isConnected) && feedbackKey(item.ref) === key,
    );
    if (target.text && texts.length > 0) {
      const sources = new Set(texts.map((item) => item.source));
      if (sources.size > 1)
        return { status: 'stale', message: 'The target has conflicting registered source text.' };
      return { status: 'ready', text: texts[0].source };
    }
    if (!target.text && (objects.length || texts.length)) return { status: 'ready' };
    return {
      status: 'missing',
      message: 'The target is not mounted. Supply an adapter to validate and locate it.',
    };
  }
  private checkResolution(target: FeedbackTarget<TRef>, resolution: TargetResolution) {
    if (resolution.status !== 'ready') throw new Error(resolution.message);
    if (!target.text) return;
    const original = this.sources.get(feedbackTargetKey(target));
    if (
      resolution.text === undefined ||
      (original !== undefined && original !== resolution.text) ||
      !validTextRange(resolution.text, target)
    )
      throw new Error(
        'The target text is stale or its range no longer matches the original source.',
      );
  }
  locate: FeedbackController<TRef>['locate'] = async (target) => {
    const request = ++this.locating;
    try {
      const resolution = await this.resolve(target);
      this.checkResolution(target, resolution);
      const source = resolution.status === 'ready' ? resolution.text : undefined;
      if (request !== this.locating) return;
      if (this.options.adapter) await this.options.adapter.locate(copy(target));
      if (request !== this.locating) return;
      const key = feedbackKey(target.ref);
      const textElement = [...this.texts.values()]
        .find((item) => feedbackKey(item.ref) === key && (!target.text || item.source === source))
        ?.segments.find((segment) => segment.node.isConnected)?.node.parentElement;
      const element = target.text
        ? textElement
        : ([...this.objects.values()].find(
            (item) => item.element.isConnected && feedbackKey(item.ref) === key,
          )?.element ?? textElement);
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
  private highlightText(target: FeedbackTarget<TRef>, source: string | undefined) {
    if (!target.text) return;
    const registrations = [...this.texts.values()].filter(
      (item) => feedbackKey(item.ref) === feedbackKey(target.ref) && item.source === source,
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
  submit: FeedbackController<TRef>['submit'] = async () => {
    if (this.disabled) return;
    if (this.state.editor || (this.state.pendingKind === 'objects' && this.state.pending.length)) {
      this.publish({
        uiError: this.state.editor
          ? '请先保存或取消正在编辑的批注。'
          : '请先点击“批注”，保存或取消所选位置。',
      });
      return;
    }
    this.publish({ submitting: true, error: null, pending: [], uiError: null });
    const value = frozen(copy(this.state.value));
    try {
      schema.parse(value);
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
      await this.options.onSubmit(value);
    } catch (error) {
      this.publish({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      this.publish({ submitting: false });
    }
  };
}
