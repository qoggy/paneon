import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
export type PullRequest = {
  number: number;
  title: string;
  state: string;
  headRefName: string;
  url: string;
};
export type PullRequestDetail = PullRequest & {
  body: string;
  baseRefName: string;
  isDraft: boolean;
};
export type Repository = { nameWithOwner: string; description: string; url: string };
async function ghJson<T>(args: string[]): Promise<T> {
  const { stdout } = await execute('gh', args, { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
  return JSON.parse(stdout) as T;
}
export async function repositoryPullRequests(repository: string) {
  const [repo, pullRequests] = await Promise.all([
    ghJson<Repository>(['repo', 'view', repository, '--json', 'nameWithOwner,description,url']),
    ghJson<PullRequest[]>([
      'pr',
      'list',
      '--repo',
      repository,
      '--limit',
      '30',
      '--json',
      'number,title,state,headRefName,url',
    ]),
  ]);
  return { repository: repo, pullRequests };
}
export async function pullRequestDetail(repository: string, number: number) {
  return ghJson<PullRequestDetail>([
    'pr',
    'view',
    String(number),
    '--repo',
    repository,
    '--json',
    'number,title,state,headRefName,url,body,baseRefName,isDraft',
  ]);
}
