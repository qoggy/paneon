import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Download, Maximize, Minus, Plus, X } from 'lucide-react';
import { Button } from './button';
import { DialogClose, DialogDescription, DialogTitle } from './dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { useUI } from './use-ui';
import type { DiagramImage } from './mermaid-image';

export function DiagramIconButton({
  label,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button type="button" size="icon-sm" variant="ghost" aria-label={label} {...props}>
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function MermaidViewer({
  image,
  download,
  busy,
}: {
  image: DiagramImage;
  download: () => void;
  busy: boolean;
}) {
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
      <DialogTitle className="sr-only">{t('Diagram viewer')}</DialogTitle>
      <DialogDescription className="sr-only">
        {t('Drag to pan. Press Escape to close.')}
      </DialogDescription>
      <div
        data-slot="mermaid-viewer-toolbar"
        className="flex shrink-0 items-center justify-end gap-0.5 border-b px-3 py-2 text-muted-foreground"
      >
        <DiagramIconButton
          label={t('Zoom out')}
          disabled={view.scale <= 0.05}
          onClick={() => zoom(1 / 1.25)}
        >
          <Minus />
        </DiagramIconButton>
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
        <DiagramIconButton
          label={t('Zoom in')}
          disabled={view.scale >= 8}
          onClick={() => zoom(1.25)}
        >
          <Plus />
        </DiagramIconButton>
        <DiagramIconButton
          label={t('Fit to window')}
          onClick={() => setView({ scale: fitScale(), x: 0, y: 0, fitted: true })}
        >
          <Maximize />
        </DiagramIconButton>
        <span className="mx-1.5 h-4 border-l" aria-hidden="true" />
        <DiagramIconButton label={t('Download PNG')} disabled={busy} onClick={download}>
          <Download />
        </DiagramIconButton>
        <DialogClose
          render={
            <DiagramIconButton label={t('Close diagram')}>
              <X />
            </DiagramIconButton>
          }
        />
      </div>
      <div
        ref={viewport}
        data-slot="mermaid-viewport"
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
          data-slot="mermaid-viewer-image"
          src={image.url}
          alt={t('Expanded diagram')}
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
