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
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
      mkdir(join(e.packageRoot, 'skills/paneon/references'), { recursive: true }),
      mkdir(join(e.packageRoot, 'skills/paneon/assets/standard/choose'), { recursive: true }),
    ]);
    await writeFile(join(e.packageRoot, 'skills/paneon/SKILL.md'), '# Paneon\n');
    await writeFile(join(e.packageRoot, 'skills/paneon/references/cli.md'), 'Commands');
    await writeFile(
      join(e.packageRoot, 'skills/paneon/assets/standard/choose/panel.tsx'),
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
    assert.equal(plan.targets[0].path, join(e.env.CLAUDE_CONFIG_DIR, 'skills/paneon'));
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
    assert.equal(onlyClaude.targets[0].path, join(e.cwd, '.claude/skills/paneon'));
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
    const central = join(e.cwd, '.agents/skills/paneon'),
      link = join(e.cwd, '.claude/skills/paneon');
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
      { path: '.agents/skills/paneon', kind: 'directory' },
      { path: '.claude/skills/paneon', kind: 'symlink', target: '.agents/skills/paneon' },
    ]);
    assert.equal((await readdir(e.cwd)).includes('.paneon'), false);
  }));
void test('copy replaces user modifications and removes stale references while preserving other skills', async () =>
  fixture(async (e) => {
    await install(e, { ...request, method: 'copy' });
    for (const p of ['.agents/skills/paneon', '.claude/skills/paneon']) {
      await writeFile(join(e.cwd, p, 'SKILL.md'), 'user changes');
      await writeFile(join(e.cwd, p, 'references/obsolete.md'), 'old');
      await mkdir(join(e.cwd, dirname(p), 'other-skill'));
      await writeFile(join(e.cwd, dirname(p), 'other-skill/SKILL.md'), 'keep');
    }
    e.packageVersion = '1.2.4';
    await install(e, { ...request, method: 'copy' });
    for (const p of ['.agents/skills/paneon', '.claude/skills/paneon']) {
      assert.equal((await lstat(join(e.cwd, p))).isSymbolicLink(), false);
      assert.equal(await readFile(join(e.cwd, p, 'SKILL.md'), 'utf8'), '# Paneon\n');
      assert.deepEqual(await readdir(join(e.cwd, p, 'references')), ['cli.md']);
      assert.equal(await readFile(join(e.cwd, dirname(p), 'other-skill/SKILL.md'), 'utf8'), 'keep');
    }
    const r = await records(e);
    assert.equal(r.installations.length, 1);
    assert.equal(r.installations[0].paneonVersion, '1.2.4');
  }));
void test('global Universal targets share ~/.agents; non-universal explicit targets are created', async () =>
  fixture(async (e) => {
    const all = (await listSkillAgents(e)).map((a) => a.id);
    const result = await install(e, { scope: 'global', agents: all, method: 'copy' });
    assert.equal(result.targets.length, 6);
    assert.deepEqual(
      result.targets.map((t) => t.path).sort(),
      [
        '.agents/skills/paneon',
        '.claude/skills/paneon',
        '.codeium/windsurf/skills/paneon',
        '.kiro/skills/paneon',
        '.qwen/skills/paneon',
        '.roo/skills/paneon',
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
    const path = join(e.cwd, '.claude/skills/paneon');
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
    assert.equal(await realpath(path), join(e.cwd, '.agents/skills/paneon'));
    assert.equal(await readFile(join(wrong, 'keep'), 'utf8'), 'retain');
    await rm(path);
    await symlink(join(root, 'missing'), path, 'dir');
    await install(e);
    assert.equal(await realpath(path), join(e.cwd, '.agents/skills/paneon'));
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
void test('source overlap through direct, final-link and parent-link aliases is blocked before deletion', async () =>
  fixture(async (e, root) => {
    const source = join(e.packageRoot, 'skills/paneon');
    await mkdir(join(e.cwd, '.agents'), { recursive: true });
    await symlink(join(e.packageRoot, 'skills'), join(e.cwd, '.agents/skills'), 'dir');
    await assert.rejects(
      createInstallPlan({ scope: 'project', agents: ['codex'] }, e),
      code('SKILL_INSTALL_UNSAFE_PATH'),
    );
    await rm(join(e.cwd, '.agents/skills'));
    await mkdir(join(e.cwd, '.agents/skills'));
    await symlink(source, join(e.cwd, '.agents/skills/paneon'), 'dir');
    await assert.rejects(
      createInstallPlan({ scope: 'project', agents: ['codex'] }, e),
      code('SKILL_INSTALL_UNSAFE_PATH'),
    );
    await rm(join(e.cwd, '.agents/skills/paneon'));
    await symlink(root, join(e.cwd, '.agents/skills/paneon'), 'dir');
    await assert.rejects(
      createInstallPlan({ scope: 'project', agents: ['codex'] }, e),
      code('SKILL_INSTALL_UNSAFE_PATH'),
    );
    assert.equal(await readFile(join(source, 'SKILL.md'), 'utf8'), '# Paneon\n');
  }));
void test('invalid or missing bundled skill is rejected without altering existing targets', async () =>
  fixture(async (e) => {
    await install(e);
    await rm(join(e.packageRoot, 'skills/paneon/SKILL.md'));
    await assert.rejects(createInstallPlan(request, e), code('SKILL_INSTALL_INVALID_REQUEST'));
    assert.equal(
      await readFile(join(e.cwd, '.agents/skills/paneon/SKILL.md'), 'utf8'),
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
        await readFile(join(e.cwd, '.agents/skills/paneon/SKILL.md'), 'utf8'),
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
    await mkdir(join(e.cwd, '.agents'));
    await symlink(protectedDir, join(e.cwd, '.agents/skills'), 'dir');
    await assert.rejects(executeInstallPlan(plan, e), code('SKILL_INSTALL_UNSAFE_PATH'));
    assert.equal(await readFile(join(protectedDir, 'keep'), 'utf8'), 'keep');
  }));
void test('metadata storage failure stops before replacing skills and reports failure', async () =>
  fixture(async (e, root) => {
    await install(e);
    const skill = join(e.cwd, '.agents/skills/paneon/SKILL.md');
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
    await symlink(join(e.packageRoot, 'skills/paneon'), join(socketRoot, 'source'), 'dir');
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
        await readFile(join(e.cwd, '.agents/skills/paneon/SKILL.md'), 'utf8'),
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
    await rm(join(e.cwd, '.claude/skills/paneon'));
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
            [join(e.cwd, '.agents/skills/paneon')],
          );
          return true;
        },
      );
    } finally {
      fs.promises.symlink = original;
      syncBuiltinESMExports();
    }
    assert.equal(await readFile(recordPath, 'utf8'), previous);
    await assert.rejects(lstat(join(e.cwd, '.claude/skills/paneon')), { code: 'ENOENT' });
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
void test('multi-project and global installs coexist, reinstall replaces only its matching identity', async () =>
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
    assert.equal(r.installations.length, 3);
    assert.deepEqual(r.installations.find((i) => i.projectPath === e.cwd)?.agents, ['qwen-code']);
    assert.equal(r.installations.find((i) => i.projectPath === second.cwd)?.paneonVersion, '1.2.3');
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
      { path: '.agents/skills/paneon', kind: 'directory' },
    ]);
    const configured = { ...e, env: { CLAUDE_CONFIG_DIR: 'custom-claude' } };
    const plan = await createInstallPlan({ scope: 'global', agents: ['claude-code'] }, configured);
    assert.equal(plan.targets[0].path, join(e.cwd, 'custom-claude/skills/paneon'));
  }));
