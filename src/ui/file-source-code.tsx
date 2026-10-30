import { useLayoutEffect, useRef } from 'react';
import { CodeBlockContent, CodeBlockLine } from './code-block-primitives';
import { codeTokenStyle, useCodeHighlighting } from './code-highlighting';

/** Line presentation over the exact normalized display string; mapping stays with the file. */
export function FileSourceCode({
  code,
  language,
  highlightedLines,
  onReady,
}: {
  code: string;
  language?: string;
  highlightedLines?: { start: number; end: number };
  onReady: (element: HTMLElement) => void;
}) {
  const { language: lang, tokens } = useCodeHighlighting(code, language);
  const source = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if ((lang === 'text' || tokens) && source.current) onReady(source.current);
  }, [code, lang, tokens, onReady]);
  const lines = code.split('\n');
  return (
    <CodeBlockContent
      data-language={lang}
      lineNumbers
      codeProps={{ ref: source }}
      className="m-0 min-h-full w-max min-w-full overflow-visible text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
    >
      {lines.map((line, index) => {
        const highlighted =
          highlightedLines &&
          index + 1 >= highlightedLines.start &&
          index + 1 <= highlightedLines.end;
        return (
          <CodeBlockLine
            key={index}
            data-code-line={index + 1}
            data-line-highlighted={highlighted ? '' : undefined}
            variant={highlighted ? 'highlighted' : 'default'}
          >
            {tokens
              ? tokens[index]?.map((token, tokenIndex) => (
                  <span key={tokenIndex} data-shiki-token="" style={codeTokenStyle(token)}>
                    {token.content}
                  </span>
                ))
              : line}
            {index < lines.length - 1 ? '\n' : ''}
          </CodeBlockLine>
        );
      })}
    </CodeBlockContent>
  );
}
