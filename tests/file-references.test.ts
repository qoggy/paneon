import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  markdownLink,
  markdownLinkAddress,
  isFileReferenceRequest,
} from '../src/shared/file-references.ts';
import { readFilePreview, FILE_PREVIEW_MAX_BYTES } from '../dist/runtime/file-preview.js';
import { startServer } from './runtime-fixture.ts';
import { PACKAGE_VERSION } from '../dist/shared/paths.js';
import { build } from 'esbuild';

void test('file links preserve encoded paths, source line ranges and ordinary web/anchor links', () => {
  assert.deepEqual(markdownLink('./文件%20A.ts#L12-L18'), {
    kind: 'file',
    path: './文件 A.ts',
    startLine: 12,
    endLine: 18,
  });
  assert.deepEqual(markdownLink('/work/app.ts#L2'), {
    kind: 'file',
    path: '/work/app.ts',
    startLine: 2,
    endLine: 2,
  });
  assert.deepEqual(markdownLink('file:///work/%E6%96%87%E4%BB%B6.ts#L3-L4'), {
    kind: 'file',
    path: '/work/文件.ts',
    startLine: 3,
    endLine: 4,
  });
  assert.deepEqual(markdownLink('../notes.md#design'), { kind: 'file', path: '../notes.md' });
  assert.deepEqual(markdownLink('#design'), { kind: 'anchor', href: '#design' });
  assert.deepEqual(markdownLink('https://github.com/qoggy/paneon#L3'), {
    kind: 'web',
    url: 'https://github.com/qoggy/paneon#L3',
  });
  assert.deepEqual(markdownLink('//example.com/a'), { kind: 'web', url: 'https://example.com/a' });
  for (const href of [
    'vscode://file/work/app.ts:2',
    'javascript:alert(1)',
    'data:text/html,x',
    '',
    './a%00b',
    './bad%ZZ',
    'file://other-host/tmp/a',
    'file:///tmp/a%2fb',
    './a.ts#L8-L2',
    '?query',
    './a.ts#L9007199254740992',
  ])
    assert.equal(markdownLink(href).kind, 'disabled', href);
  assert.equal(isFileReferenceRequest({ href: './a.ts', sourcePath: 'docs/plan.md' }), true);
  assert.equal(isFileReferenceRequest({ href: 'https://example.com' }), false);
  assert.equal(isFileReferenceRequest({ href: './a', sourcePath: 3 }), false);
});

void test('default Markdown renders unsupported editor links as non-interactive text', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'node_modules/.file-reference-render-'));
  try {
    const output = await build({
      stdin: {
        contents: `import {createElement} from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {Markdown} from './src/ui/markdown'; import {UIProvider} from './src/ui/ui-provider'; export function render(markdown, reader) { return renderToStaticMarkup(createElement(UIProvider, {onReadFile: reader ? async () => ({path:'/tmp/a.ts', text:''}) : undefined, children:createElement(Markdown, {children:markdown})})); }`,
        resolveDir: process.cwd(),
        loader: 'tsx',
      },
      bundle: true,
      jsx: 'automatic',
      platform: 'node',
      format: 'esm',
      packages: 'external',
      write: false,
    });
    const entry = join(directory, 'render.mjs');
    await writeFile(entry, output.outputFiles[0].text);
    const { render } = (await import(pathToFileURL(entry).href)) as {
      render: (markdown: string, reader: boolean) => string;
    };
    const markdown =
      '[VS Code](vscode://file/tmp/a.ts:3) · [Unsafe](javascript:alert) · `./source.ts` · [Source](./source.ts#L3) · [File](file:///tmp/a.ts) · [Web](https://example.com/)';
    const supported = render(markdown, true);
    assert.match(supported, /<span\b[^>]*tabindex="-1"[^>]*>VS Code<\/span>/);
    assert.match(supported, /<span\b[^>]*>Unsafe<\/span>/);
    assert.match(supported, /<code>\.\/source.ts<\/code>/);
    assert.match(supported, /<a\b[^>]*href="\.\/source.ts#L3"[^>]*>Source<\/a>/);
    assert.match(supported, /<a\b[^>]*href="file:\/\/\/tmp\/a.ts"[^>]*>File<\/a>/);
    const standalone = render(markdown, false);
    assert.match(standalone, /<span\b[^>]*>Source<\/span>/);
    assert.match(standalone, /<span\b[^>]*>File<\/span>/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

void test('address presentation decodes readable text without changing URI separators', () => {
  assert.equal(
    markdownLinkAddress('./%E6%96%87%E4%BB%B6%20%E5%90%8D.ts#L12-L18'),
    './文件 名.ts#L12-L18',
  );
  assert.equal(
    markdownLinkAddress('https://example.com/%E6%96%87%E4%BB%B6%20%E5%90%8D?name=a%26b'),
    'https://example.com/文件 名?name=a%26b',
  );
  assert.equal(
    markdownLinkAddress('vscode://file/tmp/%E6%96%87%E4%BB%B6%20%E5%90%8D.ts:12'),
    'vscode://file/tmp/文件 名.ts:12',
  );
  assert.equal(markdownLinkAddress('./file%23name.ts#L2'), './file%23name.ts#L2');
  assert.equal(markdownLinkAddress('./bad%ZZ.ts'), './bad%ZZ.ts');
});

void test('invalid file requests reject locally instead of leaving a bridge promise pending', async () => {
  const { panelReadFile } = await import('../dist/sdk/client.js');
  await assert.rejects(panelReadFile({ href: './file.ts', sourcePath: 'bad\npath.md' }), {
    code: 'INVALID_FILE_REFERENCE',
  });
  await assert.rejects(panelReadFile({ href: 'vscode://file/tmp/a' }), {
    code: 'INVALID_FILE_REFERENCE',
  });
});

void test('preview resolves cwd/document bases and reads fresh, bounded UTF-8 source snapshots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paneon-file-read-'));
  try {
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'source.ts'), 'root source\r\n第二行\n');
    await writeFile(join(root, 'docs/source.ts'), 'document-relative');
    assert.deepEqual(await readFilePreview(root, { href: './source.ts#L2' }), {
      path: join(root, 'source.ts'),
      text: 'root source\r\n第二行\n',
    });
    assert.equal(
      (await readFilePreview(root, { href: './source.ts', sourcePath: 'docs/plan.md' })).text,
      'document-relative',
    );
    assert.equal(
      (
        await readFilePreview('/elsewhere', {
          href: './source.ts',
          sourcePath: join(root, 'docs/plan.md'),
        })
      ).text,
      'document-relative',
    );
    assert.equal(
      (await readFilePreview('/elsewhere', { href: pathToFileURL(join(root, 'source.ts')).href }))
        .text,
      'root source\r\n第二行\n',
    );
    await symlink(join(root, 'source.ts'), join(root, 'alias.ts'));
    assert.equal(
      (await readFilePreview(root, { href: './alias.ts' })).text,
      'root source\r\n第二行\n',
    );
    const snapshot = await readFilePreview(root, { href: './source.ts' });
    await writeFile(join(root, 'source.ts'), 'changed');
    assert.equal(snapshot.text, 'root source\r\n第二行\n');
    assert.equal((await readFilePreview(root, { href: './source.ts' })).text, 'changed');
    await writeFile(join(root, 'empty'), '');
    assert.equal((await readFilePreview(root, { href: './empty' })).text, '');
    await writeFile(join(root, 'binary'), Buffer.from([0, 1, 2]));
    await writeFile(join(root, 'invalid-utf8'), Buffer.from([0xff, 0xfe]));
    await writeFile(join(root, 'large'), Buffer.alloc(FILE_PREVIEW_MAX_BYTES + 1, 65));
    for (const [href, code] of [
      ['./missing', 'FILE_NOT_FOUND'],
      ['./docs', 'FILE_NOT_REGULAR'],
      ['./binary', 'FILE_NOT_TEXT'],
      ['./invalid-utf8', 'FILE_NOT_TEXT'],
      ['./large', 'FILE_TOO_LARGE'],
      ['vscode://file/a', 'INVALID_FILE_REFERENCE'],
    ])
      await assert.rejects(readFilePreview(root, { href }), { code });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test('file API requires same-origin access and a current running panel revision', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paneon-file-api-'));
  const service = await startServer(join(root, 'runtime'));
  const origin = `http://127.0.0.1:${service.descriptor.port}`;
  const panel = {
    instanceId: 'file-panel',
    definitionId: 'file-test',
    cwd: root,
    entryPath: join(root, 'panel.tsx'),
    params: {},
    watch: false,
    revision: 'current',
    status: 'running' as const,
    requires: { paneon: PACKAGE_VERSION },
    paneonVersion: PACKAGE_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  service.runtime.store.save(panel);
  await writeFile(join(root, 'source.ts'), 'safe source');
  const request = (headers: Record<string, string>, revision = 'current') =>
    service.app.inject({
      method: 'POST',
      url: '/api/panels/file-panel/file',
      headers: { host: `127.0.0.1:${service.descriptor.port}`, ...headers },
      payload: { revision, reference: { href: './source.ts' } },
    });
  try {
    assert.equal(
      (await request({})).json<{ error: { code: string }; data: { path: string; text: string } }>()
        .error.code,
      'INVALID_ORIGIN',
    );
    assert.equal(
      (await request({ origin: 'https://other.test' })).json<{
        error: { code: string };
        data: { path: string; text: string };
      }>().error.code,
      'INVALID_ORIGIN',
    );
    assert.equal(
      (await request({ origin }, 'stale')).json<{
        error: { code: string };
        data: { path: string; text: string };
      }>().error.code,
      'PANEL_REVISION_MISMATCH',
    );
    assert.deepEqual(
      (await request({ origin })).json<{
        error: { code: string };
        data: { path: string; text: string };
      }>().data,
      {
        path: join(root, 'source.ts'),
        text: 'safe source',
      },
    );
    await service.runtime.closePanel(panel.instanceId);
    assert.equal(
      (await request({ origin })).json<{
        error: { code: string };
        data: { path: string; text: string };
      }>().error.code,
      'PANEL_CLOSED',
    );
  } finally {
    await service.stop();
    await rm(root, { recursive: true, force: true });
  }
});
