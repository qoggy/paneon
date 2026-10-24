const imageStyles = [
  'color',
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'white-space',
  'background-color',
] as const;

/** Freeze the rendered theme and inherited fonts for a self-contained SVG image. */
export function snapshotDiagram(source: SVGSVGElement) {
  const clone = source.cloneNode(true) as SVGSVGElement;
  const originals = [source, ...source.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  originals.forEach((element, index) => {
    const copy = copies[index] as SVGElement | HTMLElement;
    if (!('style' in copy)) return;
    const style = getComputedStyle(element);
    for (const property of imageStyles)
      copy.style.setProperty(property, style.getPropertyValue(property));
  });
  const { width, height } = source.viewBox.baseVal;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.style.maxWidth = 'none';
  // The image retains its own styles and identifiers; an <img> keeps them out of the page DOM.
  const svg = new XMLSerializer().serializeToString(clone);
  // Panel body is transparent; the actual canvas surface comes from the UI theme token.
  const surface = document.createElement('span');
  surface.style.backgroundColor = 'var(--background, Canvas)';
  document.body.append(surface);
  const background = getComputedStyle(surface).backgroundColor;
  surface.remove();
  return {
    svg,
    background,
    width,
    height,
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  };
}

export type DiagramImage = ReturnType<typeof snapshotDiagram>;
