import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import type { ThemedTokenWithVariants } from 'shiki';
import { codeTokenStyle, markdownCodeText, useCodeHighlighting } from './code-highlighting';

function plainCode(children: ReactNode): boolean {
  return Children.toArray(children).every(
    (child) =>
      !isValidElement<{ children?: ReactNode; 'data-source-leaf'?: string }>(child) ||
      (child.type === 'span' &&
        child.props['data-source-leaf'] !== undefined &&
        plainCode(child.props.children)),
  );
}

/** Color text inside the original Markdown nodes, retaining source-mapping wrappers. */
function highlightCode(children: ReactNode, flat: ThemedTokenWithVariants[]) {
  let offset = 0;
  let index = 0;
  function highlight(nodes: ReactNode): ReactNode {
    return Children.map(nodes, (child) => {
      if (isValidElement<{ children?: ReactNode }>(child))
        return cloneElement(child, undefined, highlight(child.props.children));
      if (typeof child !== 'string' && typeof child !== 'number') return child;
      const text = String(child);
      const begin = offset;
      const end = offset + text.length;
      const parts: ReactNode[] = [];
      while (offset < end) {
        const token = flat[index];
        if (token && token.offset + token.content.length <= offset) {
          index++;
          continue;
        }
        const start = offset;
        const colored = token && token.offset <= offset;
        offset = Math.min(
          end,
          token ? (colored ? token.offset + token.content.length : token.offset) : end,
        );
        const value = text.slice(start - begin, offset - begin);
        parts.push(
          colored ? (
            <span key={start} data-shiki-token="" style={codeTokenStyle(token)}>
              {value}
            </span>
          ) : (
            value
          ),
        );
      }
      return parts;
    });
  }
  return highlight(children);
}

export function MarkdownCode({ children, language }: { children: ReactNode; language?: string }) {
  // Author-provided rehype markup owns its rendering; only our source wrappers are transparent.
  const { tokens } = useCodeHighlighting(
    markdownCodeText(children),
    plainCode(children) ? language : undefined,
  );
  return tokens ? highlightCode(children, tokens.flat()) : children;
}
