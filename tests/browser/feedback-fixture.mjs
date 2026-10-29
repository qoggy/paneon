import { readPanelFixture } from '../panel-fixture.ts';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export async function startFeedbackFixture() {
  const { startServer } = await import(new URL('../runtime-fixture.ts', import.meta.url).href);
  const root = await mkdtemp(join(tmpdir(), 'paneon-feedback-'));
  let service;
  try {
    const entry = join(root, 'panel.tsx');
    await writeFile(
      entry,
      await readPanelFixture(new URL('./feedback-fixture.txt', import.meta.url)),
    );
    service = await startServer(join(root, '.paneon'));
    await service.app.inject({
      method: 'POST',
      url: '/api/preferences',
      headers: {
        host: `127.0.0.1:${service.descriptor.port}`,
        authorization: `Bearer ${service.descriptor.controlToken}`,
      },
      payload: { ui: { language: 'zh-CN' } },
    });
    const panel = await service.runtime.run(entry, root, {}, false);
    return {
      root,
      service,
      panel,
      url: `http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`,
      async stop() {
        await service.stop();
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await service?.stop();
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
