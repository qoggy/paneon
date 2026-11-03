import { SKILL_NAME, SKILL_PACKAGE_PATH } from './skill-paths.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
  lstat,
  readdir,
  realpath,
  readlink,
  rename,
  chmod,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import type {
  InstallationRecords,
  InstallEnvironment,
  InstallRequest,
} from '../src/cli/skill-install/types.js';
const { createInstallPlan, executeInstallPlan, listSkillAgents } = (await import(
  '../dist/' + 'cli/skill-install/index.js'
)) as typeof import('../src/cli/skill-install/index.js');
async function fixture(run: (e: InstallEnvironment, root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'paneon-install-')));
  const e: InstallEnvironment = {
    cwd: join(root, 'project'),
    homeDir: join(root, 'home'),
    paneonHome: join(root, 'home/.paneon'),
    packageRoot: join(root, 'package'),
    packageVersion: '1.2.3',
    env: {},
  };
  try {
    await Promise.all([
      mkdir(e.cwd, { recursive: true }),
      mkdir(e.homeDir, { recursive: true }),
      mkdir(join(e.packageRoot, `${SKILL_PACKAGE_PATH}/references`), { recursive: true }),
      mkdir(join(e.packageRoot, `${SKILL_PACKAGE_PATH}/assets/standard/choose`), {
        recursive: true,
      }),
    ]);
    await writeFile(join(e.packageRoot, `${SKILL_PACKAGE_PATH}/SKILL.md`), '# Paneon\n');
    await writeFile(join(e.packageRoot, `${SKILL_PACKAGE_PATH}/references/cli.md`), 'Commands');
    await writeFile(
      join(e.packageRoot, `${SKILL_PACKAGE_PATH}/assets/standard/choose/panel.tsx`),
      'export default {};',
    );
    await run(e, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
const request: InstallRequest = { scope: 'project', agents: ['codex', 'claude-code'] };
async function install(e: InstallEnvironment, r: InstallRequest = request) {
  return executeInstallPlan(await createInstallPlan(r, e), e);
}
async function records(e: InstallEnvironment) {
  return JSON.parse(
    await readFile(join(e.paneonHome, 'skill-installations.json'), 'utf8'),
  ) as InstallationRecords;
}
async function bundle(e: InstallEnvironment, names: string[]) {
  await rm(join(e.packageRoot, 'skills'), { recursive: true });
  for (const name of names) {
    const path = join(e.packageRoot, 'skills', name);
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'SKILL.md'), `# ${name} ${e.packageVersion}\n`);
  }
}
const code = (expected: string) => (e: unknown) =>
  !!e && typeof e === 'object' && 'code' in e && e.code === expected;

void test('registry has 11 official targets, six Universal and environment-aware detection', async () =>
  fixture(async (e, root) => {
    e.env.CLAUDE_CONFIG_DIR = join(root, 'custom-claude');
    e.env.XDG_CONFIG_HOME = join(root, 'config');
    e.env.CODEX_HOME = join(root, 'codex-config');
    await Promise.all([
      mkdir(e.env.CLAUDE_CONFIG_DIR),
      mkdir(join(e.env.XDG_CONFIG_HOME, 'opencode'), { recursive: true }),
      mkdir(e.env.CODEX_HOME),
    ]);
    const agents = await listSkillAgents(e);
    assert.equal(agents.length, 11);
    assert.deepEqual(
      agents
        .filter((a) => a.universal)
        .map((a) => a.id)
        .sort(),
      ['cline', 'codex', 'cursor', 'gemini-cli', 'github-copilot', 'opencode'],
    );
    for (const id of ['claude-code', 'opencode', 'codex'])
      assert.equal(agents.find((a) => a.id === id)?.detected, true);
    assert.equal(agents.find((a) => a.id === 'roo')?.detected, false);
    const plan = await createInstallPlan({ scope: 'global', agents: ['claude-code'] }, e);
    assert.equal(plan.targets[0].path, join(e.env.CLAUDE_CONFIG_DIR, SKILL_PACKAGE_PATH));
  }));
void test('plan is read-only, explicit targets stay explicit and shared directories normalize to copy', async () =>
  fixture(async (e) => {
    const plan = await createInstallPlan(
      { scope: 'project', agents: ['cursor', 'codex', 'codex'], method: 'symlink' },
      e,
    );
    assert.equal(plan.targets.length, 1);
    assert.equal(plan.method, 'copy');
    assert.deepEqual(plan.agents, ['codex', 'cursor']);
    assert.deepEqual(await readdir(e.cwd), []);
    assert.deepEqual(await readdir(e.homeDir), []);
    const onlyClaude = await createInstallPlan({ scope: 'project', agents: ['claude-code'] }, e);
    assert.equal(onlyClaude.targets.length, 1);
    assert.equal(onlyClaude.targets[0].path, join(e.cwd, `.claude/skills/${SKILL_NAME}`));
    await assert.rejects(
      createInstallPlan({ scope: 'project', agents: ['unknown'] }, e),
      code('SKILL_INSTALL_INVALID_REQUEST'),
    );
  }));
void test('project symlink installs complete skill into stable central copy and records actual targets', async () =>
  fixture(async (e) => {
    const result = await install(e);
    assert.equal(result.method, 'symlink');
    assert.equal(result.targets.length, 2);
    const central = join(e.cwd, `.agents/skills/${SKILL_NAME}`),
      link = join(e.cwd, `.claude/skills/${SKILL_NAME}`);
    assert.equal((await lstat(link)).isSymbolicLink(), true);
    assert.equal(await realpath(link), central);
    assert.equal(
      await readFile(join(link, 'assets/standard/choose/panel.tsx'), 'utf8'),
      'export default {};',
    );
    assert.equal(await readFile(join(central, 'references/cli.md'), 'utf8'), 'Commands');
    const r = await records(e);
    assert.equal(r.schemaVersion, 1);
    assert.equal(r.installations[0].projectPath, e.cwd);
    assert.deepEqual(r.installations[0].targets, [
      { path: `.agents/skills/${SKILL_NAME}`, kind: 'directory' },
      {
        path: `.claude/skills/${SKILL_NAME}`,
        kind: 'symlink',
        target: `.agents/skills/${SKILL_NAME}`,
      },
    ]);
    assert.equal((await readdir(e.cwd)).includes('.paneon'), false);
  }));
void test('renamed skill removes recorded old directories and links after installing new targets', async () =>
  fixture(async (e) => {
    await mkdir(e.paneonHome, { recursive: true });
    const previous: InstallationRecords = {
      schemaVersion: 1,
      installations: [
        {
          scope: 'project',
          projectPath: e.cwd,
          paneonVersion: '1.2.2',
          agents: request.agents,
          method: 'symlink',
          targets: [
            { path: '.agents/skills/paneon', kind: 'directory' },
            { path: '.claude/skills/paneon', kind: 'symlink', target: '.agents/skills/paneon' },
          ],
        },
      ],
    };
    await writeFile(join(e.paneonHome, 'skill-installations.json'), JSON.stringify(previous));
    const oldCentral = join(e.cwd, '.agents/skills/paneon');
    const oldLink = join(e.cwd, '.claude/skills/paneon');
    await mkdir(oldCentral, { recursive: true });
    await writeFile(join(oldCentral, 'SKILL.md'), '# Old skill with local edits');
    await mkdir(dirname(oldLink), { recursive: true });
    await symlink('../../.agents/skills/paneon', oldLink, 'dir');
    const plan = await createInstallPlan(request, e);
    assert.deepEqual(plan.obsoleteTargets, [oldLink, oldCentral]);
    assert.equal(await realpath(oldLink), oldCentral); // Planning does not remove anything.
    const result = await install(e);
    assert.deepEqual(result.removedTargets, [oldLink, oldCentral]);
    await assert.rejects(lstat(oldLink), { code: 'ENOENT' });
    await assert.rejects(lstat(oldCentral), { code: 'ENOENT' });
    assert.equal(result.targets[0].path, join(e.cwd, `.agents/skills/${SKILL_NAME}`));
    assert.deepEqual((await records(e)).installations[0].targets, [
      { path: `.agents/skills/${SKILL_NAME}`, kind: 'directory' },
      {
        path: `.claude/skills/${SKILL_NAME}`,
        kind: 'symlink',
        target: `.agents/skills/${SKILL_NAME}`,
      },
    ]);
    assert.deepEqual((await install(e)).removedTargets, []);
  }));

for (const method of ['copy', 'symlink'] as const) {
  void test(`${method}: migrate bundled skills A/B to B/C without touching unrecorded skills`, async () =>
    fixture(async (e) => {
      const a = 'paneon-skill-a',
        b = 'paneon-skill-b',
        c = 'paneon-skill-c';
      await bundle(e, [a, b]);
      await install(e, { ...request, method });
      const bLink = join(e.cwd, '.claude/skills', b);
      const before = await lstat(bLink);
      await writeFile(join(e.cwd, '.agents/skills', b, 'obsolete.md'), 'remove with replacement');
      for (const directory of ['.agents/skills', '.claude/skills']) {
        const other = join(e.cwd, directory, 'unrecorded-skill');
        await mkdir(other);
        await writeFile(join(other, 'SKILL.md'), 'keep');
      }
      e.packageVersion = '2.0.0';
      await bundle(e, [b, c]);
      const plan = await createInstallPlan({ ...request, method }, e);
      assert.equal(plan.targets.length, 4);
      const result = await executeInstallPlan(plan, e);
      assert.equal(result.removedTargets.length, 2);
      for (const directory of ['.agents/skills', '.claude/skills']) {
        assert.deepEqual((await readdir(join(e.cwd, directory))).sort(), [
          b,
          c,
          'unrecorded-skill',
        ]);
        for (const name of [b, c])
          assert.equal(
            await readFile(join(e.cwd, directory, name, 'SKILL.md'), 'utf8'),
            `# ${name} 2.0.0\n`,
          );
        await assert.rejects(lstat(join(e.cwd, directory, b, 'obsolete.md')), { code: 'ENOENT' });
        assert.equal(
          await readFile(join(e.cwd, directory, 'unrecorded-skill/SKILL.md'), 'utf8'),
          'keep',
        );
      }
      if (method === 'symlink') assert.equal((await lstat(bLink)).ino, before.ino);
      assert.deepEqual(
        [
          ...new Set((await records(e)).installations.flatMap((i) => i.targets.map((t) => t.path))),
        ].sort(),
        ['.agents/skills', '.claude/skills']
          .flatMap((directory) => [b, c].map((name) => `${directory}/${name}`))
          .sort(),
      );
      assert.deepEqual((await install(e, { ...request, method })).removedTargets, []);
    }));
}

void test('multiple skills in one shared agent directory still use copy', async () =>
  fixture(async (e) => {
    await bundle(e, ['paneon-skill-a', 'paneon-skill-b']);
    const result = await install(e, {
      scope: 'project',
      agents: ['codex', 'cursor'],
      method: 'symlink',
    });
    assert.equal(result.method, 'copy');
    assert.equal(result.targets.length, 2);
    for (const target of result.targets)
      assert.equal((await lstat(target.path)).isDirectory(), true);
  }));

for (const legacy of [false, true]) {
  void test(`${legacy ? 'grouped legacy' : 'per-agent'} records retain unselected agent skills and migrate them when selected later`, async () =>
    fixture(async (e) => {
      await bundle(e, ['paneon-skill-a', 'paneon-skill-b']);
      await install(e);
      if (legacy) {
        const initial = await records(e);
        const targets = [
          ...new Map(
            initial.installations.flatMap((i) => i.targets).map((t) => [t.path, t]),
          ).values(),
        ];
        initial.installations = [{ ...initial.installations[0], agents: request.agents, targets }];
        await writeFile(join(e.paneonHome, 'skill-installations.json'), JSON.stringify(initial));
      }
      const initial = await records(e);
      e.packageVersion = '2.0.0';
      await bundle(e, ['paneon-skill-b', 'paneon-skill-c']);
      const result = await install(e, { scope: 'project', agents: ['codex'] });
      assert.deepEqual(result.removedTargets, []); // Claude still needs its old linked A source.
      const after = await records(e);
      const claude = after.installations.find((i) => i.agents.includes('claude-code'));
      assert.ok(claude);
      assert.equal(claude.paneonVersion, '1.2.3');
      assert.equal(claude.method, 'symlink');
      assert.deepEqual(claude.targets, initial.installations[0].targets);
      assert.equal(
        await readFile(join(e.cwd, '.claude/skills/paneon-skill-a/SKILL.md'), 'utf8'),
        '# paneon-skill-a 1.2.3\n',
      );
      await assert.rejects(lstat(join(e.cwd, '.claude/skills/paneon-skill-c')), { code: 'ENOENT' });
      const updated = await install(e, { scope: 'project', agents: ['claude-code'] });
      assert.equal(updated.removedTargets.length, 2);
      await assert.rejects(lstat(join(e.cwd, '.agents/skills/paneon-skill-a')), { code: 'ENOENT' });
      await assert.rejects(lstat(join(e.cwd, '.claude/skills/paneon-skill-a')), { code: 'ENOENT' });
      for (const name of ['paneon-skill-b', 'paneon-skill-c'])
        assert.equal(
          await readFile(join(e.cwd, '.claude/skills', name, 'SKILL.md'), 'utf8'),
          `# ${name} 2.0.0\n`,
        );
    }));
}

void test('copy installations retain unselected agent content and its original record', async () =>
  fixture(async (e) => {
    await bundle(e, ['paneon-skill-a']);
    await install(e, { ...request, method: 'copy' });
    const original = (await records(e)).installations.find((i) => i.agents.includes('claude-code'));
    await bundle(e, ['paneon-skill-b']);
    await install({ ...e, packageVersion: '2.0.0' }, { scope: 'project', agents: ['codex'] });
    assert.deepEqual(
      (await records(e)).installations.find((i) => i.agents.includes('claude-code')),
      original,
    );
    assert.equal(
      await readFile(join(e.cwd, '.claude/skills/paneon-skill-a/SKILL.md'), 'utf8'),
      '# paneon-skill-a 1.2.3\n',
    );
    await assert.rejects(lstat(join(e.cwd, '.agents/skills/paneon-skill-a')), { code: 'ENOENT' });
  }));

void test('an unselected agent directory replaced by a file does not block installation', async () =>
  fixture(async (e) => {
    await install(e, { ...request, method: 'copy' });
    const original = (await records(e)).installations.find((i) => i.agents.includes('claude-code'));
    const path = join(e.cwd, '.claude/skills');
    await rm(path, { recursive: true });
    await writeFile(path, 'user file');
    const result = await install(e, { scope: 'project', agents: ['codex'] });
    assert.deepEqual(result.removedTargets, []);
    assert.equal(await readFile(path, 'utf8'), 'user file');
    assert.deepEqual(
      (await records(e)).installations.find((i) => i.agents.includes('claude-code')),
      original,
    );
  }));

void test('an unreadable unrelated project does not block installation or change its record', async () =>
  fixture(async (e, root) => {
    const other = { ...e, cwd: join(root, 'project-b') };
    await mkdir(other.cwd);
    await install(other, { scope: 'project', agents: ['claude-code'] });
    const original = (await records(e)).installations.find((i) => i.projectPath === other.cwd);
    const directory = join(other.cwd, '.claude');
    await chmod(directory, 0o000);
    try {
      const result = await install(e, { scope: 'project', agents: ['codex'] });
      assert.deepEqual(result.removedTargets, []);
      assert.deepEqual(
        (await records(e)).installations.find((i) => i.projectPath === other.cwd),
        original,
      );
      assert.equal(
        await readFile(join(e.cwd, `.agents/skills/${SKILL_NAME}/SKILL.md`), 'utf8'),
        '# Paneon\n',
      );
    } finally {
      await chmod(directory, 0o755);
    }
  }));

void test('a plan still executes after another project records an installation', async () =>
  fixture(async (e, root) => {
    const plan = await createInstallPlan(request, e);
    const other = { ...e, cwd: join(root, 'project-b') };
    await mkdir(other.cwd);
    await install(other);
    await executeInstallPlan(plan, e);
    const saved = await records(e);
    assert.equal(saved.installations.length, 4);
    for (const project of [e.cwd, other.cwd])
      assert.deepEqual(
        saved.installations
          .filter((i) => i.projectPath === project)
          .flatMap((i) => i.agents)
          .sort(),
        ['claude-code', 'codex'],
      );
  }));

void test('a missing obsolete target behind a dangling parent link does not block installation', async () =>
  fixture(async (e, root) => {
    e.env.CLAUDE_CONFIG_DIR = join(root, 'old-config');
    await bundle(e, ['paneon-skill-a']);
    await install(e, { scope: 'global', agents: ['claude-code'] });
    await rm(e.env.CLAUDE_CONFIG_DIR, { recursive: true });
    await symlink(join(root, 'missing'), e.env.CLAUDE_CONFIG_DIR, 'dir');
    e.env.CLAUDE_CONFIG_DIR = join(root, 'new-config');
    await bundle(e, ['paneon-skill-b']);
    const result = await install(e, { scope: 'global', agents: ['claude-code'] });
    assert.deepEqual(result.removedTargets, []);
    assert.equal(
      await readFile(join(root, 'new-config/skills/paneon-skill-b/SKILL.md'), 'utf8'),
      '# paneon-skill-b 1.2.3\n',
    );
  }));

void test('failed new installation retains previous skills and records for retry', async () =>
  fixture(async (e) => {
    await bundle(e, ['paneon-skill-a', 'paneon-skill-b']);
    await install(e);
    const recordPath = join(e.paneonHome, 'skill-installations.json');
    const previous = await readFile(recordPath, 'utf8');
    await bundle(e, ['paneon-skill-b', 'paneon-skill-c']);
    const original = fs.promises.symlink;
    fs.promises.symlink = () =>
      Promise.reject(Object.assign(new Error('Injected link failure'), { code: 'EPERM' }));
    syncBuiltinESMExports();
    try {
      await assert.rejects(install(e), code('SKILL_INSTALL_FAILED'));
    } finally {
      fs.promises.symlink = original;
      syncBuiltinESMExports();
    }
    assert.equal(await readFile(recordPath, 'utf8'), previous);
    assert.equal(
      await readFile(join(e.cwd, '.claude/skills/paneon-skill-a/SKILL.md'), 'utf8'),
      '# paneon-skill-a 1.2.3\n',
    );
    await install(e);
    await assert.rejects(lstat(join(e.cwd, '.agents/skills/paneon-skill-a')), { code: 'ENOENT' });
    await assert.rejects(lstat(join(e.cwd, '.claude/skills/paneon-skill-a')), { code: 'ENOENT' });
  }));

void test('failed obsolete target cleanup retains old metadata and reports completed removals', async () =>
  fixture(async (e) => {
    await bundle(e, ['paneon-skill-a']);
    await install(e);
    const recordPath = join(e.paneonHome, 'skill-installations.json');
    const previous = await readFile(recordPath, 'utf8');
    await bundle(e, ['paneon-skill-b']);
    const oldCentral = join(e.cwd, '.agents/skills/paneon-skill-a');
    const oldLink = join(e.cwd, '.claude/skills/paneon-skill-a');
    const original = fs.promises.rm;
    fs.promises.rm = (path, options) =>
      String(path) === oldCentral
        ? Promise.reject(Object.assign(new Error('Injected removal failure'), { code: 'EACCES' }))
        : original(path, options);
    syncBuiltinESMExports();
    try {
      await assert.rejects(install(e), (error: unknown) => {
        assert.ok(code('SKILL_INSTALL_FAILED')(error));
        assert.deepEqual(
          (error as { details: { removedTargets: string[] } }).details.removedTargets,
          [oldLink],
        );
        return true;
      });
    } finally {
      fs.promises.rm = original;
      syncBuiltinESMExports();
    }
    assert.equal(await readFile(recordPath, 'utf8'), previous);
    assert.equal((await lstat(oldCentral)).isDirectory(), true);
    await install(e);
    await assert.rejects(lstat(oldCentral), { code: 'ENOENT' });
    await assert.rejects(lstat(oldLink), { code: 'ENOENT' });
  }));

void test('obsolete symlinks are unlinked without deleting their external destination', async () =>
  fixture(async (e, root) => {
    await bundle(e, ['paneon-skill-a']);
    await install(e);
    const protectedDir = join(root, 'external');
    await mkdir(protectedDir);
    await writeFile(join(protectedDir, 'keep'), 'keep');
    const old = join(e.cwd, '.claude/skills/paneon-skill-a');
    await rm(old);
    await symlink(protectedDir, old, 'dir');
    await bundle(e, ['paneon-skill-b']);
    await install(e);
    await assert.rejects(lstat(old), { code: 'ENOENT' });
    assert.equal(await readFile(join(protectedDir, 'keep'), 'utf8'), 'keep');
  }));

void test('global migration cleans recorded custom locations and leaves project installations intact', async () =>
  fixture(async (e, root) => {
    await bundle(e, ['paneon-skill-a', 'paneon-skill-b']);
    await install(e);
    e.env.CLAUDE_CONFIG_DIR = join(root, 'old-config');
    await install(e, { scope: 'global', agents: ['claude-code'], method: 'copy' });
    const projectRecord = (await records(e)).installations.find((i) => i.scope === 'project');
    e.env.CLAUDE_CONFIG_DIR = join(root, 'new-config');
    await bundle(e, ['paneon-skill-b', 'paneon-skill-c']);
    const result = await install(e, { scope: 'global', agents: ['claude-code'], method: 'copy' });
    assert.deepEqual(
      result.removedTargets.sort(),
      ['paneon-skill-a', 'paneon-skill-b'].map((name) => join(root, 'old-config/skills', name)),
    );
    assert.deepEqual(await readdir(join(root, 'old-config/skills')), []);
    assert.deepEqual(await readdir(join(root, 'new-config/skills')), [
      'paneon-skill-b',
      'paneon-skill-c',
    ]);
    assert.deepEqual(
      (await records(e)).installations.find((i) => i.scope === 'project'),
      projectRecord,
    );
    assert.equal(
      await readFile(join(e.cwd, '.claude/skills/paneon-skill-a/SKILL.md'), 'utf8'),
      '# paneon-skill-a 1.2.3\n',
    );
  }));

void test('shared old targets are removed only after their last recorded installation migrates', async () =>
  fixture(async (e, root) => {
    await bundle(e, ['paneon-skill-a']);
    await install(e);
    const second = { ...e, cwd: join(root, 'project-b') };
    await mkdir(join(second.cwd, '.agents'), { recursive: true });
    await symlink(join(e.cwd, '.agents/skills'), join(second.cwd, '.agents/skills'), 'dir');
    await install(second);
    const secondRecord = (await records(e)).installations.find((i) => i.projectPath === second.cwd);
    await bundle(e, ['paneon-skill-b']);
    const first = await install(e);
    assert.deepEqual(first.removedTargets, [join(e.cwd, '.claude/skills/paneon-skill-a')]);
    assert.equal(
      await readFile(join(second.cwd, '.claude/skills/paneon-skill-a/SKILL.md'), 'utf8'),
      '# paneon-skill-a 1.2.3\n',
    );
    assert.deepEqual(
      (await records(e)).installations.find((i) => i.projectPath === second.cwd),
      secondRecord,
    );
    await install(second);
    await assert.rejects(lstat(join(e.cwd, '.agents/skills/paneon-skill-a')), { code: 'ENOENT' });
    await assert.rejects(lstat(join(second.cwd, '.claude/skills/paneon-skill-a')), {
      code: 'ENOENT',
    });
    assert.equal(
      await realpath(join(second.cwd, '.claude/skills/paneon-skill-b')),
      join(e.cwd, '.agents/skills/paneon-skill-b'),
    );
  }));

void test('migration follows a recorded parent link and removes only its corresponding old skill', async () =>
  fixture(async (e, root) => {
    await bundle(e, ['paneon-skill-a']);
    await install(e, { scope: 'project', agents: ['claude-code'] });
    const original = join(e.cwd, '.claude/skills');
    const protectedDir = join(root, 'external');
    await mkdir(join(protectedDir, 'paneon-skill-a'), { recursive: true });
    await writeFile(join(protectedDir, 'paneon-skill-a/keep'), 'keep');
    await writeFile(join(protectedDir, 'unrelated'), 'keep');
    await rm(original, { recursive: true });
    await symlink(protectedDir, original, 'dir');
    await bundle(e, ['paneon-skill-b']);
    const result = await install(e, { scope: 'project', agents: ['claude-code'] });
    assert.deepEqual(result.removedTargets, [join(protectedDir, 'paneon-skill-a')]);
    await assert.rejects(lstat(join(protectedDir, 'paneon-skill-a')), { code: 'ENOENT' });
    assert.equal(await readFile(join(protectedDir, 'unrelated'), 'utf8'), 'keep');
    assert.deepEqual(await readdir(protectedDir), ['paneon-skill-b', 'unrelated']);
  }));
void test('copy replaces user modifications and removes stale references while preserving other skills', async () =>
  fixture(async (e) => {
    await install(e, { ...request, method: 'copy' });
    for (const p of [`.agents/skills/${SKILL_NAME}`, `.claude/skills/${SKILL_NAME}`]) {
      await writeFile(join(e.cwd, p, 'SKILL.md'), 'user changes');
      await writeFile(join(e.cwd, p, 'references/obsolete.md'), 'old');
      await mkdir(join(e.cwd, dirname(p), 'other-skill'));
      await writeFile(join(e.cwd, dirname(p), 'other-skill/SKILL.md'), 'keep');
    }
    e.packageVersion = '1.2.4';
    await install(e, { ...request, method: 'copy' });
    for (const p of [`.agents/skills/${SKILL_NAME}`, `.claude/skills/${SKILL_NAME}`]) {
      assert.equal((await lstat(join(e.cwd, p))).isSymbolicLink(), false);
      assert.equal(await readFile(join(e.cwd, p, 'SKILL.md'), 'utf8'), '# Paneon\n');
      assert.deepEqual(await readdir(join(e.cwd, p, 'references')), ['cli.md']);
      assert.equal(await readFile(join(e.cwd, dirname(p), 'other-skill/SKILL.md'), 'utf8'), 'keep');
    }
    const r = await records(e);
    assert.equal(r.installations.length, 2);
    assert.ok(r.installations.every((record) => record.paneonVersion === '1.2.4'));
  }));
void test('global Universal targets share ~/.agents; non-universal explicit targets are created', async () =>
  fixture(async (e) => {
    const all = (await listSkillAgents(e)).map((a) => a.id);
    const result = await install(e, { scope: 'global', agents: all, method: 'copy' });
    assert.equal(result.targets.length, 6);
    assert.deepEqual(
      result.targets.map((t) => t.path).sort(),
      [
        `.agents/skills/${SKILL_NAME}`,
        `.claude/skills/${SKILL_NAME}`,
        `.codeium/windsurf/skills/${SKILL_NAME}`,
        `.kiro/skills/${SKILL_NAME}`,
        `.qwen/skills/${SKILL_NAME}`,
        `.roo/skills/${SKILL_NAME}`,
      ]
        .map((p) => join(e.homeDir, p))
        .sort(),
    );
    const r = await records(e);
    assert.equal(r.installations[0].scope, 'global');
    assert.equal(r.installations[0].projectPath, undefined);
  }));
void test('correct link is retained, wrong or broken links repaired without deleting their old destination', async () =>
  fixture(async (e, root) => {
    await install(e);
    const path = join(e.cwd, `.claude/skills/${SKILL_NAME}`);
    const old = await lstat(path),
      content = await readlink(path);
    await install(e);
    assert.equal((await lstat(path)).ino, old.ino);
    assert.equal(await readlink(path), content);
    const wrong = join(root, 'wrong');
    await mkdir(wrong);
    await writeFile(join(wrong, 'keep'), 'retain');
    await rm(path);
    await symlink(wrong, path, 'dir');
    await install(e);
    assert.equal(await realpath(path), join(e.cwd, `.agents/skills/${SKILL_NAME}`));
    assert.equal(await readFile(join(wrong, 'keep'), 'utf8'), 'retain');
    await rm(path);
    await symlink(join(root, 'missing'), path, 'dir');
    await install(e);
    assert.equal(await realpath(path), join(e.cwd, `.agents/skills/${SKILL_NAME}`));
  }));
void test('parent symlink aliases deduplicate physical destinations and canonicalize project identity', async () =>
  fixture(async (e, root) => {
    await mkdir(join(e.cwd, '.agents/skills'), { recursive: true });
    await mkdir(join(e.cwd, '.claude'), { recursive: true });
    await symlink('../.agents/skills', join(e.cwd, '.claude/skills'), 'dir');
    const alias = join(root, 'project-alias');
    await symlink(e.cwd, alias, 'dir');
    const aliased = { ...e, cwd: alias };
    const plan = await createInstallPlan(request, aliased);
    assert.equal(plan.method, 'copy');
    assert.equal(plan.targets.length, 1);
    assert.equal(plan.projectPath, e.cwd);
    await executeInstallPlan(plan, aliased);
    assert.deepEqual(plan.targets[0].agents, ['claude-code', 'codex']);
    assert.equal((await records(e)).installations[0].projectPath, e.cwd);
  }));

for (const scope of ['project', 'global'] as const) {
  void test(`${scope}: reinstall retains a skill after its parent moves behind a symlink`, async () =>
    fixture(async (e, root) => {
      const request: InstallRequest = { scope, agents: ['claude-code'], method: 'copy' };
      await install(e, request);
      const base = scope === 'project' ? e.cwd : e.homeDir;
      const original = join(base, '.claude/skills');
      const moved = join(root, 'dotfiles-skills');
      await rename(original, moved);
      await symlink(moved, original, 'dir');
      const plan = await createInstallPlan(request, e);
      assert.deepEqual(plan.obsoleteTargets, []);
      assert.equal(plan.targets[0].path, join(moved, SKILL_NAME));
      const result = await executeInstallPlan(plan, e);
      assert.deepEqual(result.removedTargets, []);
      assert.equal(await readFile(join(original, SKILL_NAME, 'SKILL.md'), 'utf8'), '# Paneon\n');
      assert.deepEqual((await records(e)).installations[0].targets, [
        { path: relative(base, join(moved, SKILL_NAME)), kind: 'directory' },
      ]);
    }));
}
void test('source overlap through direct, final-link and parent-link aliases is blocked before deletion', async () =>
  fixture(async (e, root) => {
    const source = join(e.packageRoot, SKILL_PACKAGE_PATH);
    await mkdir(join(e.cwd, '.agents'), { recursive: true });
    await symlink(join(e.packageRoot, 'skills'), join(e.cwd, '.agents/skills'), 'dir');
    await assert.rejects(
      createInstallPlan({ scope: 'project', agents: ['codex'] }, e),
      code('SKILL_INSTALL_UNSAFE_PATH'),
    );
    await rm(join(e.cwd, '.agents/skills'));
    await mkdir(join(e.cwd, '.agents/skills'));
    await symlink(source, join(e.cwd, `.agents/skills/${SKILL_NAME}`), 'dir');
    await assert.rejects(
      createInstallPlan({ scope: 'project', agents: ['codex'] }, e),
      code('SKILL_INSTALL_UNSAFE_PATH'),
    );
    await rm(join(e.cwd, `.agents/skills/${SKILL_NAME}`));
    await symlink(root, join(e.cwd, `.agents/skills/${SKILL_NAME}`), 'dir');
    await assert.rejects(
      createInstallPlan({ scope: 'project', agents: ['codex'] }, e),
      code('SKILL_INSTALL_UNSAFE_PATH'),
    );
    assert.equal(await readFile(join(source, 'SKILL.md'), 'utf8'), '# Paneon\n');
  }));
void test('invalid or missing bundled skill is rejected without altering existing targets', async () =>
  fixture(async (e) => {
    await install(e);
    await rm(join(e.packageRoot, `${SKILL_PACKAGE_PATH}/SKILL.md`));
    await assert.rejects(createInstallPlan(request, e), code('SKILL_INSTALL_INVALID_REQUEST'));
    assert.equal(
      await readFile(join(e.cwd, `.agents/skills/${SKILL_NAME}/SKILL.md`), 'utf8'),
      '# Paneon\n',
    );
  }));
void test('malformed records and unsupported schemas are not overwritten or allowed to delete targets', async () =>
  fixture(async (e) => {
    await install(e);
    const path = join(e.paneonHome, 'skill-installations.json');
    for (const raw of [
      '{',
      '{"schemaVersion":2,"installations":[]}',
      '{"schemaVersion":1,"installations":[{}]}',
    ]) {
      await writeFile(path, raw);
      await assert.rejects(createInstallPlan(request, e), code('SKILL_INSTALL_INVALID_RECORD'));
      assert.equal(await readFile(path, 'utf8'), raw);
      assert.equal(
        await readFile(join(e.cwd, `.agents/skills/${SKILL_NAME}/SKILL.md`), 'utf8'),
        '# Paneon\n',
      );
    }
  }));
void test('tampered and parent-repointed plans cannot become filesystem deletion instructions', async () =>
  fixture(async (e, root) => {
    const plan = await createInstallPlan(request, e);
    const protectedDir = join(root, 'protected');
    await mkdir(protectedDir);
    await writeFile(join(protectedDir, 'keep'), 'keep');
    await assert.rejects(
      executeInstallPlan(
        {
          ...plan,
          targets: [{ path: protectedDir, kind: 'directory', agents: ['codex'], exists: true }],
        },
        e,
      ),
      code('SKILL_INSTALL_UNSAFE_PATH'),
    );
    await assert.rejects(
      executeInstallPlan({ ...plan, obsoleteTargets: [protectedDir] }, e),
      code('SKILL_INSTALL_UNSAFE_PATH'),
    );
    await mkdir(join(e.cwd, '.agents'));
    await symlink(protectedDir, join(e.cwd, '.agents/skills'), 'dir');
    await assert.rejects(executeInstallPlan(plan, e), code('SKILL_INSTALL_UNSAFE_PATH'));
    assert.equal(await readFile(join(protectedDir, 'keep'), 'utf8'), 'keep');
  }));
void test('metadata storage failure stops before replacing skills and reports failure', async () =>
  fixture(async (e, root) => {
    await install(e);
    const skill = join(e.cwd, `.agents/skills/${SKILL_NAME}/SKILL.md`);
    await writeFile(skill, 'preserve until record writable');
    const blocker = join(root, 'not-a-directory');
    await writeFile(blocker, 'blocked');
    await assert.rejects(createInstallPlan(request, { ...e, paneonHome: join(blocker, 'child') }));
    assert.equal(await readFile(skill, 'utf8'), 'preserve until record writable');
  }));
void test('unsupported bundled files fail during staging before deleting an installed skill', async () =>
  fixture(async (e) => {
    await install(e);
    const previous = await readFile(join(e.paneonHome, 'skill-installations.json'), 'utf8');
    // Unix socket names have a small byte limit; use a short alias into the real fixture.
    const socketRoot = await mkdtemp('/tmp/paneon-socket-');
    await symlink(join(e.packageRoot, SKILL_PACKAGE_PATH), join(socketRoot, 'source'), 'dir');
    const path = join(socketRoot, 'source/socket');
    const server = createServer();
    await new Promise<void>((accept, reject) => {
      server.once('error', reject);
      server.listen(path, accept);
    });
    try {
      await assert.rejects(
        install({ ...e, packageVersion: '9.0.0' }),
        code('SKILL_INSTALL_FAILED'),
      );
      assert.equal(
        await readFile(join(e.paneonHome, 'skill-installations.json'), 'utf8'),
        previous,
      );
      assert.equal(
        await readFile(join(e.cwd, `.agents/skills/${SKILL_NAME}/SKILL.md`), 'utf8'),
        '# Paneon\n',
      );
    } finally {
      await new Promise<void>((accept, reject) =>
        server.close((error) => (error ? reject(error) : accept())),
      );
      await rm(socketRoot, { recursive: true, force: true });
    }
  }));
void test('link failure reports partial changes, never falls back to copy or records success', async () =>
  fixture(async (e) => {
    await install(e);
    const recordPath = join(e.paneonHome, 'skill-installations.json');
    const previous = await readFile(recordPath, 'utf8');
    await rm(join(e.cwd, `.claude/skills/${SKILL_NAME}`));
    const plan = await createInstallPlan(request, { ...e, packageVersion: '9.0.0' });
    const original = fs.promises.symlink;
    fs.promises.symlink = () =>
      Promise.reject(Object.assign(new Error('Injected link failure'), { code: 'EPERM' }));
    syncBuiltinESMExports();
    try {
      await assert.rejects(
        executeInstallPlan(plan, { ...e, packageVersion: '9.0.0' }),
        (error: unknown) => {
          assert.ok(code('SKILL_INSTALL_FAILED')(error));
          assert.match((error as Error).message, /not been rolled back/);
          assert.deepEqual(
            (error as { details: { completedTargets: string[] } }).details.completedTargets,
            [join(e.cwd, `.agents/skills/${SKILL_NAME}`)],
          );
          return true;
        },
      );
    } finally {
      fs.promises.symlink = original;
      syncBuiltinESMExports();
    }
    assert.equal(await readFile(recordPath, 'utf8'), previous);
    await assert.rejects(lstat(join(e.cwd, `.claude/skills/${SKILL_NAME}`)), { code: 'ENOENT' });
  }));
void test('failed metadata rename keeps the old JSON intact without falsely reporting successful version', async () =>
  fixture(async (e) => {
    await install(e);
    const recordPath = join(e.paneonHome, 'skill-installations.json');
    const previous = await readFile(recordPath, 'utf8');
    const original = fs.promises.rename;
    fs.promises.rename = () =>
      Promise.reject(
        Object.assign(new Error('Injected metadata rename failure'), { code: 'EACCES' }),
      );
    syncBuiltinESMExports();
    try {
      await assert.rejects(
        install({ ...e, packageVersion: '9.0.0' }),
        code('SKILL_INSTALL_FAILED'),
      );
    } finally {
      fs.promises.rename = original;
      syncBuiltinESMExports();
    }
    assert.equal(await readFile(recordPath, 'utf8'), previous);
    assert.deepEqual(await readdir(e.paneonHome), ['skill-installations.json']);
  }));
void test('records reject absolute target paths and symbolic links without overwriting them', async () =>
  fixture(async (e, root) => {
    await install(e);
    const path = join(e.paneonHome, 'skill-installations.json');
    const r = await records(e);
    r.installations[0].targets[0].path = join(root, 'unsafe/paneon');
    await writeFile(path, JSON.stringify(r));
    await assert.rejects(createInstallPlan(request, e), code('SKILL_INSTALL_INVALID_RECORD'));
    await rm(path);
    const protectedFile = join(root, 'other-record.json');
    await writeFile(protectedFile, 'keep');
    await symlink(protectedFile, path);
    await assert.rejects(createInstallPlan(request, e), code('SKILL_INSTALL_INVALID_RECORD'));
    assert.equal(await readFile(protectedFile, 'utf8'), 'keep');
  }));
void test('multi-project and global installs coexist, reinstall preserves unselected agents', async () =>
  fixture(async (e, root) => {
    await install(e);
    const second = { ...e, cwd: join(root, 'project-b') };
    await mkdir(second.cwd);
    await install(second, { scope: 'project', agents: ['roo'] });
    await install(e, { scope: 'global', agents: ['codex'] });
    await install(
      { ...e, packageVersion: '2.0.0' },
      { scope: 'project', agents: ['qwen-code'], method: 'copy' },
    );
    const r = await records(e);
    assert.equal(r.installations.length, 5);
    const projectRecords = r.installations.filter((i) => i.projectPath === e.cwd);
    assert.deepEqual(projectRecords.flatMap((i) => i.agents).sort(), [
      'claude-code',
      'codex',
      'qwen-code',
    ]);
    assert.equal(
      projectRecords.find((i) => i.agents.includes('qwen-code'))?.paneonVersion,
      '2.0.0',
    );
    for (const agent of ['codex', 'claude-code'])
      assert.equal(projectRecords.find((i) => i.agents.includes(agent))?.paneonVersion, '1.2.3');
    assert.equal(r.installations.find((i) => i.projectPath === second.cwd)?.paneonVersion, '1.2.3');
  }));
void test('a concurrently created ordinary parent is resolved while dangling parent links remain unsafe', async () =>
  fixture(async (e, root) => {
    const original = fs.promises.realpath;
    let raced = false;
    fs.promises.realpath = (async (...args: Parameters<typeof original>) => {
      try {
        return await original(...args);
      } catch (error) {
        if (
          !raced &&
          String(args[0]) === e.paneonHome &&
          (error as NodeJS.ErrnoException).code === 'ENOENT'
        ) {
          raced = true;
          await mkdir(e.paneonHome);
        }
        throw error;
      }
    }) as typeof original;
    syncBuiltinESMExports();
    try {
      await createInstallPlan({ scope: 'project', agents: ['codex'] }, e);
      assert.equal(raced, true);
    } finally {
      fs.promises.realpath = original;
      syncBuiltinESMExports();
    }
    await rm(e.paneonHome, { recursive: true });
    await symlink(join(root, 'missing-parent'), e.paneonHome, 'dir');
    await assert.rejects(createInstallPlan(request, e), code('SKILL_INSTALL_UNSAFE_PATH'));
  }));

void test('parallel processes merge centralized records atomically without losing projects', async () =>
  fixture(async (e, root) => {
    const moduleUrl = new URL('../dist/cli/skill-install/index.js', import.meta.url).href;
    const projects = await Promise.all(
      Array.from({ length: 6 }, async (_, i) => {
        const cwd = join(root, `parallel-${i}`);
        await mkdir(cwd);
        return { ...e, cwd };
      }),
    );
    await Promise.all(
      projects.map(
        (env) =>
          new Promise<void>((accept, reject) => {
            const child = spawn(
              process.execPath,
              [
                '--input-type=module',
                '-e',
                `import {createInstallPlan,executeInstallPlan} from ${JSON.stringify(moduleUrl)};const env=JSON.parse(process.argv[1]);await executeInstallPlan(await createInstallPlan({scope:'project',agents:['codex']},env),env);`,
                JSON.stringify(env),
              ],
              { stdio: ['ignore', 'pipe', 'pipe'] },
            );
            let output = '';
            child.stderr.on('data', (chunk) => (output += chunk));
            child.on('error', reject);
            child.on('exit', (status) => (status === 0 ? accept() : reject(new Error(output))));
          }),
      ),
    );
    const r = await records(e);
    assert.equal(r.installations.length, 6);
    assert.deepEqual(
      r.installations.map((i) => i.projectPath).sort(),
      projects.map((i) => i.cwd).sort(),
    );
    assert.deepEqual(
      (await readdir(e.paneonHome)).filter((n) => n !== 'skill-installations.json'),
      [],
    );
  }));

void test('global home aliases retain relative targets and relative config env resolves against the injected cwd', async () =>
  fixture(async (e, root) => {
    const alias = join(root, 'home-alias');
    await symlink(e.homeDir, alias, 'dir');
    await install({ ...e, homeDir: alias }, { scope: 'global', agents: ['codex'] });
    assert.deepEqual((await records(e)).installations[0].targets, [
      { path: `.agents/skills/${SKILL_NAME}`, kind: 'directory' },
    ]);
    const configured = { ...e, env: { CLAUDE_CONFIG_DIR: 'custom-claude' } };
    const plan = await createInstallPlan({ scope: 'global', agents: ['claude-code'] }, configured);
    assert.equal(plan.targets[0].path, join(e.cwd, `custom-claude/skills/${SKILL_NAME}`));
  }));
