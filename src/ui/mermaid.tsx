import { useUI } from './use-ui';
import { useEffect, useRef, useState } from 'react';
import { Spinner } from './spinner';
import { cn } from './utils';
import { Code, Copy, Download, Ellipsis, Expand } from 'lucide-react';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { snapshotDiagram, type DiagramImage } from './mermaid-image';
import { ImageViewerDialog, ViewerIconButton as DiagramIconButton } from './image-viewer';
import { useBrowserAction } from './browser-action-context';
import type { BrowserAction } from '../shared/browser-actions';
import { useToastManager } from './toast-manager';

let library: Promise<typeof import('mermaid').default> | undefined;

function getMermaid() {
  return (library ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    return mermaid;
  }));
}

type RenderResult = { code: string; theme: string } & ({ svg: string } | { error: string });

export function Mermaid({ code, className }: { code: string; className?: string }) {
  const { t, theme } = useUI();
  const host = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<RenderResult>();

  useEffect(() => {
    let active = true;
    let container: HTMLDivElement | undefined;

    void (async () => {
      try {
        const mermaid = await getMermaid();
        if (!active) return;

        // Mermaid measures its SVG in the document; isolate its temporary/error nodes.
        container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.visibility = 'hidden';
        container.style.pointerEvents = 'none';
        const width = host.current?.clientWidth;
        if (width) container.style.width = `${width}px`;
        document.body.append(container);

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: theme === 'dark' ? 'dark' : 'default',
        });
        const { svg } = await mermaid.render(`mermaid-${crypto.randomUUID()}`, code, container);
        if (active) setResult({ code, theme, svg });
      } catch (error) {
        if (active)
          setResult({ code, theme, error: error instanceof Error ? error.message : String(error) });
      } finally {
        container?.remove();
      }
    })();

    return () => {
      active = false;
      // The official renderer has no abort API and still measures connected nodes.
      // Keep the hidden container until its promise settles, then remove it above.
    };
  }, [code, theme]);

  const current = result?.code === code && result.theme === theme ? result : undefined;

  return (
    <div ref={host} data-slot="mermaid" className={cn('min-w-0 overflow-x-auto', className)}>
      {!current ? (
        <Spinner aria-label={t('Rendering diagram')} />
      ) : 'error' in current ? (
        <div role="alert" className="text-sm text-destructive">
          <p>{t('Unable to render diagram.')}</p>
          <pre className="whitespace-pre-wrap">{current.error}</pre>
        </div>
      ) : (
        <MermaidDiagram key={`${code}:${theme}`} code={code} svg={current.svg} />
      )}
    </div>
  );
}

function MermaidDiagram({ code, svg }: { code: string; svg: string }) {
  const { t } = useUI();
  const browserAction = useBrowserAction();
  const toast = useToastManager();
  const diagram = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [image, setImage] = useState<DiagramImage | null>(null);
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  function capture() {
    const source = diagram.current?.querySelector('svg');
    if (!source) throw new Error('The diagram is unavailable.');
    return snapshotDiagram(source);
  }
  function expand() {
    returnFocus.current = document.activeElement as HTMLElement;
    setImage(capture());
    setOpen(true);
  }
  async function run(kind: 'copy-text' | 'copy-image' | 'download-image') {
    if (busy) return;
    setBusy(true);
    try {
      let action: BrowserAction;
      if (kind === 'copy-text') action = { kind, text: code };
      else {
        const picture = image ?? capture();
        action = { kind, svg: picture.svg, background: picture.background };
      }
      await browserAction(action);
      toast.add({
        title: t(
          kind === 'copy-text'
            ? 'Code copied'
            : kind === 'copy-image'
              ? 'Image copied'
              : 'PNG downloaded',
        ),
        type: 'success',
      });
    } catch (error) {
      console.error('Mermaid browser action failed.', error);
      toast.add({ title: t('Unable to complete diagram action.'), type: 'error' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <TooltipProvider>
      <div className="group relative" data-slot="mermaid-diagram">
        <div
          ref={diagram}
          role="button"
          tabIndex={0}
          aria-label={t('Expand diagram')}
          className="cursor-zoom-in overflow-x-auto rounded-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
          onClick={(event) => {
            if ((event.target as Element).closest('a')) return;
            const selection = window.getSelection();
            if (
              selection &&
              !selection.isCollapsed &&
              selection.anchorNode &&
              event.currentTarget.contains(selection.anchorNode)
            )
              return;
            expand();
          }}
          onKeyDown={(event) => {
            if (
              event.target === event.currentTarget &&
              (event.key === 'Enter' || event.key === ' ')
            ) {
              event.preventDefault();
              expand();
            }
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div
          className={cn(
            'absolute top-2 right-2 flex flex-col items-center rounded-md border bg-background p-0.5 text-muted-foreground shadow-xs transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100',
            menuOpen ? 'visible opacity-100' : 'invisible opacity-0',
          )}
        >
          <DiagramIconButton label={t('Expand diagram')} tooltipSide="right" onClick={expand}>
            <Expand />
          </DiagramIconButton>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('More diagram options')}
                      >
                        <Ellipsis />
                      </Button>
                    }
                  />
                }
              />
              <TooltipContent side="right">{t('More diagram options')}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={busy} onClick={() => void run('copy-text')}>
                <Code />
                {t('Copy Mermaid code')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={busy} onClick={() => void run('copy-image')}>
                <Copy />
                {t('Copy image')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={busy} onClick={() => void run('download-image')}>
                <Download />
                {t('Download PNG')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {image && (
        <ImageViewerDialog
          kind="diagram"
          open={open}
          onOpenChange={setOpen}
          image={image}
          busy={busy}
          download={() => void run('download-image')}
          finalFocus={() =>
            returnFocus.current?.isConnected ? returnFocus.current : diagram.current
          }
        />
      )}
    </TooltipProvider>
  );
}
