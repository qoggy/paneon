/** A local source reference, independent of the browser's URL/base directory. */
export type FileReferenceRequest = { href: string; sourcePath?: string };
export type FilePreview = { path: string; text: string };
export type MarkdownLink =
  | { kind: 'file'; path: string; startLine?: number; endLine?: number }
  | { kind: 'web'; url: string }
  | { kind: 'anchor'; href: string }
  | { kind: 'disabled' };

function hasControls(value: string) {
  return [...value].some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
}

export function markdownLink(href: string): MarkdownLink {
  if (!href || hasControls(href)) return { kind: 'disabled' };
  if (href.startsWith('#')) return { kind: 'anchor', href };
  if (/^(https?:)?\/\//i.test(href)) {
    try {
      const url = new URL(href.startsWith('//') ? `https:${href}` : href);
      return { kind: 'web', url: url.href };
    } catch {
      return { kind: 'disabled' };
    }
  }
  const protocol = /^[a-z][a-z\d+.-]*:/i.exec(href)?.[0].toLowerCase();
  if (protocol && protocol !== 'file:') return { kind: 'disabled' };
  try {
    let path: string, hash: string;
    if (protocol === 'file:') {
      const url = new URL(href);
      if (url.hostname || url.search || /%2f|%5c/i.test(url.pathname)) return { kind: 'disabled' };
      path = decodeURIComponent(url.pathname);
      hash = url.hash.slice(1);
    } else {
      const at = href.indexOf('#');
      path = decodeURIComponent(at < 0 ? href : href.slice(0, at));
      hash = at < 0 ? '' : href.slice(at + 1);
      // A query-only or web-style query URL is not a filesystem reference.
      if (path.includes('?')) return { kind: 'disabled' };
    }
    if (!path || hasControls(path)) return { kind: 'disabled' };
    const lines = /^L([1-9]\d*)(?:-L?([1-9]\d*))?$/.exec(hash);
    if (!lines) return { kind: 'file', path };
    const startLine = Number(lines[1]);
    const endLine = Number(lines[2] ?? lines[1]);
    if (!Number.isSafeInteger(endLine) || !Number.isSafeInteger(startLine) || endLine < startLine)
      return { kind: 'disabled' };
    return { kind: 'file', path, startLine, endLine };
  } catch {
    return { kind: 'disabled' };
  }
}

export function isFileReferenceRequest(value: unknown): value is FileReferenceRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.href === 'string' &&
    markdownLink(item.href).kind === 'file' &&
    (item.sourcePath === undefined ||
      (typeof item.sourcePath === 'string' && !!item.sourcePath && !hasControls(item.sourcePath)))
  );
}

/** Human-readable URI text only; navigation and protocol validation keep the original URI. */
export function markdownLinkAddress(href: string): string {
  try {
    return decodeURI(href);
  } catch {
    // Malformed escapes still need to be inspectable as the original address.
    return href;
  }
}
