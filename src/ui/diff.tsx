import { useUI } from './use-ui';
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from './button';
import { CodeBlock } from './code-block';
import { useAnnotations } from './annotation-context';
import type { AnnotationTarget as Target } from '../sdk/annotation';
import { createDiffModel, diffChanges, sourceLines } from '../shared/diff-model';
import type { DiffLine, DiffModel, DiffRow } from '../shared/diff-model';
import type { DiffRef } from '../shared/diff-model';
import { DiffToolbar } from './diff-toolbar';
import { useDiffSplit } from './diff-split';
import { revealDiffElement } from './diff-annotation';
function splitRows(rows: DiffRow[]) {
  const result: { old?: DiffLine; new?: DiffLine; kind: DiffRow['kind'] }[] = [];
  for (let i = 0; i < rows.length;) {
    if (rows[i].kind === 'context') {
      result.push(rows[i++]);
      continue;
    }
    const removed: DiffLine[] = [],
      added: DiffLine[] = [];
    while (i < rows.length && rows[i].kind !== 'context') {
      if (rows[i].old) removed.push(rows[i].old as DiffLine);
      if (rows[i].new) added.push(rows[i].new as DiffLine);
      i++;
    }
    for (let j = 0; j < Math.max(removed.length, added.length); j++)
      result.push({ old: removed[j], new: added[j], kind: 'add' });
  }
  return result;
}
export type DiffViewProps = {
  sourceId?: string;
  model?: DiffModel;
  oldText?: string;
  newText?: string;
  oldPath?: string;
  newPath?: string;
  oldRevision?: string;
  newRevision?: string;
  defaultExpanded?: boolean;
  locateTarget?: Target<DiffRef>;
  onCollapse?: () => void;
  /** Opt into a bounded code viewport; ordinary document consumers retain natural flow. */
  layout?: 'document' | 'bounded';
};
/** String diff needs no provider; supplying sourceId opts into the existing annotation adapter. */
export function DiffView(props: DiffViewProps) {
  return props.sourceId ? <AnnotatedDiffView {...props} /> : <StringDiffView {...props} />;
}
function AnnotatedDiffView(props: DiffViewProps) {
  const feedback = useAnnotations<DiffRef>();
  return <StringDiffView {...props} feedback={feedback} />;
}

/** Pure display/coordinate adapter: no repository, local Git call or source lookup. */
function StringDiffView({
  sourceId: suppliedSourceId,
  model: supplied,
  oldText,
  newText,
  oldPath,
  newPath,
  oldRevision,
  newRevision,
  defaultExpanded = false,
  locateTarget,
  onCollapse,
  layout = 'document',
  feedback,
}: DiffViewProps & { feedback?: ReturnType<typeof useAnnotations<DiffRef>> }) {
  const localSourceId = useId();
  const sourceId = suppliedSourceId ?? localSourceId;
  const { t, message } = useUI();
  const model = useMemo(
    () => supplied ?? createDiffModel(oldText, newText),
    [supplied, oldText, newText],
  );
  const changes = useMemo(() => diffChanges(model.rows), [model]);
  const headerId = useId();
  const registerText = feedback?.registerText;
  const root = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({
    sourceId,
    defaultExpanded,
    locateTarget,
    unified: false,
    expanded: locateTarget ? locateTarget.ref.kind === 'lines' : defaultExpanded,
    index: 0,
  });
  const sourceChanged = view.sourceId !== sourceId || view.defaultExpanded !== defaultExpanded;
  const targetChanged = view.locateTarget !== locateTarget;
  if (sourceChanged || targetChanged) {
    setView({
      ...view,
      sourceId,
      defaultExpanded,
      locateTarget,
      index: sourceChanged ? 0 : view.index,
      unified: targetChanged && locateTarget ? false : view.unified,
      expanded:
        targetChanged && locateTarget
          ? locateTarget.ref.kind === 'lines'
          : sourceChanged
            ? defaultExpanded
            : view.expanded,
    });
  }
  const { unified, expanded } = view;
  const setUnified = (value: boolean) => setView((current) => ({ ...current, unified: value }));
  const setExpanded = (value: boolean) => setView((current) => ({ ...current, expanded: value }));
  const splitLayout = useDiffSplit(!unified, t('调整差异两侧宽度'));
  const attachSplitRoot = splitLayout.attachRoot;
  const attachRoot = useCallback(
    (element: HTMLDivElement | null) => {
      root.current = element;
      attachSplitRoot(element);
    },
    [attachSplitRoot],
  );
  const initialLocation = useRef<string | null>(null);
  const currentChange = Math.min(view.index, Math.max(0, changes.length - 1));
  const pendingLocation = useRef(false);
  useLayoutEffect(() => {
    pendingLocation.current = false;
  }, [sourceId, defaultExpanded]);
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
    if (initialLocation.current === sourceId) return;
    if (defaultExpanded && !expanded) return;
    initialLocation.current = sourceId;
    if (!defaultExpanded || locateTarget) return;
    const frame = requestAnimationFrame(() => revealChange(0));
    return () => cancelAnimationFrame(frame);
  }, [sourceId, expanded, defaultExpanded, locateTarget, revealChange]);
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
    if (!elementRoot || !registerText) return;
    let removers: (() => void)[] = [];
    const register = () => {
      removers.forEach((remove) => remove());
      removers = [];
      for (const side of ['old', 'new'] as const) {
        const source = side === 'old' ? model.oldText : model.newText;
        if (!source) continue;
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
            ref: {
              sourceId,
              kind: 'lines',
              side,
              startLine: 1,
              endLine: sourceLines(source).length,
            },
            source,
            segments,
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
  }, [sourceId, model, unified, expanded, registerText]);
  function code(
    side: 'old' | 'new',
    line: DiffLine | undefined,
    changed: boolean,
    endingNote: boolean,
  ) {
    if (!line)
      return (
        <td className="bg-muted/30">
          <div className="h-6" />
          {endingNote && <div className="h-5" />}
        </td>
      );
    const body = line.text.replace(/\r?\n$/, '');
    const ending = line.text.slice(body.length);
    const extension = (side === 'old' ? oldPath : newPath)?.split('.').at(-1);
    const language = (
      {
        ts: 'typescript',
        tsx: 'tsx',
        js: 'javascript',
        jsx: 'jsx',
        json: 'json',
        sh: 'bash',
        yaml: 'yaml',
        yml: 'yaml',
      } as Record<string, string>
    )[extension ?? ''];
    return (
      <td
        className={`align-top ${changed ? (side === 'old' ? 'bg-[var(--diff-deletion)]' : 'bg-[var(--diff-addition)]') : ''}`}
      >
        <div className="flex h-6 font-mono text-sm leading-6">
          <span
            className={`sticky z-[1] flex shrink-0 items-center bg-background/95 text-muted-foreground select-none ${side === 'old' && !unified ? 'right-0 order-2 border-l' : 'left-0 border-r'}`}
            data-diff-gutter={side}
            style={
              changed
                ? {
                    backgroundColor:
                      side === 'old' ? 'var(--diff-deletion)' : 'var(--diff-addition)',
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
            className="min-w-max flex-1 px-3 whitespace-pre"
          >
            <CodeBlock
              code={body}
              language={language}
              className="inline max-w-none overflow-visible rounded-none border-0 bg-transparent p-0 leading-6"
            />
            {ending}
          </span>
        </div>
        {endingNote && (
          <div className="h-5 pl-16 text-xs text-muted-foreground select-none">
            {!line.text.endsWith('\n') ? `\\ ${t('No newline at end of file')}` : ''}
          </div>
        )}
      </td>
    );
  }
  const display = (rows: DiffRow[]) => {
    const split = splitRows(rows);
    const hasEndingNote = (row: { old?: DiffLine; new?: DiffLine }) =>
      !!((row.old && !row.old.text.endsWith('\n')) || (row.new && !row.new.text.endsWith('\n')));
    return unified ? (
      <div
        className="min-w-0 overflow-x-auto"
        data-diff-scroll="unified"
        tabIndex={0}
        aria-label={t('单列差异，横向滚动查看长行')}
      >
        <table className="w-max min-w-full border-collapse">
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {code(
                  row.kind === 'delete' ? 'old' : 'new',
                  row.kind === 'delete' ? row.old : row.new,
                  row.kind !== 'context',
                  hasEndingNote(row),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div
        className="grid min-w-0"
        style={{ gridTemplateColumns: 'var(--diff-columns, 50% 50%)' }}
        data-diff-split=""
      >
        {(['old', 'new'] as const).map((side) => (
          <div
            key={side}
            className="min-w-0 overflow-x-auto"
            data-diff-scroll={side}
            tabIndex={0}
            aria-label={t('{side} diff, scroll horizontally for long lines', {
              side: t(side === 'old' ? 'Old' : 'New'),
            })}
          >
            <table className="w-max min-w-full border-collapse">
              <tbody>
                {split.map((row, index) => (
                  <tr key={index}>
                    {code(side, row[side], row.kind !== 'context', hasEndingNote(row))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  };
  return (
    <div
      ref={attachRoot}
      data-diff-source={sourceId}
      className={
        layout === 'bounded' ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden' : 'min-w-0'
      }
      data-diff-layout={layout}
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
              gridTemplateColumns: unified ? 'minmax(0,1fr)' : 'var(--diff-columns, 50% 50%)',
            }}
          >
            {(['old', 'new'] as const).map((side) => (
              <div
                key={side}
                data-diff-source-header={side}
                className="flex min-w-0 items-center gap-2 px-3 py-1.5 first:border-r"
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
        className={
          layout === 'bounded'
            ? 'min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain'
            : undefined
        }
      >
        <div
          className="relative min-h-full min-w-0"
          data-diff-body=""
          data-annotation-clip-top={headerId}
        >
          {!unified && (
            <div
              {...splitLayout.separatorProps}
              data-diff-divider=""
              className="absolute inset-y-0 z-[5] w-2 -translate-x-1/2 cursor-col-resize touch-none outline-none before:absolute before:inset-y-0 before:left-1/2 before:w-px before:bg-border hover:bg-muted-foreground/10 focus-visible:ring-2 focus-visible:ring-ring data-[dragging]:bg-muted-foreground/15"
              style={{ left: 'var(--diff-left, 50%)' }}
            />
          )}
          {expanded ? (
            <div className="min-w-0 border-b">{display(model.rows)}</div>
          ) : (
            model.hunks.map((hunk, index) => (
              <section key={index} data-diff-hunk={index} className="min-w-0 border-b">
                <div className="relative z-[6] bg-muted p-2 font-mono text-sm">
                  @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                  {t('(changed block)')}
                </div>

                {display(hunk.rows)}
              </section>
            ))
          )}
          {model.hunks.length === 0 && !expanded && <p>{t('文本内容相同；可展开查看上下文。')}</p>}
        </div>
      </div>
    </div>
  );
}
