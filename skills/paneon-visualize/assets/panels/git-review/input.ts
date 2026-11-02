import type { GitRequest } from './git.ts';
import type { GitRepository, GitReviewParams } from './schema.ts';

/** Create identities once per browser session; navigation still uses the internal Git protocol. */
export function createReviewInput(input: GitReviewParams): {
  repositories: GitRepository[];
  request: GitRequest;
} {
  const repositories = input.repositories.map((path) => ({ id: crypto.randomUUID(), path }));
  if (!input.initialView)
    return { repositories, request: { repositoryId: repositories[0].id, type: 'changes' } };
  const { repositoryPath, ...view } = input.initialView;
  const repository = repositories[input.repositories.indexOf(repositoryPath)];
  return { repositories, request: { ...view, repositoryId: repository.id } };
}

/** Names are presentation only: adding/removing a name collision never changes identities. */
export function repositoryLabels(repositories: GitRepository[]): Map<string, string> {
  const paths = repositories.map(({ path }) => path.replace(/\\/g, '/').replace(/\/$/, '') || '/');
  const segments = paths.map((path) => path.split('/').filter(Boolean));
  const suffix = (index: number, depth: number) =>
    depth > segments[index].length ? paths[index] : segments[index].slice(-depth).join('/');
  return new Map(
    repositories.map((repository, index) => {
      let depth = 1;
      while (
        depth <= segments[index].length &&
        paths.some((_, other) => other !== index && suffix(other, depth) === suffix(index, depth))
      )
        depth++;
      return [repository.id, suffix(index, depth)];
    }),
  );
}
