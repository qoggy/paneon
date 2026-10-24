export type ClippedRect = { rect: DOMRect; clip: DOMRect };

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
    // A pane can declare an opaque sticky header above its annotatable body.
    // Apply this only to body descendants, never to annotations on the header itself.
    const headerId = element.getAttribute('data-annotation-clip-top');
    const header = headerId ? element.ownerDocument.getElementById(headerId) : null;
    if (header) clip.top = Math.max(clip.top, header.getBoundingClientRect().bottom);
    clips.set(element, clip);
    return clip;
  };
  return (rect: DOMRect, element: HTMLElement): ClippedRect | null => {
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
    return right > left && bottom > top
      ? {
          rect: new DOMRect(left, top, right - left, bottom - top),
          clip: new DOMRect(clip.left, clip.top, clip.right - clip.left, clip.bottom - clip.top),
        }
      : null;
  };
}

/** Clip against the iframe viewport and actual nested scrolling containers. */
export function visibleRect(rect: DOMRect, element: HTMLElement): DOMRect | null {
  return createRectClipper()(rect, element)?.rect ?? null;
}

/** Keep the full marker and collision offsets inside the source viewport. */
export function markerPosition(
  { rect, clip }: ClippedRect,
  placed: readonly DOMRect[],
): DOMRect | undefined {
  const size = 24;
  const step = 28;
  if (clip.width < size || clip.height < size) return;
  const minX = Math.max(0, clip.left);
  const minY = Math.max(0, clip.top);
  const maxX = Math.min(window.innerWidth, clip.right) - size;
  const maxY = Math.min(window.innerHeight, clip.bottom) - size;
  if (maxX < minX || maxY < minY) return;
  const x = Math.max(minX, Math.min(rect.right - 10, maxX));
  const y = Math.max(minY, Math.min(rect.top - 18, maxY));
  // Try nearby slots first. This bounded search cannot push badges into another pane.
  const xs = [x];
  const ys = [y];
  for (let d = step; d <= maxX - minX + step; d += step) {
    if (x - d >= minX) xs.push(x - d);
    if (x + d <= maxX) xs.push(x + d);
  }
  for (let d = step; d <= maxY - minY + step; d += step) {
    if (y + d <= maxY) ys.push(y + d);
    if (y - d >= minY) ys.push(y - d);
  }
  for (const top of ys)
    for (const left of xs) {
      const candidate = new DOMRect(left, top, size, size);
      if (
        placed.every(
          (other) =>
            candidate.right + 3 <= other.left ||
            candidate.left >= other.right + 3 ||
            candidate.bottom + 1 <= other.top ||
            candidate.top >= other.bottom + 1,
        )
      )
        return candidate;
    }
  // When no full badge fits, the annotation is still reachable from the catalog.
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
