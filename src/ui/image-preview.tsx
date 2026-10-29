import { useRef, useState, type HTMLAttributes } from 'react';
import { ImageViewerDialog } from './image-viewer';

/** Shared by Image and Markdown's delegated custom-image preview. */
export function useImagePreview(
  options: {
    download?: (url: string) => void;
    downloadLabel?: string;
    busy?: boolean;
  } = {},
) {
  const [image, setImage] = useState<{
    url: string;
    width: number;
    height: number;
    alt: string;
    download?: () => void;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  function expandImage(target: EventTarget | null, trigger?: HTMLElement) {
    if (!(target instanceof HTMLImageElement) || target.closest('a, [data-slot="mermaid"]'))
      return false;
    if (!target.complete || !target.naturalWidth || !target.naturalHeight) return false;
    if (trigger) returnFocus.current = trigger;
    else if (target.hasAttribute('tabindex')) returnFocus.current = target;
    const url = target.currentSrc || target.src;
    const download = options.download;
    setImage({
      url,
      width: target.naturalWidth,
      height: target.naturalHeight,
      alt: target.alt,
      download: download && (() => download(url)),
    });
    setOpen(true);
    return true;
  }
  const events: Pick<
    HTMLAttributes<HTMLElement>,
    'onPointerDownCapture' | 'onClick' | 'onKeyDown'
  > = {
    onPointerDownCapture(event) {
      // A custom image may not receive focus itself; remember its prior control.
      if (event.target instanceof HTMLImageElement) {
        const active = document.activeElement;
        returnFocus.current = active instanceof HTMLElement ? active : null;
      }
    },
    onClick(event) {
      if (!event.defaultPrevented && expandImage(event.target)) event.preventDefault();
    },
    onKeyDown(event) {
      if (
        !event.defaultPrevented &&
        (event.key === 'Enter' || event.key === ' ') &&
        expandImage(event.target)
      )
        event.preventDefault();
    },
  };
  return {
    events,
    expand: expandImage,
    viewer: image ? (
      <ImageViewerDialog
        key={image.url}
        kind="image"
        image={image}
        open={open}
        onOpenChange={setOpen}
        download={image.download}
        downloadLabel={options.downloadLabel}
        busy={options.busy}
        finalFocus={() => (returnFocus.current?.isConnected ? returnFocus.current : null)}
      />
    ) : null,
  };
}
