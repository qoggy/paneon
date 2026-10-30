import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createPackageFixture } from '../package-fixture.mjs';

// Reuse the interaction suites while blocking external assets in their real browser pages.
const offlineBrowser = `
import assert from 'node:assert/strict';
import {chromium} from ${JSON.stringify(import.meta.resolve('playwright'))};
const external = [];
const launch = chromium.launch.bind(chromium);
chromium.launch = async (options) => {
  const browser = await launch(options);
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (options) => {
    const page = await newPage(options);
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (['http:', 'https:'].includes(url.protocol) &&
          !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
        external.push(url.origin);
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    return page;
  };
  return browser;
};
await import(process.argv[1]);
assert.deepEqual(external, [], 'Installed code UI must not request external assets.');
console.log('Installed code UI completed without external asset requests.');
`;

const root = await mkdtemp(join(tmpdir(), 'paneon-code-block-pack-'));
try {
  const { metadata, packageRoot } = await createPackageFixture(root);
  const files = new Set(metadata.files.map((entry) => entry.path));
  for (const path of ['dist/ui/index.js', 'dist/ui/theme.css'])
    assert.ok(files.has(path), `Missing packaged resource: ${path}`);
  for (const file of ['./code-block.mjs', './markdown-highlighting.mjs']) {
    console.log(`Installed offline browser verification: ${file}`);
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--input-type=module', '--eval', offlineBrowser, new URL(file, import.meta.url).href],
      {
        cwd: root,
        env: {
          ...process.env,
          PANEON_TEST_RUNTIME_ENTRY: pathToFileURL(join(packageRoot, 'dist/runtime/server.js'))
            .href,
          PANEON_TEST_SKILL_SOURCE: join(packageRoot, 'skills/paneon'),
          PANEON_TEST_CLI_ENTRY: join(packageRoot, 'dist/cli/index.js'),
        },
        timeout: 180_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    console.log(stdout.trim());
  }
  console.log(
    'Independent npm installation: CodeBlock and Markdown highlighting, copy/wrap controls, themes and exact annotations passed without external assets.',
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
