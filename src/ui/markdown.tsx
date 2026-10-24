import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Children,
  isValidElement,
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  type ComponentProps,
  type Ref,
} from 'react';
import type { JsonValue } from '../sdk/annotation';
import { annotationKey } from '../sdk/annotation';
import { useAnnotationContext, useAnnotations } from './annotation-context';
import { sourceMappingPlugin } from './markdown-annotation-mapper';
import { Mermaid } from './mermaid';
import { cn } from './utils';
import { useUI } from './use-ui';

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

export type MarkdownProps<TRef = JsonValue> = {
  children: string;
  /** Opt into annotations inside AnnotationRoot; the value is delivered unchanged as target.ref. */
  annotationTarget?: TRef;
  className?: string;
  components?: Components;
  rehypePlugins?: ComponentProps<typeof ReactMarkdown>['rehypePlugins'];
};
type RenderProps = Omit<MarkdownProps, 'annotationTarget'> & {
  rootRef?: Ref<HTMLDivElement>;
  annotated?: boolean;
};
const MarkdownContent = memo(function MarkdownContent({
  children,
  className,
  components: overrides,
  rehypePlugins,
  rootRef,
  annotated,
}: RenderProps) {
  return (
    <div
      ref={rootRef}
      className={cn('markdown-body min-w-0 overflow-x-auto', className)}
      data-markdown-annotation={annotated ? '' : undefined}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={{ ...components, ...overrides }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
function AnnotatedMarkdown<TRef>({
  target,
  children,
  rehypePlugins,
  ...props
}: Omit<MarkdownProps<TRef>, 'annotationTarget'> & { target: TRef }) {
  const { store } = useAnnotationContext<TRef>();
  const { t } = useUI();
  useAnnotations<TRef>();
  const root = useRef<HTMLDivElement>(null);
  const key = annotationKey(target);
  const reference = useMemo(() => JSON.parse(key) as TRef, [key]);
  // A prop refresh must not silently reattach a saved/in-progress annotation to newer text.
  const source = store.retainedSource(reference) ?? children;
  const plugins = useMemo(
    () => [
      ...(rehypePlugins ?? []),
      sourceMappingPlugin(source, (entity) => {
        const decoder = document.createElement('textarea');
        decoder.innerHTML = entity;
        return decoder.value;
      }),
    ],
    [source, rehypePlugins],
  );
  useLayoutEffect(() => {
    if (!root.current) return;
    const segments = [...root.current.querySelectorAll<HTMLElement>('[data-source-leaf]')].flatMap(
      (element) => {
        const node = element.firstChild;
        if (node?.nodeType !== Node.TEXT_NODE) return [];
        return [
          {
            node: node as Text,
            sourceOffsets: JSON.parse(element.dataset.sourceOffsets ?? '[]') as (number | null)[],
          },
        ];
      },
    );
    return store.registerText({ ref: reference, source, segments });
  }, [store, reference, source, props.components, plugins]);
  return (
    <>
      <MarkdownContent {...props} rootRef={root} annotated rehypePlugins={plugins}>
        {source}
      </MarkdownContent>
      {source !== children && (
        <p role="status" className="mt-2 text-xs text-muted-foreground" data-markdown-retained="">
          {t(
            'Showing the version being annotated. Remove its draft annotations to display the updated content.',
          )}
        </p>
      )}
    </>
  );
}
export function Markdown<TRef = JsonValue>({ annotationTarget, ...props }: MarkdownProps<TRef>) {
  return annotationTarget === undefined ? (
    <MarkdownContent {...props} />
  ) : (
    <AnnotatedMarkdown {...props} target={annotationTarget} />
  );
}
