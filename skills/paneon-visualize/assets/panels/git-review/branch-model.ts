import type { HistoryRef } from './git.ts';

/** Prefer recorded remote defaults; conventional names are only an offline heuristic. */
export function markMainlines(refs: HistoryRef[], defaults: ReadonlyMap<string, string>) {
  const names = ['main', 'master', 'trunk'];
  const localNames = new Set(refs.filter((ref) => ref.kind === 'branch').map((ref) => ref.name));
  const targets = [...defaults.values()].map((ref) => ref.replace(/^refs\/remotes\/[^/]+\//, ''));
  const preferred = defaults.get('origin')?.replace(/^refs\/remotes\/origin\//, '');
  const local = preferred
    ? preferred
    : targets.length
      ? targets.find((name) => localNames.has(name))
      : names.find((name) => localNames.has(name));
  const remotes = new Map<string, string>();
  const remoteRefs = refs.filter((entry) => entry.kind === 'remote');
  const existing = new Set(remoteRefs.map((entry) => entry.ref));
  for (const remote of new Set(remoteRefs.map((entry) => entry.name.split('/')[0]))) {
    const recorded = defaults.get(remote);
    const conventional = names
      .map((name) => `refs/remotes/${remote}/${name}`)
      .find((ref) => existing.has(ref));
    const mainline = recorded ?? conventional;
    if (mainline) remotes.set(remote, mainline);
  }
  return refs.map((entry): HistoryRef => ({
    ...entry,
    ...(entry.kind === 'branch' && entry.name === local
      ? { mainline: true }
      : entry.kind === 'remote' && entry.ref === remotes.get(entry.name.split('/')[0])
        ? { mainline: true }
        : {}),
  }));
}
