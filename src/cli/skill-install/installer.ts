import { randomUUID } from 'node:crypto';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
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
const missingRecordedPath = (e: unknown) =>
  missing(e) || (e as NodeJS.ErrnoException).code === 'ENOTDIR';
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
    const current = await entry(absolute);
    if (current?.isSymbolicLink())
      throw unsafe(`A parent path is a broken symbolic link: ${absolute}`);
    // Another installer can mkdir between realpath's ENOENT and lstat. Resolve
    // that ordinary entry rather than misclassifying it as a dangling link.
    if (current) return realpath(absolute);
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
const recordedPath = (v: unknown): v is string =>
  nonempty(v) && !isAbsolute(v) && !['.', '..'].includes(basename(v));
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
    for (const agent of i.agents) {
      const key = `${i.scope}:${i.projectPath ?? ''}:${agent}`;
      if (identities.has(key)) throw recordError();
      identities.add(key);
    }
    for (const t of i.targets) {
      if (!t || !recordedPath(t.path) || !['directory', 'symlink'].includes(t.kind))
        throw recordError();
      if (t.kind === 'symlink' ? !recordedPath(t.target) : t.target !== undefined)
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
async function bundledSkills(e: InstallEnvironment) {
  const source = await realpath(join(e.packageRoot, 'skills'));
  const names = (await readdir(source, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (!names.length)
    throw invalid('The installed Paneon package does not contain any skills. Reinstall Paneon.');
  for (const name of names) {
    const path = join(source, name, 'SKILL.md');
    if (!(await stat(path)).isFile())
      throw invalid(`The bundled skill ${name} is incomplete. Reinstall Paneon.`);
    await readFile(path, 'utf8');
  }
  return { source, names };
}
function withLinkSources<T extends { path: string; target?: string }>(all: T[], owned: T[]): T[] {
  const paths = new Set(owned.flatMap((t) => [t.path, ...(t.target ? [t.target] : [])]));
  return all.filter((t) => paths.has(t.path));
}
async function recordedTargetPath(base: string, path: string): Promise<string> {
  const absolute = resolve(base, path);
  // A missing target needs no deletion, including a target beneath a dangling parent link.
  try {
    return (await entry(absolute)) ? await physicalParent(absolute) : absolute;
  } catch (error) {
    if (!missingRecordedPath(error))
      console.warn(
        `Could not inspect recorded skill path ${absolute}; preserving the recorded path. ${String(error)}`,
      );
    return absolute;
  }
}
async function preserveInstallations(
  records: InstallationRecords,
  scope: InstallRequest['scope'],
  projectPath: string | undefined,
  agents: string[],
  e: InstallEnvironment,
): Promise<InstallationRecord[]> {
  const preserved: InstallationRecord[] = [];
  const registry = agentRegistry(e);
  for (const record of records.installations) {
    if (record.scope !== scope || record.projectPath !== projectPath) {
      continue;
    }
    const remaining = record.agents.filter((agent) => !agents.includes(agent));
    if (remaining.length === record.agents.length) {
      preserved.push(record);
      continue;
    }
    if (!remaining.length) continue;
    // Older records grouped agents together. Attribute their targets by agent directories;
    // new records are stored per agent so their paths, method and version stay independent.
    const base = record.projectPath ?? (await realpath(e.homeDir));
    const roots = new Map(
      await Promise.all(
        record.agents.map(async (id) => {
          const agent = registry.find((a) => a.id === id);
          const directory =
            agent && (scope === 'global' ? agent.globalDir : join(base, agent.projectDir));
          let root = directory && resolve(directory);
          if (directory) {
            try {
              root = await realpath(directory);
            } catch (error) {
              if (!missingRecordedPath(error))
                console.warn(
                  `Could not inspect recorded agent directory ${directory}; preserving its recorded paths. ${String(error)}`,
                );
            }
          }
          return [id, root] as const;
        }),
      ),
    );
    const located = await Promise.all(
      record.targets.map(async (target) => ({
        target,
        directory: dirname(await recordedTargetPath(base, target.path)),
      })),
    );
    const directories = new Set(located.map((t) => t.directory));
    const unmatched = record.agents.filter((id) => {
      const root = roots.get(id);
      return !root || !directories.has(root);
    });
    const sources = new Set(record.targets.flatMap((t) => (t.target ? [t.target] : [])));
    for (const id of remaining) {
      const root = roots.get(id);
      const owned = located
        .filter(({ target, directory }) => {
          if (root && directory === root) return true;
          if (sources.has(target.path)) return false;
          const known = [...roots.values()].some((r) => r === directory);
          // A legacy configurable directory may have moved. If ownership is ambiguous,
          // retain it for the unselected agents rather than guessing a deletion owner.
          return !known && unmatched.includes(id);
        })
        .map(({ target }) => target);
      preserved.push({
        ...record,
        agents: [id],
        targets: withLinkSources(record.targets, owned.length ? owned : record.targets),
      });
    }
  }
  return preserved;
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
  let names: string[];
  try {
    ({ source, names } = await bundledSkills(e));
  } catch (error) {
    if (error instanceof PaneonError) throw error;
    throw invalid('The installed Paneon package skill could not be read. Reinstall Paneon.');
  }
  const recordPath = join(await physicalPath(e.paneonHome), 'skill-installations.json');
  const records = await readRecords(recordPath);
  if (contains(source, dirname(recordPath)))
    throw unsafe('Paneon installation metadata must be outside the bundled skill source.');
  const selected = registry.filter((a) => agents.includes(a.id));
  const paths = await Promise.all(
    selected.map(async (a) => ({
      agent: a.id,
      path: await physicalPath(request.scope === 'global' ? a.globalDir : join(base, a.projectDir)),
    })),
  );
  const unique = new Map<string, string[]>();
  for (const p of paths) unique.set(p.path, [...(unique.get(p.path) ?? []), p.agent]);
  const method = unique.size === 1 ? 'copy' : (request.method ?? 'symlink');
  const central = await physicalPath(join(base, '.agents/skills'));
  const targets: InstallTarget[] = [];
  if (method === 'symlink' && !unique.has(central)) unique.set(central, []);
  // Copy each central skill before creating links to it.
  for (const [directory, owners] of [...unique].sort(([a], [b]) =>
    a === central ? -1 : b === central ? 1 : a.localeCompare(b),
  )) {
    for (const name of names) {
      const path = join(directory, name);
      const kind = method === 'symlink' && directory !== central ? 'symlink' : 'directory';
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
        ...(kind === 'symlink' ? { target: join(central, name) } : {}),
        agents: owners.sort(),
        exists: !!info,
      });
    }
  }
  for (let i = 0; i < targets.length; i++)
    for (let j = i + 1; j < targets.length; j++)
      if (overlap(targets[i].path, targets[j].path))
        throw unsafe('Installation target directories overlap.');
  const projectPath = request.scope === 'project' ? base : undefined;
  const previous = records.installations.filter(
    (i) => i.scope === request.scope && i.projectPath === projectPath,
  );
  const preservedInstallations = await preserveInstallations(
    records,
    request.scope,
    projectPath,
    agents,
    e,
  );
  // A path still owned or referenced by another installation must remain available.
  const retained = new Set(targets.map((t) => t.path));
  for (const installation of [
    ...records.installations.filter((i) => !previous.includes(i)),
    ...preservedInstallations,
  ]) {
    const root = installation.projectPath ?? (await realpath(e.homeDir));
    for (const target of installation.targets) {
      retained.add(await recordedTargetPath(root, target.path));
      if (target.target) retained.add(await recordedTargetPath(root, target.target));
    }
  }
  const obsoleteTargets: string[] = [];
  for (const target of previous
    .flatMap((record) => record.targets)
    .sort((a, b) =>
      a.kind === b.kind ? a.path.localeCompare(b.path) : a.kind === 'symlink' ? -1 : 1,
    )) {
    const recorded = resolve(base, target.path);
    if (retained.has(recorded)) continue;
    try {
      if (!(await entry(recorded))) continue;
    } catch (error) {
      if (missingRecordedPath(error)) continue;
      throw error;
    }
    const path = await physicalParent(recorded);
    if (retained.has(path) || obsoleteTargets.includes(path)) continue;
    if (
      overlap(source, path) ||
      contains(path, recordPath) ||
      contains(path, await physicalPath(e.paneonHome)) ||
      contains(path, base) ||
      [...retained].some((other) => overlap(path, other))
    )
      throw new PaneonError(
        'SKILL_INSTALL_UNSAFE_PATH',
        'A previous installation target overlaps protected paths.',
        { path },
      );
    obsoleteTargets.push(path);
  }
  return {
    scope: request.scope,
    ...(request.scope === 'project' ? { projectPath: base } : {}),
    method,
    agents,
    paneonVersion: e.packageVersion,
    sourcePath: source,
    recordPath,
    targets,
    obsoleteTargets,
    preservedInstallations,
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
async function storedRecord(
  plan: InstallPlan,
  agent: string,
  e: InstallEnvironment,
): Promise<InstallationRecord> {
  const base = plan.projectPath ?? (await realpath(e.homeDir));
  return {
    scope: plan.scope,
    ...(plan.projectPath ? { projectPath: plan.projectPath } : {}),
    paneonVersion: plan.paneonVersion,
    agents: [agent],
    method: plan.method,
    targets: withLinkSources(
      plan.targets,
      plan.targets.filter((t) => t.agents.includes(agent)),
    ).map((t) => ({
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
  const removed: string[] = [];
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
    records.installations = [
      ...records.installations.filter(
        (i) => i.scope !== fresh.scope || i.projectPath !== fresh.projectPath,
      ),
      ...fresh.preservedInstallations,
      ...(await Promise.all(fresh.agents.map((agent) => storedRecord(fresh, agent, e)))),
    ];
    validateRecord(records);
    // Prepare source and metadata before removing any existing skill directory.
    staging = await mkdtemp(join(dirname(fresh.recordPath), '.skill-install-'));
    const stagedSource = join(staging, 'skills');
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
          await cp(join(stagedSource, basename(target.path)), target.path, {
            recursive: true,
            dereference: false,
            verbatimSymlinks: true,
          });
      }
      completed.push(target.path);
    }
    // Keep the old installation until every new skill has been installed successfully.
    for (const path of fresh.obsoleteTargets) {
      if ((await physicalParent(path)) !== path)
        throw unsafe(`A previous installation target parent changed during installation: ${path}`);
      await rm(path, { recursive: true, force: true });
      removed.push(path);
    }
    await rename(pending, fresh.recordPath);
    pending = undefined;
    return {
      scope: fresh.scope,
      ...(fresh.projectPath ? { projectPath: fresh.projectPath } : {}),
      method: fresh.method,
      paneonVersion: fresh.paneonVersion,
      recordPath: fresh.recordPath,
      removedTargets: removed,
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
        removedTargets: removed,
      },
    );
  } finally {
    if (pending) await rm(pending, { force: true }).catch(() => {});
    if (staging) await rm(staging, { recursive: true, force: true }).catch(() => {});
    if (unlock) await unlock();
  }
}
