import * as prompts from '@clack/prompts';
import {
  createInstallEnvironment,
  createInstallPlan,
  executeInstallPlan,
  listSkillAgents,
  type InstallEnvironment,
  type InstallMethod,
  type InstallPlan,
  type InstallResult,
  type InstallScope,
} from './skill-install/index.js';

export type InitOptions = {
  agent?: string[];
  project?: boolean;
  global?: boolean;
  copy?: boolean;
  yes?: boolean;
  json?: boolean;
};

function invalid(message: string): never {
  throw Object.assign(new Error(message), { code: 'INVALID_ARGUMENT' });
}

function summary(plan: InstallPlan): string {
  return plan.targets
    .map(
      (target) =>
        `${target.path}\n  ${target.kind === 'symlink' ? `symlink → ${target.target ?? ''}` : 'copy'}${target.exists ? `\n  overwrites: ${target.path}` : ''}`,
    )
    .join('\n\n');
}

/** Environment injection is internal: production always uses the fixed Paneon home. */
export async function runInit(
  options: InitOptions,
  environment: InstallEnvironment = createInstallEnvironment(),
): Promise<InstallResult | { cancelled: true }> {
  if (options.project && options.global) invalid('--project and --global cannot be used together.');
  const available = await listSkillAgents(environment);
  if (options.agent) {
    if (!options.agent.length) invalid('--agent requires at least one agent ID.');
    for (const id of options.agent) {
      if (!available.some((agent) => agent.id === id))
        invalid(`Unknown agent '${id}'. Use paneon init --help to see supported agents.`);
    }
  }
  const interactive = !options.json && Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!options.yes && !interactive)
    throw Object.assign(
      new Error('Run paneon init in a terminal, or provide --yes with your installation options.'),
      { code: 'NON_INTERACTIVE_INPUT_REQUIRED' },
    );

  const cancelled = () => {
    prompts.cancel('Installation cancelled.');
    return { cancelled: true as const };
  };
  if (!options.yes) prompts.intro('Paneon skill');
  let agents =
    options.agent ??
    available.filter((agent) => agent.universal || agent.detected).map((agent) => agent.id);
  if (!options.yes && !options.agent) {
    const universal = available.filter((agent) => agent.universal);
    if (universal.length)
      prompts.note(
        `${universal.map((agent) => agent.displayName).join(', ')}\nShared directory: .agents/skills`,
        'Universal (always selected)',
      );
    const selected = await prompts.multiselect({
      message: 'Which agents do you want to install to?',
      options: available
        .filter((agent) => !agent.universal)
        .map((agent) => ({
          value: agent.id,
          label: agent.displayName,
          hint: agent.detected ? 'detected' : undefined,
        })),
      initialValues: available
        .filter((agent) => !agent.universal && agent.detected)
        .map((agent) => agent.id),
      required: false,
    });
    if (prompts.isCancel(selected)) return cancelled();
    agents = [...universal.map((agent) => agent.id), ...selected];
  }
  let scope: InstallScope = options.global ? 'global' : 'project';
  if (!options.yes && !options.project && !options.global) {
    const selected = await prompts.select<InstallScope>({
      message: 'Installation scope',
      options: [
        { value: 'project' as const, label: 'Project', hint: 'Install in the current project' },
        { value: 'global' as const, label: 'Global', hint: 'Install for your user account' },
      ],
      initialValue: 'project',
    });
    if (prompts.isCancel(selected)) return cancelled();
    scope = selected;
  }
  let plan = await createInstallPlan(
    { agents, scope, ...(options.copy ? { method: 'copy' } : {}) },
    environment,
  );
  if (!options.yes && !options.copy && plan.method === 'symlink' && plan.targets.length > 1) {
    const method = await prompts.select<InstallMethod>({
      message: 'Installation method',
      options: [
        { value: 'symlink' as const, label: 'Symlink (Recommended)' },
        { value: 'copy' as const, label: 'Copy to all agents' },
      ],
      initialValue: 'symlink',
    });
    if (prompts.isCancel(method)) return cancelled();
    plan = await createInstallPlan({ agents, scope, method }, environment);
  }
  if (!options.yes) {
    prompts.note(summary(plan), 'Installation Summary');
    const confirmed = await prompts.confirm({
      message: 'Proceed with installation?',
      initialValue: true,
    });
    if (prompts.isCancel(confirmed) || !confirmed) return cancelled();
  }
  const result = await executeInstallPlan(plan, environment);
  if (!options.yes) prompts.outro('Installation complete.');
  return result;
}
