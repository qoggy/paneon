import { useEffect, useSyncExternalStore } from 'react';
import { useAnnotationContext } from './annotation-context';
import { AnnotationMenu, AnnotationSurface } from './annotation-surface';
import { FilePreviewSheet } from './file-preview';
import { textControlSelector } from './annotation-selection';

/** Internal controls mounted once when the page enables annotations. */
export function AnnotationControls() {
  const { store } = useAnnotationContext<unknown>();
  const file = useSyncExternalStore(store.subscribe, store.getFileView, store.getFileView);
  useEffect(() => {
    const select = (event: MouseEvent | KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(textControlSelector)) return;
      if (
        event instanceof KeyboardEvent &&
        !event.shiftKey &&
        !['Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      )
        return;
      const selection = document.getSelection();
      if (selection) store.selectText(selection);
    };
    document.addEventListener('mouseup', select);
    document.addEventListener('keyup', select);
    return () => {
      document.removeEventListener('mouseup', select);
      document.removeEventListener('keyup', select);
    };
  }, [store]);
  return (
    <>
      {file && (
        <FilePreviewSheet
          key={file.id}
          reference={file.reference}
          snapshot={file.snapshot}
          annotations={{ store, id: file.id, ref: file.ref }}
          open={file.open}
          onOpenChange={(open) => {
            if (!open) store.closeFile();
          }}
          finalFocus={() => (file.trigger?.isConnected ? file.trigger : null)}
        />
      )}
      <AnnotationSurface />
      <AnnotationMenu />
    </>
  );
}
