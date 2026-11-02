import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { promisify } from 'node:util';
import { repository } from './git.ts';
import { gitCheckoutInputSchema } from './schema.ts';
import type { GitCheckoutInput } from './schema.ts';

const exec = promisify(execFile);
export type CheckoutReason =
  | 'dirty'
  | 'in-progress'
  | 'stale'
  | 'current'
  | 'local-exists'
  | 'symbolic-remote'
  | 'remote-unavailable'
  | 'verification-failed'
  | 'git-error';
class CheckoutRejected extends Error {
  reason: CheckoutReason;
  constructor(reason: CheckoutReason) {
    super(reason);
    this.reason = reason;
  }
}

/** Conservative checkout policy belongs to this panel, not the Paneon runtime. */
export async function checkoutGit(value: GitCheckoutInput, signal?: AbortSignal) {
  const input = gitCheckoutInputSchema.parse(value);
  try {
    const root = await repository(input.params, input.repositoryId, signal);
    const run = async (...args: string[]) =>
      (
        await exec('git', ['-C', root, ...args], {
          encoding: 'utf8',
          maxBuffer: 4 * 1024 * 1024,
          signal,
        })
      ).stdout.trim();
    const symbolicRef = async (ref: string) => {
      try {
        return await run('symbolic-ref', '--quiet', ref);
      } catch (error) {
        if ((error as { code?: number }).code === 1) return null;
        throw error;
      }
    };
    const head = async () => ({
      branch: (await symbolicRef('HEAD'))?.replace(/^refs\/heads\//, '') ?? null,
      commit: await run('rev-parse', '--verify', 'HEAD^{commit}'),
    });
    // Resolve Git's own paths, including linked worktrees. Empty merge commits can
    // leave a clean status while an operation is still in progress.
    for (const name of [
      'MERGE_HEAD',
      'CHERRY_PICK_HEAD',
      'REVERT_HEAD',
      'rebase-merge',
      'rebase-apply',
      'sequencer',
      'BISECT_LOG',
      'index.lock',
    ]) {
      const path = await run('rev-parse', '--git-path', name);
      const exists = await lstat(isAbsolute(path) ? path : resolve(root, path)).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return false;
          throw error;
        },
      );
      if (exists) throw new CheckoutRejected('in-progress');
    }
    if (
      await run(
        'status',
        '--porcelain=v1',
        '-z',
        '--untracked-files=all',
        '--ignore-submodules=none',
      )
    )
      throw new CheckoutRejected('dirty');
    const before = await head();
    if (before.branch !== input.expectedHead.branch || before.commit !== input.expectedHead.commit)
      throw new CheckoutRejected('stale');
    const { target } = input;
    // Validate the exact ref, not DWIM resolution of a short branch/tag name.
    await run('check-ref-format', target.ref);
    const commit = await run('rev-parse', '--verify', '--end-of-options', `${target.ref}^{commit}`);
    if (commit !== target.commit) throw new CheckoutRejected('stale');
    let branch = '';
    if (target.kind === 'branch') {
      branch = target.ref.slice('refs/heads/'.length);
      await run('check-ref-format', '--branch', branch);
      if (branch === before.branch) throw new CheckoutRejected('current');
    } else if (target.kind === 'remote') {
      if (await symbolicRef(target.ref)) throw new CheckoutRejected('symbolic-remote');
      const name = target.ref.slice('refs/remotes/'.length);
      const remotes = (await run('remote'))
        .split('\n')
        .filter((remote) => remote && name.startsWith(`${remote}/`));
      if (remotes.length !== 1) throw new CheckoutRejected('remote-unavailable');
      branch = name.slice(remotes[0].length + 1);
      await run('check-ref-format', '--branch', branch);
      const existing = await run('for-each-ref', '--format=%(refname)', `refs/heads/${branch}`);
      if (existing.split('\n').includes(`refs/heads/${branch}`))
        throw new CheckoutRejected('local-exists');
    }
    // A trailing -- prevents path checkout; no force/reset/merge/stash and no
    // implicit recursion into submodules, even if configured globally.
    const args = ['checkout', '--no-guess', '--no-overwrite-ignore', '--no-recurse-submodules'];
    if (target.kind === 'remote') args.push('-b', branch, '--track', target.ref);
    else if (target.kind === 'tag') args.push('--detach', commit);
    else args.push(branch);
    await run(...args, '--');
    const after = await head();
    if (after.branch !== (target.kind === 'tag' ? null : branch) || after.commit !== commit)
      throw new CheckoutRejected('verification-failed');
    if (
      target.kind === 'remote' &&
      (await run('for-each-ref', '--format=%(upstream)', `refs/heads/${branch}`)) !== target.ref
    )
      throw new CheckoutRejected('verification-failed');
    return {
      ok: true as const,
      data: {
        operationId: randomUUID(),
        repositoryPath: root,
        target,
        before,
        after,
      },
    };
  } catch (error) {
    if (error instanceof CheckoutRejected)
      return { ok: false as const, reason: error.reason, message: '' };
    const failure = error as Error & { stderr?: string };
    return {
      ok: false as const,
      reason: 'git-error' as const,
      message: failure.stderr?.trim() || failure.message || String(error),
    };
  }
}
