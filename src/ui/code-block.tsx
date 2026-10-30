import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { annotationKey, type JsonValue } from '../sdk/annotation.js';
import { useAnnotationContext } from './annotation-context';
import { CodeBlockFrame } from './code-block-frame';
import { CodeBlockContent, CodeBlockLine } from './code-block-primitives';
import { codeTokenStyle, useCodeHighlighting } from './code-highlighting';
import { fileTextSegments } from './file-annotation-source';

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
  const sourceProps = { code, language, lineNumbers, highlightedLines };
  return (
    <CodeBlockFrame
      code={code}
      language={language}
      header={header}
      defaultWrap={defaultWrap}
      className={className}
    >
      {(wrap) =>
        annotationTarget === undefined ? (
          <CodeSource {...sourceProps} wrap={wrap} />
        ) : (
          <AnnotatedCodeSource {...sourceProps} wrap={wrap} target={annotationTarget} />
        )
      }
    </CodeBlockFrame>
  );
}

type CodeSourceProps = Pick<CodeBlockProps, 'code' | 'language' | 'highlightedLines'> & {
  lineNumbers: boolean;
  wrap: boolean;
  onReady?: (element: HTMLElement) => void;
};

function CodeSource({
  code,
  language,
  lineNumbers,
  highlightedLines,
  wrap,
  onReady,
}: CodeSourceProps) {
  const display = useMemo(() => code.replace(/\r\n?/g, '\n'), [code]);
  const { language: lang, tokens } = useCodeHighlighting(display, language);
  const source = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (source.current) onReady?.(source.current);
  }, [code, tokens, lineNumbers, onReady]);
  const lines = display.split('\n');
  return (
    <CodeBlockContent
      data-language={lang}
      lineNumbers={lineNumbers}
      wrap={wrap}
      codeProps={{ ref: source }}
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

function AnnotatedCodeSource<TRef>({ target, ...props }: CodeSourceProps & { target: TRef }) {
  const { store } = useAnnotationContext<TRef>();
  const key = annotationKey(target);
  const reference = useMemo(() => JSON.parse(key) as TRef, [key]);
  const unregister = useRef<(() => void) | undefined>(undefined);
  const { code } = props;
  const ready = useCallback(
    (element: HTMLElement) => {
      unregister.current?.();
      unregister.current = store.registerText({
        ref: reference,
        source: code,
        segments: fileTextSegments(element, code),
      });
    },
    [store, reference, code],
  );
  useLayoutEffect(() => () => unregister.current?.(), []);
  return <CodeSource {...props} onReady={ready} />;
}
