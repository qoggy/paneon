import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createElement, type ComponentType, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type ReactMarkdown from 'react-markdown';
import type { Root } from 'hast';
type MarkdownProps = { children: string; className?: string } & Pick<
  ComponentProps<typeof ReactMarkdown>,
  'components' | 'rehypePlugins'
>;

const output = mkdtempSync(join(import.meta.dirname, '.mermaid-test-'));
after(() => rmSync(output, { recursive: true, force: true }));
await build({
  entryPoints: ['src/ui/mermaid.tsx', 'src/ui/markdown.tsx'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  jsx: 'automatic',
  outdir: output,
});
const { Mermaid } = (await import(pathToFileURL(join(output, 'mermaid.js')).href)) as {
  Mermaid: ComponentType<{ code: string; className?: string }>;
};
const { Markdown } = (await import(pathToFileURL(join(output, 'markdown.js')).href)) as {
  Markdown: ComponentType<MarkdownProps>;
};

void test('Mermaid is safe to import and render without browser globals', () => {
  const html = renderToStaticMarkup(
    createElement(Mermaid, { code: 'flowchart LR\n A --> B', className: 'diagram-example' }),
  );
  assert.match(html, /data-slot="mermaid"/);
  assert.match(html, /diagram-example/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /<svg[^>]*id="mermaid-/);
});

void test('Markdown mermaid fences replace their pre wrapper, including nested fences', () => {
  const html = renderToStaticMarkup(
    createElement(Markdown, {
      children: [
        '```mermaid',
        'flowchart LR',
        ' A --> B',
        '```',
        '',
        '> ```mermaid',
        '> sequenceDiagram',
        '>  Alice->>Bob: Hi',
        '> ```',
      ].join('\n'),
    }),
  );
  assert.equal((html.match(/data-slot="mermaid"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<pre/);
  assert.match(html, /<blockquote>/);
});

void test('Markdown keeps ordinary code, inline code, GFM, and raw HTML disabled', () => {
  const html = renderToStaticMarkup(
    createElement(Markdown, {
      children: [
        '`mermaid`',
        '',
        '```typescript',
        'const mermaid = "plain code";',
        '```',
        '',
        '- [x] complete',
        '',
        '| Name | Value |',
        '| --- | --- |',
        '| Test | 1 |',
        '',
        '<script>alert("raw html")</script>',
      ].join('\n'),
    }),
  );
  assert.match(html, /<code>mermaid<\/code>/);
  assert.match(html, /<pre><code class="language-typescript">/);
  assert.match(html, /<table>/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /disabled=""/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /data-slot="mermaid"/);
});

void test('Markdown source adapters compose with built-in GFM and Mermaid rendering', () => {
  const html = renderToStaticMarkup(
    createElement(Markdown, {
      children:
        'A paragraph.\n\n| Name | Value |\n| --- | --- |\n| Test | 1 |\n\n```mermaid\nflowchart LR\n A --> B\n```',
      components: {
        p: ({ children }) => createElement('p', { 'data-adapter': 'paragraph' }, children),
      },
      rehypePlugins: [
        () => (tree: Root) => {
          tree.children.unshift({
            type: 'element',
            tagName: 'span',
            properties: { 'data-source-marker': 'mapped' },
            children: [],
          });
        },
      ],
    }),
  );
  assert.match(html, /data-adapter="paragraph"/);
  assert.match(html, /data-source-marker="mapped"/);
  assert.match(html, /<table>/);
  assert.equal((html.match(/data-slot="mermaid"/g) ?? []).length, 1);
});
