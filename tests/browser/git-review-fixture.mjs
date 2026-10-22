import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from '../git-review-fixture.ts';
export async function startGitReviewFixture() {
  const f = await fixture();
  let service;
  try {
    const { startServer } = await import(
      process.env.PANEON_TEST_RUNTIME_ENTRY ??
        new URL('../../dist/runtime/server.js', import.meta.url).href
    );
    const skill = join(f.root, 'agent-skills/paneon');
    await cp(
      process.env.PANEON_TEST_SKILL_SOURCE ?? new URL('../../skills/paneon', import.meta.url),
      skill,
      { recursive: true },
    );
    service = await startServer(join(f.root, '.paneon'));
    const params = {
      title: 'Git review acceptance',
      repositories: [
        { id: 'web', path: './web', label: 'Web' },
        { id: 'server', path: './server', label: 'Server' },
      ],
      initialView: { repositoryId: 'web', type: 'changes', file: 'a.ts' },
    };
    const run = (input = params) =>
      service.runtime.run(join(skill, 'assets/panels/git-review/panel.tsx'), f.root, input, false);
    const panel = await run();
    return {
      ...f,
      service,
      params,
      panel,
      run,
      url: (p = panel) => `http://127.0.0.1:${service.descriptor.port}/panels/${p.instanceId}`,
      async events(p = panel) {
        return (await service.runtime.events(p.instanceId, 'acceptance', 100, 0)).events;
      },
      async stop() {
        await service.stop();
        await f.close();
      },
    };
  } catch (error) {
    await service?.stop();
    await f.close();
    throw error;
  }
}

/** Real commits and files for layout regressions; does not change the semantic Git fixture. */
export async function createLayoutRepository(root) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { mkdir, writeFile } = await import('node:fs/promises');
  const execute = promisify(execFile);
  const repository = join(root, 'layout-repo');
  await mkdir(repository);
  const git = async (...args) => (await execute('git', ['-C', repository, ...args])).stdout.trim();
  await git('init', '-q', '-b', 'main');
  await git('config', 'user.email', 'layout@example.test');
  await git('config', 'user.name', 'Layout reviewer');
  const filename = `packages/${'long-directory-'.repeat(4)}/${'very-long-component-'.repeat(5)}.ts`;
  await mkdir(join(repository, filename, '..'), { recursive: true });
  const code = (version) =>
    `const ${version}Value = "${'long_code_segment_'.repeat(100)}${version.toUpperCase()}_END";\nconst second = ${version === 'old' ? 1 : 2};\nlast ${version}`;
  await writeFile(join(repository, filename), code('old'));
  for (let i = 0; i < 72; i++)
    await writeFile(
      join(repository, `file-${String(i).padStart(3, '0')}.ts`),
      `export const value = ${i};\n`,
    );
  await git('add', '.');
  await git('commit', '-qm', 'Create layout baseline');
  const base = await git('rev-parse', 'HEAD');
  await git('branch', 'base');
  for (let i = 0; i < 53; i++) {
    await execute(
      'git',
      [
        '-C',
        repository,
        '-c',
        `user.name=${i % 2 ? 'A' : 'Author with a much longer display name'}`,
        'commit',
        '--allow-empty',
        '-qm',
        `Change ${i}: ${'A deliberately long commit subject describing the change '.repeat(4)}`,
      ],
      {
        env: {
          ...process.env,
          GIT_AUTHOR_DATE: `2026-10-${String(1 + (i % 20)).padStart(2, '0')}T12:34:00+08:00`,
          GIT_COMMITTER_DATE: `2026-10-${String(1 + (i % 20)).padStart(2, '0')}T12:34:00+08:00`,
        },
      },
    );
  }
  await writeFile(join(repository, filename), code('new'));
  for (let i = 0; i < 72; i++)
    await writeFile(
      join(repository, `file-${String(i).padStart(3, '0')}.ts`),
      `export const value = ${i + 1};\n`,
    );
  await git('add', '.');
  await git(
    'commit',
    '-qm',
    `Inspect long code and many changed files: ${'long subject '.repeat(20)}`,
  );
  return { repository, filename, base, tip: await git('rev-parse', 'HEAD') };
}

/** A real fork/merge with local, remote and annotated/lightweight tag decorations. */
export async function createGraphRepository(root) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { mkdir, writeFile } = await import('node:fs/promises');
  const execute = promisify(execFile);
  const repository = join(root, 'graph-repo');
  await mkdir(repository);
  const git = async (...args) => (await execute('git', ['-C', repository, ...args])).stdout.trim();
  await git('init', '-q', '-b', 'main');
  await git('config', 'user.name', 'Paneon reviewer');
  await git('config', 'user.email', 'reviewer@example.test');
  await writeFile(join(repository, 'README.md'), '# Review workbench\n');
  await git('add', '.');
  await git('commit', '-qm', 'Create the review workbench');
  await git('checkout', '-qb', 'feature/cache');
  await writeFile(join(repository, 'cache.ts'), 'export const cache = new Map();\n');
  await git('add', '.');
  await git('commit', '-qm', 'Keep loaded snapshots while navigating');
  await writeFile(join(repository, 'cache.test.ts'), '// Keep snapshots on a failed query.\n');
  await git('add', '.');
  await git('commit', '-qm', 'Cover query failures and retained snapshots');
  await git('checkout', '-q', 'main');
  await writeFile(join(repository, 'history.ts'), 'export const rowHeight = 36;\n');
  await git('add', '.');
  await git('commit', '-qm', 'Add a compact commit history');
  await git('merge', '-q', '--no-ff', 'feature/cache', '-m', 'Merge feature/cache into main');
  const merge = await git('rev-parse', 'HEAD');
  await git('tag', 'v0.1.0');
  await git('tag', '-am', 'Reviewed release', 'reviewed');
  await git('update-ref', 'refs/remotes/origin/main', merge);
  await git('checkout', '-qb', 'feature/history');
  await writeFile(join(repository, 'history.ts'), 'export const rowHeight = 28;\n');
  const message =
    'Render commit graph and branch labels\n\nKeep the selected branch at the top.\nPreserve <plain text> and 中文.\n\nAdd regression coverage for navigation and paging.';
  await git('commit', '-qam', message);
  const tip = await git('rev-parse', 'HEAD');
  const unrelated = await git(
    'commit-tree',
    await git('rev-parse', 'HEAD^{tree}'),
    '-p',
    merge,
    '-m',
    'Unmerged work on another branch',
  );
  await git('update-ref', 'refs/heads/feature/unmerged', unrelated);
  return { repository, merge, tip, unrelated, message };
}
