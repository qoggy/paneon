import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Card, CardContent } from '../ui/card';
import { Spinner } from '../ui/spinner';
import { useUI } from '../ui/use-ui';
import { BuildDiagnostic } from './build-diagnostic';
import { api, ApiError, errorMessage, type PanelDetails } from './api';
import { validRequest, validSource, type BridgeIdentity, type BridgeRequest } from './bridge';
import { isBrowserAction } from '../shared/browser-actions';
import { performBrowserAction } from '../ui/browser-actions';

export function PanelHost({ instanceId }: { instanceId: string }) {
  const { t } = useUI();
  const [panel, setPanel] = useState<PanelDetails>();
  const [error, setError] = useState<string>();
  const [connected, setConnected] = useState<boolean>();
  const [missing, setMissing] = useState(false);
  const definitionId = panel?.definitionId;
  useEffect(() => {
    document.title = definitionId ? `${definitionId} - paneon` : 'paneon';
    return () => {
      document.title = 'paneon';
    };
  }, [definitionId]);
  const refreshGeneration = useRef(0);
  const refresh = useCallback(() => {
    const generation = ++refreshGeneration.current;
    return api<PanelDetails>(`/api/panels/${encodeURIComponent(instanceId)}`)
      .then((next) => {
        if (generation !== refreshGeneration.current) return;
        setPanel(next);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (generation !== refreshGeneration.current) return;
        if (cause instanceof ApiError && cause.code === 'PANEL_NOT_FOUND') {
          setPanel(undefined);
          setMissing(true);
          setError(undefined);
        } else setError(errorMessage(cause));
      });
  }, [instanceId]);
  useEffect(() => {
    if (missing) return;
    const generation = refreshGeneration;
    void refresh();
    const url = new URL(`/api/panels/${encodeURIComponent(instanceId)}/stream`, location.href);
    url.protocol = 'ws:';
    let disposed = false;
    let socket: WebSocket;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 500;
    function connect() {
      if (disposed) return;
      socket = new WebSocket(url);
      socket.onopen = () => {
        if (disposed) return;
        retryDelay = 500;
        setConnected(true);
        void refresh();
      };
      socket.onerror = () => {
        if (!disposed) setConnected(false);
      };
      socket.onclose = () => {
        if (disposed) return;
        setConnected(false);
        void refresh();
        retry = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 10000);
      };
      socket.onmessage = (event) => {
        if (disposed) return;
        try {
          const update = JSON.parse(event.data as string) as { type?: string };
          if (update.type === 'deleted') {
            generation.current++;
            setPanel(undefined);
            setMissing(true);
            setError(undefined);
          } else if (update.type === 'state') void refresh();
        } catch {
          setError('The runtime sent an invalid state notification.');
        }
      };
    }
    connect();
    return () => {
      disposed = true;
      generation.current++;
      clearTimeout(retry);
      socket.close();
    };
  }, [instanceId, refresh, missing]);
  return (
    <div className="flex h-dvh flex-col">
      {connected === false && !error && !missing && (
        <p role="status" className="shrink-0 px-4 py-2 text-sm text-muted-foreground">
          {t('Reconnecting to Paneon…')}
        </p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{t('Runtime connection')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {panel?.diagnostic && (
        <BuildDiagnostic
          diagnostic={panel.diagnostic}
          previousAvailable={panel.status === 'running'}
        />
      )}
      {missing && (
        <Card>
          <CardContent className="pt-6">
            <p>{t('This panel no longer exists.')}</p>
          </CardContent>
        </Card>
      )}
      {!panel && !error && !missing && <Spinner />}
      {panel &&
        (panel.status === 'running' ? (
          <Frame key={`${panel.instanceId}:${panel.revision}`} panel={panel} />
        ) : (
          <Card>
            <CardContent className="pt-6">
              <h2 className="font-semibold">{t('Panel {status}', { status: t(panel.status) })}</h2>
              <p className="text-sm text-muted-foreground">
                {panel.status === 'closed'
                  ? t('This panel has been closed. Interaction history is retained.')
                  : t(
                      'This panel is unavailable. Ask your agent to inspect the diagnostic and correct the source.',
                    )}
              </p>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}

function Frame({ panel }: { panel: PanelDetails }) {
  const { theme, language } = useUI();
  const ui = useRef({ theme, language });
  useLayoutEffect(() => {
    ui.current = { theme, language };
  }, [theme, language]);
  const frame = useRef<HTMLIFrameElement>(null);
  const [identity] = useState<BridgeIdentity>(() => ({
    paneon: true,
    instanceId: panel.instanceId,
    revision: panel.revision,
    channelId: crypto.randomUUID(),
  }));
  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { ...identity, direction: 'preferences', ui: { theme, language } },
      '*',
    );
  }, [theme, language, identity]);
  const endpoint = `/api/panels/${encodeURIComponent(panel.instanceId)}`;
  const latestPanel = useRef(panel);
  useEffect(() => {
    latestPanel.current = panel;
  }, [panel]);
  useEffect(() => {
    const seen = new Set<string>();
    let active = true;
    async function dispatch(message: BridgeRequest) {
      const panel = latestPanel.current;
      const payload = message.payload;
      if (message.method === 'browser' && isBrowserAction(payload)) {
        await performBrowserAction(payload);
        return null;
      }
      if (message.method === 'file')
        return api<unknown>(`${endpoint}/file`, {
          method: 'POST',
          body: JSON.stringify({ revision: panel.revision, reference: payload }),
        });
      if (message.method === 'action') {
        const action = panel.manifest?.actions.find((item) => item.id === payload.actionId);
        if (!action) throw new ApiError('UNKNOWN_ACTION', 'The requested action does not exist.');
        return api<unknown>(`${endpoint}/actions/${encodeURIComponent(action.id)}`, {
          method: 'POST',
          body: JSON.stringify({
            revision: panel.revision,
            requestId: message.requestId,
            input: payload.input,
          }),
        });
      }
      if (message.method === 'event')
        return api<unknown>(`${endpoint}/events`, {
          method: 'POST',
          body: JSON.stringify({
            revision: panel.revision,
            type: payload.type,
            payload: payload.payload,
          }),
        });
    }
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!validSource(event.source, frame.current?.contentWindow ?? null)) return;
      if (
        event.data &&
        typeof event.data === 'object' &&
        'paneon' in event.data &&
        event.data.paneon === true &&
        'direction' in event.data &&
        event.data.direction === 'ready'
      ) {
        frame.current?.contentWindow?.postMessage(
          { ...identity, direction: 'init', params: latestPanel.current.params, ui: ui.current },
          '*',
        );
        return;
      }
      if (!validRequest(event.data, identity)) return;
      const message = event.data;
      // A request is never executed twice, including while its first response is pending.
      if (seen.has(message.requestId)) return;
      if (seen.size >= 10000) {
        frame.current?.contentWindow?.postMessage(
          {
            ...identity,
            direction: 'response',
            requestId: message.requestId,
            ok: false,
            error: {
              code: 'BRIDGE_LIMIT_REACHED',
              message: 'Refresh this panel before making more requests.',
            },
          },
          '*',
        );
        return;
      }
      seen.add(message.requestId);
      void dispatch(message)
        .then((data) => {
          if (active)
            frame.current?.contentWindow?.postMessage(
              { ...identity, direction: 'response', requestId: message.requestId, ok: true, data },
              '*',
            );
        })
        .catch((cause: unknown) => {
          if (active)
            frame.current?.contentWindow?.postMessage(
              {
                ...identity,
                direction: 'response',
                requestId: message.requestId,
                ok: false,
                error: {
                  code: cause instanceof ApiError ? cause.code : 'REQUEST_FAILED',
                  message: cause instanceof ApiError ? cause.message : 'The request failed.',
                },
              },
              '*',
            );
        });
    };
    window.addEventListener('message', onMessage);
    return () => {
      active = false;
      window.removeEventListener('message', onMessage);
    };
  }, [endpoint, identity]);
  return (
    <iframe
      ref={frame}
      title={panel.definitionId}
      sandbox="allow-scripts"
      referrerPolicy="same-origin"
      src={`/panels/${encodeURIComponent(panel.instanceId)}/${encodeURIComponent(panel.revision)}/frame.html`}
      className="block min-h-0 w-full flex-1 border-0 bg-background"
    />
  );
}
