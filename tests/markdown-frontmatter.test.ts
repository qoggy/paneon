import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import type { FrontmatterText, FrontmatterValue } from '../src/ui/markdown-frontmatter.ts';
import { parseFrontmatter } from '../src/ui/markdown-frontmatter.ts';
import { sourceMappingPlugin } from '../src/ui/markdown-annotation-mapper.ts';
import type { SourceNode } from '../src/ui/markdown-annotation-mapper.ts';
import examples from './fixtures/markdown-frontmatter.json' with { type: 'json' };

function texts(node: FrontmatterValue | null): FrontmatterText[] {
  if (!node) return [];
  return node.properties.concat(
    node.kind === 'text'
      ? [node.text]
      : node.kind === 'sequence'
        ? node.items.flatMap(texts)
        : node.entries.flatMap((entry) => [...texts(entry.key), ...texts(entry.value)]),
  );
}

function quote(source: string, text: FrontmatterText) {
  const start = text.offsets[0];
  const end = text.offsets.at(-1);
  assert.ok(typeof start === 'number' && typeof end === 'number');
  return source.slice(start, end);
}

void test('the approved YAML cases retain their semantics without requiring an object root', () => {
  for (const example of examples) {
    const parsed = parseFrontmatter(example.source);
    if (example.expected === 'markdown') {
      assert.equal(parsed, null, example.id);
      continue;
    }
    assert.ok(parsed, example.id);
    assert.equal(parsed.errors.length > 0, example.expected === 'error', example.id);
    assert.equal(parsed.markdown.length, example.source.length, example.id);
    assert.deepEqual(parsed.markdown.match(/[\r\n]/g), example.source.match(/[\r\n]/g), example.id);
    for (const text of [parsed.raw, ...texts(parsed.value)]) {
      assert.equal(text.offsets.length, text.value.length + 1, example.id);
      const boundaries = text.offsets.filter((offset) => offset !== null);
      assert.deepEqual(
        boundaries,
        [...boundaries].sort((a, b) => a - b),
        example.id,
      );
      assert.ok(boundaries.every((offset) => offset >= 0 && offset <= example.source.length));
    }
  }
});

void test('envelope recognition does not consume ordinary Markdown or a second YAML document', () => {
  for (const source of [
    '---',
    '---\nname: unclosed',
    '\n---\nx: y\n---',
    ' ---\nx: y\n---',
    '# Heading\n\n---\nx: y\n---',
    '```yaml\n---\nx: y\n---\n```',
  ])
    assert.equal(parseFrontmatter(source), null, source);
  for (const newline of ['\n', '\r\n', '\r']) {
    const source = [
      '\uFEFF--- \t',
      'name: windows',
      '... \t',
      '# Body',
      '---',
      'second: document',
    ].join(newline);
    const parsed = parseFrontmatter(source);
    assert.ok(parsed);
    assert.equal(
      parsed.markdown.slice(source.indexOf('# Body')),
      source.slice(source.indexOf('# Body')),
    );
    assert.equal(parsed.raw.value, `name: windows${newline}`);
  }
});

void test('literal values and CST properties preserve precision, key spelling, tags and aliases', () => {
  const source =
    '---\n&root\n"true": 900719925474099312345\ntrue: 0.123456789012345678901\nvalue: &base !env "token"\ncopy: *base\ncycle: &self {next: *self}\nempty:\n---\n';
  const parsed = parseFrontmatter(source);
  assert.ok(parsed);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(
    texts(parsed.value).map((text) => text.value),
    [
      '&root',
      '"true"',
      '900719925474099312345',
      'true',
      '0.123456789012345678901',
      'value',
      '&base',
      '!env',
      'token',
      'copy',
      '*base',
      'cycle',
      '&self',
      'next',
      '*self',
      'empty',
      '',
    ],
  );
  for (const text of texts(parsed.value)) {
    if (text.value === '') continue;
    assert.equal(quote(source, text), text.value);
  }
});

void test('decoded scalars use exact ranges and expose no invented partial escape coordinates', () => {
  const source =
    '---\nplain: repeat\nquoted: "repeat"\nescaped: "a\\nb"\nblock: |-\n  first\n  second\n---\nrepeat';
  const parsed = parseFrontmatter(source);
  assert.ok(parsed);
  const leaves = texts(parsed.value);
  const repeats = leaves.filter((text) => text.value === 'repeat');
  assert.deepEqual(
    repeats.map((text) => text.offsets[0]),
    [source.indexOf('repeat'), source.indexOf('"repeat"') + 1],
  );
  const escaped = leaves.find((text) => text.value === 'a\nb');
  assert.ok(escaped);
  assert.deepEqual(escaped.offsets.slice(1, -1), [null, null]);
  assert.equal(quote(source, escaped), '"a\\nb"');
  const block = leaves.find((text) => text.value === 'first\nsecond');
  assert.ok(block);
  assert.equal(quote(source, block), '|-\n  first\n  second\n');
});

void test('alias validity follows YAML traversal even inside complex keys', () => {
  const valid = parseFrontmatter('---\n? [&key value]\n: item\nref: *key\n---');
  assert.ok(valid);
  assert.deepEqual(valid.errors, []);
  const invalid = parseFrontmatter('---\n? [*missing]\n: item\n---');
  assert.ok(invalid);
  assert.equal(invalid.errors[0]?.code, 'UNRESOLVED_ALIAS');
});

void test('body GFM positions continue to address the complete BOM/CRLF source', async () => {
  const source =
    '\uFEFF---\r\nname: repeat\r\n---\r\n\r\n# Body\r\n\r\n**repeat** and [linked 中文🙂](https://example.com)\r\n\r\n---\r\n';
  const parsed = parseFrontmatter(source);
  assert.ok(parsed);
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype);
  const tree = await processor.run(processor.parse(parsed.markdown));
  sourceMappingPlugin(source, (entity) => entity)()(tree);
  const mapped: SourceNode[] = [];
  function collect(node: SourceNode) {
    if (node.properties?.['data-source-offsets']) mapped.push(node);
    node.children?.forEach(collect);
  }
  collect(tree);
  const repeat = mapped.find((node) => node.children?.[0]?.value === 'repeat');
  assert.ok(repeat);
  const serialized = repeat.properties?.['data-source-offsets'];
  assert.ok(typeof serialized === 'string');
  const offsets = JSON.parse(serialized) as number[];
  assert.equal(offsets[0], source.indexOf('**repeat**') + 2);
  assert.equal(source.slice(offsets[0], offsets.at(-1)), 'repeat');
});

void test('public Markdown frontmatter adds no generated copy or controls of its own', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'node_modules/.markdown-frontmatter-test-'));
  try {
    const output = await build({
      stdin: {
        contents: `import {createElement} from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {Markdown} from './src/ui/markdown'; import {UIProvider} from './src/ui/ui-provider'; export function render(source, props = {}) { return renderToStaticMarkup(createElement(UIProvider, null, createElement(Markdown, props, source))); }`,
        resolveDir: process.cwd(),
        loader: 'tsx',
      },
      bundle: true,
      jsx: 'automatic',
      platform: 'node',
      format: 'esm',
      packages: 'external',
      alias: {
        '@qoggy/paneon/sdk': join(process.cwd(), 'dist/sdk/index.js'),
        '@qoggy/paneon/sdk/client': join(process.cwd(), 'dist/sdk/client.js'),
      },
      write: false,
    });
    const entry = join(directory, 'render.mjs');
    await writeFile(entry, output.outputFiles[0].text);
    const { render } = (await import(pathToFileURL(entry).href)) as {
      render: (source: string, props?: Record<string, unknown>) => string;
    };
    for (const example of examples) {
      const html = render(example.source);
      const withoutCodeBlocks = html.replace(
        /<div data-slot="markdown-code-block"[\s\S]*?<\/pre><\/div>/g,
        '',
      );
      assert.doesNotMatch(
        withoutCodeBlocks,
        /<button\b|<details\b|当前显示：|输入第|已识别前置块|空元数据|（空字符串）/,
        example.id,
      );
      assert.doesNotMatch(html, /data-slot="badge"/, example.id);
      if (example.expected === 'error') assert.match(html, /data-invalid=""/, example.id);
    }
    for (const language of ['__proto__', 'constructor', 'unknown']) {
      const html = render('```' + language + '\nconst value = 1;\n```');
      assert.match(
        html,
        new RegExp('>' + language + '</span>'),
        'Unknown language labels are text, not object prototype members.',
      );
    }
    const emptyLanguage = () => (tree: SourceNode) => {
      function walk(node: SourceNode) {
        if (node.tagName === 'code')
          node.properties = { ...node.properties, className: ['language-'] };
        node.children?.forEach(walk);
      }
      walk(tree);
    };
    assert.match(
      render('```ts\nconst value = 1;\n```', { rehypePlugins: [emptyLanguage] }),
      />Plain Text<\/span>/,
    );
    const source =
      '---\nname: "**plain** <b>text</b>"\nmetadata:\n  version: "1.0"\n---\n\n# Body\n\n- [x] done';
    const html = render(source);
    assert.match(html, /<dl>/);
    assert.match(html, /\*\*plain\*\* &lt;b&gt;text&lt;\/b&gt;/);
    assert.match(html, /<h1\b[^>]*>Body<\/h1>/);
    assert.match(html, /type="checkbox"/);
    assert.doesNotMatch(render(source, { frontmatter: 'off' }), /data-markdown-frontmatter/);
    const annotated = render(source, { annotationTarget: 'frontmatter' });
    assert.match(annotated, /data-source-leaf="yaml"/);
    assert.match(annotated, /data-source-offsets=/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
