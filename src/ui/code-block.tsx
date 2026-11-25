import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ThemedTokenWithVariants } from 'shiki';
import { annotationKey, type JsonValue } from '../sdk/annotation.js';
import { useAnnotationContext } from './annotation-context';
import type { AnnotationTextRegistration } from './annotation-types';
import { CodeBlockFoldActions, JsonFoldMarker } from './code-block-fold-controls';
import { CodeBlockFrame } from './code-block-frame';
import { CodeBlockContent, CodeBlockLine } from './code-block-primitives';
import { codeBlockSource, visibleCodeRows, type CodeSourcePart } from './code-block-source';
import { codeTokenStyle, useCodeHighlighting } from './code-highlighting';
import { fileSourceOffsets, textSegmentsAt } from './file-annotation-source';

export type CodeBlockProps<TRef = JsonValue> = {
  /** Original source used for copying and annotation coordinates. */
  code: string;
  /** Bundled highlighting language; omitted or unknown languages render as plain text. */
  language?: string;
  /** Defaults to true (language title); a string sets the title, false uses floating actions. */
  header?: boolean | string;
  /** Show logical line numbers starting at 1. Defaults to false. */
  lineNumbers?: boolean;
  /** Initial word wrapping; users can toggle it. Defaults to true. */
  defaultWrap?: boolean;
  /** One inclusive logical line range, starting at 1; independent of line numbers. */
  highlightedLines?: { start: number; end: number };
  /** Opt into the page annotation session; delivered unchanged as target.ref. */
  annotationTarget?: TRef;
  /** Class name for the entire root container. */
  className?: string;
};

export function CodeBlock<TRef = JsonValue>({
  code,
  language,
  header,
  lineNumbers = false,
  defaultWrap = true,
  highlightedLines,
  annotationTarget,
  className,
}: CodeBlockProps<TRef>) {
  const lang = language?.toLowerCase();
  const json = lang === 'json' || lang === 'jsonc';
  const model = useMemo(() => codeBlockSource(code, json), [code, json]);
  const [view, setView] = useState(() => ({ model, folded: new Set<number>() }));
  if (view.model !== model) setView({ model, folded: new Set() });
  const { folded } = view;
  const setFolded = useCallback((next: Set<number>) => setView({ model, folded: next }), [model]);
  const toggle = useCallback(
    (start: number) => {
      setView((current) => {
        const next = new Set(current.folded);
        if (next.has(start)) next.delete(start);
        else next.add(start);
        return { model, folded: next };
      });
    },
    [model],
  );
  const atBulkFold =
    folded.size === model.bulkFolded.size &&
    [...folded].every((start) => model.bulkFolded.has(start));
  const sourceProps = { code, language, lineNumbers, highlightedLines, model, folded, toggle };
  return (
    <CodeBlockFrame
      code={code}
      language={language}
      header={header}
      defaultWrap={defaultWrap}
      className={className}
      leadingActions={
        model.sections.length > 0 && (
          <CodeBlockFoldActions
            canExpand={folded.size > 0}
            canCollapse={model.bulkFolded.size > 0 && !atBulkFold}
            expand={() => setFolded(new Set())}
            collapse={() => setFolded(model.bulkFolded)}
          />
        )
      }
    >
      {(wrap) =>
        annotationTarget === undefined ? (
          <CodeSource {...sourceProps} wrap={wrap} />
        ) : (
          <AnnotatedCodeSource
            {...sourceProps}
            wrap={wrap}
            target={annotationTarget}
            setFolded={setFolded}
          />
        )
      }
    </CodeBlockFrame>
  );
}

type CodeSourceProps = Pick<CodeBlockProps, 'code' | 'language' | 'highlightedLines'> & {
  lineNumbers: boolean;
  wrap: boolean;
  model: ReturnType<typeof codeBlockSource>;
  folded: ReadonlySet<number>;
  toggle: (start: number) => void;
  onReady?: (element: HTMLElement) => void;
};

function SourcePart({
  model,
  part,
  tokens,
}: {
  model: CodeSourceProps['model'];
  part: CodeSourcePart;
  tokens: ThemedTokenWithVariants[] | undefined;
}) {
  const { from, to, line } = part;
  const end = model.lines[line].end;
  return (
    <span data-code-source-offset={from}>
      {tokens
        ? tokens.map((token) => {
            const start = Math.max(from - token.offset, 0);
            const stop = Math.min(to - token.offset, token.content.length);
            return start < stop ? (
              <span key={token.offset} data-shiki-token="" style={codeTokenStyle(token)}>
                {token.content.slice(start, stop)}
              </span>
            ) : null;
          })
        : model.display.slice(from, Math.min(end, to))}
      {to > end ? '\n' : ''}
    </span>
  );
}

function CodeSource({
  code,
  language,
  lineNumbers,
  highlightedLines,
  wrap,
  model,
  folded,
  toggle,
  onReady,
}: CodeSourceProps) {
  const { language: lang, tokens } = useCodeHighlighting(model.display, language);
  const rows = useMemo(() => visibleCodeRows(model, folded), [model, folded]);
  const hasFolds = model.sections.length > 0;
  const source = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (source.current) onReady?.(source.current);
  }, [code, rows, tokens, lineNumbers, onReady]);
  return (
    <CodeBlockContent
      data-language={lang}
      data-json-folds={hasFolds || undefined}
      lineNumbers={lineNumbers}
      wrap={wrap}
      codeProps={{ ref: source }}
      style={
        hasFolds
          ? ({ '--code-line-digits': `${String(model.lines.length).length}ch` } as CSSProperties)
          : undefined
      }
    >
      {rows.map(({ line, parts }) => {
        const number = line + 1;
        const highlighted =
          highlightedLines && number >= highlightedLines.start && number <= highlightedLines.end;
        const gutter = parts.find((part) => 'start' in part);
        return (
          <CodeBlockLine
            key={line}
            data-code-line={number}
            data-line-highlighted={highlighted ? '' : undefined}
            variant={highlighted ? 'highlighted' : 'default'}
          >
            {parts.map((part) =>
              'start' in part ? (
                <JsonFoldMarker
                  key={`fold-${part.start}`}
                  section={part}
                  folded={folded.has(part.start)}
                  gutter={part === gutter}
                  toggle={() => toggle(part.start)}
                />
              ) : (
                <SourcePart
                  key={part.from}
                  model={model}
                  part={part}
                  tokens={tokens?.[part.line]}
                />
              ),
            )}
          </CodeBlockLine>
        );
      })}
    </CodeBlockContent>
  );
}

function AnnotatedCodeSource<TRef>({
  target,
  setFolded,
  ...props
}: CodeSourceProps & {
  target: TRef;
  setFolded: (next: Set<number>) => void;
}) {
  const { store } = useAnnotationContext<TRef>();
  const key = annotationKey(target);
  const reference = useMemo(() => JSON.parse(key) as TRef, [key]);
  const unregister = useRef<(() => void) | undefined>(undefined);
  const pendingReveal = useRef<(() => void) | undefined>(undefined);
  const { code, model, folded } = props;
  const offsets = useMemo(() => fileSourceOffsets(code), [code]);
  const locate = useCallback<NonNullable<AnnotationTextRegistration<TRef>['locate']>>(
    ({ text }) => {
      if (!text || folded.size === 0) return;
      const next = new Set(folded);
      for (const { start, end } of model.sections) {
        if (offsets[start] < text.end && offsets[end] > text.start) next.delete(start);
      }
      if (next.size === folded.size) return;
      return new Promise<void>((resolve) => {
        pendingReveal.current?.();
        pendingReveal.current = resolve;
        setFolded(next);
      });
    },
    [folded, model, offsets, setFolded],
  );
  const ready = useCallback(
    (element: HTMLElement) => {
      unregister.current?.();
      unregister.current = store.registerText({
        ref: reference,
        source: code,
        segments: Array.from(
          element.querySelectorAll<HTMLElement>('[data-code-source-offset]'),
        ).flatMap((part) => textSegmentsAt(part, offsets, Number(part.dataset.codeSourceOffset))),
        locate: model.sections.length > 0 ? locate : undefined,
        locateAfterAdapter: true,
      });
      // Position the selection only after the newly visible source has been registered.
      pendingReveal.current?.();
      pendingReveal.current = undefined;
    },
    [store, reference, code, offsets, locate, model],
  );
  useLayoutEffect(
    () => () => {
      unregister.current?.();
      pendingReveal.current?.();
      pendingReveal.current = undefined;
    },
    [],
  );
  return <CodeSource {...props} onReady={ready} />;
}
