import type { BrowserAction } from '../shared/browser-actions';

async function diagramPNG(svg: string, background: string): Promise<Blob> {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.localName !== 'svg' || parsed.querySelector('parsererror'))
    throw new Error('Invalid diagram SVG.');
  const viewBox = root
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const width = viewBox?.[2] ?? Number.parseFloat(root.getAttribute('width') ?? '');
  const height = viewBox?.[3] ?? Number.parseFloat(root.getAttribute('height') ?? '');
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)))
    throw new Error('Invalid diagram dimensions.');
  // Export the entire diagram at 2x, bounding the canvas allocation for large graphs.
  const scale = Math.min(2, 8192 / width, 8192 / height, Math.sqrt(16_000_000 / (width * height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  root.setAttribute('width', String(canvas.width));
  root.setAttribute('height', String(canvas.height));
  root.style.maxWidth = 'none';
  const image = new Image();
  // A data URL also supports Mermaid's XHTML labels without a blob-origin canvas taint.
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(root))}`;
  await image.decode();
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Unable to export diagram.'))),
      'image/png',
    ),
  );
}

export async function performBrowserAction(action: BrowserAction): Promise<void> {
  if (action.kind === 'copy-text') {
    await navigator.clipboard.writeText(action.text);
    return;
  }
  if (action.kind === 'copy-image') {
    // Start the clipboard write during the click, before asynchronous rasterization.
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': diagramPNG(action.svg, action.background) }),
    ]);
    return;
  }
  const blob = await diagramPNG(action.svg, action.background);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'diagram.png';
  link.click();
  // Keep the URL alive until the browser has consumed the download click.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
