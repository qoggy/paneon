import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import { serverAction, z } from '@qoggy/paneon/sdk';
import { PanelInputContext } from '@qoggy/paneon/sdk/client';
import { readFilePreview } from '../runtime/file-preview';
import {
  Children,
  createContext,
  useContext,
  useId,
  useImperativeHandle,
  isValidElement,
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type Ref,
  type ReactNode,
  type ReactElement,
} from 'react';
import type { AnnotationTarget, JsonValue } from '../sdk/annotation';
import { annotationKey } from '../sdk/annotation';
import { useAnnotationContext, useAnnotations } from './annotation-context';
import { sourceMappingPlugin } from './markdown-annotation-mapper';
import type { SourceNode } from './markdown-annotation-mapper';
import { MediaAnnotationContext, MediaToolbarHostContext } from './media-annotation';
import { parseFrontmatter } from './markdown-frontmatter';
import { MarkdownFrontmatter } from './markdown-frontmatter-view';
import { Mermaid } from './mermaid';
import { MarkdownCodeBlock } from './markdown-code-block';
import { markdownCodeText } from './code-highlighting';
import { ImageContent } from './image';
import { useImagePreview } from './image-preview';
import { MarkdownOutline } from './markdown-outline';
import { useUI } from './use-ui';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { markdownLink, markdownLinkAddress } from '../shared/file-references';
import type { FileReferenceRequest } from '../shared/file-references';
import { FileReferenceContext, useFileReference } from './file-reference-context';
import { useBrowserAction } from './browser-action-context';
import { AnnotationEnabledContext, AnnotationEnvironmentContext } from './annotation-environment';
import { FilePreviewSheet } from './file-preview';
import { toast } from './toast-manager';

/** Component-private text reader; Image owns image reads. */
// eslint-disable-next-line react-refresh/only-export-components -- The build separates component actions before React compilation.
export const readLocalFile = serverAction({
  kind: 'query',
  input: z.object({ href: z.string(), sourcePath: z.string().optional() }).strict(),
  handler: async (_ctx, input) => {
    try {
      const file = await readFilePreview(process.cwd(), {
        href: input.href,
        ...(input.sourcePath ? { sourcePath: input.sourcePath } : {}),
      });
      return { ok: true as const, path: file.path, content: file.text };
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (error instanceof Error && code && /^(FILE_|INVALID_FILE_REFERENCE$)/.test(code))
        return { ok: false as const, error: { code, message: error.message } };
      throw error;
    }
  },
});

async function readTextReference(reference: FileReferenceRequest) {
  const result = await readLocalFile(reference);
  if (!result.ok) throw Object.assign(new Error(result.error.message), { code: result.error.code });
  return { path: result.path, text: result.content };
}

const FileLinkContext = createContext<{
  sourcePath?: string;
  openFile: (reference: FileReferenceRequest, trigger: HTMLAnchorElement) => void;
  revealAnchor: (href: string) => boolean;
} | null>(null);
const MarkdownMediaContext = createContext<{ ref: unknown; source: string } | undefined>(undefined);

function markdownMediaTarget(
  context: { ref: unknown; source: string } | undefined,
  node: SourceNode | undefined,
  mermaid: boolean,
) {
  const start = node?.position?.start.offset,
    end = node?.position?.end.offset;
  if (!context || start === undefined || end === undefined) return undefined;
  const target: AnnotationTarget<unknown> = mermaid
    ? { ref: context.ref, type: 'mermaid', text: { start, end } }
    : { ref: context.ref, text: { start, end, quote: context.source.slice(start, end) } };
  return {
    target,
    source: context.source,
    summary: mermaid ? 'Mermaid' : context.source.slice(start, end),
  };
}

function MarkdownLink({
  node,
  href = '',
  children,
  ...props
}: ComponentProps<'a'> & { node?: SourceNode }) {
  const target = markdownLink(href);
  const context = useContext(FileLinkContext);
  const readFile = useFileReference();
  const browserAction = useBrowserAction();
  const { t } = useUI();
  const document = useContext(MarkdownMediaContext);
  const annotationEnabled = useContext(AnnotationEnabledContext);
  const [tools, setTools] = useState<HTMLSpanElement | null>(null);
  const linkedMedia =
    document && annotationEnabled && node?.children?.some((child) => child.tagName === 'img');
  const withMedia = (link: ReactElement) =>
    linkedMedia ? (
      <span className="group/media inline-flex max-w-full items-start gap-2 align-top">
        <MediaToolbarHostContext.Provider value={tools}>{link}</MediaToolbarHostContext.Provider>
        <span ref={setTools} className="flex shrink-0 items-start gap-1" />
      </span>
    ) : (
      link
    );
  const withAddress = (element: ReactElement) =>
    href ? (
      <Tooltip>
        <TooltipTrigger delay={500} render={element} />
        <TooltipContent className="max-w-[min(32rem,calc(100vw-2rem))] text-left break-all">
          {markdownLinkAddress(href)}
        </TooltipContent>
      </Tooltip>
    ) : (
      element
    );
  if (target.kind === 'disabled' || (target.kind === 'file' && (!context || !readFile)))
    return withAddress(<span tabIndex={-1}>{children}</span>);
  if (target.kind === 'anchor')
    return withMedia(
      <a
        {...props}
        href={href}
        onClick={(event) => {
          props.onClick?.(event);
          if (!event.defaultPrevented && context?.revealAnchor(href)) event.preventDefault();
        }}
      >
        {children}
      </a>,
    );
  const link = withAddress(
    <a
      {...props}
      title={undefined}
      href={href}
      onClick={(event) => {
        props.onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        if (target.kind === 'file' && context) {
          context.openFile(
            { href, ...(context?.sourcePath ? { sourcePath: context.sourcePath } : {}) },
            event.currentTarget,
          );
        } else if (target.kind === 'web') {
          void browserAction({ kind: 'open-url', url: target.url }).catch((error: unknown) => {
            console.error('Open Markdown link failed.', error);
            toast.add({ title: t('Unable to open link.'), type: 'error' });
          });
        }
      }}
    >
      {children}
    </a>,
  );
  return withMedia(link);
}

const components: Components = {
  a: MarkdownLink,
  img: MarkdownImage,
  pre: MarkdownPre,
};

function MarkdownPre({ children, node, ...props }: ComponentProps<'pre'> & { node?: SourceNode }) {
  const context = useContext(MarkdownMediaContext);
  const child = Children.toArray(children)[0];
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child) || child.type !== 'code')
    return <pre {...props}>{children}</pre>;
  const language = child.props.className
    ?.split(/\s+/)
    .find((name) => name.startsWith('language-'))
    ?.slice(9);
  if (language === 'mermaid')
    return (
      <MediaAnnotationContext.Provider value={markdownMediaTarget(context, node, true)}>
        <Mermaid code={markdownCodeText(child.props.children).replace(/\n$/, '')} />
      </MediaAnnotationContext.Provider>
    );
  return (
    <MarkdownCodeBlock {...props} language={language}>
      {child}
    </MarkdownCodeBlock>
  );
}

function MarkdownImage({ node, ...props }: ComponentProps<'img'> & { node?: SourceNode }) {
  const context = useContext(FileLinkContext);
  const document = useContext(MarkdownMediaContext);
  return (
    <MediaAnnotationContext.Provider value={markdownMediaTarget(document, node, false)}>
      <ImageContent {...props} sourcePath={context?.sourcePath} />
    </MediaAnnotationContext.Provider>
  );
}

export type MarkdownProps<TRef = JsonValue> = {
  children: string;
  /** Original Markdown file path. Relative file links use its directory; otherwise panel cwd. */
  sourcePath?: string;
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
  annotationReference?: unknown;
};
const MarkdownContent = /*#__PURE__*/ memo(function MarkdownContent({
  children,
  className,
  components: overrides,
  rehypePlugins,
  rootRef,
  annotated,
  annotationReference,
  frontmatter = 'auto',
  sourcePath,
}: RenderProps) {
  const root = useRef<HTMLDivElement>(null);
  useImperativeHandle<HTMLDivElement | null, HTMLDivElement | null>(
    rootRef,
    () => root.current,
    [],
  );
  const anchorPrefix = `paneon-md-${useId()}-`;
  const [file, setFile] = useState<{
    reference: FileReferenceRequest;
    trigger: HTMLAnchorElement;
    id: number;
  }>();
  const [fileOpen, setFileOpen] = useState(false);
  const fileId = useRef(0);
  const annotationEnabled = useContext(AnnotationEnabledContext);
  const annotationEnvironment = useContext(AnnotationEnvironmentContext);
  const readFile = useFileReference();
  const linkContext = useMemo(
    () => ({
      sourcePath,
      revealAnchor(href: string) {
        let fragment: string;
        try {
          fragment = decodeURIComponent(href.slice(1));
        } catch (error) {
          console.warn('Invalid Markdown anchor.', error);
          return false;
        }
        if (!fragment) return false;
        // Generated IDs are instance-scoped; author-supplied IDs keep their original spelling.
        const target =
          root.current?.querySelector<HTMLElement>(`#${CSS.escape(anchorPrefix + fragment)}`) ??
          root.current?.querySelector<HTMLElement>(`#${CSS.escape(fragment)}`);
        if (!target) return false;
        target.scrollIntoView({ block: 'start' });
        return true;
      },
      openFile(reference: FileReferenceRequest, trigger: HTMLAnchorElement) {
        if (annotated && annotationEnabled && annotationEnvironment) {
          annotationEnvironment.openFile(reference, trigger, annotationReference, readFile);
          return;
        }
        setFile({ reference, trigger, id: ++fileId.current });
        setFileOpen(true);
      },
    }),
    [
      sourcePath,
      anchorPrefix,
      annotated,
      annotationReference,
      annotationEnabled,
      annotationEnvironment,
      readFile,
    ],
  );
  const preview = useImagePreview();
  const metadata = useMemo(
    () => (frontmatter === 'off' ? null : parseFrontmatter(children)),
    [children, frontmatter],
  );
  const renderedMarkdown = useMemo(
    () => (
      <ReactMarkdown
        urlTransform={(url, key) =>
          key === 'href' && (markdownLink(url).kind === 'file' || /^vscode:\/\//i.test(url))
            ? url
            : defaultUrlTransform(url)
        }
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[...(rehypePlugins ?? []), [rehypeSlug, { prefix: anchorPrefix }]]}
        components={{ ...components, ...overrides }}
      >
        {metadata?.markdown ?? children}
      </ReactMarkdown>
    ),
    [children, metadata, overrides, rehypePlugins, anchorPrefix],
  );
  return (
    <>
      <FileLinkContext.Provider value={linkContext}>
        <MarkdownOutline
          contentRef={root}
          className={className}
          annotated={annotated}
          {...preview.events}
        >
          {metadata && <MarkdownFrontmatter value={metadata} annotated={annotated ?? false} />}
          <MarkdownMediaContext.Provider
            value={annotated ? { ref: annotationReference, source: children } : undefined}
          >
            {renderedMarkdown}
          </MarkdownMediaContext.Provider>
        </MarkdownOutline>
      </FileLinkContext.Provider>
      {file && (
        <FilePreviewSheet
          key={file.id}
          reference={file.reference}
          open={fileOpen}
          onOpenChange={setFileOpen}
          finalFocus={() => (file.trigger.isConnected ? file.trigger : null)}
        />
      )}
      {preview.viewer}
    </>
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
      <MarkdownContent
        {...props}
        rootRef={root}
        annotated
        annotationReference={reference}
        rehypePlugins={plugins}
      >
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
  const upstreamReader = useFileReference();
  const inPanel = useContext(PanelInputContext) !== undefined;
  const reader =
    upstreamReader ?? (inPanel && readLocalFile.actionId ? readTextReference : undefined);
  return (
    <FileReferenceContext.Provider value={reader}>
      {annotationTarget === undefined ? (
        <MarkdownContent {...props} />
      ) : (
        <AnnotatedMarkdown {...props} target={annotationTarget} />
      )}
    </FileReferenceContext.Provider>
  );
}
