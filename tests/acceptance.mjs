import { join } from 'node:path';
import { acceptance, repositoryRoot } from './acceptance-support.mjs';

await acceptance({
  cliPath: join(repositoryRoot, 'dist/cli/index.js'),
  fixturesPath: join(repositoryRoot, 'tests/fixtures/panels'),
});
