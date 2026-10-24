#!/usr/bin/env node
// An application-owned demonstration CLI. It never deploys anything.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [command = 'status', environment = 'staging', branch = ''] = process.argv.slice(2);
const statePath = resolve('.paneon-demo-release.json');
const initial = () => ({
  environments: {
    staging: { branches: ['feature/search', 'fix/navigation'], step: 0, history: [] },
    preview: { branches: [], step: 0, history: [] },
  },
});
try {
  let state;
  try {
    state = JSON.parse(await readFile(statePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = initial();
  }
  if (command === 'reset') state = initial();
  const current = state.environments[environment];
  if (!current) throw new Error('Choose staging or preview.');
  if (command === 'integrate') {
    if (!branch.trim()) throw new Error('A branch is required.');
    if (!current.branches.includes(branch)) current.branches.push(branch);
    current.history.push(`Added ${branch}`);
  } else if (command === 'advance') {
    if (!current.branches.length) throw new Error('Add a branch before advancing.');
    current.step = Math.min(current.step + 1, 4);
    current.history.push(`Completed step ${current.step}`);
  } else if (command !== 'status' && command !== 'reset') {
    throw new Error('Use status, integrate, advance, or reset.');
  }
  if (command !== 'status') await writeFile(statePath, JSON.stringify(state, null, 2));
  console.log(JSON.stringify({ environment, ...current }));
} catch (error) {
  console.error(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
}
