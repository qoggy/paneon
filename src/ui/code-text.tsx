import { useLayoutEffect, useRef } from 'react';
import type { DiffInlineSpan } from './diff-presentation';
import { cn } from './utils';
import { codeTokenStyle, useCodeHighlighting } from './code-highlighting';

/** Private text renderer. Decorations split syntax tokens without changing source text. */
export function CodeText({
  code,
  language,
  className,
  spans = [],
  lineNumbers = false,
  highlightedLines,
  onReady,
}: {
  code: string;
  onReady?: (element: HTMLElement) => void;
  language?: string;
  className?: string;
  spans?: readonly DiffInlineSpan[];
  lineNumbers?: boolean;
  highlightedLines?: { start: number; end: number };
}) {
  const { language: lang, tokens } = useCodeHighlighting(code, language);
  const source = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if ((lang === 'text' || tokens) && source.current) onReady?.(source.current);
  }, [code, lang, tokens, onReady]);
  const decorate = (text: string, start: number) => {
    if (!spans.length) return text;
    const pieces = [];
    let cursor = start;
    const end = start + text.length;
    for (const span of spans) {
      if (span.end <= cursor) continue;
      if (span.start >= end) break;
      const from = Math.max(cursor, span.start),
        to = Math.min(end, span.end);
      if (from > cursor) pieces.push(text.slice(cursor - start, from - start));
      pieces.push(
        <span
          key={from}
          data-diff-inline={span.kind}
          style={{ backgroundColor: `var(--diff-${span.kind}-text)` }}
        >
          {text.slice(from - start, to - start)}
        </span>,
      );
      cursor = to;
    }
    if (cursor < end) pieces.push(text.slice(cursor - start));
    return pieces;
  };
  return (
    <pre
      data-language={lang}
      data-line-numbers={lineNumbers ? '' : undefined}
      className={cn(
        'max-w-full overflow-x-auto rounded-md border bg-muted/50 p-4 font-mono text-sm',
        className,
      )}
    >
      <code ref={source} className={lineNumbers ? 'block py-3' : undefined}>
        {tokens
          ? tokens.map((line, i) => (
              <span
                key={i}
                data-code-line={lineNumbers ? i + 1 : undefined}
                data-line-highlighted={
                  lineNumbers &&
                  highlightedLines &&
                  i + 1 >= highlightedLines.start &&
                  i + 1 <= highlightedLines.end
                    ? ''
                    : undefined
                }
                className={
                  lineNumbers
                    ? 'grid grid-cols-[4rem_1fr] border-l-2 border-transparent pr-4 before:pr-4 before:text-right before:text-muted-foreground before:content-[attr(data-code-line)] before:select-none data-line-highlighted:border-l-foreground/50 data-line-highlighted:bg-muted'
                    : undefined
                }
              >
                <span>
                  {line.map((token, j) => (
                    <span key={j} data-shiki-token="" style={codeTokenStyle(token)}>
                      {decorate(token.content, token.offset)}
                    </span>
                  ))}
                  {i < tokens.length - 1 ? '\n' : ''}
                </span>
              </span>
            ))
          : lineNumbers
            ? code.split(/\r\n|\r|\n/).map((line, i, all) => (
                <span
                  key={i}
                  data-code-line={i + 1}
                  data-line-highlighted={
                    highlightedLines &&
                    i + 1 >= highlightedLines.start &&
                    i + 1 <= highlightedLines.end
                      ? ''
                      : undefined
                  }
                  className="grid grid-cols-[4rem_1fr] border-l-2 border-transparent pr-4 before:pr-4 before:text-right before:text-muted-foreground before:content-[attr(data-code-line)] before:select-none data-line-highlighted:border-l-foreground/50 data-line-highlighted:bg-muted"
                >
                  <span>
                    {line}
                    {i < all.length - 1 ? '\n' : ''}
                  </span>
                </span>
              ))
            : decorate(code, 0)}
      </code>
    </pre>
  );
}
