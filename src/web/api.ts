import {
  HTTP_BODY_LIMIT_BYTES,
  requestBodyBytes,
  bodyTooLargeDiagnostic,
} from '../shared/limits.ts';
export type Diagnostic = { code: string; message: string };
export type PanelSummary = {
  instanceId: string;
  definitionId: string;
  status: 'running' | 'closed' | 'unavailable';
  revision: string;
  watch: boolean;
  entryPath: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
};
export type PanelPage = {
  panels: PanelSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
export type ActionManifest = {
  id: string;
  kind: 'query' | 'mutation';
};
export type PanelDetails = PanelSummary & {
  params: unknown;
  paneonVersion: string;
  diagnostic?: Diagnostic;
  manifest?: { actions: ActionManifest[] };
};
export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  if (typeof options?.body === 'string' && requestBodyBytes(options.body) > HTTP_BODY_LIMIT_BYTES) {
    const detail = bodyTooLargeDiagnostic();
    throw new ApiError(detail.code, detail.message);
  }
  let response: Response;
  try {
    const headers = new Headers(options?.headers);
    if (options?.body != null && !headers.has('Content-Type'))
      headers.set('Content-Type', 'application/json');
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new ApiError(
      'CONNECTION_LOST',
      'The connection was lost. An action may have completed; it will not be retried automatically.',
    );
  }
  let result: { ok: boolean; data: T; error?: Diagnostic };
  try {
    result = (await response.json()) as typeof result;
  } catch {
    throw new ApiError('INVALID_RESPONSE', 'The runtime returned an invalid response.');
  }
  if (!response.ok || !result.ok)
    throw new ApiError(
      result.error?.code ?? 'REQUEST_FAILED',
      result.error?.message ?? 'The request failed.',
    );
  return result.data;
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The request failed.';
}
