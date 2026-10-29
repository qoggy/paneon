import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

export async function startMarkdownImageFixture() {
  const { startServer } = await import(new URL('../runtime-fixture.ts', import.meta.url).href);
  const root = await mkdtemp(join(tmpdir(), 'paneon-markdown-images-'));
  const filename = `markdown-image-${randomUUID()}.png`;
  const asset = fileURLToPath(new URL(`../../dist/web/assets/${filename}`, import.meta.url));
  let service;
  const remoteBytes = await readFile(new URL('../../docs/readme/git-review.png', import.meta.url));
  const remote = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'image/png' });
    response.end(remoteBytes);
  });
  await new Promise((resolve) => remote.listen(0, '127.0.0.1', resolve));
  const remoteSource = `http://127.0.0.1:${remote.address().port}/original.png`;
  try {
    await mkdir(fileURLToPath(new URL('../../dist/web/assets/', import.meta.url)), {
      recursive: true,
    });
    await copyFile(new URL('../../docs/readme/git-review.png', import.meta.url), asset);
    service = await startServer(join(root, 'runtime'));
    const entry = join(root, 'panel.tsx');
    await writeFile(
      entry,
      String.raw`
import { useState } from 'react';
import { agent, annotationValueSchema, definePanel, z } from '@qoggy/paneon/sdk';
import { Button, Image, Markdown, Mermaid, Page, usePageAnnotations } from '@qoggy/paneon/ui';
const source = ${JSON.stringify(`http://127.0.0.1:${service.descriptor.port}/assets/${filename}`)};
const missing = new URL('/assets/missing-markdown-image.png', source).href;
let parseCount = 0;
const parsePlugins = [() => (tree: { children: unknown[] }) => {
  tree.children.push({ type: 'element', tagName: 'output', properties: { 'data-parse-count': '' }, children: [{ type: 'text', value: String(++parseCount) }] });
}];
function Panel() {
  const [second, setSecond] = useState(false);
  usePageAnnotations({ onSubmit: (value) => agent.emit('annotations-submitted', value) });
  return <Page title="Markdown 图片大图验收">
    <div data-testid="plain"><Markdown annotationTarget="plain" rehypePlugins={parsePlugins}>{'图片前的文字。\n\n![Git 评审界面](' + source + ')\n\n图片后的文字。'}</Markdown></div>
    <div data-testid="remote-https"><Markdown>{'![HTTPS 网络图片](https://images.paneon.test/example.png)'}</Markdown></div>
    <div data-testid="remote-http"><Markdown>{'![HTTP 网络图片](http://images.paneon.test/example.png)'}</Markdown></div>
    <div data-testid="slow-image"><Image src="https://images.paneon.test/slow.png" alt="独立 Image 等待加载" /></div>
    <div data-testid="slow-markdown"><Markdown>{'![Markdown 等待加载](https://images.paneon.test/slow.png)'}</Markdown></div>
    <div data-testid="export-remote"><Image src=${JSON.stringify(remoteSource)} alt="跨域原图操作" /></div>
    <div data-testid="linked"><Markdown>{'[![链接图片](' + source + ')](#image-link-target)'}</Markdown></div>
    <div data-testid="nested"><Markdown>{'> 引用中的图片\n>\n> ![引用图片](' + source + ')'}</Markdown></div>
    <div data-testid="custom"><Markdown components={{ img: ({ node: _node, ...props }) => <img {...props} data-custom-image="" style={{maxHeight: 160}} /> }}>{'![自定义图片](' + source + ')'}</Markdown></div>
    <div data-testid="broken"><Markdown>{'![损坏图片](' + missing + ')'}</Markdown></div>
    <Button onClick={() => setSecond((value) => !value)}>切换图片</Button>
    <div data-testid="changing"><Markdown>{'![' + (second ? '第二张图片' : '第一张图片') + '](' + source + (second ? '?second' : '') + ')'}</Markdown></div>
    <div data-testid="markdown-mermaid-image"><Markdown>{'~~~mermaid\nflowchart LR\n A["<img src=\'' + source + '\' width=\'32\' height=\'32\'/> label"] --> B[Next]\n~~~'}</Markdown></div>
    <Mermaid code={'flowchart LR\n A[Markdown] --> B[共用大图查看器]'} />
    <div id="image-link-target">图片链接目标</div>
  </Page>;
}
export default definePanel({id:'markdown-image-acceptance',requires:{paneon:'>=0.0.1 <0.1.0'},input:z.object({}),events:{'annotations-submitted':annotationValueSchema(z.string())},render:Panel});
`,
    );
    const panel = await service.runtime.run(entry, root, {}, false);
    return {
      root,
      entry,
      service,
      panel,
      url: `http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`,
      remoteSource,
      async stop() {
        await service.stop();
        await new Promise((resolve, reject) =>
          remote.close((error) => (error ? reject(error) : resolve())),
        );
        await rm(asset, { force: true });
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await service?.stop();
    await new Promise((resolve, reject) =>
      remote.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(asset, { force: true });
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
