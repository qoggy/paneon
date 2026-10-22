import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export async function startFeedbackFixture() {
  const { startServer } = await import(
    process.env.PANEON_TEST_RUNTIME_ENTRY ??
      new URL('../../dist/runtime/server.js', import.meta.url).href
  );
  const root = await mkdtemp(join(tmpdir(), 'paneon-feedback-'));
  let service;
  try {
    const entry = join(root, 'panel.tsx');
    await writeFile(
      entry,
      await readFile(new URL('./feedback-fixture.txt', import.meta.url), 'utf8'),
    );
    service = await startServer(join(root, '.paneon'));
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
