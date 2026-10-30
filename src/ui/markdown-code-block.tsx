import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { CodeBlockFrame } from './code-block-frame';
import { CodeBlockContent } from './code-block-primitives';
import { markdownCodeText } from './code-highlighting';
import { MarkdownCode } from './markdown-code';

export function MarkdownCodeBlock({
  children,
  language,
  ...props
}: Omit<ComponentProps<'pre'>, 'children'> & {
  children: ReactElement<ComponentProps<'code'> & { children?: ReactNode }>;
  language?: string;
}) {
  return (
    <CodeBlockFrame
      code={markdownCodeText(children.props.children)}
      language={language}
      data-slot="markdown-code-block"
    >
      {(wrap) => (
        <CodeBlockContent {...props} wrap={wrap} codeProps={children.props}>
          <MarkdownCode language={language}>{children.props.children}</MarkdownCode>
        </CodeBlockContent>
      )}
    </CodeBlockFrame>
  );
}
