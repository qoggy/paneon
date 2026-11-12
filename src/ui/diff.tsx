import { useUI } from './use-ui';
import {
  useCallback,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Ref } from 'react';
import { Button } from './button';
import { HighlightedCodeText } from './code-text';
import { useCodeHighlighting } from './code-highlighting';
import { Spinner } from './spinner';
import { useAnnotations } from './annotation-context';
import { annotationKey } from '../sdk/annotation';
import type { ElementAnnotationRef, JsonValue } from '../sdk/annotation';
import { createDiffModel, diffChanges } from '../shared/diff-model';
import type { DiffModel } from '../shared/diff-model';
import { diffPresentation } from './diff-presentation';
import type { DiffCell } from './diff-presentation';
import { DiffToolbar } from './diff-toolbar';
import { DiffColumns } from './diff-columns';
import { DiffSplit } from './diff-split';
import type { DiffSplitRow } from './diff-split';
import { diffLocationRanges, revealDiffElement, revealDiffLocation } from './diff-annotation';
import type { DiffLocation } from './diff-annotation';
import {
  diffAnnotationBlocks,
  diffBlockAnchor,
  diffBlockKey,
  diffBlockSummary,
} from './diff-block-annotations';
import { DiffBlockActions } from './diff-block-actions';
import type { AnnotationTextRegistration } from './annotation-types';
export type DiffViewHandle = {
  /** Expands the required context and reveals coordinates after the DOM is ready. */
  reveal(location: DiffLocation): Promise<void>;
  getRanges(location: DiffLocation): Range[];
};
function sourceLanguage(path?: string) {
  const extension = path?.split('.').at(-1);
  return (
    {
      ts: 'typescript',
      tsx: 'tsx',
      js: 'javascript',
      jsx: 'jsx',
      json: 'json',
      jsonc: 'jsonc',
      sh: 'bash',
      yaml: 'yaml',
      yml: 'yaml',
      py: 'python',
      java: 'java',
      css: 'css',
      html: 'html',
      htm: 'html',
      md: 'markdown',
      markdown: 'markdown',
    } as Record<string, string>
  )[extension ?? ''];
}
export type DiffViewProps<TRef = JsonValue> = {
  ref?: Ref<DiffViewHandle>;
  /** References are delivered unchanged as target.ref; an omitted side cannot be annotated. */
  annotationTargets?: { old?: TRef; new?: TRef };
  model?: DiffModel;
  oldText?: string;
  newText?: string;
  oldPath?: string;
  newPath?: string;
  oldRevision?: string;
  newRevision?: string;
  /** Initial word wrapping; users can toggle it. Defaults to false. */
  defaultWrap?: boolean;
  defaultExpanded?: boolean;
  onCollapse?: () => void;
  /** Opt into a bounded code viewport; ordinary document consumers retain natural flow. */
  layout?: 'document' | 'bounded';
};
/** Display needs no provider; supplying side references joins the page annotation session. */
export function DiffView<TRef = JsonValue>(props: DiffViewProps<TRef>) {
  return props.annotationTargets?.old !== undefined ||
    props.annotationTargets?.new !== undefined ? (
    <AnnotatedDiffView {...props} />
  ) : (
    <StringDiffView {...props} />
  );
}
function AnnotatedDiffView<TRef>(props: DiffViewProps<TRef>) {
  const feedback = useAnnotations<TRef>();
  return <StringDiffView {...props} feedback={feedback} />;
}

/** Pure display/coordinate adapter: no repository, local Git call or source lookup. */
function StringDiffView<TRef>({
  ref,
  annotationTargets,
  model: supplied,
  oldText,
  newText,
  oldPath,
  newPath,
  oldRevision,
  newRevision,
  defaultWrap = false,
  defaultExpanded = true,
  onCollapse,
  layout = 'document',
  feedback,
}: DiffViewProps<TRef> & { feedback?: ReturnType<typeof useAnnotations<TRef>> }) {
  const sourceId = useId();
  const [wrap, setWrap] = useState(defaultWrap);
  const oldKey =
    annotationTargets?.old === undefined ? undefined : annotationKey(annotationTargets.old);
  const newKey =
    annotationTargets?.new === undefined ? undefined : annotationKey(annotationTargets.new);
  if (oldKey !== undefined && oldKey === newKey)
    throw new Error('DiffView old and new annotation targets must be different.');
  const targets = useMemo(
    () => ({
      old: oldKey === undefined ? undefined : (JSON.parse(oldKey) as TRef),
      new: newKey === undefined ? undefined : (JSON.parse(newKey) as TRef),
    }),
    [oldKey, newKey],
  );
  const { t, message } = useUI();
  const model = useMemo(
    () => supplied ?? createDiffModel(oldText, newText),
    [supplied, oldText, newText],
  );
  const oldHighlight = useCodeHighlighting(model.oldText ?? '', sourceLanguage(oldPath));
  const newHighlight = useCodeHighlighting(model.newText ?? '', sourceLanguage(newPath));
  const highlightingReady =
    (oldHighlight.language === 'text' || !!oldHighlight.tokens) &&
    (newHighlight.language === 'text' || !!newHighlight.tokens);
  const changes = useMemo(() => diffChanges(model.rows), [model]);
  const headerId = useId();
  const registerText = feedback?.registerText;
  const root = useRef<HTMLDivElement>(null);
  const bodyRoot = useRef<HTMLDivElement>(null);
  const gutters = useRef(new Map<string, HTMLElement>());
  const blocks = useMemo(() => diffAnnotationBlocks(model, targets), [model, targets]);
  const blockLookup = useMemo(
    () => new Map(blocks.map((block) => [diffBlockKey(block.targets), block])),
    [blocks],
  );
  const [view, setView] = useState({
    model,
    defaultExpanded,
    unified: false,
    expanded: defaultExpanded,
    index: 0,
    reveal: 0,
  });
  const sourceChanged = view.model !== model || view.defaultExpanded !== defaultExpanded;
  if (sourceChanged) {
    setView({
      ...view,
      model,
      defaultExpanded,
      index: 0,
      expanded: defaultExpanded,
    });
  }
  const { unified, expanded } = view;
  const tables = useMemo(
    () => (expanded ? [model.rows] : model.hunks.map((hunk) => hunk.rows)).map(diffPresentation),
    [model, expanded],
  );
  const splitRows = useMemo<DiffSplitRow[]>(
    () =>
      expanded
        ? tables[0].split
        : tables.flatMap((table, index) => {
            const hunk = model.hunks[index];
            return [
              {
                hunk: {
                  index,
                  label: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@ ${t('(changed block)')}`,
                },
              },
              ...table.split,
            ];
          }),
    [tables, model, expanded, t],
  );
  // Decide from whole source texts, never from an individual hunk or trimmed content.
  const sides: ('old' | 'new')[] =
    !model.oldText && model.newText
      ? ['new']
      : model.oldText && !model.newText
        ? ['old']
        : ['old', 'new'];
  const sideBySide = !unified && sides.length === 2;
  const columns = sideBySide ? 'var(--diff-columns, 50% 50%)' : 'minmax(0,1fr)';
  const presentation = useCallback<
    NonNullable<AnnotationTextRegistration<TRef | ElementAnnotationRef>['presentation']>
  >(
    (selected) => {
      const block = blockLookup.get(diffBlockKey(selected));
      return block
        ? {
            summary: diffBlockSummary(block, oldPath, newPath),
            anchor: diffBlockAnchor(block, gutters.current, sideBySide),
            side: 'bottom',
            align: 'center',
          }
        : undefined;
    },
    [blockLookup, oldPath, newPath, sideBySide],
  );
  const setUnified = (value: boolean) => setView((current) => ({ ...current, unified: value }));
  const setExpanded = (value: boolean) => setView((current) => ({ ...current, expanded: value }));
  const columnLayout = useRef<Record<string, number> | undefined>(undefined);
  const initialLocation = useRef<DiffModel | null>(null);
  const pendingReveal = useRef<{ location: DiffLocation; resolve: () => void } | null>(null);
  const cancelHighlight = useRef<(() => void) | undefined>(undefined);
  const reveal = useCallback(
    (location: DiffLocation) =>
      new Promise<void>((resolve) => {
        pendingReveal.current?.resolve();
        cancelHighlight.current?.();
        initialLocation.current = model;
        pendingReveal.current = { location, resolve };
        setView((current) => ({
          ...current,
          unified: false,
          expanded: location.kind === 'text',
          reveal: current.reveal + 1,
        }));
      }),
    [model],
  );
  useImperativeHandle(
    ref,
    () => ({
      getRanges: (location) =>
        root.current ? diffLocationRanges(root.current, model, location) : [],
      reveal,
    }),
    [model, reveal],
  );
  useLayoutEffect(() => {
    const request = pendingReveal.current;
    if (!request || !root.current || !highlightingReady) return;
    pendingReveal.current = null;
    cancelHighlight.current = revealDiffLocation(root.current, model, request.location);
    request.resolve();
  }, [model, view.reveal, unified, expanded, highlightingReady]);
  useLayoutEffect(
    () => () => {
      pendingReveal.current?.resolve();
      pendingReveal.current = null;
      cancelHighlight.current?.();
    },
    [model],
  );
  const currentChange = Math.min(view.index, Math.max(0, changes.length - 1));
  const pendingLocation = useRef(false);
  useLayoutEffect(() => {
    pendingLocation.current = false;
  }, [model, defaultExpanded]);
  const revealChange = useCallback(
    (index: number) => {
      const change = changes[index];
      const line = change?.new ?? change?.old;
      if (!line) return;
      const side = change.new ? 'new' : 'old';
      const element = root.current?.querySelector<HTMLElement>(
        `[data-code-side="${side}"][data-line="${line.number}"]`,
      );
      if (element) revealDiffElement(element);
    },
    [changes],
  );
  useLayoutEffect(() => {
    if (!highlightingReady) return;
    if (initialLocation.current === model) return;
    if (defaultExpanded && !expanded) return;
    initialLocation.current = model;
    if (!defaultExpanded) return;
    const frame = requestAnimationFrame(() => revealChange(0));
    return () => cancelAnimationFrame(frame);
  }, [model, expanded, defaultExpanded, revealChange, highlightingReady]);
  const navigate = (index: number) => {
    setView((current) => ({ ...current, index }));
    revealChange(index);
  };
  useLayoutEffect(() => {
    if (!pendingLocation.current) return;
    pendingLocation.current = false;
    revealChange(currentChange);
  }, [unified, expanded, currentChange, revealChange]);

  useLayoutEffect(() => {
    const elementRoot = root.current;
    if (!elementRoot || !registerText || !highlightingReady) return;
    let removers: (() => void)[] = [];
    const register = () => {
      removers.forEach((remove) => remove());
      removers = [];
      for (const side of ['old', 'new'] as const) {
        const target = targets[side];
        const source = side === 'old' ? model.oldText : model.newText;
        if (target === undefined || !source) continue;
        const segments: { node: Text; sourceOffsets: number[] }[] = [];
        elementRoot
          .querySelectorAll<HTMLElement>(`[data-code-side="${side}"]`)
          .forEach((element) => {
            let offset = Number(element.dataset.sourceStart);
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            let node: Node | null;
            while ((node = walker.nextNode())) {
              const value = node as Text;
              segments.push({
                node: value,
                sourceOffsets: Array.from({ length: value.data.length + 1 }, (_, i) => offset + i),
              });
              offset += value.data.length;
            }
          });
        removers.push(
          registerText({
            ref: target,
            source,
            segments,
            locate: (target) =>
              reveal(
                target.text
                  ? {
                      kind: 'text',
                      side,
                      ...target.text,
                      quote: source.slice(target.text.start, target.text.end),
                    }
                  : { kind: 'file' },
              ),
            presentation,
          }),
        );
      }
    };
    register();
    const observer = new MutationObserver(register);
    observer.observe(elementRoot, { childList: true, characterData: true, subtree: true });
    return () => {
      observer.disconnect();
      removers.forEach((remove) => remove());
    };
  }, [targets, model, unified, expanded, registerText, presentation, reveal, highlightingReady]);
  function code(side: 'old' | 'new', cell: DiffCell, endingNote: boolean) {
    const { line, kind, spans } = cell;
    const changed = kind !== 'context';
    const background = changed ? `var(--diff-${kind})` : undefined;
    const body = line.text.replace(/\r?\n$/, '');
    const ending = line.text.slice(body.length);
    const highlight = side === 'old' ? oldHighlight : newHighlight;
    return (
      <td className="align-top" data-diff-kind={kind} style={{ backgroundColor: background }}>
        <div className={`flex font-mono text-sm leading-6 ${wrap ? 'min-h-6' : 'h-6'}`}>
          <span
            ref={
              changed
                ? (element) => {
                    const key = `${side}:${line.number}`;
                    if (element) gutters.current.set(key, element);
                    else gutters.current.delete(key);
                  }
                : undefined
            }
            className={`sticky z-[1] flex shrink-0 items-start bg-background/95 text-muted-foreground select-none ${side === 'old' && !unified ? 'right-0 order-2 border-l' : 'left-0 border-r'}`}
            data-diff-gutter={side}
            style={
              changed
                ? {
                    backgroundColor: background,
                  }
                : undefined
            }
          >
            <span className="w-10 shrink-0 px-1 text-right text-xs tabular-nums select-none">
              {line.number}
            </span>
            <span aria-hidden="true" className="w-3 shrink-0 text-center text-xs select-none">
              {changed ? (side === 'old' ? '−' : '+') : ' '}
            </span>
          </span>
          <span
            data-code-side={side}
            data-source-start={line.start}
            data-line={line.number}
            className={`flex-1 px-3 ${wrap ? 'min-w-0 wrap-break-word whitespace-pre-wrap' : 'min-w-max whitespace-pre'}`}
          >
            <HighlightedCodeText
              code={body}
              language={highlight.language}
              tokens={highlight.tokens ? [highlight.tokens[line.number - 1] ?? []] : undefined}
              sourceStart={line.start}
              spans={spans}
              className={`inline max-w-none overflow-visible rounded-none border-0 bg-transparent p-0 leading-6 ${wrap ? 'wrap-break-word whitespace-pre-wrap' : ''}`}
            />
            {ending}
          </span>
        </div>
        {endingNote && (
          <div
            className={`pl-16 text-xs text-muted-foreground select-none ${wrap ? 'min-h-5 wrap-break-word' : 'h-5'}`}
          >
            {!line.text.endsWith('\n') ? `\\ ${t('No newline at end of file')}` : ''}
          </div>
        )}
      </td>
    );
  }
  const display = ({ split, unified: lines }: ReturnType<typeof diffPresentation>) => {
    const side = sides[0];
    return unified ? (
      <div
        className="min-w-0 overflow-x-auto"
        data-diff-scroll="unified"
        tabIndex={0}
        aria-label={t(wrap ? 'Unified diff' : '单列差异，横向滚动查看长行')}
      >
        <table
          className={
            wrap ? 'w-full table-fixed border-collapse' : 'w-max min-w-full border-collapse'
          }
        >
          <tbody>
            {lines.map(({ side, cell }, index) => (
              <tr key={index}>{code(side, cell, !cell.line.text.endsWith('\n'))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div
        className="min-w-0 overflow-x-auto"
        data-diff-scroll={side}
        tabIndex={0}
        aria-label={t(wrap ? '{side} diff' : '{side} diff, scroll horizontally for long lines', {
          side: t(side === 'old' ? 'Old' : 'New'),
        })}
      >
        <table
          className={
            wrap ? 'w-full table-fixed border-collapse' : 'w-max min-w-full border-collapse'
          }
        >
          <tbody>
            {split.flatMap((row, index) =>
              row[side]
                ? [
                    <tr key={index}>
                      {code(side, row[side], !row[side].line.text.endsWith('\n'))}
                    </tr>,
                  ]
                : [],
            )}
          </tbody>
        </table>
      </div>
    );
  };
  const rootClassName =
    layout === 'bounded' ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden' : 'min-w-0';
  if (!highlightingReady)
    return (
      <div
        ref={root}
        data-diff-source={sourceId}
        data-diff-layout={layout}
        data-wrap={wrap}
        className={rootClassName}
        aria-busy="true"
      >
        <p
          role="status"
          className="flex flex-1 items-center justify-center gap-2 p-4 text-sm text-muted-foreground"
        >
          <Spinner aria-hidden="true" />
          {t('Preparing file diff…')}
        </p>
      </div>
    );
  return (
    <div
      ref={root}
      data-diff-source={sourceId}
      className={rootClassName}
      data-diff-layout={layout}
      data-wrap={wrap}
      aria-busy="false"
    >
      <style>
        {'::highlight(paneon-diff-location) { background-color: Highlight; color: HighlightText; }'}
      </style>
      <div
        id={headerId}
        data-diff-header=""
        className={`${layout === 'bounded' ? 'shrink-0' : 'sticky top-0'} z-10 border-b bg-background`}
      >
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1 px-1 py-1">
          <DiffToolbar
            unified={unified}
            expanded={expanded}
            wrap={wrap}
            onWrap={() => setWrap((value) => !value)}
            current={currentChange}
            total={changes.length}
            onNavigate={navigate}
            onMode={(value) => {
              if (value === unified) {
                revealChange(currentChange);
                return;
              }
              pendingLocation.current = true;
              setUnified(value);
            }}
            onExpanded={() => {
              pendingLocation.current = true;
              setExpanded(!expanded);
            }}
          />
          {onCollapse && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onCollapse}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={message('Collapse file diff')}
              title={message('Collapse file diff')}
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                aria-hidden="true"
                className="size-4"
              >
                <rect x="2" y="2" width="12" height="12" rx="1.5" />
                <path d="M2 10h12 M6 6l2 2 2-2" />
              </svg>
            </Button>
          )}
        </div>
        {[oldPath, newPath, oldRevision, newRevision].some((value) => !!value) && (
          <div
            data-diff-source-headers=""
            className="grid min-w-0 border-t bg-muted/30 text-xs"
            style={{
              gridTemplateColumns: columns,
            }}
          >
            {sides.map((side) => (
              <div
                key={side}
                data-diff-source-header={side}
                className={`flex min-w-0 items-center gap-2 px-3 py-1.5 ${sides.length === 2 ? 'first:border-r' : ''}`}
                title={[
                  side === 'old' ? oldRevision : newRevision,
                  side === 'old' ? oldPath : newPath,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              >
                <span className="shrink-0 font-mono text-muted-foreground">
                  {side === 'old' ? (oldRevision ?? '') : (newRevision ?? '')}
                </span>
                <span className="truncate">
                  {side === 'old' ? (oldPath ?? '') : (newPath ?? '')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div
        data-diff-viewport=""
        style={sideBySide ? { scrollbarWidth: 'none' } : undefined}
        className={
          layout === 'bounded'
            ? 'min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain'
            : undefined
        }
      >
        <div
          ref={bodyRoot}
          className="relative min-h-full min-w-0"
          data-diff-body=""
          data-annotation-clip-top={headerId}
        >
          {sideBySide && (
            <DiffColumns
              idPrefix={sourceId}
              source={root}
              layoutRef={columnLayout}
              label={t('调整差异两侧宽度')}
            />
          )}
          {sideBySide ? (
            splitRows.length > 0 && (
              <div className="min-w-0 border-b">
                <DiffSplit rows={splitRows} renderCell={code} layout={layout} wrap={wrap} />
              </div>
            )
          ) : expanded ? (
            <div className="min-w-0 border-b">{display(tables[0])}</div>
          ) : (
            model.hunks.map((hunk, index) => (
              <section key={index} data-diff-hunk={index} className="min-w-0 border-b">
                <div className="relative z-[6] bg-muted p-2 font-mono text-sm">
                  @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                  {t('(changed block)')}
                </div>

                {display(tables[index])}
              </section>
            ))
          )}
          {model.hunks.length === 0 && !expanded && <p>{t('文本内容相同；可展开查看上下文。')}</p>}
          {feedback && (
            <DiffBlockActions
              blocks={blocks}
              body={bodyRoot}
              gutters={gutters}
              split={sideBySide}
            />
          )}
        </div>
      </div>
    </div>
  );
}
