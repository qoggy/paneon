import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  Input,
  Page,
  Spinner,
  Stack,
  Switch,
  Textarea,
} from '../ui';
import { api, ApiError, errorMessage, type PanelDetails } from './api';
import { validRequest, validSource, type BridgeIdentity, type BridgeRequest } from './bridge';

type Credential = {
  ref: string;
  expiresAt: string;
  status: 'ready' | 'expired' | 'revoked';
  label: string;
};
type Prompt = {
  actionId: string;
  label: string;
  ttlSeconds: number;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export function PanelHost({ instanceId }: { instanceId: string }) {
  const [panel, setPanel] = useState<PanelDetails>();
  const [error, setError] = useState<string>();
  const [connected, setConnected] = useState(false);
  const [building, setBuilding] = useState(false);
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
        if (generation === refreshGeneration.current) setError(errorMessage(cause));
      });
  }, [instanceId]);
  useEffect(() => {
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
        retry = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 10000);
      };
      socket.onmessage = (event) => {
        if (disposed) return;
        try {
          const update = JSON.parse(event.data as string) as { type?: string; building?: boolean };
          if (update.type === 'state') {
            setBuilding(update.building === true);
            void refresh();
          }
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
  }, [instanceId, refresh]);
  return (
    <Page title={panel?.definitionId ?? 'Paneon'}>
      <Stack direction="row" wrap className="items-center justify-between">
        <Stack direction="row" gap={2} wrap className="items-center">
          <a href="/" className="text-sm underline underline-offset-4">
            All panels
          </a>
          <Badge variant={connected ? 'secondary' : 'outline'}>
            {connected ? 'Connected' : 'Reconnecting'}
          </Badge>
          {panel && (
            <>
              <Badge variant="outline">{panel.watch ? 'Auto reload on' : 'Auto reload off'}</Badge>
              <Badge variant="outline">Paneon {panel.paneonVersion}</Badge>
            </>
          )}
          {building && (
            <span role="status" className="flex items-center gap-2 text-sm">
              <Spinner />
              Building
            </span>
          )}
        </Stack>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          Refresh status
        </Button>
      </Stack>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Runtime connection</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {panel?.diagnostic && (
        <Alert variant="destructive">
          <AlertTitle>{panel.diagnostic.code}</AlertTitle>
          <AlertDescription>
            {panel.diagnostic.message}
            {panel.status === 'running' && ' The previous working panel remains available.'}
          </AlertDescription>
        </Alert>
      )}
      {!panel && !error && <Spinner />}
      {panel &&
        (panel.status === 'running' ? (
          <Frame key={`${panel.instanceId}:${panel.revision}`} panel={panel} />
        ) : (
          <Card>
            <CardContent className="pt-6">
              <h2 className="font-semibold">Panel {panel.status}</h2>
              <p className="text-sm text-muted-foreground">
                {panel.status === 'closed'
                  ? 'This panel has been closed. Interaction history is retained.'
                  : 'This panel is unavailable. Ask your agent to inspect the diagnostic and correct the source.'}
              </p>
            </CardContent>
          </Card>
        ))}
    </Page>
  );
}

function Frame({ panel }: { panel: PanelDetails }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [identity] = useState<BridgeIdentity>(() => ({
    paneon: true,
    instanceId: panel.instanceId,
    revision: panel.revision,
    channelId: crypto.randomUUID(),
  }));
  const [prompt, setPrompt] = useState<Prompt>();
  const currentPrompt = useRef<Prompt | undefined>(undefined);
  const secretInput = useRef<HTMLInputElement>(null);
  const secretArea = useRef<HTMLTextAreaElement>(null);
  const [multiline, setMultiline] = useState(false);
  const bindSecretInput = useCallback((node: HTMLInputElement | null) => {
    if (!node) return;
    secretInput.current = node;
    return () => {
      node.value = '';
      secretInput.current = null;
    };
  }, []);
  const bindSecretArea = useCallback((node: HTMLTextAreaElement | null) => {
    if (!node) return;
    secretArea.current = node;
    return () => {
      node.value = '';
      secretArea.current = null;
    };
  }, []);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [credentialError, setCredentialError] = useState<string>();
  const endpoint = `/api/panels/${encodeURIComponent(panel.instanceId)}`;
  const latestPanel = useRef(panel);
  useEffect(() => {
    latestPanel.current = panel;
  }, [panel]);
  const cancel = useCallback(() => {
    currentPrompt.current?.reject(
      new ApiError('CREDENTIAL_CANCELLED', 'Credential input was cancelled.'),
    );
    currentPrompt.current = undefined;
    if (secretInput.current) secretInput.current.value = '';
    if (secretArea.current) secretArea.current.value = '';
    setPrompt(undefined);
    setCredentialError(undefined);
  }, []);
  useEffect(() => {
    const seen = new Set<string>();
    let active = true;
    async function dispatch(message: BridgeRequest) {
      const panel = latestPanel.current;
      const payload = message.payload;
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
      const action = panel.manifest?.actions.find((item) => item.id === payload.actionId);
      if (!action?.credential)
        throw new ApiError(
          'CREDENTIAL_NOT_DECLARED',
          'This action does not declare credential input.',
        );
      const credential = action.credential;
      if (currentPrompt.current)
        throw new ApiError('CREDENTIAL_BUSY', 'A credential dialog is already open.');
      return new Promise<unknown>((resolve, reject) => {
        const next = {
          actionId: action.id,
          label: credential.label,
          ttlSeconds: Math.min(3600, Math.max(1, credential.ttlSeconds ?? 900)),
          resolve,
          reject,
        };
        currentPrompt.current = next;
        setMultiline(false);
        setPrompt(next);
        setCredentialError(undefined);
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
          { ...identity, direction: 'init', params: latestPanel.current.params },
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
      currentPrompt.current?.reject(
        new ApiError('PANEL_REVISION_MISMATCH', 'The panel changed. Request a new credential.'),
      );
      currentPrompt.current = undefined;
    };
  }, [endpoint, identity]);
  useEffect(() => {
    const timer = window.setInterval(
      () =>
        setCredentials((current) =>
          current.map((item) =>
            item.status === 'ready' && Date.parse(item.expiresAt) <= Date.now()
              ? { ...item, status: 'expired' }
              : item,
          ),
        ),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);
  async function submit() {
    const request = currentPrompt.current;
    const value = multiline ? secretArea.current?.value : secretInput.current?.value;
    if (!request || !value || submitting) return;
    setSubmitting(true);
    setCredentialError(undefined);
    try {
      const result = await api<{ ref: string; expiresAt: string; status: 'ready' }>(
        '/api/credentials',
        {
          method: 'POST',
          body: JSON.stringify({
            instanceId: panel.instanceId,
            revision: panel.revision,
            actionId: request.actionId,
            value,
            ttlSeconds: request.ttlSeconds,
          }),
        },
      );
      if (secretInput.current) secretInput.current.value = '';
      if (secretArea.current) secretArea.current.value = '';
      setCredentials((current) => [...current, { ...result, label: request.label }]);
      request.resolve(result);
      currentPrompt.current = undefined;
      setPrompt(undefined);
    } catch (cause) {
      setCredentialError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }
  async function revoke(ref: string) {
    try {
      await api(`/api/credentials/${encodeURIComponent(ref)}`, { method: 'DELETE' });
      setCredentials((current) =>
        current.map((item) => (item.ref === ref ? { ...item, status: 'revoked' } : item)),
      );
    } catch (cause) {
      setCredentialError(errorMessage(cause));
    }
  }
  return (
    <>
      <iframe
        ref={frame}
        title={panel.definitionId}
        sandbox="allow-scripts"
        referrerPolicy="same-origin"
        src={`/panels/${encodeURIComponent(panel.instanceId)}/${encodeURIComponent(panel.revision)}/frame.html`}
        className="h-[75vh] min-h-96 w-full rounded-lg border bg-background"
      />
      {credentials.length > 0 && (
        <section aria-label="Credential references" className="space-y-2">
          <h2 className="text-sm font-medium">Temporary credentials</h2>
          {credentials.map((item) => (
            <Stack key={item.ref} direction="row" gap={2} className="items-center">
              <span className="text-sm">{item.label}</span>
              <Badge variant="outline">{item.status}</Badge>
              {item.status === 'ready' && (
                <Button size="sm" variant="outline" onClick={() => void revoke(item.ref)}>
                  Revoke
                </Button>
              )}
            </Stack>
          ))}
        </section>
      )}
      {credentialError && !prompt && (
        <Alert variant="destructive">
          <AlertDescription>{credentialError}</AlertDescription>
        </Alert>
      )}
      <Dialog
        open={Boolean(prompt)}
        onOpenChange={(open) => {
          if (!open && !submitting) cancel();
        }}
      >
        <DialogContent
          showCloseButton={!submitting}
          onEscapeKeyDown={(event) => {
            if (submitting) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (submitting) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Provide a temporary credential</DialogTitle>
            <DialogDescription>
              {prompt?.label}. The value is given to the declared server function; the panel and
              agent receive only a reference.
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-1 text-xs text-muted-foreground">
            <dt>Action</dt>
            <dd className="break-all">{prompt?.actionId}</dd>
            <dt>Revision</dt>
            <dd className="break-all">{panel.revision}</dd>
            <dt>Expires after</dt>
            <dd>
              {(prompt?.ttlSeconds ?? 900) % 60 === 0
                ? `${(prompt?.ttlSeconds ?? 900) / 60} minutes`
                : `${prompt?.ttlSeconds ?? 900} ${(prompt?.ttlSeconds ?? 900) === 1 ? 'second' : 'seconds'}`}
            </dd>
          </dl>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Field>
              <FieldLabel htmlFor="paneon-credential">Credential</FieldLabel>
              {multiline ? (
                <Textarea
                  ref={bindSecretArea}
                  id="paneon-credential"
                  autoComplete="off"
                  spellCheck={false}
                  rows={5}
                  required
                  disabled={submitting}
                />
              ) : (
                <Input
                  ref={bindSecretInput}
                  id="paneon-credential"
                  type="password"
                  autoComplete="off"
                  required
                  disabled={submitting}
                />
              )}
            </Field>
            <Field orientation="horizontal" className="mt-3">
              <Switch
                id="paneon-multiline"
                checked={multiline}
                disabled={submitting}
                onCheckedChange={(checked) => {
                  if (secretInput.current) secretInput.current.value = '';
                  if (secretArea.current) secretArea.current.value = '';
                  setMultiline(checked);
                }}
              />
              <FieldLabel htmlFor="paneon-multiline">Multiline input (shown as text)</FieldLabel>
            </Field>
            {credentialError && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {credentialError}
              </p>
            )}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" disabled={submitting} onClick={cancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Spinner />}Provide
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
