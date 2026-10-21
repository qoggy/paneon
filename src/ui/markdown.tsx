import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Children, isValidElement } from 'react';
import { Mermaid } from './mermaid';
import { cn } from './utils';

const components: Components = {
  pre({ children, node: _node, ...props }) {
    const child = Children.toArray(children)[0];
    if (
      isValidElement<{ className?: string; children?: string }>(child) &&
      child.type === 'code' &&
      child.props.className?.split(/\s+/).includes('language-mermaid')
    )
      return <Mermaid code={String(child.props.children ?? '').replace(/\n$/, '')} />;
    return <pre {...props}>{children}</pre>;
  },
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('markdown-body min-w-0 overflow-x-auto', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
