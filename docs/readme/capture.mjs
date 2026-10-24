// Regenerate README media after `npm run build`:
// node docs/readme/capture.mjs (requires Chrome and ffmpeg).
// Add --explanation-only to replace just the opening GIF.
// Uses real panels, demonstration data, and an isolated temporary service.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { startServer } from '../../dist/runtime/server.js';

const execute = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'paneon-readme-'));
const output = fileURLToPath(new URL('./', import.meta.url));
const skill = join(root, 'skill');
let service, browser;
try {
  await cp(new URL('../../skills/paneon/', import.meta.url), skill, { recursive: true });
  service = await startServer(join(root, 'runtime'));
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const frame = page.frameLocator('iframe');
  const button = (name) => frame.getByRole('button', { name, exact: true });
  async function open(name, params) {
    const panel = await service.runtime.run(
      join(skill, `assets/panels/${name}/panel.tsx`),
      root,
      params,
      false,
    );
    await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
    await frame.locator('main').waitFor();
    return panel;
  }
  async function shot(path, clip) {
    await frame.locator('body').evaluate(() => document.fonts.ready.then(() => undefined));
    await page.screenshot({ path, clip, animations: 'disabled' });
  }

  console.log('Capturing left-fork-first execution: consecutive steps 7–15');
  const example = join(skill, 'assets/examples/dining-philosophers');
  const simulation = await service.runtime.run(join(example, 'panel.tsx'), root, {}, false);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${simulation.instanceId}`);
  await frame.getByRole('heading', { name: 'Dining philosophers', exact: true }).waitFor();
  const frames = [];
  const still = async (seconds) => {
    const filename = join(root, `explain-${frames.length}.png`);
    await shot(filename, { x: 48, y: 0, width: 1184, height: 880 });
    frames.push({ filename, seconds });
  };
  const strategy = frame.getByRole('radio', { name: 'Left fork first', exact: true });
  await strategy.click();
  assert.equal(await strategy.getAttribute('aria-checked'), 'true');
  // Prepare steps 1–6 off camera, then capture every consecutive step from 7–15.
  // Keep the strategy and framing fixed throughout the recording.
  for (let step = 1; step <= 15; step++) {
    await button('Next step').click();
    assert.equal(await frame.getByTestId('step-counter').textContent(), `${step} / 15`);
    assert.equal(await strategy.getAttribute('aria-checked'), 'true');
    if (step >= 7) await still(step === 15 ? 3 : 1);
  }
  assert.equal(await frame.locator('[data-next-edge][data-edge-state="deadlock"]').count(), 5);
  assert.match(await frame.getByTestId('simulation-status').textContent(), /Deadlock/);
  assert.equal(
    (await service.runtime.events(simulation.instanceId, 'readme', 10, 0)).events.length,
    0,
  );
  if (process.env.PANEON_README_ARTIFACTS) {
    await mkdir(process.env.PANEON_README_ARTIFACTS, { recursive: true });
    for (const index of [0, 3, 8])
      await cp(
        frames[index].filename,
        join(process.env.PANEON_README_ARTIFACTS, `frame-${index}.png`),
      );
  }
  const manifest = join(root, 'frames.txt');
  await writeFile(
    manifest,
    frames.map(({ filename, seconds }) => `file '${filename}'\nduration ${seconds}\n`).join('') +
      `file '${frames.at(-1).filename}'\n`,
  );
  await execute('ffmpeg', [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    manifest,
    '-filter_complex',
    '[0:v]fps=8,scale=1080:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
    '-t',
    String(frames.reduce((duration, frame) => duration + frame.seconds, 0)),
    '-loop',
    '0',
    join(output, 'interactive-explanation.gif'),
  ]);
  await page.setViewportSize({ width: 1280, height: 800 });

  if (!process.argv.includes('--explanation-only')) {
    console.log('Capturing real Git history and annotation');
    const repository = join(root, 'search-app');
    await mkdir(join(repository, 'src'), { recursive: true });
    const git = (...args) => execute('git', ['-C', repository, ...args]);
    await git('init', '-q', '-b', 'main');
    await git('config', 'user.name', 'Alex Morgan');
    await git('config', 'user.email', 'alex@example.invalid');
    await writeFile(join(repository, 'README.md'), '# Search app\n');
    await git('add', '.');
    await git('commit', '-qm', 'Create search workspace');
    const before = `type SearchResult = { title: string; url: string };\n\nexport async function search(\n  query: string,\n  limit = 20,\n): Promise<SearchResult[]> {\n  const params = new URLSearchParams({\n    q: query,\n    limit: String(limit),\n  });\n\n  const response = await fetch('/api/search?' + params);\n  return response.json();\n}\n`;
    await writeFile(join(repository, 'src/search.ts'), before);
    await git('add', '.');
    await git('commit', '-qm', 'Add search results endpoint');
    await git('checkout', '-qb', 'feature/search-validation');
    await writeFile(
      join(repository, 'src/search.test.ts'),
      '// Cover blank queries and result limits.\n',
    );
    await git('add', '.');
    await git('commit', '-qm', 'Cover query validation and result limits');
    await git('checkout', '-q', 'main');
    await writeFile(join(repository, 'src/config.ts'), 'export const searchEnabled = true;\n');
    await git('add', '.');
    await git('commit', '-qm', 'Enable search for the pilot');
    await git(
      'merge',
      '-q',
      '--no-ff',
      'feature/search-validation',
      '-m',
      'Merge search validation coverage',
    );
    await git('tag', 'v0.1.0');
    await git('checkout', '-qb', 'feature/search-limits');
    const after = before
      .replace(
        '  const params',
        '  const text = query.trim();\n  if (!text) return [];\n  const safeLimit = Math.min(50, Math.max(1, limit));\n\n  const params',
      )
      .replace('q: query', 'q: text')
      .replace('String(limit)', 'String(safeLimit)');
    await writeFile(join(repository, 'src/search.ts'), after);
    await git('commit', '-qam', 'Validate search input before sending a request');
    const tip = (await git('rev-parse', 'HEAD')).stdout.trim();
    await git('update-ref', 'refs/remotes/origin/main', 'main');
    await open('git-review', {
      title: 'Review search input validation',
      repositories: [{ id: 'search', path: './search-app', label: 'Search app' }],
      initialView: { repositoryId: 'search', type: 'history', commit: tip, file: 'src/search.ts' },
    });
    await frame.locator('[data-code-side="new"][data-line="8"]').waitFor();
    const code = frame.locator('[data-code-side="new"][data-line="9"]');
    await code.scrollIntoViewIfNeeded();
    const codeBox = await code.boundingBox();
    // Native drag selection follows the current text-first annotation workflow.
    await page.mouse.move(codeBox.x + 8, codeBox.y + codeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(codeBox.x + 245, codeBox.y + codeBox.height / 2, { steps: 12 });
    await page.mouse.up();
    await button('Annotation').click();
    await frame
      .getByLabel('Annotation text', { exact: true })
      .fill('Please make this limit configurable before we expand the pilot.');
    await shot(join(output, 'git-review.png'));
  }

  assert.deepEqual(errors, []);
  console.log('README media captured without page errors.');
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
