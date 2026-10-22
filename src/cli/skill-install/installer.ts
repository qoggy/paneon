import { randomUUID } from 'node:crypto';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import { PaneonError } from '../../shared/types.js';
import { agentRegistry } from './agents.js';
import type {
  InstallationRecord,
  InstallationRecords,
  InstallEnvironment,
  InstallPlan,
  InstallRequest,
  InstallResult,
  InstallTarget,
} from './types.js';

const invalid = (message: string) => new PaneonError('SKILL_INSTALL_INVALID_REQUEST', message);
const unsafe = (message: string) => new PaneonError('SKILL_INSTALL_UNSAFE_PATH', message);
const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === 'ENOENT';
async function entry(path: string) {
  try {
    return await lstat(path);
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}
// Resolve every existing parent, but keep the last component so rm unlinks a final symlink.
async function physicalParent(path: string): Promise<string> {
  const absolute = resolve(path);
  return join(await physicalPath(dirname(absolute)), basename(absolute));
}
async function physicalPath(path: string): Promise<string> {
  const absolute = resolve(path);
  try {
    return await realpath(absolute);
  } catch (e) {
    if (!missing(e)) throw e;
    // A broken parent link is unsafe: recreating through it could redirect installation.
    if (await entry(absolute)) throw unsafe(`A parent path is a broken symbolic link: ${absolute}`);
    const parent = dirname(absolute);
    if (parent === absolute) throw e;
    return join(await physicalPath(parent), basename(absolute));
  }
}
function contains(a: string, b: string) {
  const part = relative(a, b);
  return part === '' || (!part.startsWith(`..${sep}`) && part !== '..' && !isAbsolute(part));
}
function overlap(a: string, b: string) {
  return contains(a, b) || contains(b, a);
}
const nonempty = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && !v.includes('\0');
function recordError() {
  return new PaneonError(
    'SKILL_INSTALL_INVALID_RECORD',
    'The skill installation record is invalid. Repair or remove it before installing.',
  );
}
function validateRecord(value: unknown): InstallationRecords {
  if (!value || typeof value !== 'object') throw recordError();
  const r = value as InstallationRecords;
  if (r.schemaVersion !== 1 || !Array.isArray(r.installations)) throw recordError();
  const identities = new Set<string>();
  for (const i of r.installations) {
    if (
      !i ||
      !['project', 'global'].includes(i.scope) ||
      !['copy', 'symlink'].includes(i.method) ||
      !nonempty(i.paneonVersion) ||
      !Array.isArray(i.agents) ||
      i.agents.length === 0 ||
      !i.agents.every(nonempty) ||
      new Set(i.agents).size !== i.agents.length ||
      !Array.isArray(i.targets) ||
      i.targets.length === 0
    )
      throw recordError();
    if (
      i.scope === 'project'
        ? !nonempty(i.projectPath) ||
          !isAbsolute(i.projectPath) ||
          resolve(i.projectPath) !== i.projectPath
        : i.projectPath !== undefined
    )
      throw recordError();
    const key = `${i.scope}:${i.projectPath ?? ''}`;
    if (identities.has(key)) throw recordError();
    identities.add(key);
    for (const t of i.targets) {
      if (
        !t ||
        !nonempty(t.path) ||
        isAbsolute(t.path) ||
        basename(t.path) !== 'paneon' ||
        !['directory', 'symlink'].includes(t.kind)
      )
        throw recordError();
      if (
        t.kind === 'symlink'
          ? !nonempty(t.target) || isAbsolute(t.target) || basename(t.target) !== 'paneon'
          : t.target !== undefined
      )
        throw recordError();
    }
  }
  return r;
}
async function readRecords(path: string): Promise<InstallationRecords> {
  const info = await entry(path);
  if (!info) return { schemaVersion: 1, installations: [] };
  if (!info.isFile() || info.isSymbolicLink()) throw recordError();
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (e) {
    throw new PaneonError(
      'SKILL_INSTALL_INVALID_RECORD',
      'The skill installation record could not be read.',
      { reason: String(e) },
    );
  }
  try {
    return validateRecord(JSON.parse(raw));
  } catch (e) {
    if (e instanceof PaneonError) throw e;
    throw recordError();
  }
}
async function sourcePath(e: InstallEnvironment): Promise<string> {
  const source = await realpath(join(e.packageRoot, 'skills/paneon'));
  if (!(await stat(source)).isDirectory() || !(await stat(join(source, 'SKILL.md'))).isFile())
    throw invalid(
      'The installed Paneon package does not contain a complete skill. Reinstall Paneon.',
    );
  await readFile(join(source, 'SKILL.md'), 'utf8');
  return source;
}
export async function createInstallPlan(
  request: InstallRequest,
  e: InstallEnvironment,
): Promise<InstallPlan> {
  if (
    !request ||
    !['project', 'global'].includes(request.scope) ||
    (request.method !== undefined && !['copy', 'symlink'].includes(request.method)) ||
    !Array.isArray(request.agents) ||
    !request.agents.length ||
    !request.agents.every(nonempty)
  )
    throw invalid('Choose at least one supported agent and a valid installation scope.');
  const registry = agentRegistry(e);
  const agents = [...new Set(request.agents)].sort();
  if (agents.some((id) => !registry.some((a) => a.id === id)))
    throw invalid(
      `Unknown agent: ${agents.filter((id) => !registry.some((a) => a.id === id)).join(', ')}.`,
    );
  if (!nonempty(e.packageVersion)) throw invalid('The Paneon package version is missing.');
  const base = await realpath(request.scope === 'project' ? e.cwd : e.homeDir);
  if (!(await stat(base)).isDirectory())
    throw invalid('The installation root must be a directory.');
  let source: string;
  try {
    source = await sourcePath(e);
  } catch (error) {
    if (error instanceof PaneonError) throw error;
    throw invalid('The installed Paneon package skill could not be read. Reinstall Paneon.');
  }
  const recordPath = join(await physicalPath(e.paneonHome), 'skill-installations.json');
  await readRecords(recordPath);
  if (contains(source, dirname(recordPath)))
    throw unsafe('Paneon installation metadata must be outside the bundled skill source.');
  const selected = registry.filter((a) => agents.includes(a.id));
  const paths = await Promise.all(
    selected.map(async (a) => ({
      agent: a.id,
      path: await physicalParent(
        join(request.scope === 'global' ? a.globalDir : join(base, a.projectDir), 'paneon'),
      ),
    })),
  );
  const unique = new Map<string, string[]>();
  for (const p of paths) unique.set(p.path, [...(unique.get(p.path) ?? []), p.agent]);
  const method = unique.size === 1 ? 'copy' : (request.method ?? 'symlink');
  const central = await physicalParent(join(base, '.agents/skills/paneon'));
  const targets: InstallTarget[] = [];
  if (method === 'symlink' && !unique.has(central)) unique.set(central, []);
  // Copy the central source before creating links to it.
  for (const [path, owners] of [...unique].sort(([a], [b]) =>
    a === central ? -1 : b === central ? 1 : a.localeCompare(b),
  )) {
    const kind = method === 'symlink' && path !== central ? 'symlink' : 'directory';
    if (overlap(source, path))
      throw unsafe('The installation target overlaps the bundled skill source.');
    const info = await entry(path);
    if (info?.isSymbolicLink()) {
      const link = resolve(dirname(path), await readlink(path));
      const resolved = await physicalPath(link);
      if (overlap(source, resolved))
        throw unsafe('An installation target links to the bundled skill source.');
    }
    if (contains(path, recordPath) || contains(path, await physicalPath(e.paneonHome)))
      throw unsafe('The installation target overlaps Paneon installation metadata.');
    targets.push({
      path,
      kind,
      ...(kind === 'symlink' ? { target: central } : {}),
      agents: owners.sort(),
      exists: !!info,
    });
  }
  for (let i = 0; i < targets.length; i++)
    for (let j = i + 1; j < targets.length; j++)
      if (overlap(targets[i].path, targets[j].path))
        throw unsafe('Installation target directories overlap.');
  return {
    scope: request.scope,
    ...(request.scope === 'project' ? { projectPath: base } : {}),
    method,
    agents,
    paneonVersion: e.packageVersion,
    sourcePath: source,
    recordPath,
    targets,
  };
}
async function lockRecords(home: string): Promise<() => Promise<void>> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  const path = join(home, 'skill-installations.lock');
  const token = randomUUID();
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      await mkdir(path, { mode: 0o700 });
      try {
        await writeFile(join(path, 'owner.json'), JSON.stringify({ pid: process.pid, token }));
      } catch (e) {
        await rm(path, { recursive: true, force: true });
        throw e;
      }
      return async () => {
        const owner = JSON.parse(await readFile(join(path, 'owner.json'), 'utf8')) as {
          token: string;
        };
        if (owner.token === token) await rm(path, { recursive: true, force: true });
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      // Do not reap a lock by PID: two contenders could otherwise remove a new owner's lock.
      // A crash leaves a visible lock for explicit recovery rather than risking concurrent writes.
      await delay(100);
    }
  }
  throw new PaneonError(
    'SKILL_INSTALL_BUSY',
    'Another Paneon skill installation is in progress. If no installer is running, remove the stale lock before retrying.',
    { lockPath: path },
  );
}
async function storedRecord(plan: InstallPlan, e: InstallEnvironment): Promise<InstallationRecord> {
  const base = plan.projectPath ?? (await realpath(e.homeDir));
  return {
    scope: plan.scope,
    ...(plan.projectPath ? { projectPath: plan.projectPath } : {}),
    paneonVersion: plan.paneonVersion,
    agents: plan.agents,
    method: plan.method,
    targets: plan.targets.map((t) => ({
      path: relative(base, t.path),
      kind: t.kind,
      ...(t.target ? { target: relative(base, t.target) } : {}),
    })),
  };
}
export async function executeInstallPlan(
  plan: InstallPlan,
  e: InstallEnvironment,
): Promise<InstallResult> {
  let unlock: (() => Promise<void>) | undefined;
  let staging: string | undefined;
  let pending: string | undefined;
  const completed: string[] = [];
  try {
    // Plans are review artifacts, not arbitrary filesystem write capabilities.
    const verified = await createInstallPlan(
      { agents: plan.agents, scope: plan.scope, method: plan.method },
      e,
    );
    if (!isDeepStrictEqual(plan, verified))
      throw unsafe('The installation plan changed. Review a new plan before proceeding.');
    unlock = await lockRecords(dirname(verified.recordPath));
    const fresh = await createInstallPlan(
      { agents: plan.agents, scope: plan.scope, method: plan.method },
      e,
    );
    if (!isDeepStrictEqual(plan, fresh))
      throw unsafe('The installation plan changed. Review a new plan before proceeding.');
    const records = await readRecords(fresh.recordPath);
    const installed = await storedRecord(fresh, e);
    records.installations = records.installations.filter(
      (i) => i.scope !== installed.scope || i.projectPath !== installed.projectPath,
    );
    records.installations.push(installed);
    validateRecord(records);
    // Prepare source and metadata before removing any existing skill directory.
    staging = await mkdtemp(join(dirname(fresh.recordPath), '.skill-install-'));
    const stagedSource = join(staging, 'paneon');
    await cp(fresh.sourcePath, stagedSource, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
    });
    pending = join(dirname(fresh.recordPath), `.skill-installations-${randomUUID()}.tmp`);
    const file = await open(pending, 'wx', 0o600);
    try {
      await file.writeFile(`${JSON.stringify(records, null, 2)}\n`);
      await file.sync();
    } finally {
      await file.close();
    }
    for (const target of fresh.targets) {
      // Recheck parent aliases at the point of mutation. Do not follow a changed target root.
      if ((await physicalParent(target.path)) !== target.path)
        throw unsafe('An installation target parent changed during installation.');
      const info = await entry(target.path);
      const correctLink =
        target.kind === 'symlink' &&
        info?.isSymbolicLink() &&
        (await physicalPath(resolve(dirname(target.path), await readlink(target.path)))) ===
          target.target;
      if (!correctLink) {
        await mkdir(dirname(target.path), { recursive: true });
        await rm(target.path, { recursive: true, force: true });
        if (target.kind === 'symlink') {
          if (!target.target) throw unsafe('The symbolic link target is missing.');
          await symlink(relative(dirname(target.path), target.target), target.path, 'dir');
        } else
          await cp(stagedSource, target.path, {
            recursive: true,
            dereference: false,
            verbatimSymlinks: true,
          });
      }
      completed.push(target.path);
    }
    await rename(pending, fresh.recordPath);
    pending = undefined;
    return {
      scope: fresh.scope,
      ...(fresh.projectPath ? { projectPath: fresh.projectPath } : {}),
      method: fresh.method,
      paneonVersion: fresh.paneonVersion,
      recordPath: fresh.recordPath,
      targets: fresh.targets.map((t) => ({
        path: t.path,
        kind: t.kind,
        ...(t.target ? { target: t.target } : {}),
        status: t.kind === 'symlink' ? 'linked' : 'installed',
      })),
    };
  } catch (error) {
    if (error instanceof PaneonError && completed.length === 0) throw error;
    throw new PaneonError(
      'SKILL_INSTALL_FAILED',
      'Paneon skill installation did not complete. Files already changed have not been rolled back.',
      {
        reason: error instanceof Error ? error.message : String(error),
        completedTargets: completed,
      },
    );
  } finally {
    if (pending) await rm(pending, { force: true }).catch(() => {});
    if (staging) await rm(staging, { recursive: true, force: true }).catch(() => {});
    if (unlock) await unlock();
  }
}
