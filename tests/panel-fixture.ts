import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PACKAGE_VERSION } from '../dist/shared/paths.js';

export { PACKAGE_VERSION };

// Keep the generated requires.paneon value literal for the compiler's static preflight.
export async function readPanelFixture(path: string | URL, version = PACKAGE_VERSION) {
  return (await readFile(path, 'utf8')).replaceAll('__PANEON_TEST_VERSION__', version);
}

export async function copyPanelFixtures(
  source: string | URL,
  destination: string,
  version = PACKAGE_VERSION,
) {
  await cp(source, destination, { recursive: true });
  for (const name of await readdir(destination)) {
    if (name.endsWith('.tsx')) {
      const path = join(destination, name);
      await writeFile(path, await readPanelFixture(path, version));
    }
  }
}
