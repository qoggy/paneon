/** Cache ancestor clipping once for one synchronous geometry measurement.
 * Never retain it across scroll/resize/layout changes. */
export function createRectClipper() {
  const clips = new Map<
    HTMLElement,
    { left: number; top: number; right: number; bottom: number }
  >();
  const clipFor = (
    element: HTMLElement,
  ): { left: number; top: number; right: number; bottom: number } => {
    const cached = clips.get(element);
    if (cached) return cached;
    const view = element.ownerDocument.defaultView;
    if (!view) return { left: 0, top: 0, right: 0, bottom: 0 };
    const clip = element.parentElement
      ? { ...clipFor(element.parentElement) }
      : { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight };
    const style = view.getComputedStyle(element);
    const clipX = /(auto|scroll|hidden|clip)/.test(style.overflowX);
    const clipY = /(auto|scroll|hidden|clip)/.test(style.overflowY);
    if (clipX || clipY) {
      const bounds = element.getBoundingClientRect();
      if (clipX) {
        clip.left = Math.max(clip.left, bounds.left + element.clientLeft);
        clip.right = Math.min(clip.right, bounds.left + element.clientLeft + element.clientWidth);
      }
      if (clipY) {
        clip.top = Math.max(clip.top, bounds.top + element.clientTop);
        clip.bottom = Math.min(clip.bottom, bounds.top + element.clientTop + element.clientHeight);
      }
    }
    clips.set(element, clip);
    return clip;
  };
  return (rect: DOMRect, element: HTMLElement): DOMRect | null => {
    const view = element.ownerDocument.defaultView;
    if (!view) return null;
    // Most text in a long Diff is offscreen; no ancestor style reads are needed.
    if (
      rect.right <= 0 ||
      rect.bottom <= 0 ||
      rect.left >= view.innerWidth ||
      rect.top >= view.innerHeight
    )
      return null;
    const clip = element.parentElement
      ? clipFor(element.parentElement)
      : { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight };
    const left = Math.max(0, rect.left, clip.left);
    const top = Math.max(0, rect.top, clip.top);
    const right = Math.min(view.innerWidth, rect.right, clip.right);
    const bottom = Math.min(view.innerHeight, rect.bottom, clip.bottom);
    return right > left && bottom > top ? new DOMRect(left, top, right - left, bottom - top) : null;
  };
}

/** Clip against the iframe viewport and actual nested scrolling containers. */
export function visibleRect(rect: DOMRect, element: HTMLElement): DOMRect | null {
  return createRectClipper()(rect, element);
}

export function floatingPosition(
  rect: DOMRect | undefined,
  width: number,
  height: number,
  preferBelow = false,
) {
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const right = left + (viewport?.width ?? window.innerWidth);
  const bottom = top + (viewport?.height ?? window.innerHeight);
  const margin = 8;
  const x = Math.max(
    left + margin,
    Math.min(
      preferBelow && rect && rect.width > width + 80
        ? rect.right - width
        : (rect?.left ?? right - width - margin),
      right - width - margin,
    ),
  );
  const above = (rect?.top ?? top + height + margin * 2) - height - margin;
  const below = (rect?.bottom ?? top) + margin;
  const y =
    preferBelow && below + height <= bottom - margin
      ? below
      : above >= top + margin
        ? above
        : Math.min((rect?.bottom ?? top) + margin, bottom - height - margin);
  return { left: x, top: Math.max(top + margin, y) };
}
