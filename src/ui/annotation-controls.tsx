import { useEffect } from 'react';
import { useAnnotationContext } from './annotation-context';
import { AnnotationMenu, AnnotationSurface } from './annotation-surface';
import { textControlSelector } from './annotation-selection';

/** Internal controls mounted once when the page enables annotations. */
export function AnnotationControls() {
  const { store } = useAnnotationContext<unknown>();
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
      <AnnotationSurface />
      <AnnotationMenu />
    </>
  );
}
