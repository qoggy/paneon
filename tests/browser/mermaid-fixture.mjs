import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// This entry point does not drive a browser. CUA and the regression runner share it.
export async function startMermaidFixture() {
  const { startServer } = await import(new URL('../runtime-fixture.ts', import.meta.url).href);
  const root = await mkdtemp(join(tmpdir(), 'paneon-mermaid-'));
  let service;
  try {
    const entry = join(root, 'panel.tsx');
    await writeFile(
      entry,
      await readFile(new URL('./mermaid-fixture.txt', import.meta.url), 'utf8'),
    );
    service = await startServer(join(root, 'data'));
    const panel = await service.runtime.run(entry, root, {}, false);
    return {
      root,
      entry,
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
