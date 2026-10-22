import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test, mock } from 'node:test';
import { Readable } from 'node:stream';
import { api } from '../src/web/api.ts';
import {
  HTTP_BODY_LIMIT_BYTES,
  EVENT_PAYLOAD_LIMIT_CHARACTERS,
  requestBodyBytes,
} from '../src/shared/limits.ts';

const { startServer } = (await import(
  '../dist/runtime/' + 'server.js'
)) as typeof import('../src/runtime/server.js');

type Envelope = {
  ok: boolean;
  data?: { length?: number; id?: number };
  error?: { code: string; message: string; details?: { limitBytes: number } };
};

void test('browser transport preflights the complete UTF-8 envelope before fetch and preserves diagnostics', async () => {
  const calls: RequestInit[] = [];
  const fetch = mock.method(globalThis, 'fetch', (_path: unknown, options?: RequestInit) => {
    calls.push(options ?? {});
    return Promise.resolve(new Response(JSON.stringify({ ok: true, data: { saved: true } })));
  });
  try {
    const envelope = { revision: 'revision', input: { text: '中'.repeat(65525) } };
    const chinese = JSON.stringify(envelope);
    assert.ok(requestBodyBytes(chinese) > 131072);
    await api('/api/action', { method: 'POST', body: chinese });
    assert.equal(calls[0]?.body, chinese);
    const base = JSON.stringify({ revision: 'r', input: { text: '' } });
    const exact = JSON.stringify({
      revision: 'r',
      input: { text: 'x'.repeat(HTTP_BODY_LIMIT_BYTES - requestBodyBytes(base)) },
    });
    assert.equal(requestBodyBytes(exact), HTTP_BODY_LIMIT_BYTES);
    await api('/api/action', { method: 'POST', body: exact });
    assert.equal(calls.length, 2);
    const oversized = JSON.stringify({
      revision: 'r',
      input: { text: 'x'.repeat(HTTP_BODY_LIMIT_BYTES - requestBodyBytes(base) + 1) },
    });
    await assert.rejects(api('/api/action', { method: 'POST', body: oversized }), {
      code: 'BODY_TOO_LARGE',
      message: /262144-byte UTF-8 limit/,
    });
    assert.equal(calls.length, 2, 'an envelope over the byte limit must never reach fetch');
    fetch.mock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: 'BODY_TOO_LARGE',
              message: 'The complete HTTP request body exceeds the 262144-byte UTF-8 limit.',
            },
          }),
          { status: 413 },
        ),
      ),
    );
    await assert.rejects(api('/api/action', { method: 'POST', body: '{}' }), {
      code: 'BODY_TOO_LARGE',
    });
  } finally {
    fetch.mock.restore();
  }
});

void test(
  'HTTP accepts long Chinese feedback and enforces independent event and complete-body limits',
  { timeout: 120_000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'paneon-request-limits-'));
    const entry = join(home, 'panel.tsx');
    await writeFile(
      entry,
      `import {definePanel,serverAction,z} from 'paneon/sdk';export const length=serverAction({input:z.object({text:z.string()}),handler:async(_ctx,input)=>({length:input.text.length})});function Panel(){return <p>Limits</p>}export default definePanel({id:'request-limits',requires:{paneon:'0.0.0'},input:z.object({}),events:{feedback:z.object({text:z.string()}),['t'.repeat(128)]:z.object({text:z.string()})},render:Panel});`,
    );
    const service = await startServer(join(home, '.paneon'));
    const origin = `http://127.0.0.1:${service.descriptor.port}`;
    try {
      const panel = await service.runtime.run(entry, home, {}, false);
      const path = `/api/panels/${panel.instanceId}`;
      const post = async (
        suffix: string,
        body: string,
        headers: Record<string, string> = { Origin: origin },
      ) => {
        const response = await fetch(origin + path + suffix, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body,
        });
        return { status: response.status, result: (await response.json()) as Envelope };
      };
      const payload = {
        text: '中'.repeat(EVENT_PAYLOAD_LIMIT_CHARACTERS - JSON.stringify({ text: '' }).length),
      };
      assert.equal(JSON.stringify(payload).length, 65536);
      const eventBody = JSON.stringify({ revision: panel.revision, type: 'feedback', payload });
      assert.ok(
        requestBodyBytes(eventBody) > 131072 && requestBodyBytes(eventBody) < HTTP_BODY_LIMIT_BYTES,
      );
      const accepted = await post('/events', eventBody);
      assert.equal(accepted.status, 200);
      assert.equal(accepted.result.ok, true);
      const events = await service.runtime.events(panel.instanceId, 'limits', 100, 0);
      assert.deepEqual(events.events[0]?.payload, payload);
      const tooManyCharacters = await post(
        '/events',
        JSON.stringify({
          revision: panel.revision,
          type: 'feedback',
          payload: { text: payload.text + '中' },
        }),
      );
      assert.equal(tooManyCharacters.status, 400);
      assert.equal(tooManyCharacters.result.error?.code, 'INVALID_EVENT');
      assert.match(tooManyCharacters.result.error?.message ?? '', /65536-character UTF-16 limit/);
      const typeAtLimit = await post(
        '/events',
        JSON.stringify({
          revision: panel.revision,
          type: 't'.repeat(128),
          payload: { text: 'valid' },
        }),
      );
      assert.equal(typeAtLimit.status, 200);
      const typeTooLong = await post(
        '/events',
        JSON.stringify({ revision: panel.revision, type: 't'.repeat(129), payload: {} }),
      );
      assert.equal(typeTooLong.result.error?.code, 'INVALID_EVENT');
      assert.match(typeTooLong.result.error?.message ?? '', /128 UTF-16/);
      const base = JSON.stringify({ revision: panel.revision, input: { text: '' } });
      const textLength = HTTP_BODY_LIMIT_BYTES - requestBodyBytes(base);
      const exact = JSON.stringify({
        revision: panel.revision,
        input: { text: 'x'.repeat(textLength) },
      });
      assert.equal(requestBodyBytes(exact), HTTP_BODY_LIMIT_BYTES);
      const exactResult = await post('/actions/panel.tsx%23length', exact);
      assert.equal(exactResult.status, 200, JSON.stringify(exactResult));
      assert.equal(exactResult.result.data?.length, textLength);
      const oversized = JSON.stringify({
        revision: panel.revision,
        input: { text: 'x'.repeat(textLength + 1) },
      });
      const rejected = await post('/actions/panel.tsx%23length', oversized);
      assert.equal(rejected.status, 413);
      assert.equal(rejected.result.error?.code, 'BODY_TOO_LARGE');
      assert.deepEqual(rejected.result.error?.details, { limitBytes: HTTP_BODY_LIMIT_BYTES });
      assert.match(rejected.result.error?.message ?? '', /262144-byte UTF-8 limit/);
      const chunked = await fetch(origin + path + '/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${service.descriptor.controlToken}`,
        },
        body: Readable.from([oversized.slice(0, 100000), oversized.slice(100000)]),
        duplex: 'half',
      });
      assert.equal(chunked.status, 413);
      assert.equal(((await chunked.json()) as Envelope).error?.code, 'BODY_TOO_LARGE');
      const foreign = await post('/events', oversized, { Origin: 'http://example.com' });
      assert.equal(foreign.result.error?.code, 'INVALID_ORIGIN');
      const missingOrigin = await post('/events', eventBody, {});
      assert.equal(missingOrigin.result.error?.code, 'INVALID_ORIGIN');
      assert.equal(
        (await service.runtime.events(panel.instanceId, 'history', 100, 0)).events.length,
        2,
        'all rejected bodies leave durable event history unchanged',
      );
    } finally {
      await service.stop();
      await rm(home, { recursive: true, force: true });
    }
  },
);
