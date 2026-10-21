import type { BridgeIdentity, BridgeRequest as SdkBridgeRequest } from '../sdk/protocol.js';
export type { BridgeIdentity };
export type BridgeRequest = SdkBridgeRequest & { payload: Record<string, unknown> };
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
// The source window is checked separately: opaque-origin frames intentionally have origin null.
export function validRequest(value: unknown, identity: BridgeIdentity): value is BridgeRequest {
  if (
    !record(value) ||
    value.paneon !== true ||
    value.direction !== 'request' ||
    value.channelId !== identity.channelId ||
    value.instanceId !== identity.instanceId ||
    value.revision !== identity.revision ||
    typeof value.requestId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(value.requestId) ||
    !record(value.payload)
  )
    return false;
  if (value.method === 'action')
    return typeof value.payload.actionId === 'string' && Object.hasOwn(value.payload, 'input');
  if (value.method === 'event')
    return typeof value.payload.type === 'string' && Object.hasOwn(value.payload, 'payload');
  if (value.method === 'credential') return typeof value.payload.actionId === 'string';
  return false;
}
export function validSource(source: unknown, frame: unknown): boolean {
  return frame != null && source === frame;
}
