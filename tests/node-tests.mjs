import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = new URL('./', import.meta.url);
const files = (await readdir(directory))
  .filter((file) => file.endsWith('.test.ts'))
  .sort()
  .map((file) => fileURLToPath(new URL(file, directory)));
const concurrency = process.env.PANEON_TEST_CONCURRENCY ?? '6';
console.log(`Node test concurrency: ${concurrency}`);
const result = spawnSync(
  process.execPath,
  ['--test', `--test-concurrency=${concurrency}`, ...files],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
