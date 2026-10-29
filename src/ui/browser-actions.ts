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

async function imagePNG(url: string): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  context.drawImage(image, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Unable to copy image.'))),
      'image/png',
    ),
  );
}

async function originalImage(url: string): Promise<Blob> {
  if (url.startsWith('data:')) {
    // Decode locally: host connect-src intentionally does not permit data-URL fetches.
    const comma = url.indexOf(',');
    const metadata = url.slice(5, comma);
    const payload = url.slice(comma + 1);
    const bytes = metadata.endsWith(';base64')
      ? Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(payload));
    return new Blob([bytes], { type: metadata.split(';')[0] });
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to download image: HTTP ${response.status}.`);
  return response.blob();
}

export async function performBrowserAction(action: BrowserAction): Promise<void> {
  if (action.kind === 'open-url') {
    if (!/^https?:$/.test(new URL(action.url).protocol)) throw new Error('Unsupported URL.');
    window.open(action.url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (action.kind === 'copy-text') {
    await navigator.clipboard.writeText(action.text);
    return;
  }
  if (action.kind === 'copy-image') {
    // Start the clipboard write during the click, before asynchronous rasterization.
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png':
          'svg' in action ? diagramPNG(action.svg, action.background) : imagePNG(action.url),
      }),
    ]);
    return;
  }
  let blob: Blob;
  if ('svg' in action) blob = await diagramPNG(action.svg, action.background);
  else blob = await originalImage(action.url);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'svg' in action ? 'diagram.png' : (action.filename ?? 'image');
  link.click();
  // Keep the URL alive until the browser has consumed the download click.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
