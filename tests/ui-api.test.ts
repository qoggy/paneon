import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/web/api.ts';
void test('host transport declares JSON only when sending a body, so empty DELETE requests remain valid', async () => {
  const calls: RequestInit[] = [];
  const fetch = mock.method(globalThis, 'fetch', (_path: unknown, options?: RequestInit) => {
    calls.push(options ?? {});
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true, data: { revoked: true } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  try {
    await api('/api/panels');
    await api('/api/credentials/reference', { method: 'DELETE' });
    await api('/api/credentials', { method: 'POST', body: '{}' });
    assert.equal(new Headers(calls[0].headers).has('Content-Type'), false);
    assert.equal(new Headers(calls[1].headers).has('Content-Type'), false);
    assert.equal(new Headers(calls[2].headers).get('Content-Type'), 'application/json');
  } finally {
    fetch.mock.restore();
  }
});
