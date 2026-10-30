import type { DiffInlineSpan } from './diff-presentation';
import { cn } from './utils';
import { codeTokenStyle, useCodeHighlighting } from './code-highlighting';

/** Private text renderer. Decorations split syntax tokens without changing source text. */
export function CodeText({
  code,
  language,
  className,
  spans = [],
}: {
  code: string;
  language?: string;
  className?: string;
  spans?: readonly DiffInlineSpan[];
}) {
  const { language: lang, tokens } = useCodeHighlighting(code, language);
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
      className={cn(
        'max-w-full overflow-x-auto rounded-md border bg-muted/50 p-4 font-mono text-sm',
        className,
      )}
    >
      <code>
        {tokens
          ? tokens.map((line, i) => (
              <span key={i}>
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
          : decorate(code, 0)}
      </code>
    </pre>
  );
}
