import type { Diagnostic } from '../shared/types.js';

export function diagnosticLocation(value: Diagnostic) {
  const details = value.details;
  // entryPath is a compilation input, not necessarily a precise tool location.
  const file = details?.file ?? (details?.line ? details?.entryPath : undefined);
  if (typeof file !== 'string') return undefined;
  return (
    file +
    (typeof details?.line === 'number'
      ? `:${details.line}${typeof details.column === 'number' ? `:${details.column}` : ''}`
      : '')
  );
}
export function debugDiagnostic(value: unknown) {
  if (!value || typeof value !== 'object' || !('details' in value)) return '';
  const diagnostic = value as Diagnostic;
  const details = diagnostic.details;
  if (!details || typeof details.stage !== 'string') return '';
  return ['stage', 'stack', 'cause', 'exitCode', 'signal', 'stderr', 'truncated']
    .flatMap((key) =>
      details[key] === undefined
        ? []
        : [
            `[debug] build.${key}=${typeof details[key] === 'string' ? details[key] : JSON.stringify(details[key])}\n`,
          ],
    )
    .join('');
}
