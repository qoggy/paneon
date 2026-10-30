import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import type { AnnotationStore, FileSnapshot } from './annotation-store';
import { fileTextSegments } from './file-annotation-source';
import { Copy } from 'lucide-react';
import type { FilePreview, FileReferenceRequest } from '../shared/file-references';
import { markdownLink } from '../shared/file-references';
import { useFileReference } from './file-reference-context';
import type { ReadFileReference } from './file-reference-context';
import { useBrowserAction } from './browser-action-context';
import { Button } from './button';
import { FileSourceCode } from './file-source-code';
import { Empty, EmptyDescription, EmptyHeader } from './empty';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './sheet';
import { Spinner } from './spinner';
import { toast } from './toast-manager';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { useUI, type UIMessage } from './use-ui';

const errors = {
  FILE_NOT_FOUND: 'The referenced file does not exist.',
  FILE_ACCESS_DENIED: 'The referenced file could not be read.',
  FILE_NOT_REGULAR: 'The reference does not point to a regular file.',
  FILE_TOO_LARGE: 'File preview is limited to 1 MiB.',
  FILE_NOT_TEXT: 'Only UTF-8 text files can be previewed.',
} as const;

export function FilePreviewSheet({
  reference,
  open,
  onOpenChange,
  finalFocus,
  annotations,
  snapshot,
  reader: providedReader,
}: {
  reader?: ReadFileReference;
  snapshot?: FileSnapshot;
  annotations?: { store: AnnotationStore<unknown>; id: number; ref: unknown };
  reference: FileReferenceRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus: ComponentProps<typeof SheetContent>['finalFocus'];
}) {
  // One reader per opening: provider rerenders must not replace the displayed snapshot.
  const reader = useFileReference();
  const [readFile] = useState(() => providedReader ?? reader);
  const { t } = useUI();
  const title = useRef<HTMLHeadingElement>(null);
  const store = annotations?.store;
  const referenceRef = annotations?.ref;
  const overlayRef = useCallback(
    (node: HTMLDivElement | null) => store?.setOverlayContainer(node),
    [store],
  );
  const [state, setState] = useState<{
    file?: FilePreview;
    snapshot?: FileSnapshot;
    error?: UIMessage;
  }>(() => (snapshot ? { file: snapshot.file, snapshot } : {}));
  const target = markdownLink(reference.href);
  const path = state.file?.path ?? (target.kind === 'file' ? target.path : reference.href);
  useEffect(() => {
    if (snapshot || !readFile) return;
    let active = true;
    void readFile(reference)
      .then(async (result) => {
        // The reader may reuse its result object; this opening owns a value snapshot.
        const file: FilePreview = { path: result.path, text: result.text };
        const retained = await store?.createFileSnapshot(file, referenceRef);
        if (active) {
          if (retained) store?.retainFile(retained);
          setState({ file, snapshot: retained });
        }
      })
      .catch((error: unknown) => {
        console.error('File preview failed.', error);
        const code = (error as { code?: string } | null)?.code;
        const key =
          code && Object.hasOwn(errors, code) ? errors[code as keyof typeof errors] : undefined;
        if (active) setState({ error: key ?? 'Unable to preview file.' });
      });
    return () => {
      active = false;
    };
  }, [readFile, reference, snapshot, store, referenceRef]);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(next) => {
        if (next) store?.refreshGeometry();
      }}
    >
      <ResizableFileSheetContent
        data-slot="file-preview"
        className="w-[min(44rem,calc(100vw-2rem))] gap-0 sm:max-w-none"
        initialFocus={title}
        finalFocus={finalFocus}
        onKeyDownCapture={(event) => {
          // The copy tooltip must not consume the Sheet's Escape action.
          if (
            event.key === 'Escape' &&
            !(event.target instanceof Element && event.target.closest('[data-annotation-controls]'))
          ) {
            event.preventDefault();
            event.stopPropagation();
            onOpenChange(false);
          }
        }}
      >
        <SheetHeader className="shrink-0 border-b pr-12">
          <SheetTitle ref={title} tabIndex={-1} className="focus:outline-none">
            {path.replace(/\/+$/, '').split('/').at(-1) || '/'}
          </SheetTitle>
          <div className="flex items-center gap-1">
            <SheetDescription className="min-w-0 font-mono text-xs break-all">
              {path}
            </SheetDescription>
            {state.file && <CopyPath path={state.file.path} />}
          </div>
        </SheetHeader>
        {state.file ? (
          <PreviewSource
            file={state.file}
            href={reference.href}
            snapshot={state.snapshot}
            annotations={annotations}
            open={open}
          />
        ) : state.error !== undefined ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            {t(state.error)}
          </p>
        ) : (
          <div role="status" className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Spinner aria-hidden="true" />
            {t('Reading file…')}
          </div>
        )}
        {annotations && open && (
          <div
            ref={overlayRef}
            data-file-annotation-overlay=""
            className="pointer-events-none fixed inset-0 z-50"
          />
        )}
      </ResizableFileSheetContent>
    </Sheet>
  );
}

function ResizableFileSheetContent({ children, ...props }: ComponentProps<typeof SheetContent>) {
  const { t } = useUI();
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [width, setWidth] = useState<number>();
  const resize = (next: number) => {
    const maximum = window.innerWidth - 32;
    setWidth(Math.min(maximum, Math.max(Math.min(320, maximum), next)));
  };
  return (
    <SheetContent
      {...props}
      ref={content}
      style={{ width: width === undefined ? undefined : `min(${width}px, calc(100vw - 2rem))` }}
    >
      <button
        type="button"
        aria-label={t('Resize file preview')}
        className="absolute inset-y-0 left-0 z-10 w-2 -translate-x-1/2 cursor-ew-resize touch-none select-none hover:bg-ring/30 focus-visible:bg-ring/30 focus-visible:outline-none"
        onPointerDown={(event) => {
          if (event.button !== 0 || !content.current) return;
          event.preventDefault();
          drag.current = {
            x: event.clientX,
            width: content.current.getBoundingClientRect().width,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current) resize(drag.current.width + drag.current.x - event.clientX);
        }}
        onPointerUp={(event) => {
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (!content.current || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
          event.preventDefault();
          resize(
            content.current.getBoundingClientRect().width + (event.key === 'ArrowLeft' ? 32 : -32),
          );
        }}
      />
      {children}
    </SheetContent>
  );
}

function CopyPath({ path }: { path: string }) {
  const browserAction = useBrowserAction();
  const { t } = useUI();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            className="shrink-0"
            aria-label={t('Copy path')}
            onClick={() => {
              void browserAction({ kind: 'copy-text', text: path }).then(
                () => toast.add({ title: t('Path copied'), type: 'success' }),
                (error: unknown) => {
                  console.error('Copy file path failed.', error);
                  toast.add({ title: t('Unable to copy path.'), type: 'error' });
                },
              );
            }}
          >
            <Copy />
          </Button>
        }
      />
      <TooltipContent>{t('Copy path')}</TooltipContent>
    </Tooltip>
  );
}

function PreviewSource({
  file,
  href,
  snapshot,
  annotations,
  open,
}: {
  file: FilePreview;
  href: string;
  snapshot?: FileSnapshot;
  annotations?: { store: AnnotationStore<unknown>; id: number; ref: unknown };
  open: boolean;
}) {
  const { t } = useUI();
  const target = markdownLink(href);
  const lines =
    target.kind === 'file' && target.startLine
      ? { start: target.startLine, end: target.endLine ?? target.startLine }
      : undefined;
  const viewport = useRef<HTMLDivElement>(null);
  const unregister = useRef<(() => void) | undefined>(undefined);
  const store = annotations?.store;
  const id = annotations?.id;
  const ready = useCallback(
    (source: HTMLElement) => {
      unregister.current?.();
      if (open && store && snapshot && id !== undefined) {
        unregister.current = store.registerText({
          ref: snapshot.ref,
          sourceRef: snapshot.sourceRef,
          source: file.text,
          segments: fileTextSegments(source, file.text),
        });
        store.fileMounted(id);
      }
    },
    [open, store, snapshot, file, id],
  );
  useLayoutEffect(
    () => () => {
      unregister.current?.();
      unregister.current = undefined;
    },
    [open, snapshot],
  );
  const start = lines?.start;
  // Shiki splits LF/CRLF, while source locations also count lone CR as a line ending.
  const code = useMemo(() => file.text.replace(/\r\n?/g, '\n'), [file.text]);
  const count = code.split('\n').length;
  useLayoutEffect(() => {
    const box = viewport.current;
    const line = box?.querySelector<HTMLElement>(`[data-code-line="${start}"]`);
    if (box && line)
      box.scrollTop +=
        line.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight / 3;
  }, [file, start]);
  const extension = file.path.split('.').at(-1)?.toLowerCase();
  const language =
    ({ mjs: 'js', cjs: 'js', py: 'python', md: 'markdown', htm: 'html' } as Record<string, string>)[
      extension ?? ''
    ] ?? extension;
  return (
    <>
      {lines && (
        <p
          role="status"
          className="shrink-0 border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground"
        >
          {lines.start > count
            ? t('The referenced line is outside this file.')
            : t('Lines {start}–{end}', { start: lines.start, end: Math.min(count, lines.end) })}
        </p>
      )}
      <div ref={viewport} data-slot="file-preview-source" className="min-h-0 flex-1 overflow-auto">
        {file.text === '' ? (
          <Empty>
            <EmptyHeader>
              <EmptyDescription>{t('The file is empty.')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <FileSourceCode
            code={code}
            onReady={ready}
            language={language}
            highlightedLines={lines}
          />
        )}
      </div>
    </>
  );
}
