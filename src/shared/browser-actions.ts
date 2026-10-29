/** Browser-only operations delegated by an isolated panel to its authenticated host. */
export type BrowserAction =
  | { kind: 'copy-text'; text: string }
  | { kind: 'open-url'; url: string }
  | { kind: 'copy-image' | 'download-image'; svg: string; background: string }
  | { kind: 'copy-image' | 'download-image'; url: string; filename?: string };

export function isBrowserAction(value: unknown): value is BrowserAction {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  if (item.kind === 'copy-text') return typeof item.text === 'string';
  if (item.kind === 'open-url') {
    try {
      return typeof item.url === 'string' && /^https?:$/.test(new URL(item.url).protocol);
    } catch {
      return false;
    }
  }
  return (
    (item.kind === 'copy-image' || item.kind === 'download-image') &&
    ((typeof item.svg === 'string' && typeof item.background === 'string') ||
      (typeof item.url === 'string' &&
        (item.filename === undefined || typeof item.filename === 'string')))
  );
}
