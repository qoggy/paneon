import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Download, Maximize, Minus, Plus, X } from 'lucide-react';
import { Button } from './button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { useUI } from './use-ui';

type ViewerImage = { url: string; width: number; height: number; alt?: string };
type ViewerProps = {
  image: ViewerImage;
  kind: 'image' | 'diagram';
  download?: () => void;
  busy?: boolean;
};

export function ImageViewerDialog({
  open,
  onOpenChange,
  finalFocus,
  ...props
}: ViewerProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus: React.ComponentProps<typeof DialogContent>['finalFocus'];
}) {
  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          data-slot={props.kind === 'diagram' ? 'mermaid-viewer' : 'image-viewer'}
          showCloseButton={false}
          className="flex h-[calc(100dvh-4rem)] w-[calc(100vw-4rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
          onKeyDownCapture={(event) => {
            // Focused icon tooltips must not consume the viewer's Escape action.
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onOpenChange(false);
            }
          }}
          finalFocus={finalFocus}
        >
          <ImageViewer {...props} />
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

export function ViewerIconButton({
  label,
  children,
  tooltipSide = 'top',
  ...props
}: React.ComponentProps<typeof Button> & {
  label: string;
  children: ReactNode;
  tooltipSide?: React.ComponentProps<typeof TooltipContent>['side'];
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button type="button" size="icon-sm" variant="ghost" aria-label={label} {...props}>
            {children}
          </Button>
        }
      />
      <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
  );
}

function ImageViewer({ image, kind, download, busy }: ViewerProps) {
  const prefix = kind === 'diagram' ? 'mermaid' : 'image';
  const { t } = useUI();
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; panX: number; panY: number } | null>(
    null,
  );
  const [view, setView] = useState({ scale: 1, x: 0, y: 0, fitted: true });
  const [dragging, setDragging] = useState(false);
  const fitScale = () => {
    const box = viewport.current;
    return box
      ? Math.min(1, (box.clientWidth - 48) / image.width, (box.clientHeight - 48) / image.height)
      : 1;
  };
  useEffect(() => {
    const box = viewport.current;
    if (!box) return;
    const observer = new ResizeObserver(() => {
      const scale = Math.min(
        1,
        (box.clientWidth - 48) / image.width,
        (box.clientHeight - 48) / image.height,
      );
      setView((current) => (current.fitted ? { scale, x: 0, y: 0, fitted: true } : current));
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [image]);
  function zoom(factor: number) {
    setView((current) => {
      const scale = Math.min(8, Math.max(0.05, current.scale * factor));
      const ratio = scale / current.scale;
      return { scale, x: current.x * ratio, y: current.y * ratio, fitted: false };
    });
  }
  return (
    <>
      <DialogTitle className="sr-only">
        {t(kind === 'diagram' ? 'Diagram viewer' : 'Image viewer')}
      </DialogTitle>
      <DialogDescription className="sr-only">
        {t('Drag to pan. Press Escape to close.')}
      </DialogDescription>
      <div
        data-slot={`${prefix}-viewer-toolbar`}
        className="flex shrink-0 items-center justify-end gap-0.5 border-b px-3 py-2 text-muted-foreground"
      >
        <ViewerIconButton
          label={t('Zoom out')}
          disabled={view.scale <= 0.05}
          onClick={() => zoom(1 / 1.25)}
        >
          <Minus />
        </ViewerIconButton>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-w-14 tabular-nums"
                aria-label={t('Actual size')}
                onClick={() => setView({ scale: 1, x: 0, y: 0, fitted: false })}
              >
                {Math.round(view.scale * 100)}%
              </Button>
            }
          />
          <TooltipContent>{t('Actual size')}</TooltipContent>
        </Tooltip>
        <ViewerIconButton
          label={t('Zoom in')}
          disabled={view.scale >= 8}
          onClick={() => zoom(1.25)}
        >
          <Plus />
        </ViewerIconButton>
        <ViewerIconButton
          label={t('Fit to window')}
          onClick={() => setView({ scale: fitScale(), x: 0, y: 0, fitted: true })}
        >
          <Maximize />
        </ViewerIconButton>
        <span className="mx-1.5 h-4 border-l" aria-hidden="true" />
        {download && (
          <ViewerIconButton label={t('Download PNG')} disabled={busy} onClick={download}>
            <Download />
          </ViewerIconButton>
        )}
        <DialogClose
          render={
            <ViewerIconButton label={t(kind === 'diagram' ? 'Close diagram' : 'Close image')}>
              <X />
            </ViewerIconButton>
          }
        />
      </div>
      <div
        ref={viewport}
        data-slot={`${prefix}-viewport`}
        className="relative min-h-0 flex-1 touch-none overflow-hidden select-none"
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            panX: view.x,
            panY: view.y,
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || start.id !== event.pointerId) return;
          setView((current) => ({
            ...current,
            x: start.panX + event.clientX - start.x,
            y: start.panY + event.clientY - start.y,
            fitted: false,
          }));
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
          setDragging(false);
        }}
      >
        <img
          data-slot={`${prefix}-viewer-image`}
          src={image.url}
          alt={image.alt ?? t('Expanded diagram')}
          draggable={false}
          className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
          style={{
            width: image.width,
            height: image.height,
            transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        />
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
        <div>{t('Drag to pan')}</div>
        <span>{t('Esc to close')}</span>
      </div>
    </>
  );
}
