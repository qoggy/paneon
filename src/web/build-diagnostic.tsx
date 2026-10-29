import type { Diagnostic } from '../shared/types';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { useUI } from '../ui/use-ui';

export function BuildDiagnostic({
  diagnostic,
  previousAvailable = false,
}: {
  diagnostic: Diagnostic;
  previousAvailable?: boolean;
}) {
  const { t } = useUI();
  const details = diagnostic.details;
  const file =
    typeof details?.file === 'string'
      ? details.file
      : typeof details?.line === 'number' && typeof details?.entryPath === 'string'
        ? details.entryPath
        : undefined;
  const location =
    file &&
    file +
      (typeof details?.line === 'number'
        ? `:${details.line}${typeof details.column === 'number' ? `:${details.column}` : ''}`
        : '');
  const frame = typeof details?.frame === 'string' ? details.frame : undefined;
  return (
    <Alert variant="destructive">
      <AlertTitle>{diagnostic.code}</AlertTitle>
      <AlertDescription className="min-w-0">
        <p className="max-h-40 overflow-auto break-words whitespace-pre-wrap">
          {diagnostic.message}
        </p>
        {location && (
          <p className="max-h-24 overflow-auto font-mono text-xs break-all">{location}</p>
        )}
        {previousAvailable && (
          <p>{t('The page still shows the last successfully built version.')}</p>
        )}
        {frame && (
          <details className="w-full min-w-0">
            <summary className="cursor-pointer">{t('Show code frame')}</summary>
            <pre className="mt-2 max-h-64 max-w-full overflow-auto rounded border p-3 text-xs">
              {frame}
            </pre>
          </details>
        )}
        {details?.truncated === true && (
          <p className="text-xs">{t('Diagnostic content was truncated.')}</p>
        )}
      </AlertDescription>
    </Alert>
  );
}
