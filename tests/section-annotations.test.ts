import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const output = mkdtempSync(join(import.meta.dirname, '.section-test-'));
after(() => rmSync(output, { recursive: true, force: true }));
await build({
  stdin: {
    contents: `export {Page, Section} from './src/ui/layout';
export {AnnotationText} from './src/ui/annotation';
export {UIProvider} from './src/ui/ui-provider';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  jsx: 'automatic',
  outfile: join(output, 'section.js'),
});
const { Page, Section, AnnotationText, UIProvider } = (await import(
  pathToFileURL(join(output, 'section.js')).href
)) as Pick<
  typeof import('../dist/ui/index.js'),
  'Page' | 'Section' | 'AnnotationText' | 'UIProvider'
>;

function textSources(node: ReactNode): { target: unknown; children: ReactNode }[] {
  if (Array.isArray(node)) return node.flatMap((child: ReactNode) => textSources(child));
  if (!isValidElement<{ target?: unknown; children?: ReactNode }>(node)) return [];
  if (node.type === AnnotationText)
    return [{ target: node.props.target, children: node.props.children }];
  return textSources(node.props.children);
}

void test('Section without annotationTarget keeps its original markup outside a page session', () => {
  assert.equal(
    renderToStaticMarkup(
      createElement(Section, {
        title: '接口说明',
        description: '接口用途',
        id: 'api',
        className: 'section-example',
        children: createElement('div', null, '正文'),
      }),
    ),
    '<section class="min-w-0 space-y-4 section-example" id="api"><header class="space-y-1"><h2 class="text-lg font-semibold">接口说明</h2><p class="text-sm text-muted-foreground">接口用途</p></header><div>正文</div></section>',
  );
});

void test('Section distinguishes identical field text and preserves the complete caller reference', () => {
  for (const id of ['section-1', { section: 'api', revision: 2 }, 0, false, null]) {
    const tree = Section({
      title: '接口',
      description: '接口',
      annotationTarget: id,
      children: createElement(AnnotationText, { target: 'body', children: '独立正文' }),
    });
    assert.deepEqual(textSources(tree), [
      { target: { id, field: 'title' }, children: '接口' },
      { target: { id, field: 'description' }, children: '接口' },
      { target: 'body', children: '独立正文' },
    ]);
  }
  assert.deepEqual(
    textSources(Section({ annotationTarget: 'empty', title: '', description: '' })),
    [],
  );
  assert.deepEqual(
    textSources(Section({ annotationTarget: 'description-only', description: '说明' })),
    [{ target: { id: 'description-only', field: 'description' }, children: '说明' }],
  );
});

void test('annotated Section retains semantic headings and does not forward annotation props to HTML', () => {
  const html = renderToStaticMarkup(
    createElement(UIProvider, {
      children: createElement(Section, {
        title: '接口说明',
        description: '接口用途',
        annotationTarget: 'section-1',
        id: 'annotated-api',
        children: createElement('p', null, '正文'),
      }),
    }),
  );
  assert.match(html, /<section class="min-w-0 space-y-4" id="annotated-api">/);
  assert.match(
    html,
    /<h2 class="text-lg font-semibold"><span data-annotation-text="">接口说明<\/span><\/h2>/,
  );
  assert.match(
    html,
    /<p class="text-sm text-muted-foreground"><span data-annotation-text="">接口用途<\/span><\/p>/,
  );
  assert.match(html, /<p>正文<\/p><\/section>/);
  assert.equal((html.match(/data-annotation-text=""/g) ?? []).length, 2);
  assert.doesNotMatch(html, /annotationTarget=|field=|section-1/);
});

void test('Page without annotationTarget keeps its original markup outside a page session', () => {
  assert.equal(
    renderToStaticMarkup(
      createElement(Page, {
        title: '缓存方案',
        description: '先缓存商品详情',
        id: 'cache',
        className: 'page-example',
        children: createElement('div', null, '正文'),
      }),
    ),
    '<main class="mx-auto w-full max-w-6xl space-y-8 p-4 md:p-8 page-example" id="cache"><header class="space-y-2"><h1 class="text-2xl font-semibold tracking-tight">缓存方案</h1><p class="text-muted-foreground">先缓存商品详情</p></header><div>正文</div></main>',
  );
});

void test('Page uses the same field references as Section without registering ordinary children', () => {
  for (const id of ['page-1', { page: 'cache', revision: 2 }, 0, false, null]) {
    const props = {
      title: '接口',
      description: '接口',
      annotationTarget: id,
      children: createElement('p', null, '普通正文'),
    };
    assert.deepEqual(textSources(Page(props)), textSources(Section(props)));
    assert.deepEqual(textSources(Page(props)), [
      { target: { id, field: 'title' }, children: '接口' },
      { target: { id, field: 'description' }, children: '接口' },
    ]);
  }
  assert.deepEqual(
    textSources(Page({ annotationTarget: 'empty', title: '', description: '' })),
    [],
  );
  assert.deepEqual(
    textSources(Page({ annotationTarget: 'description-only', description: '说明' })),
    [{ target: { id: 'description-only', field: 'description' }, children: '说明' }],
  );
});

void test('annotated Page retains its heading, layout and HTML attributes', () => {
  const html = renderToStaticMarkup(
    createElement(UIProvider, {
      children: createElement(Page, {
        title: '缓存方案',
        description: '先缓存商品详情',
        annotationTarget: 'page-1',
        id: 'annotated-page',
        children: createElement('p', null, '正文'),
      }),
    }),
  );
  assert.match(
    html,
    /<main class="mx-auto w-full max-w-6xl space-y-8 p-4 md:p-8" id="annotated-page">/,
  );
  assert.match(
    html,
    /<h1 class="text-2xl font-semibold tracking-tight"><span data-annotation-text="">缓存方案<\/span><\/h1>/,
  );
  assert.match(
    html,
    /<p class="text-muted-foreground"><span data-annotation-text="">先缓存商品详情<\/span><\/p>/,
  );
  assert.match(html, /<p>正文<\/p><\/main>/);
  assert.equal((html.match(/data-annotation-text=""/g) ?? []).length, 2);
  assert.doesNotMatch(html, /annotationTarget=|field=|page-1/);
});
