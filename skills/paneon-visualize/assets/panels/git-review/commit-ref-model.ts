import type { CommitDecoration } from './git.ts';

const kinds = ['branch', 'remote', 'tag', 'head'] as const;

export function groupCommitRefs(
  refs: readonly CommitDecoration[],
  currentBranch?: string,
  mainlines: readonly string[] = [],
) {
  const priority = (ref: CommitDecoration) =>
    ref.kind === 'branch' && ref.name === currentBranch
      ? 2
      : (ref.kind === 'branch' || ref.kind === 'remote') && mainlines.includes(ref.name)
        ? 1
        : 0;
  return kinds.flatMap((kind) => {
    const entries = refs
      .filter((ref) => ref.kind === kind)
      .sort((a, b) => priority(b) - priority(a));
    return entries.length ? [{ kind, refs: entries }] : [];
  });
}

export function commitRefRevision(ref: CommitDecoration) {
  return ref.kind === 'head'
    ? 'HEAD'
    : `refs/${{ branch: 'heads', remote: 'remotes', tag: 'tags' }[ref.kind]}/${ref.name}`;
}

export function summarizeCommitRefs(
  refs: readonly CommitDecoration[],
  currentBranch?: string,
  mainlines: readonly string[] = [],
) {
  const branches = refs.filter((ref) => ref.kind === 'branch');
  const branch =
    branches.find((ref) => ref.name === currentBranch) ??
    branches.find((ref) => mainlines.includes(ref.name)) ??
    branches[0];
  const remotes = refs.filter((ref) => ref.kind === 'remote');
  if (branch) {
    const roots = [...new Set(remotes.map((ref) => ref.name.split('/')[0]))];
    return roots.length ? `${roots.join(', ')} & ${branch.name}` : branch.name;
  }
  return refs.find((ref) => ref.kind === 'tag')?.name ?? remotes[0]?.name ?? refs[0]?.name ?? '';
}
