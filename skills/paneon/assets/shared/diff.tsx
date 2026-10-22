import { useLocale } from './i18n';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, CodeBlock, FeedbackTarget, Input, useFeedback } from 'paneon/ui';
import type { FeedbackTarget as Target } from 'paneon/sdk';
import { createDiffModel, sourceLines } from './diff-model.ts';
import type { DiffLine, DiffModel, DiffRow } from './diff-model.ts';
import type { GitRef } from './diff-schema.ts';
import { DiffToolbar } from './diff-toolbar.tsx';
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
/** Pure display/coordinate adapter: no repository, local Git call or source lookup. */
export function DiffView({
  sourceId,
  model: supplied,
  oldText,
  newText,
  oldPath,
  newPath,
  fileOnly = false,
  locateTarget,
}: {
  sourceId: string;
  model?: DiffModel;
  oldText?: string;
  newText?: string;
  oldPath?: string;
  newPath?: string;
  fileOnly?: boolean;
  locateTarget?: Target<GitRef>;
}) {
  const { t, message } = useLocale();
  const model = useMemo(
    () => supplied ?? createDiffModel(oldText, newText),
    [supplied, oldText, newText],
  );
  const feedback = useFeedback<GitRef>();
  const { registerText } = feedback;
  const root = useRef<HTMLDivElement>(null);
  const [unified, setUnified] = useState(false),
    [expanded, setExpanded] = useState(false);
  const [navigation, setNavigation] = useState({ sourceId, index: 0 });
  const currentHunk =
    navigation.sourceId === sourceId
      ? Math.min(navigation.index, Math.max(0, model.hunks.length - 1))
      : 0;
  const pendingLocation = useRef(false);
  useLayoutEffect(() => {
    setNavigation({ sourceId, index: 0 });
    pendingLocation.current = false;
  }, [sourceId]);
  const revealHunk = (index: number) => {
    const hunk = model.hunks[index];
    if (!hunk) return;
    const changed = hunk.rows.find((row) => row.kind !== 'context');
    const line = changed?.new ?? changed?.old;
    const side = changed?.new ? 'new' : 'old';
    const element =
      expanded && line
        ? root.current?.querySelector<HTMLElement>(
            `[data-code-side="${side}"][data-line="${line.number}"]`,
          )
        : root.current?.querySelector<HTMLElement>(`[data-diff-hunk="${index}"]`);
    element?.scrollIntoView({ block: 'center', inline: 'nearest' });
  };
  const navigate = (index: number) => {
    setNavigation({ sourceId, index });
    revealHunk(index);
  };
  useLayoutEffect(() => {
    if (!pendingLocation.current) return;
    pendingLocation.current = false;
    revealHunk(currentHunk);
  }, [unified, expanded]);
  const [rangeSide, setRangeSide] = useState<'old' | 'new'>('new'),
    [start, setStart] = useState('1'),
    [end, setEnd] = useState('1'),
    [error, setError] = useState('');
  useLayoutEffect(() => {
    if (!locateTarget) return;
    setExpanded(locateTarget.ref.kind === 'lines');
    setUnified(false);
  }, [locateTarget]);
  useLayoutEffect(() => {
    const elementRoot = root.current;
    if (!elementRoot || fileOnly) return;
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
  }, [sourceId, model, fileOnly, unified, expanded, registerText]);
  const chooseLine = (side: 'old' | 'new', first: number, last: number) => {
    const source = side === 'old' ? model.oldText : model.newText,
      lines = sourceLines(source ?? '');
    if (
      source === undefined ||
      !Number.isInteger(first) ||
      !Number.isInteger(last) ||
      first < 1 ||
      last < first ||
      last > lines.length
    ) {
      setError('请选择该侧有效的连续行范围。');
      return;
    }
    const quote = source.slice(lines[first - 1].start, lines[last - 1].end);
    feedback.toggleTarget({
      ref: { sourceId, kind: 'lines', side, startLine: first, endLine: last },
      text: { start: 0, end: quote.length, quote },
    });
    setError('');
  };
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
        className={`border-l align-top ${changed ? (side === 'old' ? 'bg-[var(--diff-deletion)]' : 'bg-[var(--diff-addition)]') : ''}`}
      >
        <div className="flex h-6 font-mono text-sm leading-6">
          <button
            type="button"
            className="w-12 shrink-0 pr-2 text-right text-muted-foreground select-none"
            disabled={feedback.mode !== 'select' || feedback.submitting}
            aria-label={t('Select {side} line {number}', {
              side: t(side === 'old' ? 'Old' : 'New'),
              number: line.number,
            })}
            onClick={() => chooseLine(side, line.number, line.number)}
          >
            {line.number}
          </button>
          <span aria-hidden="true" className="w-4 shrink-0 select-none">
            {changed ? (side === 'old' ? '-' : '+') : ' '}
          </span>
          <span
            data-code-side={side}
            data-source-start={line.start}
            data-line={line.number}
            className="min-w-max whitespace-pre"
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
      <div className="grid min-w-0 grid-cols-2 divide-x" data-diff-split="">
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
    <div ref={root} data-diff-source={sourceId} className="min-w-0 space-y-2">
      <style>
        {'::highlight(paneon-diff-location) { background-color: Highlight; color: HighlightText; }'}
      </style>
      <div className="sticky top-0 z-10 flex min-w-0 flex-wrap items-center gap-2 border-b bg-background py-1">
        <div className="min-w-0 flex-1">
          <FeedbackTarget<GitRef> target={{ sourceId, kind: 'file' }}>
            <div
              className="truncate rounded-md px-2 py-1 font-mono text-sm"
              title={`${oldPath ?? '∅'} → ${newPath ?? '∅'}`}
            >
              {oldPath ?? '∅'} → {newPath ?? '∅'}{' '}
              <span className="text-muted-foreground">{t('（整文件）')}</span>
            </div>
          </FeedbackTarget>
        </div>
        {!fileOnly && (
          <DiffToolbar
            unified={unified}
            expanded={expanded}
            current={currentHunk}
            total={model.hunks.length}
            onNavigate={navigate}
            onMode={(value) => {
              if (value === unified) {
                revealHunk(currentHunk);
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
        )}
      </div>
      {!fileOnly && (
        <>
          {feedback.mode === 'select' && (
            <div className="flex flex-wrap items-center gap-2">
              <label>
                {t('侧')}{' '}
                <select
                  aria-label={t('侧')}
                  value={rangeSide}
                  onChange={(e) => setRangeSide(e.target.value as 'old' | 'new')}
                >
                  <option value={'old'}>{t('旧')}</option>
                  <option value={'new'}>{t('新')}</option>
                </select>
              </label>
              <label>
                {t('起始行')}
                <Input
                  aria-label={t('起始行')}
                  type="number"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-24"
                />
              </label>
              <label>
                {t('结束行')}
                <Input
                  aria-label={t('结束行')}
                  type="number"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-24"
                />
              </label>
              <Button
                variant="outline"
                onClick={() => chooseLine(rangeSide, Number(start), Number(end))}
              >
                {t('选择连续行')}
              </Button>
            </div>
          )}
          {error && <p role="alert">{message(error)}</p>}
          {expanded ? (
            <div className="min-w-0 rounded-md border">{display(model.rows)}</div>
          ) : (
            model.hunks.map((hunk, index) => (
              <section key={index} data-diff-hunk={index} className="min-w-0 rounded-md border">
                <FeedbackTarget<GitRef>
                  target={{
                    sourceId,
                    kind: 'hunk',
                    oldStart: hunk.oldStart,
                    oldLines: hunk.oldLines,
                    newStart: hunk.newStart,
                    newLines: hunk.newLines,
                    patch: hunk.patch,
                  }}
                >
                  <div className="bg-muted p-2 font-mono text-sm">
                    @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                    {t('(changed block)')}
                  </div>
                </FeedbackTarget>
                {display(hunk.rows)}
              </section>
            ))
          )}
          {model.hunks.length === 0 && !expanded && <p>{t('文本内容相同；可展开查看上下文。')}</p>}
        </>
      )}
    </div>
  );
}

/** Exact DOM geometry for interval references created by explicit line controls.
 * The same mapping powers location and contextual markers, without registering
 * overlapping text sources or searching repeated quotes. */
export function diffTargetRanges(model: DiffModel, target: Target<GitRef>): Range[] {
  if (target.ref.kind !== 'lines' || !target.text) return [];
  const ref = target.ref,
    text = ref.side === 'old' ? model.oldText : model.newText;
  if (text === undefined) return [];
  const line = sourceLines(text)[ref.startLine - 1];
  if (!line) return [];
  const start = line.start + target.text.start,
    end = line.start + target.text.end;
  const root = document.querySelector<HTMLElement>(
    `[data-diff-source="${CSS.escape(ref.sourceId)}"]`,
  );
  if (!root) return [];
  const expected = text.slice(start, end);
  if (expected !== target.text.quote) return [];
  const ranges: Range[] = [];
  root.querySelectorAll<HTMLElement>(`[data-code-side="${ref.side}"]`).forEach((element) => {
    let offset = Number(element.dataset.sourceStart);
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const value = node as Text,
        next = offset + value.length;
      if (next > start && offset < end) {
        const range = document.createRange();
        range.setStart(value, Math.max(0, start - offset));
        range.setEnd(value, Math.min(value.length, end - offset));
        ranges.push(range);
      }
      offset = next;
    }
  });
  return ranges;
}

/** Reveal the actual selected source fragment in its own scroll pane. */
export function locateDiffTarget(model: DiffModel, target: Target<GitRef>) {
  const ranges = diffTargetRanges(model, target);
  const first = ranges[0]?.startContainer.parentElement;
  first?.scrollIntoView({ block: 'center', inline: 'nearest' });
  // Run after the public controller's default highlight. Separate ranges avoid
  // highlighting the opposite column between consecutive same-side rows.
  requestAnimationFrame(() => {
    // A source span can be wider than its pane: reveal the selected fragment,
    // rather than merely scrolling the whole line's start into view.
    const viewport = first?.closest<HTMLElement>('[data-diff-scroll]');
    const bounds = ranges[0]?.getBoundingClientRect();
    if (viewport && bounds) {
      const clip = viewport.getBoundingClientRect();
      if (bounds.left < clip.left || bounds.right > clip.right)
        viewport.scrollLeft += bounds.left - clip.left - 16;
    }
    document.getSelection()?.removeAllRanges();
    if (CSS.highlights && typeof Highlight !== 'undefined')
      CSS.highlights.set('paneon-diff-location', new Highlight(...ranges));
  });
}
