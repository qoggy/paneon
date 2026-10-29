import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(join(process.cwd(), 'node_modules/.markdown-standalone-'));
after(() => rm(directory, { recursive: true, force: true }));
const output = await build({
  stdin: {
    contents: `
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Markdown} from './dist/ui/markdown.js';
import {Image} from './dist/ui/image.js';
import {UIProvider} from './dist/ui/ui-provider.js';
import {PanelInputContext,usePanelInput} from '@qoggy/paneon/sdk/client';
const source='[Source](./source.ts)\\n\\n![relative](./picture.png)\\n\\n![absolute](/logo.png)';
export function render(options={}) {
  const content=createElement(UIProvider,{onReadFile:options.reader?async()=>({path:'/source.ts',text:''}):undefined},options.imageOnly?createElement(Image,{src:'./picture.png',alt:'standalone image'}):createElement(Markdown,null,source));
  return renderToStaticMarkup(Object.hasOwn(options,'input')?createElement(PanelInputContext.Provider,{value:options.input},content):content);
}
function Input(){return createElement('code',null,JSON.stringify(usePanelInput()));}
export function input(value,provided){return renderToStaticMarkup(provided?createElement(PanelInputContext.Provider,{value},createElement(Input)):createElement(Input));}
`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  jsx: 'automatic',
  platform: 'node',
  format: 'esm',
  packages: 'external',
  alias: { '@qoggy/paneon/sdk/client': join(process.cwd(), 'dist/sdk/client.js') },
  // The browser library uses a DOM entity decoder. Select the same package's
  // Node implementation for this SSR harness; component/proxy code is unchanged.
  plugins: [
    {
      name: 'node-entity-decoder',
      setup(plugin) {
        plugin.onResolve({ filter: /decode-named-character-reference\/index\.dom\.js$/ }, () => ({
          path: join(process.cwd(), 'node_modules/decode-named-character-reference/index.js'),
        }));
      },
    },
  ],
  write: false,
});
const entry = join(directory, 'render.mjs');
await writeFile(entry, output.outputFiles[0].text);
const renderer = (await import(pathToFileURL(entry).href)) as {
  render: (options?: { reader?: boolean; input?: unknown; imageOnly?: boolean }) => string;
  input: (value: unknown, provided: boolean) => string;
};

void test('published Markdown outside a panel keeps local links as text and image URLs native', () => {
  const html = renderer.render();
  assert.doesNotMatch(html, /<a\b[^>]*href="\.\/source\.ts"/);
  assert.match(html, /<span\b[^>]*>Source<\/span>/);
  assert.match(html, /<img\b[^>]*src="\.\/picture\.png"/);
  assert.match(html, /<img\b[^>]*src="\/logo\.png"/);
  assert.match(html, /Loading image/);
});

void test('a standalone custom text reader enables links without intercepting image URLs', () => {
  const html = renderer.render({ reader: true });
  assert.match(html, /<a\b[^>]*href="\.\/source\.ts"/);
  assert.match(html, /<img\b[^>]*src="\.\/picture\.png"/);
});

void test('panel presence accepts all JSON inputs, including null, false and zero', () => {
  for (const input of [{}, null, false, 0, '']) {
    const html = renderer.render({ input });
    assert.match(html, /<a\b[^>]*href="\.\/source\.ts"/);
    assert.match(html, /Loading image/);
  }
  assert.equal(renderer.input(undefined, false), '<code>{}</code>');
  assert.equal(renderer.input(null, true), '<code>null</code>');
  assert.equal(renderer.input(false, true), '<code>false</code>');
  assert.equal(renderer.input(0, true), '<code>0</code>');
});

void test('public Image initially renders its Spinner and preserves the native standalone URL', () => {
  const html = renderer.render({ imageOnly: true });
  assert.match(html, /Loading image/);
  assert.match(html, /<svg\b[^>]*class="[^"]*animate-spin/);
  assert.match(html, /<img\b[^>]*src="\.\/picture\.png"/);
  assert.match(html, /alt="standalone image"/);
});
