import { useEffect, useState, type ReactNode } from 'react';
import { Alert, AlertDescription, Badge, Spinner, useUI } from '../ui';
import { api, errorMessage } from './api';
import type { RuntimeDescriptor } from '../shared/types';
type Health = Omit<RuntimeDescriptor, 'controlToken'>;
export function ServerStatus() {
  const { language, t } = useUI();
  const [result, setResult] = useState<Health>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    void api<Health>('/health', { signal: controller.signal }).then(
      (health) => {
        if (!controller.signal.aborted) setResult(health);
      },
      (cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      },
    );
    return () => controller.abort();
  }, []);
  const rows: [string, ReactNode][] | undefined = result && [
    [
      t('Status'),
      <Badge key="status" variant="secondary">
        {t('running')}
      </Badge>,
    ],
    [t('Version'), result.paneonVersion],
    [t('Process ID'), String(result.pid)],
    [t('Address'), new URL(`http://127.0.0.1:${result.port}`).origin],
    [t('Started at'), new Date(result.startedAt).toLocaleString(language)],
    [t('Runtime ID'), result.runtimeId],
  ];
  return (
    <section className="max-w-[640px]" aria-labelledby="server-title">
      <h1 id="server-title" className="mb-6 text-xl font-semibold tracking-tight">
        {t('Local Paneon service')}
      </h1>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {t('Unable to load service status. {error}', { error })}
          </AlertDescription>
        </Alert>
      ) : rows ? (
        <dl>
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="grid gap-2 border-t py-4 text-sm sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-5"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-all">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          {t('Loading')}
        </div>
      )}
    </section>
  );
}
