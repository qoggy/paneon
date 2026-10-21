import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from './utils';
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('markdown-body min-w-0 overflow-x-auto', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
