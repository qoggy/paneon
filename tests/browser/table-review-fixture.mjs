import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
export const markdown =
  '# 阅读\n\nrepeat **repeat** and [linked 中文🙂](https://example.com) &amp; \\* escaped.\n\n`a  b` and **bold**.\n\n```js\nconst x = 1;\n```\n\n- first\n- second\n\n> quoted text\n\n<script>unsafe()</script>';
export const tableInput = {
  title: 'Table review acceptance',
  pageSize: 2,
  columns: [
    { key: 'name', label: '说明' },
    { key: 'n', label: 'Number', type: 'number' },
    { key: 'b', label: 'Boolean', type: 'boolean' },
  ],
  rows: [
    { name: 'repeat 中文🙂 repeat', n: 20, b: true },
    { name: 'same', n: 10, b: false },
    { name: 'same', n: 10, b: null },
    { name: 'last', n: null, b: true },
  ],
};
export async function startTableReviewFixture() {
  const { startServer } = await import(new URL('../runtime-fixture.ts', import.meta.url).href);
  const root = await mkdtemp(join(tmpdir(), 'paneon-table-review-'));
  let service;
  try {
    const skill = join(root, 'agent-skills/paneon');
    await cp(
      process.env.PANEON_TEST_SKILL_SOURCE ?? new URL('../../skills/paneon', import.meta.url),
      skill,
      { recursive: true },
    );
    service = await startServer(join(root, '.paneon'));
    await service.app.inject({
      method: 'POST',
      url: '/api/preferences',
      headers: {
        host: `127.0.0.1:${service.descriptor.port}`,
        authorization: `Bearer ${service.descriptor.controlToken}`,
      },
      payload: { ui: { language: 'zh-CN' } },
    });
    async function cli(...args) {
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          process.env.PANEON_TEST_CLI_ENTRY ??
            new URL('../../dist/cli/index.js', import.meta.url).pathname,
          'panel',
          ...args,
          '--json',
        ],
        { cwd: root, env: { ...process.env, HOME: root }, maxBuffer: 4 * 1024 * 1024 },
      );
      const result = JSON.parse(stdout);
      assert.equal(result.ok, true);
      return result.data;
    }
    async function run(name, input) {
      const path = join(root, `${name}.json`);
      await writeFile(path, JSON.stringify(input));
      return cli(
        'run',
        join(process.env.PANEON_TEST_INPLACE_SKILL ?? skill, `assets/panels/${name}/panel.tsx`),
        '--cwd',
        root,
        '--params-file',
        path,
        '--no-watch',
      );
    }
    const table = await run('table', tableInput);
    const markdownFilePath = join(root, '审阅 方案.md');
    await writeFile(markdownFilePath, markdown);
    return {
      root,
      service,
      table,
      markdownFilePath,
      runReview: (path = '审阅 方案.md') =>
        run('file-review', { title: 'Markdown review acceptance', files: [path] }),
      cli,
      url: (panel) => `http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`,
      async events(panel) {
        return (await service.runtime.events(panel.instanceId, 'acceptance', 100, 0)).events;
      },
      async stop() {
        await service.stop();
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await service?.stop();
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
