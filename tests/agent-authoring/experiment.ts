import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const skillInvocation = '[paneon-visualize](~/.agents/skills/paneon-visualize/SKILL.md)';

export async function prepareExperiment(options: {
  task: string;
  output: string;
  repository: string;
  provideSkill?: boolean;
  invokeSkill?: boolean;
  skillDirectory?: string;
}) {
  const body = await readFile(resolve(options.task), 'utf8');
  const prefixed = body.startsWith(skillInvocation);
  const invoked = prefixed || !!options.invokeSkill;
  const provided = invoked || !!options.provideSkill;
  const prompt = invoked && !prefixed ? `${skillInvocation}\n\n${body}` : body;
  const condition = invoked ? 'forced' : provided ? 'available' : 'baseline';
  await mkdir(resolve(options.output), { recursive: true });
  const output = await mkdtemp(join(resolve(options.output), 'run-'));
  const cwd = join(output, 'workspace');
  const bin = join(output, 'bin');
  await Promise.all([mkdir(cwd), mkdir(bin)]);
  await writeFile(
    join(bin, 'paneon'),
    `#!/usr/bin/env node\nvoid import(${JSON.stringify(pathToFileURL(join(options.repository, 'dist/cli/index.js')).href)});\n`,
    { mode: 0o755 },
  );

  const skillDirectory = resolve(
    options.skillDirectory ?? join(homedir(), '.agents/skills/paneon-visualize'),
  );
  // One invocation-local override excludes any other copy of the named skill.
  // It never edits the user's config or adds instructions to the task.
  const entries = ['{name="paneon-visualize",enabled=false}'];
  if (provided) {
    entries.push(`{path=${JSON.stringify(join(skillDirectory, 'SKILL.md'))},enabled=true}`);
    await cp(skillDirectory, join(output, 'skill-snapshot'), { recursive: true });
  }
  const skillConfig = `skills.config=[${entries.join(',')}]`;
  return { output, cwd, bin, prompt, condition, provided, invoked, skillDirectory, skillConfig };
}
