import { useUI } from './ui/use-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Page,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
  Spinner,
  Stack,
} from './ui';
import { api, errorMessage, type PanelPage } from './web/api';
import { PreferencesSettings } from './web/preferences-settings';
import { PanelHost } from './web/panel-host';
export default function App() {
  const match = /^\/panels\/([^/]+)\/?$/.exec(window.location.pathname);
  return match ? <PanelHost instanceId={decodeURIComponent(match[1])} /> : <PanelList />;
}
function PanelList() {
  const { t } = useUI();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PanelPage>();
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const [error, setError] = useState<string>();
  const [closing, setClosing] = useState<string[]>([]);
  const [closeErrors, setCloseErrors] = useState<Record<string, string | undefined>>({});
  async function closePanel(instanceId: string) {
    if (closing.includes(instanceId)) return;
    setClosing((current) => [...current, instanceId]);
    setCloseErrors((current) => ({ ...current, [instanceId]: undefined }));
    try {
      await api(`/api/panels/${encodeURIComponent(instanceId)}/close`, { method: 'POST' });
      setResult(
        (current) =>
          current && {
            ...current,
            panels: current.panels.map((panel) =>
              panel.instanceId === instanceId ? { ...panel, status: 'closed' } : panel,
            ),
          },
      );
    } catch (cause) {
      setCloseErrors((current) => ({ ...current, [instanceId]: errorMessage(cause) }));
    } finally {
      setClosing((current) => current.filter((id) => id !== instanceId));
    }
  }
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await api<PanelPage>(`/api/panels?page=${page}&pageSize=20`);
      if (request !== generation.current) return;
      if (page > Math.max(1, result.totalPages)) {
        setPage(Math.max(1, result.totalPages));
        return;
      }
      setResult(result);
      setError(undefined);
    } catch (cause) {
      if (request === generation.current) setError(errorMessage(cause));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [page]);
  useEffect(() => {
    const requests = generation;
    void refresh();
    return () => {
      requests.current++;
    };
  }, [refresh]);
  const panels = result?.page === page ? result.panels : undefined;
  const totalPages = Math.max(1, result?.totalPages ?? 1);
  const busy = loading || closing.length > 0;
  return (
    <Page title="Paneon">
      <Stack direction="row" className="items-center justify-between">
        <h2 className="text-lg font-semibold">{t('Panels')}</h2>
        <PreferencesSettings />
        <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
          {t('Refresh')}
        </Button>
      </Stack>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {loading && <Spinner />}
      {!loading && panels?.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p>{t('No panels yet. Run a panel with the Paneon CLI.')}</p>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {!loading &&
          panels?.map((panel) => (
            <Card key={panel.instanceId}>
              <CardHeader>
                <CardTitle>
                  <a
                    className="underline-offset-4 hover:underline"
                    href={`/panels/${encodeURIComponent(panel.instanceId)}`}
                  >
                    {panel.definitionId}
                  </a>
                </CardTitle>
                <CardDescription className="break-all">{panel.instanceId}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Stack direction="row" gap={2}>
                  <Badge variant="secondary">{t(panel.status)}</Badge>
                  <Badge variant="outline">
                    {panel.watch ? t('Auto reload on') : t('Auto reload off')}
                  </Badge>
                </Stack>
                <p className="text-sm break-all text-muted-foreground">{panel.entryPath}</p>
                <Stack direction="row" gap={2} wrap>
                  <Button asChild variant="outline">
                    <a href={`/panels/${encodeURIComponent(panel.instanceId)}`}>
                      {t('Open panel')}
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    disabled={panel.status === 'closed' || closing.includes(panel.instanceId)}
                    aria-busy={closing.includes(panel.instanceId)}
                    onClick={() => void closePanel(panel.instanceId)}
                  >
                    {closing.includes(panel.instanceId) ? (
                      <>
                        <Spinner /> {t('Closing…')}
                      </>
                    ) : (
                      t('Close')
                    )}
                  </Button>
                </Stack>
                {closeErrors[panel.instanceId] && (
                  <Alert variant="destructive">
                    <AlertDescription>{closeErrors[panel.instanceId]}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          ))}
      </div>
      {result && (
        <Pagination aria-label={t('Panel pagination')}>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                aria-disabled={busy || page <= 1}
                tabIndex={busy || page <= 1 ? -1 : undefined}
                className={busy || page <= 1 ? 'pointer-events-none opacity-50' : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  if (!busy && page > 1) setPage(page - 1);
                }}
              />
            </PaginationItem>
            <PaginationItem>
              <span aria-live="polite" className="px-3 text-sm text-muted-foreground">
                {t('Page {page} of {totalPages} · {total} panels', {
                  page,
                  totalPages,
                  total: result.total,
                })}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#"
                aria-disabled={busy || page >= totalPages}
                tabIndex={busy || page >= totalPages ? -1 : undefined}
                className={
                  busy || page >= totalPages ? 'pointer-events-none opacity-50' : undefined
                }
                onClick={(event) => {
                  event.preventDefault();
                  if (!busy && page < totalPages) setPage(page + 1);
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </Page>
  );
}
