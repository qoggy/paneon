// Agent IDs, directories and detection adapted from Vercel Skills (MIT).
// See UPSTREAM-LICENSE.md for the pinned source and applicable license.
import { homedir } from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';
import { access } from 'node:fs/promises';
import { PANEON_HOME, PACKAGE_ROOT, PACKAGE_VERSION } from '../../shared/paths.js';
import type { InstallEnvironment, SkillAgent } from './types.js';
type Agent = {
  id: string;
  displayName: string;
  projectDir: string;
  globalDir: string;
  detection: string[];
};
export function createInstallEnvironment(): InstallEnvironment {
  return {
    cwd: process.cwd(),
    homeDir: homedir(),
    paneonHome: PANEON_HOME,
    packageRoot: PACKAGE_ROOT,
    packageVersion: PACKAGE_VERSION,
    env: process.env,
  };
}
export function agentRegistry(e: InstallEnvironment): Agent[] {
  const home = resolve(e.homeDir);
  const claude = resolve(e.cwd, e.env.CLAUDE_CONFIG_DIR?.trim() || join(home, '.claude'));
  const codex = resolve(e.cwd, e.env.CODEX_HOME?.trim() || join(home, '.codex'));
  const configuredXdg = e.env.XDG_CONFIG_HOME?.trim();
  const config = configuredXdg && isAbsolute(configuredXdg) ? configuredXdg : join(home, '.config');
  const universal = '.agents/skills';
  return [
    {
      id: 'codex',
      displayName: 'Codex',
      projectDir: universal,
      globalDir: join(home, universal),
      detection: [codex, '/etc/codex'],
    },
    {
      id: 'cursor',
      displayName: 'Cursor',
      projectDir: universal,
      globalDir: join(home, universal),
      detection: [join(home, '.cursor')],
    },
    {
      id: 'claude-code',
      displayName: 'Claude Code',
      projectDir: '.claude/skills',
      globalDir: join(claude, 'skills'),
      detection: [claude],
    },
    {
      id: 'opencode',
      displayName: 'OpenCode',
      projectDir: universal,
      globalDir: join(home, universal),
      detection: [join(config, 'opencode')],
    },
    {
      id: 'gemini-cli',
      displayName: 'Gemini CLI',
      projectDir: universal,
      globalDir: join(home, universal),
      detection: [join(home, '.gemini')],
    },
    {
      id: 'github-copilot',
      displayName: 'GitHub Copilot',
      projectDir: universal,
      globalDir: join(home, universal),
      detection: [join(home, '.copilot')],
    },
    {
      id: 'cline',
      displayName: 'Cline',
      projectDir: universal,
      globalDir: join(home, universal),
      detection: [join(home, '.cline')],
    },
    {
      id: 'windsurf',
      displayName: 'Windsurf',
      projectDir: '.windsurf/skills',
      globalDir: join(home, '.codeium/windsurf/skills'),
      detection: [join(home, '.codeium/windsurf')],
    },
    {
      id: 'qwen-code',
      displayName: 'Qwen Code',
      projectDir: '.qwen/skills',
      globalDir: join(home, '.qwen/skills'),
      detection: [join(home, '.qwen')],
    },
    {
      id: 'kiro-cli',
      displayName: 'Kiro CLI',
      projectDir: '.kiro/skills',
      globalDir: join(home, '.kiro/skills'),
      detection: [join(home, '.kiro')],
    },
    {
      id: 'roo',
      displayName: 'Roo Code',
      projectDir: '.roo/skills',
      globalDir: join(home, '.roo/skills'),
      detection: [join(home, '.roo')],
    },
  ];
}
async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return false;
    throw error;
  }
}
export async function listSkillAgents(e: InstallEnvironment): Promise<SkillAgent[]> {
  return Promise.all(
    agentRegistry(e).map(async (a) => ({
      id: a.id,
      displayName: a.displayName,
      universal: a.projectDir === '.agents/skills',
      detected: (await Promise.all(a.detection.map(exists))).some(Boolean),
    })),
  );
}
