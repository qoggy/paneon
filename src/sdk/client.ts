import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { Action, PanelDefinition } from './server.js';
import type { BridgeInit, BridgeRequest, BridgeResponse, CredentialRef } from './protocol.js';
import type { JsonValue } from '../shared/types.js';
export { z } from 'zod';
export type { ActionContext, Action, PanelDefinition } from './server.js';
export const PanelInputContext = createContext<unknown>({});
export function usePanelInput<I>(): I {
  return useContext(PanelInputContext) as I;
}
let connection: BridgeInit | undefined;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
export function initializeBridge(init: BridgeInit) {
  connection = init;
}
if (typeof window !== 'undefined')
  window.addEventListener('message', (event: MessageEvent<BridgeResponse>) => {
    const data = event.data;
    if (
      event.source !== window.parent ||
      !connection ||
      !data ||
      data.paneon !== true ||
      data.direction !== 'response' ||
      data.channelId !== connection.channelId ||
      data.instanceId !== connection.instanceId ||
      data.revision !== connection.revision
    )
      return;
    const request = pending.get(data.requestId);
    if (!request) return;
    pending.delete(data.requestId);
    if (data.ok) request.resolve(data.data);
    else
      request.reject(
        Object.assign(new Error(data.error?.message ?? 'The request failed.'), {
          code: data.error?.code,
        }),
      );
  });
function request<T>(method: BridgeRequest['method'], payload: unknown): Promise<T> {
  if (!connection) return Promise.reject(new Error('The panel bridge is not connected.'));
  const identity = connection;
  const requestId = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    pending.set(requestId, { resolve: (v) => resolve(v as T), reject });
    window.parent.postMessage(
      {
        paneon: true,
        channelId: identity.channelId,
        instanceId: identity.instanceId,
        revision: identity.revision,
        direction: 'request',
        requestId,
        method,
        payload: payload as JsonValue,
      },
      '*',
    );
  });
}
export function createActionProxy<I, O, K extends 'query' | 'mutation'>(
  actionId: string,
  kind: K,
): Action<I, O, K> {
  return Object.assign((input: I) => request<O>('action', { actionId, input }), {
    kind,
    actionId,
  }) as Action<I, O, K>;
}
export function serverAction(): never {
  throw new Error('serverAction must be compiled by Paneon.');
}
export function definePanel<I>(definition: PanelDefinition<I>): PanelDefinition<I> {
  return definition;
}
export const agent = {
  emit: (type: string, payload: unknown) => request<{ id: number }>('event', { type, payload }),
};
export const credentials = {
  request: (action: { actionId?: string }) =>
    request<CredentialRef>('credential', { actionId: action.actionId }),
};
export function useQuery<I, O>(
  action: Action<I, O, 'query'>,
  input: I,
  options: { refreshMs?: number } = {},
) {
  if (action.kind !== 'query') throw new Error('useQuery accepts only query actions.');
  const [state, setState] = useState<{
    data: O | undefined;
    error: Error | undefined;
    loading: boolean;
  }>({ data: undefined, error: undefined, loading: true });
  const latest = useRef({ action, input });
  latest.current = { action, input };
  const trigger = useRef<() => Promise<void>>(async () => {});
  const key = JSON.stringify(input);
  useEffect(() => {
    let active = true;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (!active || running) return;
      running = true;
      setState((s) => ({ ...s, loading: true }));
      try {
        const data = await latest.current.action(latest.current.input);
        if (active) setState({ data, error: undefined, loading: false });
      } catch (e) {
        if (active)
          setState((s) => ({
            ...s,
            error: e instanceof Error ? e : new Error('The query failed.'),
            loading: false,
          }));
      } finally {
        running = false;
        if (active && options.refreshMs && options.refreshMs > 0)
          timer = setTimeout(() => {
            void run();
          }, options.refreshMs);
      }
    };
    trigger.current = async () => {
      if (timer) clearTimeout(timer);
      await run();
    };
    void run();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [action, key, options.refreshMs]);
  const refetch = useCallback(() => trigger.current(), []);
  return { ...state, refetch };
}
