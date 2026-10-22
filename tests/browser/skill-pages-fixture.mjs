import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const choices = {
  title: 'Standard choice acceptance',
  description: 'Compare the choices, then submit one complete result.',
  questions: [
    {
      id: 'storage',
      title: 'Storage',
      options: [
        {
          id: 'sqlite',
          label: 'SQLite',
          description: 'Single machine',
          recommended: true,
          details: '## Details\n\nKeep **backups**.',
        },
        { id: 'postgres', label: 'PostgreSQL' },
      ],
    },
    {
      id: 'features',
      title: 'Features',
      mode: 'multiple',
      options: [
        { id: 'a', label: 'Feature A' },
        { id: 'b', label: 'Feature B' },
      ],
    },
    { id: 'delivery', title: 'Delivery', options: [{ id: 'npm', label: 'npm' }] },
  ],
};
export const formInput = {
  title: 'Standard form acceptance',
  fields: [
    {
      name: 'name',
      label: 'Project name',
      type: 'text',
      required: true,
      minLength: 2,
      maxLength: 20,
      description: 'Name for the agent.',
    },
    { name: 'notes', label: 'Notes', type: 'textarea' },
    {
      name: 'replicas',
      label: 'Replicas',
      type: 'number',
      min: 0,
      max: 5,
      defaultValue: 0,
      required: true,
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      options: [
        { value: 'local', label: 'Local' },
        { value: 'cloud', label: 'Cloud' },
      ],
      defaultValue: 'local',
    },
    {
      name: 'priority',
      label: 'Priority',
      type: 'radio',
      required: true,
      options: [
        { value: 'normal', label: 'Normal' },
        { value: 'high', label: 'High' },
      ],
    },
    {
      name: 'features',
      label: 'Form features',
      type: 'multiselect',
      options: [
        { value: 'a', label: 'Extra A' },
        { value: 'b', label: 'Extra B' },
      ],
    },
    { name: 'check', label: 'Required boolean', type: 'checkbox', required: true },
    { name: 'switch', label: 'Optional switch', type: 'switch' },
  ],
};

// Share this fixture with browser-driven acceptance; run a complete skill copy outside the repo.
export async function startSkillPagesFixture() {
  const { startServer } = await import(
    process.env.PANEON_TEST_RUNTIME_ENTRY ??
      new URL('../../dist/runtime/server.js', import.meta.url).href
  );
  const root = await mkdtemp(join(tmpdir(), 'paneon-skill-pages-'));
  let service;
  try {
    const skill = join(root, 'agent-skills/paneon');
    await cp(
      process.env.PANEON_TEST_SKILL_SOURCE ?? new URL('../../skills/paneon', import.meta.url),
      skill,
      { recursive: true },
    );
    service = await startServer(join(root, '.paneon'));
    const run = (name, params) =>
      service.runtime.run(join(skill, `assets/panels/${name}/panel.tsx`), root, params, false);
    const choose = await run('choose', choices);
    const form = await run('form', formInput);
    return {
      root,
      skill,
      service,
      choose,
      form,
      run,
      url: (panel) => `http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`,
      async events(panel) {
        return (await service.runtime.events(panel.instanceId, 'acceptance', 100, 0)).events;
      },
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
