import type { UIPreferences } from '../shared/preferences.js';
import type { JsonValue, Diagnostic } from '../shared/types.js';
export type BridgeIdentity = {
  paneon: true;
  channelId: string;
  instanceId: string;
  revision: string;
};
export type BridgeRequest = BridgeIdentity & {
  direction: 'request';
  requestId: string;
  method: 'action' | 'event' | 'browser';
  payload: JsonValue;
};
export type BridgeResponse = BridgeIdentity & {
  direction: 'response';
  requestId: string;
  ok: boolean;
  data?: JsonValue;
  error?: Diagnostic;
};
export type BridgeInit = BridgeIdentity & {
  direction: 'init';
  params: JsonValue;
  ui: UIPreferences;
};
export type BridgePreferences = BridgeIdentity & { direction: 'preferences'; ui: UIPreferences };
