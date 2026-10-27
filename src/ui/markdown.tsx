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
  type ReactNode,
} from 'react';
import type { JsonValue } from '../sdk/annotation';
import { annotationKey } from '../sdk/annotation';
import { useAnnotationContext, useAnnotations } from './annotation-context';
import { sourceMappingPlugin } from './markdown-annotation-mapper';
import { Mermaid } from './mermaid';
import { MarkdownCodeBlock } from './markdown-code-block';
import { markdownCodeText } from './code-highlighting';
import { parseFrontmatter } from './markdown-frontmatter';
import { MarkdownFrontmatter } from './markdown-frontmatter-view';
import { cn } from './utils';
import { useUI } from './use-ui';

const components: Components = {
  pre({ children, node: _node, ...props }) {
    const child = Children.toArray(children)[0];
    if (
      !isValidElement<{ className?: string; children?: ReactNode }>(child) ||
      child.type !== 'code'
    )
      return <pre {...props}>{children}</pre>;
    const language = child.props.className
      ?.split(/\s+/)
      .find((name) => name.startsWith('language-'))
      ?.slice(9);
    if (language === 'mermaid')
      return <Mermaid code={markdownCodeText(child.props.children).replace(/\n$/, '')} />;
    return (
      <MarkdownCodeBlock {...props} language={language}>
        {child}
      </MarkdownCodeBlock>
    );
  },
};

export type MarkdownProps<TRef = JsonValue> = {
  children: string;
  /** Recognize a leading YAML block; disable for intentionally ambiguous Markdown. */
  frontmatter?: 'auto' | 'off';
  /** Opt into the session enabled by usePageAnnotations; the value is delivered unchanged as target.ref. */
  annotationTarget?: TRef;
  className?: string;
  components?: Components;
  rehypePlugins?: ComponentProps<typeof ReactMarkdown>['rehypePlugins'];
};
type RenderProps = Omit<MarkdownProps, 'annotationTarget'> & {
  rootRef?: Ref<HTMLDivElement>;
  annotated?: boolean;
};
const MarkdownContent = /*#__PURE__*/ memo(function MarkdownContent({
  children,
  className,
  components: overrides,
  rehypePlugins,
  rootRef,
  annotated,
  frontmatter = 'auto',
}: RenderProps) {
  const metadata = useMemo(
    () => (frontmatter === 'off' ? null : parseFrontmatter(children)),
    [children, frontmatter],
  );
  return (
    <div
      ref={rootRef}
      className={cn('markdown-body min-w-0 overflow-x-auto', className)}
      data-markdown-annotation={annotated ? '' : undefined}
    >
      {metadata && <MarkdownFrontmatter value={metadata} annotated={annotated ?? false} />}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={{ ...components, ...overrides }}
      >
        {metadata?.markdown ?? children}
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
    const elementRoot = root.current;
    if (!elementRoot) return;
    let unregister: (() => void) | undefined;
    const register = () => {
      unregister?.();
      const segments = [...elementRoot.querySelectorAll<HTMLElement>('[data-source-leaf]')].flatMap(
        (element) => {
          const offsets = JSON.parse(element.dataset.sourceOffsets ?? '[]') as (number | null)[];
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          const mapped = [];
          let offset = 0;
          let node: Node | null;
          while ((node = walker.nextNode())) {
            const text = node as Text;
            mapped.push({
              node: text,
              sourceOffsets: offsets.slice(offset, offset + text.length + 1),
            });
            offset += text.length;
          }
          return mapped;
        },
      );
      unregister = store.registerText({ ref: reference, source, segments });
    };
    register();
    // Highlighting replaces Text nodes after tokenization; rebind their original source offsets.
    const observer = new MutationObserver(register);
    observer.observe(elementRoot, { childList: true, characterData: true, subtree: true });
    return () => {
      observer.disconnect();
      unregister?.();
    };
  }, [store, reference, source, props.components, props.frontmatter, plugins]);
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
