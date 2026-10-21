import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
export type ReleaseState = {
  environment: string;
  branches: string[];
  step: number;
  history: string[];
};

// This adapter belongs to this example, not to Paneon. No shell interpolation.
export async function releaseCommand(
  command: 'status' | 'integrate' | 'advance',
  environment: string,
  branch = '',
): Promise<ReleaseState> {
  const { stdout } = await run(
    process.execPath,
    [resolve('examples/demo-release-cli.mjs'), command, environment, branch],
    { maxBuffer: 1024 * 1024, timeout: 10_000 },
  );
  return JSON.parse(stdout) as ReleaseState;
}
