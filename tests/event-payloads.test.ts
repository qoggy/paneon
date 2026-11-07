import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PACKAGE_VERSION } from '../dist/shared/paths.js';
import { startServer } from './runtime-fixture.ts';

void test('JSON events preserve title refs and arbitrary fields without declarations or a worker wake', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paneon-event-payloads-'));
  const home = join(root, 'data');
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    `import {definePanel,z} from '@qoggy/paneon/sdk';function Panel(){return <p>Page title</p>}export default definePanel({id:'json-events',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:Panel});`,
  );
  let service = await startServer(home);
  try {
    const panel = await service.runtime.run(entry, root, {}, false);
    const manifest = service.runtime.inspect(panel.instanceId).manifest;
    assert.ok(manifest);
    assert.equal(Object.hasOwn(manifest, 'events'), false);
    await service.stop();
    service = await startServer(home);
    assert.equal(service.runtime.resourceUsage.workers, 0);
    const payload = {
      annotations: [
        {
          targets: [
            {
              ref: { id: 'title', field: 'title' },
              text: { start: 0, end: 10, quote: 'Page title' },
            },
          ],
          comment: 'Explain this heading.',
        },
      ],
      extra: { count: 7, enabled: false, values: [null, '中文'] },
    };
    const response = await service.app.inject({
      method: 'POST',
      url: `/api/panels/${panel.instanceId}/events`,
      headers: {
        host: `127.0.0.1:${service.descriptor.port}`,
        authorization: `Bearer ${service.descriptor.controlToken}`,
      },
      payload: { revision: panel.revision, type: 'new-feedback-event', payload },
    });
    assert.equal(response.statusCode, 200, response.body);
    const receipt = response.json<{ data: { id: number; payload: unknown } }>().data;
    assert.deepEqual(receipt.payload, payload);
    assert.equal(
      service.runtime.resourceUsage.workers,
      0,
      'Storing feedback needs no execution process',
    );

    const correction = { ...payload, annotations: [], replacesEventId: receipt.id };
    const corrected = await service.runtime.append(
      panel.instanceId,
      panel.revision,
      'new-feedback-event',
      correction,
    );
    assert.deepEqual(corrected.payload, correction);
    for (const value of [null, false, 7, 'text', [1, { dynamic: true }]]) {
      const event = await service.runtime.append(
        panel.instanceId,
        panel.revision,
        'dynamic',
        value,
      );
      assert.deepEqual(event.payload, value);
    }
    const events = await service.runtime.events(panel.instanceId, 'agent', 100, 0);
    assert.deepEqual(events.events[0].payload, payload);
    assert.deepEqual(events.events[1].payload, correction);
    const last = events.events.at(-1);
    assert.ok(last);
    service.runtime.store.ack(panel.instanceId, 'agent', last.id);
    assert.deepEqual((await service.runtime.events(panel.instanceId, 'agent', 100, 0)).events, []);

    const cycle: { value?: unknown } = {};
    cycle.value = cycle;
    for (const invalid of [undefined, NaN, 1n, new Date(), cycle])
      await assert.rejects(
        service.runtime.append(panel.instanceId, panel.revision, 'invalid-json', invalid),
        { code: 'INVALID_RESULT' },
      );
    await assert.rejects(service.runtime.append(panel.instanceId, 'old-revision', 'dynamic', {}), {
      code: 'PANEL_REVISION_MISMATCH',
    });
    await service.runtime.closePanel(panel.instanceId);
    await assert.rejects(service.runtime.append(panel.instanceId, panel.revision, 'dynamic', {}), {
      code: 'PANEL_CLOSED',
    });
  } finally {
    await service.stop();
    await rm(root, { recursive: true, force: true });
  }
});
