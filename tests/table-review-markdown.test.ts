import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import { sourceMappingPlugin } from '../src/ui/markdown-annotation-mapper.ts';
import type { SourceNode } from '../src/ui/markdown-annotation-mapper.ts';
void test('actual GFM AST text leaves retain explicit boundaries through formatting and containers', async () => {
  const source =
    '# 标题🙂\n\nrepeat **repeat** and [linked 中文🙂](https://example.com) &amp; \\* escaped.\n\n`a  b` and ~~gone~~.\n\n- first\n  wrapped\n\n> quoted\n> continuation\n\n| name | value |\n| --- | --- |\n| cell | a\\|b |\n\n```js\nconst x = 1;\n```\n\n```\n> literal\n```';
  const parser = unified().use(remarkParse).use(remarkGfm).use(remarkRehype);
  const tree = await parser.run(parser.parse(source));
  const leaves: SourceNode[] = [];
  function collect(node: SourceNode) {
    if (node.type === 'text' && node.position) leaves.push(node);
    node.children?.forEach(collect);
  }
  collect(tree);
  sourceMappingPlugin(source, (entity) => (entity === '&amp;' ? '&' : entity))()(tree);
  const mapped = new Map<SourceNode, (number | null)[]>();
  function mappings(node: SourceNode) {
    if (node.properties?.['data-source-offsets'])
      mapped.set(
        node.children?.[0] as SourceNode,
        JSON.parse(node.properties['data-source-offsets'] as string) as (number | null)[],
      );
    node.children?.forEach(mappings);
  }
  mappings(tree);
  for (const leaf of leaves) {
    const offsets = mapped.get(leaf);
    assert.ok(
      offsets,
      `Missing mapping for ${JSON.stringify(leaf.value)} at ${leaf.position?.start.offset}`,
    );
    assert.equal(offsets.length, (leaf.value?.length ?? 0) + 1);
  }
  const repetitions = leaves.filter((leaf) => leaf.value === 'repeat');
  assert.equal(repetitions.length, 1);
  assert.equal(mapped.get(repetitions[0])?.[0], source.indexOf('**repeat**') + 2);
});

void test('fenced code maps parser-preserved CRLF and its synthetic final newline', async () => {
  const source =
    '# 标题\r\n\r\n```ts\r\nconst title = "中文🙂";\r\n\r\n  console.log(title);\r\n```';
  const parser = unified().use(remarkParse).use(remarkGfm).use(remarkRehype);
  const tree = await parser.run(parser.parse(source));
  sourceMappingPlugin(source, (entity) => entity)()(tree);
  let code: SourceNode | undefined;
  function find(node: SourceNode) {
    if (node.tagName === 'code') code = node;
    node.children?.forEach(find);
  }
  find(tree);
  const leaf = code?.children?.[0];
  const offsets = JSON.parse(leaf?.properties?.['data-source-offsets'] as string) as number[];
  const text = leaf?.children?.[0]?.value ?? '';
  assert.equal(text, 'const title = "中文🙂";\r\n\r\n  console.log(title);\n');
  assert.equal(offsets.length, text.length + 1);
  for (const quote of ['const', '中文🙂', 'console.log(title);']) {
    const index = text.indexOf(quote);
    assert.equal(source.slice(offsets[index], offsets[index + quote.length]), quote);
  }
});
