/** Browser-only operations delegated by an isolated panel to its authenticated host. */
export type BrowserAction =
  | { kind: 'copy-text'; text: string }
  | { kind: 'copy-image' | 'download-image'; svg: string; background: string };

export function isBrowserAction(value: unknown): value is BrowserAction {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  if (item.kind === 'copy-text') return typeof item.text === 'string';
  return (
    (item.kind === 'copy-image' || item.kind === 'download-image') &&
    typeof item.svg === 'string' &&
    typeof item.background === 'string'
  );
}
