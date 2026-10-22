import { GitHubReview } from '../skills/paneon/assets/examples/github-pr/github.ts';
const repository = process.env.PANEON_LIVE_REPOSITORY ?? 'cli/cli',
  number = Number(process.env.PANEON_LIVE_PR ?? '14768');
const client = new GitHubReview(),
  session = `live-${Date.now()}`;
const list = await client.list(repository, { limit: 2 });
const { detail } = await client.detail(repository, session, number);
const comparison = await client.comparison(repository, session, detail.id);
const checks = await client.checks(repository, session, detail.id);
const file = comparison.files[0]
  ? await client.diff(repository, session, comparison.id, comparison.files[0].filename)
  : undefined;
console.log(
  JSON.stringify(
    {
      repository,
      number,
      listed: list.items.map((pr) => pr.number),
      baseCommit: comparison.baseCommit,
      headCommit: comparison.headCommit,
      mergeBaseCommit: comparison.mergeBaseCommit,
      headOwner: detail.headRepositoryOwner?.login,
      returnedFiles: comparison.files.length,
      reportedFiles: comparison.reportedFiles,
      complete: comparison.complete,
      checks: checks.snapshots.map((snapshot) =>
        snapshot.source.kind === 'check'
          ? {
              key: snapshot.source.key,
              name: snapshot.source.name,
              status: snapshot.source.status,
              conclusion: snapshot.source.conclusion,
            }
          : null,
      ),
      file: file?.source,
      oldCharacters: file?.model?.oldText?.length,
      newCharacters: file?.model?.newText?.length,
      hunks: file?.model?.hunks.length,
    },
    null,
    2,
  ),
);
