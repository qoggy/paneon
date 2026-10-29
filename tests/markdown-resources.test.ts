import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, open, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { Runtime } from '../dist/runtime/lifecycle.js';

void test('Image owns image reads and Markdown retains text reads with the same path rules', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'paneon-markdown-resources-')));
  const runtime = new Runtime(join(root, 'runtime'));
  const remote = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    response.end('<svg/>');
  });
  await new Promise<void>((resolve) => remote.listen(0, '127.0.0.1', resolve));
  try {
    await mkdir(join(root, 'docs'));
    await mkdir(join(root, 'directory.png'));
    await writeFile(join(root, 'picture.png'), 'root image bytes');
    await writeFile(join(root, 'docs/picture.png'), 'document image bytes');
    await writeFile(join(root, 'source.ts'), 'export const root = true;');
    await writeFile(join(root, 'docs/source.ts'), 'export const document = true;');
    await writeFile(join(root, 'binary.bin'), Buffer.from([0, 1]));
    const huge = await open(join(root, 'large.png'), 'w');
    await huge.truncate(20 * 1024 * 1024 + 1);
    await huge.close();
    const entry = join(root, 'panel.tsx');
    await writeFile(
      entry,
      "import{definePanel,z}from'@qoggy/paneon/sdk';import{Markdown}from'@qoggy/paneon/ui';export default definePanel({id:'resources',requires:{paneon:'*'},input:z.object({}),render:()=> <Markdown>{'![local](./picture.png)'}</Markdown>});",
    );
    const panel = await runtime.run(entry, root, {}, false);
    const manifest = runtime.manifest(panel.instanceId);
    assert.ok(manifest);
    const actions = manifest.actions;
    assert.equal(actions.length, 2);
    const imageAction = actions.find((action) => action.id.includes('/image#readImage'));
    const textAction = actions.find((action) => action.id.includes('/markdown#readLocalFile'));
    assert.ok(imageAction);
    assert.ok(textAction);
    const invoke = (href: string, format: 'image' | 'text', sourcePath?: string) =>
      runtime.invoke(
        panel.instanceId,
        panel.revision,
        format === 'image' ? imageAction.id : textAction.id,
        {
          href,
          ...(sourcePath ? { sourcePath } : {}),
        },
      );
    assert.deepEqual(await invoke('./picture.png', 'image'), {
      ok: true,
      path: join(root, 'picture.png'),
      content: 'data:image/png;base64,' + Buffer.from('root image bytes').toString('base64'),
    });
    const address = remote.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/picture.svg`;
    assert.deepEqual(await invoke(url, 'image'), {
      ok: true,
      path: url,
      content: 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64'),
    });
    assert.deepEqual(await invoke('./picture.png', 'image', 'docs/report.md'), {
      ok: true,
      path: join(root, 'docs/picture.png'),
      content: 'data:image/png;base64,' + Buffer.from('document image bytes').toString('base64'),
    });
    assert.deepEqual(
      await invoke(join(root, 'picture.png'), 'image', 'docs/report.md'),
      await invoke('./picture.png', 'image'),
    );
    assert.deepEqual(await invoke('./source.ts#L1', 'text', 'docs/report.md'), {
      ok: true,
      path: join(root, 'docs/source.ts'),
      content: 'export const document = true;',
    });
    for (const [href, format, code] of [
      ['./missing.png', 'image', 'FILE_NOT_FOUND'],
      ['./directory.png', 'image', 'FILE_NOT_REGULAR'],
      ['./large.png', 'image', 'IMAGE_TOO_LARGE'],
      ['./source.ts', 'image', 'IMAGE_FORMAT_UNSUPPORTED'],
      ['javascript:alert(1)', 'image', 'INVALID_FILE_REFERENCE'],
      ['./binary.bin', 'text', 'FILE_NOT_TEXT'],
    ] as const) {
      const result = (await invoke(href, format)) as { ok: boolean; error: { code: string } };
      assert.equal(result.ok, false, href);
      assert.equal(result.error.code, code, href);
    }
    const index = await readFile(new URL('../dist/ui/index.js', import.meta.url), 'utf8');
    assert.doesNotMatch(index, /readLocalFile/);
    assert.doesNotMatch(index, /readImage|ImageContent|useImagePreview/);
    const imageEntry = join(root, 'image-panel.tsx');
    await writeFile(
      imageEntry,
      "import{definePanel,z}from'@qoggy/paneon/sdk';import{Image}from'@qoggy/paneon/ui';export default definePanel({id:'image-only',requires:{paneon:'*'},input:z.object({}),render:()=> <Image src='./picture.png' alt='document image' sourcePath='docs/report.md' className='max-w-md'/>});",
    );
    const imagePanel = await runtime.run(imageEntry, root, {}, false);
    assert.deepEqual(
      runtime.manifest(imagePanel.instanceId)?.actions.map((action) => action.id),
      [imageAction.id],
    );
    assert.deepEqual(
      await runtime.invoke(imagePanel.instanceId, imagePanel.revision, imageAction.id, {
        href: './picture.png',
        sourcePath: 'docs/report.md',
      }),
      {
        ok: true,
        path: join(root, 'docs/picture.png'),
        content: 'data:image/png;base64,' + Buffer.from('document image bytes').toString('base64'),
      },
    );
  } finally {
    await runtime.stop();
    await new Promise<void>((resolve, reject) =>
      remote.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  }
});
