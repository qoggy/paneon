import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function startExplanationsFixture(
  names = ['dining-philosophers', 'sentinel-leap-array'],
) {
  const { startServer } = await import(new URL('../runtime-fixture.ts', import.meta.url).href);
  const root = await mkdtemp(join(tmpdir(), 'paneon-explanations-'));
  let service;
  try {
    const skill = join(root, 'copied-skill/paneon');
    await cp(
      process.env.PANEON_TEST_SKILL_SOURCE ?? new URL('../../skills/paneon', import.meta.url),
      skill,
      { recursive: true },
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
    const panels = {};
    for (const name of names)
      panels[name] = await service.runtime.run(
        join(skill, `assets/examples/${name}/panel.tsx`),
        root,
        {},
        false,
      );
    return {
      root,
      skill,
      service,
      panels,
      url: (name) =>
        `http://127.0.0.1:${service.descriptor.port}/panels/${panels[name].instanceId}`,
      events: async (name) =>
        (await service.runtime.events(panels[name].instanceId, 'explanation-browser', 100, 0))
          .events,
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
