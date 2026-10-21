import ts from 'typescript';
import { relative, dirname, resolve } from 'node:path';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { PaneonError } from '../shared/types.js';
export type SourceModule = {
  file: string;
  source: ts.SourceFile;
  actions: Map<
    string,
    { statement: ts.Statement; call: ts.CallExpression; kind: 'query' | 'mutation' }
  >;
  names: Map<string, ts.Statement>;
  imports: Map<string, { statement: ts.ImportDeclaration; specifier: string; imported: string }>;
  checker: ts.TypeChecker;
  symbols: Map<ts.Symbol, string>;
};
const printer = ts.createPrinter();
function bindingIdentifiers(name: ts.BindingName): ts.Identifier[] {
  return ts.isIdentifier(name)
    ? [name]
    : name.elements.flatMap((element) =>
        ts.isOmittedExpression(element) ? [] : bindingIdentifiers(element.name),
      );
}
function isTypeOnlyImport(statement: ts.ImportDeclaration): boolean {
  const clause = statement.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  return Boolean(
    !clause.name &&
    bindings &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((binding) => binding.isTypeOnly),
  );
}
export function parseModule(
  file: string,
  readSource: (file: string) => string = (path) => readFileSync(path, 'utf8'),
): SourceModule {
  const source = ts.createSourceFile(
    file,
    readSource(file),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const names = new Map<string, ts.Statement>();
  const imports: SourceModule['imports'] = new Map();
  const actions: SourceModule['actions'] = new Map();
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      // TypeScript checks these imports before extraction. They must not become
      // runtime bindings when import declarations are reconstructed below.
      if (isTypeOnlyImport(statement)) continue;
      const specifier = statement.moduleSpecifier.text;
      const clause = statement.importClause;
      if (clause?.name)
        imports.set(clause.name.text, { statement, specifier, imported: 'default' });
      if (clause?.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings))
          imports.set(clause.namedBindings.name.text, { statement, specifier, imported: '*' });
        else
          for (const s of clause.namedBindings.elements)
            if (!s.isTypeOnly)
              imports.set(s.name.text, {
                statement,
                specifier,
                imported: s.propertyName?.text ?? s.name.text,
              });
      }
    } else if (ts.isVariableStatement(statement))
      for (const d of statement.declarationList.declarations) {
        for (const name of bindingIdentifiers(d.name)) names.set(name.text, statement);
      }
    else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement)) &&
      statement.name
    )
      names.set(statement.name.text, statement);
  }
  const serverNames = new Set(
    [...imports]
      .filter(([, i]) => i.specifier === 'paneon/sdk' && i.imported === 'serverAction')
      .map(([n]) => n),
  );
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      serverNames.has(node.expression.text)
    ) {
      const declaration = node.parent;
      const list = declaration.parent;
      const statement = list.parent;
      if (
        !ts.isVariableDeclaration(declaration) ||
        !ts.isIdentifier(declaration.name) ||
        !ts.isVariableDeclarationList(list) ||
        !ts.isVariableStatement(statement) ||
        statement.parent !== source ||
        !statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ||
        statement.declarationList.declarations.length !== 1 ||
        !(list.flags & ts.NodeFlags.Const)
      )
        throw new PaneonError(
          'UNSUPPORTED_ACTION_CAPTURE',
          'Declare actions as top-level named exported constants.',
          { entryPath: file },
        );
      const options = node.arguments[0];
      if (!options || !ts.isObjectLiteralExpression(options))
        throw new PaneonError(
          'UNSUPPORTED_ACTION_CAPTURE',
          'Action options must be an object literal.',
          { entryPath: file },
        );
      const kind = options.properties.find(
        (p) => ts.isPropertyAssignment(p) && p.name.getText(source) === 'kind',
      );
      const kindValue =
        kind && ts.isPropertyAssignment(kind) && ts.isStringLiteral(kind.initializer)
          ? kind.initializer.text
          : 'mutation';
      if (kindValue !== 'query' && kindValue !== 'mutation')
        throw new PaneonError('BUILD_FAILED', 'Action kind must be query or mutation.');
      actions.set(declaration.name.text, { statement, call: node, kind: kindValue });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  const host = ts.createCompilerHost({ noLib: true, noResolve: true });
  host.getSourceFile = (name) => (name === file ? source : undefined);
  const checker = ts
    .createProgram([file], { noLib: true, noResolve: true, jsx: ts.JsxEmit.ReactJSX }, host)
    .getTypeChecker();
  const symbols = new Map<ts.Symbol, string>();
  for (const [name, statement] of names) {
    const node = ts.isVariableStatement(statement)
      ? statement.declarationList.declarations
          .flatMap((declaration) => bindingIdentifiers(declaration.name))
          .find((binding) => binding.text === name)
      : 'name' in statement
        ? (statement.name as ts.Node)
        : undefined;
    const symbol = node && checker.getSymbolAtLocation(node);
    if (symbol) symbols.set(symbol, name);
  }
  for (const [name, imported] of imports) {
    const clause = imported.statement.importClause;
    const binding = clause?.namedBindings;
    const node =
      clause?.name?.text === name
        ? clause.name
        : binding && ts.isNamespaceImport(binding)
          ? binding.name
          : binding && ts.isNamedImports(binding)
            ? binding.elements.find((e) => e.name.text === name)?.name
            : undefined;
    const symbol = node && checker.getSymbolAtLocation(node);
    if (symbol) symbols.set(symbol, name);
  }
  return { file, source, names, imports, actions, checker, symbols };
}
export function staticRequirement(module: SourceModule, version: string): string {
  const statement = module.source.statements.find(ts.isExportAssignment);
  const call = statement?.expression;
  if (
    !call ||
    !ts.isCallExpression(call) ||
    !ts.isIdentifier(call.expression) ||
    module.imports.get(call.expression.text)?.imported !== 'definePanel'
  )
    throw new PaneonError(
      'INVALID_PANEON_REQUIREMENT',
      'Default-export definePanel with a literal requires.paneon range.',
      { entryPath: module.file, currentVersion: version },
    );
  const obj = call.arguments[0];
  const property = (node: ts.Node | undefined, name: string): ts.Expression | undefined =>
    node && ts.isObjectLiteralExpression(node)
      ? node.properties.find(
          (p): p is ts.PropertyAssignment =>
            ts.isPropertyAssignment(p) &&
            p.name.getText(module.source).replace(/['"]/g, '') === name,
        )?.initializer
      : undefined;
  const range = property(property(obj, 'requires'), 'paneon');
  if (!range || !ts.isStringLiteral(range))
    throw new PaneonError(
      'INVALID_PANEON_REQUIREMENT',
      'requires.paneon must be a literal npm semver range.',
      { entryPath: module.file, currentVersion: version },
    );
  return range.text;
}
function references(node: ts.Node, module: SourceModule) {
  const refs = new Set<string>();
  function visit(n: ts.Node) {
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword)
      throw new PaneonError(
        'UNSUPPORTED_ACTION_CAPTURE',
        'Dynamic imports are not supported in panel source.',
      );
    if (ts.isIdentifier(n)) {
      const symbol = ts.isShorthandPropertyAssignment(n.parent)
        ? module.checker.getShorthandAssignmentValueSymbol(n.parent)
        : module.checker.getSymbolAtLocation(n);
      const name = symbol && module.symbols.get(symbol);
      if (name) refs.add(name);
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
  return refs;
}
function localPath(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return;
  const raw = resolve(dirname(from), specifier);
  if (existsSync(raw) && statSync(raw).isFile() && !/\.[cm]?[jt]sx?$/.test(raw)) return;
  for (const path of [
    raw,
    raw + '.ts',
    raw + '.tsx',
    raw.replace(/\.js$/, '.ts'),
    raw.replace(/\.js$/, '.tsx'),
    resolve(raw, 'index.ts'),
    resolve(raw, 'index.tsx'),
  ])
    if (existsSync(path) && statSync(path).isFile() && !path.endsWith('.css')) return path;
  if (specifier.endsWith('.css')) return;
  throw new PaneonError('BUILD_FAILED', 'A local dependency could not be resolved.', {
    entryPath: from,
    dependency: specifier,
  });
}
export type Graph = {
  modules: Map<string, SourceModule>;
  sources: Map<string, string>;
  actions: { id: string; name: string; file: string; kind: 'query' | 'mutation' }[];
};
export function createGraph(
  entry: string,
  side: 'client' | 'server',
  readSource?: (file: string) => string,
): Graph {
  const modules = new Map<string, SourceModule>();
  const selected = new Map<string, Set<ts.Statement>>();
  const selectedImports = new Map<string, Set<string>>();
  const roots = new Map<string, Set<string>>();
  const actions: Graph['actions'] = [];
  const load = (file: string) => {
    let m = modules.get(file);
    if (!m) {
      m = parseModule(file, readSource);
      modules.set(file, m);
      selected.set(file, new Set());
      selectedImports.set(file, new Set());
      roots.set(file, new Set());
      for (const [name, a] of m.actions)
        actions.push({
          id: `${relative(dirname(entry), file).replaceAll('\\', '/')}#${name}`,
          name,
          file,
          kind: a.kind,
        });
    }
    return m;
  };
  function select(file: string, node: ts.Statement) {
    const m = load(file);
    const set = selected.get(file)!;
    if (set.has(node)) return;
    set.add(node);
    const action = [...m.actions].find(([, a]) => a.statement === node);
    if (side === 'client' && action) return;
    if (
      side === 'server' &&
      ts.isExportAssignment(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isObjectLiteralExpression(node.expression.arguments[0])
    ) {
      const opts = node.expression.arguments[0];
      for (const p of opts.properties)
        if (p.name?.getText(m.source) !== 'render')
          for (const name of references(p, m)) reference(file, name);
      reference(file, node.expression.expression.getText(m.source));
      return;
    }
    if (
      side === 'server' &&
      ts.isVariableStatement(node) &&
      !(node.declarationList.flags & ts.NodeFlags.Const)
    )
      throw new PaneonError(
        'UNSUPPORTED_ACTION_CAPTURE',
        'Actions cannot capture mutable module bindings.',
        { entryPath: file },
      );
    for (const name of references(node, m)) reference(file, name);
  }
  function reference(file: string, name: string) {
    const m = load(file);
    const imported = m.imports.get(name);
    if (imported) {
      selectedImports.get(file)!.add(name);
      const local = localPath(file, imported.specifier);
      if (local) include(local, imported.imported);
      else if (
        side === 'client' &&
        (imported.specifier.startsWith('node:') || builtinModules.includes(imported.specifier))
      )
        throw new PaneonError('BUILD_FAILED', 'Browser code cannot import Node modules.', {
          entryPath: file,
          dependency: imported.specifier,
        });
      return;
    }
    const declaration = m.names.get(name);
    if (declaration) select(file, declaration);
  }
  function include(file: string, exported: string) {
    const m = load(file);
    const done = roots.get(file)!;
    if (done.has(exported)) return;
    done.add(exported);
    if (exported === 'default') {
      const d = m.source.statements.find(ts.isExportAssignment);
      if (d) select(file, d);
    } else if (exported === '*') {
      for (const n of m.names.keys()) reference(file, n);
    } else {
      const n = m.names.get(exported);
      if (n) select(file, n);
      else
        for (const s of m.source.statements)
          if (ts.isExportDeclaration(s)) {
            select(file, s);
            if (s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier)) {
              const p = localPath(file, s.moduleSpecifier.text);
              if (p) include(p, exported);
            }
          }
    }
    for (const s of m.source.statements)
      if (ts.isImportDeclaration(s) && !s.importClause) {
        if (ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text.endsWith('.css')) {
          if (side === 'client') selected.get(file)!.add(s);
        } else
          throw new PaneonError(
            'UNSUPPORTED_ACTION_CAPTURE',
            'Side-effect module imports are not supported; use explicit imports.',
            { entryPath: file },
          );
      }
  }
  include(entry, 'default');
  // Gather all statically declared actions reachable from the panel's source imports.
  const discovered = new Set<string>();
  function discover(file: string) {
    if (discovered.has(file)) return;
    discovered.add(file);
    const m = load(file);
    for (const a of m.actions.values()) if (side === 'server') select(file, a.statement);
    for (const s of m.source.statements)
      if (
        ts.isImportDeclaration(s) &&
        ts.isStringLiteral(s.moduleSpecifier) &&
        !isTypeOnlyImport(s)
      ) {
        const p = localPath(file, s.moduleSpecifier.text);
        if (p) {
          load(p);
          discover(p);
        }
      }
  }
  discover(entry);
  const sources = new Map<string, string>();
  for (const [file, m] of modules) {
    const lines: string[] = [];
    if (side === 'client' && m.actions.size)
      lines.push('import {createActionProxy as __paneonProxy} from "paneon/sdk/client";');
    for (const statement of m.source.statements) {
      if (ts.isImportDeclaration(statement) && statement.importClause) {
        const names = selectedImports.get(file)!;
        const clause = statement.importClause;
        const def = clause.name && names.has(clause.name.text) ? clause.name.text : undefined;
        const binding = clause.namedBindings;
        let named = '';
        if (binding && ts.isNamedImports(binding)) {
          const elements = binding.elements.filter((e) => names.has(e.name.text));
          if (elements.length) named = `{ ${elements.map((e) => e.getText(m.source)).join(', ')} }`;
        } else if (binding && names.has(binding.name.text)) named = `* as ${binding.name.text}`;
        if (def || named)
          lines.push(
            `import ${[def, named].filter(Boolean).join(', ')} from ${statement.moduleSpecifier.getText(m.source)};`,
          );
      } else if (selected.get(file)!.has(statement)) {
        const action = [...m.actions].find(([, a]) => a.statement === statement);
        if (side === 'client' && action) {
          const id = `${relative(dirname(entry), file).replaceAll('\\', '/')}#${action[0]}`;
          lines.push(
            `export const ${action[0]} = __paneonProxy(${JSON.stringify(id)},${JSON.stringify(action[1].kind)});`,
          );
        } else if (
          side === 'server' &&
          ts.isExportAssignment(statement) &&
          ts.isCallExpression(statement.expression) &&
          ts.isObjectLiteralExpression(statement.expression.arguments[0])
        ) {
          const obj = statement.expression.arguments[0];
          const filtered = ts.factory.updateObjectLiteralExpression(
            obj,
            obj.properties.filter((p) => p.name?.getText(m.source) !== 'render'),
          );
          lines.push(
            `export default ${statement.expression.expression.getText(m.source)}(${printer.printNode(ts.EmitHint.Expression, filtered, m.source)});`,
          );
        } else lines.push(statement.getText(m.source));
      }
    }
    sources.set(file, lines.join('\n'));
  }
  return { modules, sources, actions };
}
export function resolveThirdParty(specifier: string, importer: string) {
  try {
    return createRequire(importer).resolve(specifier);
  } catch {
    throw new PaneonError('BUILD_FAILED', 'A third-party dependency could not be resolved.', {
      entryPath: importer,
      dependency: specifier,
    });
  }
}
