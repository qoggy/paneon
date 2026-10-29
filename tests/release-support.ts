export interface ReleaseJob {
  name: string;
  resources?: string[];
  covers?: string[];
}

/** Omit a standalone suite only when its complete caller is also selected. */
export function deduplicateJobs<T extends ReleaseJob>(jobs: T[]): T[] {
  const covered = new Set(jobs.flatMap((job) => job.covers ?? []));
  return jobs.filter((job) => !covered.has(job.name));
}

/** Bound process concurrency and serialize jobs sharing a machine resource. */
export async function runJobs<T extends ReleaseJob>(
  jobs: T[],
  concurrency: number,
  execute: (job: T) => Promise<void>,
  stopped: () => boolean = () => false,
): Promise<void> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1)
    throw new Error('Concurrency must be a positive integer.');
  const pending = [...jobs];
  const running = new Set<Promise<void>>();
  const locked = new Set<string>();
  let failure: Error | undefined;
  while ((pending.length && !stopped() && !failure) || running.size) {
    while (!stopped() && !failure && running.size < concurrency) {
      const index = pending.findIndex((job) =>
        (job.resources ?? []).every((resource) => !locked.has(resource)),
      );
      if (index < 0) break;
      const [job] = pending.splice(index, 1);
      const resources = job.resources ?? [];
      for (const resource of resources) locked.add(resource);
      const task = Promise.resolve()
        .then(() => execute(job))
        .catch((error: unknown) => {
          failure =
            error instanceof Error ? error : new Error('Release job failed.', { cause: error });
        })
        .finally(() => {
          for (const resource of resources) locked.delete(resource);
          running.delete(task);
        });
      running.add(task);
    }
    if (running.size) await Promise.race(running);
  }
  if (failure) throw failure;
}
