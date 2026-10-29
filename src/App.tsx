import { useUI } from './ui/use-ui';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from './ui/navigation-menu';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from './ui/pagination';
import { Spinner } from './ui/spinner';
import { Stack } from './ui/layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { api, ApiError, errorMessage, type PanelPage, type PanelSummary } from './web/api';
import { PreferencesSettings } from './web/preferences-settings';
import { PanelHost } from './web/panel-host';
import { ServerStatus } from './web/server-status';
import PanelDeleteDialog from './web/panel-delete-dialog';
type ManagementPath = '/' | '/server' | '/settings';
type PanelListState = { status: PanelSummary['status'] | 'all'; page: number };
type NavigationMode = 'push' | 'replace' | 'pop';
const managementPaths = ['/', '/server', '/settings'] as const;
function managementPath(path: string): ManagementPath {
  return path === '/server' || path === '/settings' ? path : '/';
}
function readPanelListState(search: string): PanelListState {
  const query = new URLSearchParams(search);
  return {
    status: (query.get('status') ?? 'all') as PanelListState['status'],
    page: Number(query.get('page') ?? '1'),
  };
}
function panelListUrl({ status, page }: PanelListState): string {
  const query = new URLSearchParams();
  if (status !== 'all') query.set('status', status);
  if (page !== 1) query.set('page', String(page));
  const search = query.toString();
  return search ? `/?${search}` : '/';
}
export default function App() {
  const match = /^\/panels\/([^/]+)\/?$/.exec(window.location.pathname);
  return match ? <PanelHost instanceId={decodeURIComponent(match[1])} /> : <ManagementApp />;
}
function ManagementApp() {
  const [path, setPath] = useState(window.location.pathname);
  const [list, setList] = useState(() =>
    readPanelListState(window.location.pathname === '/' ? window.location.search : ''),
  );
  const [panelsVisited, setPanelsVisited] = useState(window.location.pathname === '/');
  const activeUrl = useRef(path + window.location.search);
  const scrollPositions = useRef<Record<string, number>>({});
  const navigate = useCallback((next: string, mode: NavigationMode = 'push') => {
    if (activeUrl.current === next) return;
    const previous = new URL(activeUrl.current, window.location.origin);
    const target = new URL(next, window.location.origin);
    scrollPositions.current[previous.pathname] = window.scrollY;
    if (mode !== 'pop')
      window.history[mode === 'replace' ? 'replaceState' : 'pushState'](null, '', next);
    if (target.pathname === '/') {
      setPanelsVisited(true);
      setList(readPanelListState(target.search));
    }
    activeUrl.current = next;
    setPath(target.pathname);
  }, []);
  const changeList = useCallback(
    (next: PanelListState, replace = false) => {
      if (new URL(activeUrl.current, window.location.origin).pathname === '/')
        navigate(panelListUrl(next), replace ? 'replace' : 'push');
      else setList(next);
    },
    [navigate],
  );
  useEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    const pop = () => navigate(window.location.pathname + window.location.search, 'pop');
    window.addEventListener('popstate', pop);
    return () => {
      window.removeEventListener('popstate', pop);
      history.scrollRestoration = previous;
    };
  }, [navigate]);
  useLayoutEffect(() => {
    window.scrollTo(0, scrollPositions.current[path] ?? 0);
  }, [path]);
  return (
    <Management
      path={managementPath(path)}
      navigate={navigate}
      panelsVisited={panelsVisited}
      list={list}
      changeList={changeList}
    />
  );
}
function Management({
  path,
  navigate,
  panelsVisited,
  list,
  changeList,
}: {
  path: ManagementPath;
  navigate: (path: string) => void;
  panelsVisited: boolean;
  list: PanelListState;
  changeList: (next: PanelListState, replace?: boolean) => void;
}) {
  const { t } = useUI();
  const listUrl = panelListUrl(list);
  const labels = { '/': t('Panels'), '/server': t('Server'), '/settings': t('Settings') };
  return (
    <div className="mx-auto w-full max-w-6xl px-4 md:px-8">
      <header className="flex items-center gap-6 border-b py-4">
        <a
          className="w-fit text-2xl font-semibold tracking-tight"
          href={listUrl}
          onClick={(event) => {
            if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
              return;
            event.preventDefault();
            navigate(listUrl);
          }}
        >
          Paneon
        </a>
        <NavigationMenu aria-label={t('Management navigation')}>
          <NavigationMenuList>
            {managementPaths.map((target) => (
              <NavigationMenuItem key={target}>
                <NavigationMenuLink
                  href={target === '/' ? listUrl : target}
                  active={path === target}
                  className={navigationMenuTriggerStyle()}
                  onClick={(event) => {
                    if (
                      event.button ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    navigate(target === '/' ? listUrl : target);
                  }}
                >
                  {labels[target]}
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>
      </header>
      <main className="py-8">
        <div hidden={path !== '/'}>
          {(panelsVisited || path === '/') && <PanelList {...list} onChange={changeList} />}
        </div>
        {path === '/server' && <ServerStatus />}
        <div hidden={path !== '/settings'}>
          <PreferencesSettings />
        </div>
      </main>
    </div>
  );
}
function PanelList({
  status,
  page,
  onChange,
}: PanelListState & { onChange: (next: PanelListState, replace?: boolean) => void }) {
  const { t } = useUI();
  const [result, setResult] = useState<PanelPage & { filter: typeof status }>();
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const [error, setError] = useState<string>();
  const [closing, setClosing] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<string[]>([]);
  const [deletionTarget, setDeletionTarget] = useState<{
    panel: PanelSummary;
    trigger: HTMLButtonElement;
  }>();
  const [operationErrors, setOperationErrors] = useState<Record<string, string | undefined>>({});
  async function closePanel(instanceId: string) {
    if (closing.includes(instanceId)) return;
    setClosing((current) => [...current, instanceId]);
    setOperationErrors((current) => ({ ...current, [instanceId]: undefined }));
    try {
      await api(`/api/panels/${encodeURIComponent(instanceId)}/close`, { method: 'POST' });
      if (status !== 'all') await refresh();
      else
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
      setOperationErrors((current) => ({ ...current, [instanceId]: errorMessage(cause) }));
    } finally {
      setClosing((current) => current.filter((id) => id !== instanceId));
    }
  }
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError(undefined);
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (status !== 'all') query.set('status', status);
      const result = await api<PanelPage>(`/api/panels?${query}`);
      if (request !== generation.current) return;
      if (page > Math.max(1, result.totalPages)) {
        onChange({ status, page: Math.max(1, result.totalPages) }, true);
        return;
      }
      setResult({ ...result, filter: status });
      setError(undefined);
    } catch (cause) {
      if (request === generation.current) setError(errorMessage(cause));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [page, status, onChange]);
  const currentRefresh = useRef(refresh);
  useLayoutEffect(() => {
    currentRefresh.current = refresh;
  }, [refresh]);
  async function deletePanel(instanceId: string) {
    setDeleting((current) => [...current, instanceId]);
    setOperationErrors((current) => ({ ...current, [instanceId]: undefined }));
    try {
      await api(`/api/panels/${encodeURIComponent(instanceId)}`, { method: 'DELETE' });
      await currentRefresh.current();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'PANEL_NOT_FOUND')
        await currentRefresh.current();
      else setOperationErrors((current) => ({ ...current, [instanceId]: errorMessage(cause) }));
    } finally {
      setDeleting((current) => current.filter((id) => id !== instanceId));
    }
  }
  useEffect(() => {
    const requests = generation;
    void refresh();
    return () => {
      requests.current++;
    };
  }, [refresh]);
  const currentResult = result?.filter === status && result.page === page ? result : undefined;
  const panels = currentResult?.panels;
  const totalPages = Math.max(1, currentResult?.totalPages ?? 1);
  const busy = loading || closing.length > 0 || deleting.length > 0;
  return (
    <Tabs
      value={status}
      onValueChange={(value) => {
        onChange({ status: value as typeof status, page: 1 });
      }}
      className="gap-4"
      render={
        <section aria-labelledby="panels-title">
          <Stack direction="row" className="items-center justify-between">
            <h1 id="panels-title" className="text-xl font-semibold tracking-tight">
              {t('Panels')}
            </h1>
            <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
              {t('Refresh')}
            </Button>
          </Stack>
          <TabsList aria-label={t('Panel status')}>
            {(
              [
                ['all', 'All'],
                ['running', 'Running'],
                ['closed', 'Closed'],
                ['unavailable', 'unavailable'],
              ] as const
            ).map(([value, label]) => (
              <TabsTrigger key={value} value={value} disabled={closing.length > 0}>
                {t(label)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={status} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {loading && <Spinner />}
            {!loading && panels?.length === 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p>
                    {t(
                      status === 'all'
                        ? 'No panels yet. Run a panel with the Paneon CLI.'
                        : 'No panels with this status.',
                    )}
                  </p>
                </CardContent>
              </Card>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {!loading &&
                panels?.map((panel) => (
                  <Card key={panel.instanceId}>
                    <CardHeader className="flex flex-row items-baseline justify-between gap-3">
                      <CardTitle className="min-w-0 break-words">
                        <a
                          className="underline-offset-4 hover:underline"
                          href={`/panels/${encodeURIComponent(panel.instanceId)}`}
                        >
                          {panel.definitionId}
                        </a>
                      </CardTitle>
                      <span className="shrink-0 text-sm text-muted-foreground">
                        #{panel.instanceId}
                      </span>
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
                        <Button
                          nativeButton={false}
                          render={
                            <a href={`/panels/${encodeURIComponent(panel.instanceId)}`}>
                              {t('Open panel')}
                            </a>
                          }
                          variant="outline"
                        />
                        <Button
                          variant="outline"
                          disabled={
                            panel.status === 'closed' ||
                            closing.includes(panel.instanceId) ||
                            deleting.includes(panel.instanceId)
                          }
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
                        <Button
                          variant="destructive"
                          className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
                          disabled={closing.includes(panel.instanceId)}
                          aria-disabled={deleting.includes(panel.instanceId)}
                          aria-busy={deleting.includes(panel.instanceId)}
                          onClick={(event) => {
                            if (!deleting.includes(panel.instanceId))
                              setDeletionTarget({ panel, trigger: event.currentTarget });
                          }}
                        >
                          {deleting.includes(panel.instanceId) ? (
                            <>
                              <Spinner /> {t('Deleting…')}
                            </>
                          ) : (
                            t('Delete')
                          )}
                        </Button>
                      </Stack>
                      {operationErrors[panel.instanceId] && (
                        <Alert variant="destructive">
                          <AlertDescription>{operationErrors[panel.instanceId]}</AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                ))}
            </div>
            {currentResult && (
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
                        if (!busy && page > 1) onChange({ status, page: page - 1 });
                      }}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <span aria-live="polite" className="px-3 text-sm text-muted-foreground">
                      {t('Page {page} of {totalPages} · {total} panels', {
                        page,
                        totalPages,
                        total: currentResult.total,
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
                        if (!busy && page < totalPages) onChange({ status, page: page + 1 });
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </TabsContent>
          {deletionTarget && (
            <PanelDeleteDialog
              {...deletionTarget}
              onClose={() => setDeletionTarget(undefined)}
              onDelete={(instanceId) => void deletePanel(instanceId)}
            />
          )}
        </section>
      }
    />
  );
}
