export const HTTP_BODY_LIMIT_BYTES = 262144;
export const EVENT_PAYLOAD_LIMIT_CHARACTERS = 65536;
export const EVENT_TYPE_LIMIT_CHARACTERS = 128;

export function requestBodyBytes(body: string): number {
  return new TextEncoder().encode(body).byteLength;
}

export function bodyTooLargeDiagnostic() {
  return {
    code: 'BODY_TOO_LARGE',
    message: `The complete HTTP request body exceeds the ${HTTP_BODY_LIMIT_BYTES}-byte UTF-8 limit.`,
    details: { limitBytes: HTTP_BODY_LIMIT_BYTES },
  };
}
