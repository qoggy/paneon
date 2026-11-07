import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

const root = join(import.meta.dirname, '..');
const references = join(root, 'skills/paneon-visualize/references');
const components = join(references, 'components');
const sections = ['Use when', 'Import', 'Props'];

// Public values without a component reference, each with the reason.
const documentedInAuthoring = new Set([
  'AnnotationText',
  'usePageAnnotations',
  'useAnnotations',
  'useUI',
]);
const excluded: Record<string, string> = {
  UIProvider: 'the host wraps every panel in it',
  TooltipProvider: 'UIProvider renders it',
  Toaster: 'UIProvider renders it',
  ToastProvider: 'part of the Toaster that UIProvider renders',
  ToastPortal: 'part of the Toaster that UIProvider renders',
  ToastViewport: 'part of the Toaster that UIProvider renders',
  Toast: 'part of the Toaster that UIProvider renders',
  ToastContent: 'part of the Toaster that UIProvider renders',
  ToastTitle: 'part of the Toaster that UIProvider renders',
  ToastDescription: 'part of the Toaster that UIProvider renders',
  ToastAction: 'part of the Toaster that UIProvider renders',
  ToastClose: 'part of the Toaster that UIProvider renders',
  createToastManager: 'a separate manager needs its own Toaster, which panels do not render',
};

function uiExports() {
  const entry = join(root, 'src/ui/index.ts');
  const program = ts.createProgram([entry], {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2023,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);
  assert.ok(source, `${entry} is part of the program`);
  const module = checker.getSymbolAtLocation(source);
  assert.ok(module, `${entry} is a module`);
  const values = new Set<string>();
  const all = new Set<string>();
  for (const symbol of checker.getExportsOfModule(module)) {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    all.add(symbol.name);
    if (target.flags & ts.SymbolFlags.Value) values.add(symbol.name);
  }
  return { values, all };
}

type Reference = { file: string; headings: string[]; useWhen: string[]; imports: string[] };

function parseReference(file: string): Reference {
  const text = readFileSync(join(components, file), 'utf8');
  const headings: string[] = [];
  const body = new Map<string, string[]>();
  let current: string[] | undefined;
  let fenced = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    const heading = !fenced && /^## (.+)$/.exec(line);
    if (heading) {
      headings.push(heading[1]);
      body.set(heading[1], (current = []));
    } else current?.push(line);
  }
  const useWhen = (body.get('Use when') ?? []).filter((line) => line.trim() !== '');
  const importSection = (body.get('Import') ?? []).join('\n');
  const imports = [...importSection.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@qoggy\/paneon\/ui'/g)]
    .flatMap((match) => match[1].split(','))
    .map((name) => name.trim().replace(/^type\s+/, ''))
    .filter(Boolean);
  return { file, headings, useWhen, imports };
}

const files = readdirSync(components)
  .filter((file) => file.endsWith('.md') && file !== 'index.md')
  .sort();
const parsed = files.map(parseReference);

void test('component references follow the three-section format', () => {
  assert.ok(files.length > 0);
  for (const reference of parsed) {
    assert.deepEqual(reference.headings, sections, reference.file);
    assert.equal(reference.useWhen.length, 1, `${reference.file}: Use when is one line`);
    assert.ok(reference.imports.length > 0, `${reference.file}: Import lists names`);
  }
});

void test('component references match the public UI exports', () => {
  const { values, all } = uiExports();
  const documented = new Map<string, string>();
  for (const reference of parsed)
    for (const name of reference.imports) {
      assert.ok(all.has(name), `${reference.file}: ${name} is not exported by @qoggy/paneon/ui`);
      documented.set(name, reference.file);
    }
  const authoring = readFileSync(join(references, 'authoring.md'), 'utf8');
  for (const name of documentedInAuthoring)
    assert.ok(authoring.includes(`\`${name}`), `authoring.md documents ${name}`);
  for (const name of values)
    assert.ok(
      documented.has(name) || documentedInAuthoring.has(name) || name in excluded,
      `${name} is exported without a component reference or an exclusion`,
    );
  for (const name of [...documentedInAuthoring, ...Object.keys(excluded)]) {
    assert.ok(values.has(name), `${name} is listed in the test but no longer exported`);
    assert.ok(!documented.has(name), `${name} is both excluded and documented`);
  }
});

void test('the component index links every reference with its Use when sentence', () => {
  const index = readFileSync(join(components, 'index.md'), 'utf8').split('\n');
  for (const reference of parsed) {
    const rows = index.filter((line) => line.includes(`](${reference.file})`));
    assert.equal(rows.length, 1, `index.md links ${reference.file} once`);
    assert.ok(
      rows[0].includes(reference.useWhen[0].trim()),
      `index.md repeats the Use when sentence of ${reference.file}`,
    );
  }
  for (const [, target] of index.join('\n').matchAll(/\]\(([^)#]+\.md)\)/g))
    assert.ok(files.includes(target), `index.md links missing ${target}`);
});
