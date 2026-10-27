import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function startFileReferenceFixture() {
  const { startServer } = await import(new URL('../runtime-fixture.ts', import.meta.url).href);
  const root = await mkdtemp(join(tmpdir(), 'paneon-file-references-'));
  let service;
  try {
    await mkdir(join(root, 'docs'));
    const source =
      Array.from({ length: 180 }, (_, i) => `export const line${i + 1} = ${i + 1};`).join('\n') +
      '\n';
    await writeFile(join(root, 'source.ts'), source);
    await writeFile(join(root, 'docs/source.ts'), 'export const documentRelative = true;\n');
    await writeFile(join(root, '文件 名.ts'), 'export const unicodePath = true;\n');
    await writeFile(
      join(root, 'source-cr.ts'),
      'const first = 1;\rconst second = 2;\rconst third = 3;',
    );
    await writeFile(join(root, 'plain.txt'), 'First 😀\r\nSecond plain\rThird');
    await writeFile(join(root, 'empty.txt'), '');
    await writeFile(join(root, 'binary.bin'), Buffer.from([0, 1, 2]));
    await writeFile(join(root, 'large.txt'), Buffer.alloc(1024 * 1024 + 1, 65));
    const entry = join(root, 'panel.tsx');
    const markdown = [
      '# Markdown 文件引用',
      '点击本地文件，在抽屉中阅读源码；关闭后保留原文位置。',
      '1. 行内代码：`source.ts`',
      '2. [相对路径](./source.ts)',
      `3. [绝对路径](${join(root, 'source.ts')})`,
      '4. [source.ts:153–159](./source.ts#L153-L159)',
      `5. [file:// 本地文件](${pathToFileURL(join(root, 'source.ts')).href}#L8) · [VS Code](vscode://file${root}/source.ts:153)`,
      '6. [HTTPS 网页](https://example.com/)',
      '## 异常情况',
      '[不存在](./missing.ts) · [空文件](./empty.txt) · [二进制](./binary.bin) · [过大文件](./large.txt) · [超出行号](./source.ts#L999) · [目录](./docs/)',
      '[中文路径](./文件%20名.ts#L1) · [CR 换行](./source-cr.ts#L2) · [纯文本与 CRLF](./plain.txt)',
    ].join('\n\n');
    await writeFile(
      entry,
      `
import { agent, annotationValueSchema, definePanel, z } from '@qoggy/paneon/sdk';
import { useRef, useState } from 'react';
import { Markdown, Page, UIProvider, useUI, usePageAnnotations } from '@qoggy/paneon/ui';
function ReaderSnapshot() {
  const [generation,setGeneration] = useState(0);
  const calls = useRef(0);
  const cached = useRef({path:'/snapshot.ts',text:'export const retained = 1;'});
  const ui = useUI();
  return <UIProvider ui={ui} onReadFile={async () => {
    const call = ++calls.current;
    cached.current.text = 'export const retained = ' + call + ';';
    if (call === 1) setTimeout(() => { cached.current.text = 'export const cacheUpdated = true;'; setGeneration(1); },100);
    return cached.current;
  }}><div data-reader-generation={generation}><Markdown>{'[读取器快照](./snapshot.ts)'}</Markdown></div></UIProvider>;
}
function Panel() {
  usePageAnnotations<string>({onSubmit: async value => { await agent.emit('annotations',value); }});
  return <Page title="文件引用验收"><Markdown annotationTarget="main">{${JSON.stringify(markdown)}}</Markdown>
    <Markdown sourcePath="docs/plan.md">{'[按文档目录解析](./source.ts)'}</Markdown>
    <Markdown components={{a:({children})=><strong data-custom-link="">{children}</strong>}}>{'[自定义链接](https://example.com)'}</Markdown>
    <ReaderSnapshot />
  </Page>;
}
export default definePanel({id:'file-references', requires:{paneon:'>=0.0.1 <0.1.0'},input:z.object({}).strict(), events:{annotations:annotationValueSchema(z.literal('main'))},render:Panel});`,
    );
    service = await startServer(join(root, 'runtime'));
    await service.app.inject({
      method: 'POST',
      url: '/api/preferences',
      headers: {
        host: `127.0.0.1:${service.descriptor.port}`,
        authorization: `Bearer ${service.descriptor.controlToken}`,
      },
      payload: { ui: { theme: 'light', language: 'zh-CN' } },
    });
    const panel = await service.runtime.run(entry, root, {}, false);
    return {
      root,
      entry,
      service,
      panel,
      url: `http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`,
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
