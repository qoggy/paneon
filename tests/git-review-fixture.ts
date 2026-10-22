import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, rename, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export const git = async (root: string, ...args: string[]) =>
  (await exec('git', ['-C', root, ...args])).stdout.trim();
export async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'paneon-git-'));
  const repo = join(root, 'web'),
    second = join(root, 'server'),
    empty = join(root, 'empty');
  for (const dir of [repo, second, empty]) {
    await mkdir(dir);
    await git(dir, 'init', '-q', '-b', 'main');
    await git(dir, 'config', 'user.name', 'Fixture');
    await git(dir, 'config', 'user.email', 'fixture@example.test');
    await git(dir, 'config', 'core.autocrlf', 'false');
  }
  const original = 'const 标题 = "缓存 缓存🙂";\r\nconst n = 1;\r\nlast';
  await writeFile(join(repo, 'a.ts'), original);
  await writeFile(join(repo, 'old name\nfile.txt'), 'rename me\n');
  await writeFile(join(repo, 'tracked.log'), 'old\n');
  await git(repo, 'add', '.');
  await git(repo, 'commit', '-qm', 'root');
  const rootCommit = await git(repo, 'rev-parse', 'HEAD');
  await git(repo, 'branch', 'base');
  await writeFile(join(repo, 'a.ts'), original.replace('n = 1', 'n = 2'));
  await git(repo, 'commit', '-qam', 'feature');
  const feature = await git(repo, 'rev-parse', 'HEAD');
  await writeFile(join(repo, 'a.ts'), original.replace('n = 1', 'n = 3'));
  await git(repo, 'add', 'a.ts');
  await writeFile(join(repo, 'a.ts'), original.replace('n = 1', 'n = 4'));
  await rename(join(repo, 'old name\nfile.txt'), join(repo, 'new name\nfile.txt'));
  await git(repo, 'add', '--', 'old name\nfile.txt', 'new name\nfile.txt');
  await writeFile(join(repo, '.gitignore'), '*.log\n');
  await writeFile(join(repo, 'ignored.log'), 'invisible');
  await writeFile(join(repo, 'tracked.log'), 'tracked remains visible\n');
  await writeFile(join(repo, 'untracked\nspace.txt'), 'untracked\r\n');
  await writeFile(join(repo, 'binary.bin'), Buffer.from([0, 255, 4]));
  await symlink('/etc/passwd', join(repo, 'outside-link'));
  await writeFile(join(second, 'a.ts'), 'server-only\n');
  return {
    root,
    repo,
    second,
    empty,
    rootCommit,
    feature,
    original,
    async close() {
      await rm(root, { recursive: true, force: true });
    },
  };
}
