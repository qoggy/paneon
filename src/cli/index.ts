#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Command } from 'commander';

const packageJson: unknown = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

if (
  typeof packageJson !== 'object' ||
  packageJson === null ||
  !('version' in packageJson) ||
  typeof packageJson.version !== 'string'
) {
  throw new Error('Invalid package version');
}

const program = new Command();

program
  .name('paneon')
  .description('Code-first interactive interfaces for coding agents.')
  .version(packageJson.version);

program.parse();
