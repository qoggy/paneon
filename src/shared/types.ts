export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type Diagnostic = { code: string; message: string; details?: Record<string, JsonValue> };
export class PaneonError extends Error {
  code: string;
  details?: Record<string, JsonValue>;
  constructor(code: string, message: string, details?: Record<string, JsonValue>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
export function diagnostic(error: unknown): Diagnostic {
  return error instanceof PaneonError
    ? {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      }
    : { code: 'INTERNAL_ERROR', message: 'An internal framework operation failed.' };
}
export function jsonValue(value: unknown): JsonValue {
  const seen = new Set<object>();
  function check(v: unknown): void {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (typeof v !== 'object' || v === null || seen.has(v))
      throw new PaneonError('INVALID_RESULT', 'The value must be finite, acyclic JSON.');
    seen.add(v);
    if (Array.isArray(v)) v.forEach(check);
    else {
      if (Object.getPrototypeOf(v) !== Object.prototype)
        throw new PaneonError('INVALID_RESULT', 'The value must contain plain JSON objects.');
      Object.values(v).forEach(check);
    }
    seen.delete(v);
  }
  check(value);
  return value as JsonValue;
}
export type ActionManifest = {
  id: string;
  kind: 'query' | 'mutation';
  inputSchema: JsonValue;
  credential?: { label: string; ttlSeconds?: number };
};
export type Manifest = {
  inputSchema: JsonValue;
  definitionId: string;
  requires: { paneon: string };
  paneonVersion: string;
  revision: string;
  clientEntry: string;
  serverEntry: string;
  assets: string[];
  dependencies: string[];
  actions: ActionManifest[];
  events: Record<string, JsonValue>;
};
export type PanelInstance = {
  instanceId: string;
  definitionId: string;
  status: 'running' | 'closed' | 'unavailable';
  entryPath: string;
  cwd: string;
  revision: string;
  watch: boolean;
  createdAt: string;
  updatedAt: string;
};
export type StoredPanel = PanelInstance & {
  params: JsonValue;
  requires: { paneon: string };
  paneonVersion: string;
  diagnostic?: Diagnostic;
};
export type RuntimeDescriptor = {
  runtimeId: string;
  pid: number;
  port: number;
  controlToken: string;
  paneonVersion: string;
  protocolVersion: number;
  startedAt: string;
};
export const PROTOCOL_VERSION = 1;
