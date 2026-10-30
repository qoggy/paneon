import ts from 'typescript';
import { isAbsolute, relative, resolve } from 'node:path';

/** Static, best-effort check that annotation pages give every content source a target. */

const UNKNOWN = Symbol('unknown');
const PRESENT = Symbol('present');
type Env = Map<ts.Symbol | undefined, unknown>;
type Fn = ts.FunctionLikeDeclaration & { body: ts.Node };
type Children = { childrenNodes: readonly ts.Node[]; env: Env };
type Group = 'missing' | 'text' | 'unchecked';
export type AnnotationFinding = { location: string; message: string; excerpt: string };
export type AnnotationCheck = {
  summary: string;
  next: string;
  missingTargets: AnnotationFinding[];
  unannotatedText: AnnotationFinding[];
  unchecked: AnnotationFinding[];
};

// Interactive controls and interface chrome never carry plan content.
const skipped = new Set([
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'label',
  'Button',
  'Input',
  'Textarea',
  'Select',
  'SelectTrigger',
  'SelectContent',
  'SelectItem',
  'Checkbox',
  'Switch',
  'RadioGroup',
  'RadioGroupItem',
  'Label',
  'FieldLabel',
  'FieldError',
  'TabsList',
  'TabsTrigger',
  'DropdownMenuContent',
  'DropdownMenuItem',
  'ContextMenuContent',
  'ContextMenuItem',
  'NavigationMenu',
  'Pagination',
  'TooltipContent',
  'Alert',
  'Empty',
  'Spinner',
  'Badge',
  'StatusBadge',
]);
const sources = new Set(['Markdown', 'CodeBlock', 'Image', 'Mermaid']);
const hasLetter = (text: string) => /\p{L}/u.test(text);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !('kind' in value && 'pos' in value);
const isFn = (value: unknown): value is Fn =>
  typeof value === 'object' &&
  value !== null &&
  'kind' in value &&
  ts.isFunctionLike(value as ts.Node) &&
  (value as ts.FunctionLikeDeclaration).body !== undefined;
const isChildren = (value: unknown): value is Children =>
  typeof value === 'object' && value !== null && 'childrenNodes' in value;
const field = (value: unknown, key: unknown) =>
  value === UNKNOWN || value === PRESENT || key === UNKNOWN
    ? UNKNOWN
    : record(value) && typeof key === 'string'
      ? value[key]
      : Array.isArray(value) && typeof key === 'number'
        ? (value as unknown[])[key]
        : undefined;
/** Static property name: `a`, `'a'` and `1` are keys; computed names are not. */
const keyName = (name: ts.PropertyName | ts.BindingName) =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
    ? name.text
    : UNKNOWN;
const moduleName = (node: ts.Node) =>
  ts.isStringLiteral(node) ? node.text : node.getText().replace(/^['"]|['"]$/g, '');

export function checkAnnotations(entryPath: string): AnnotationCheck {
  const entry = resolve(entryPath);
  const program = ts.createProgram([entry], {
    jsx: ts.JsxEmit.ReactJSX,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ESNext,
    allowJs: true,
    noEmit: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const root = program.getSourceFile(entry);
  if (!root)
    throw Object.assign(new Error('The entry is not readable.'), { code: 'INVALID_ARGUMENT' });
  const found: Record<Group, AnnotationFinding[]> = { missing: [], text: [], unchecked: [] };
  const emitted = new Set<string>();
  const active = new Set<ts.Node>();
  let session = false;
  let opaque = false;

  function report(node: ts.Node, group: Group, message: string) {
    const file = node.getSourceFile();
    const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
    const path = relative(process.cwd(), file.fileName);
    const location = `${path.startsWith('..') || isAbsolute(path) ? file.fileName : path}:${line + 1}:${character + 1}`;
    const key = `${location}:${message}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    found[group].push({
      location,
      message,
      excerpt: node.getText(file).replace(/\s+/g, ' ').slice(0, 120),
    });
  }

  function symbol(node: ts.Node) {
    let value = checker.getSymbolAtLocation(node);
    if (value && value.flags & ts.SymbolFlags.Alias) value = checker.getAliasedSymbol(value);
    return value;
  }

  /** The exported name when the tag comes from @qoggy/paneon/ui. */
  function publicName(node: ts.Node): string | undefined {
    const name = ts.isPropertyAccessExpression(node) ? node.name : node;
    // Follow local re-exports such as `export { DiffView } from '@qoggy/paneon/ui'`.
    let current = checker.getSymbolAtLocation(name);
    for (let depth = 0; current && depth < 10; depth++) {
      for (const declaration of current.declarations ?? []) {
        const specifier = ts.isImportSpecifier(declaration)
          ? declaration.parent.parent.parent.moduleSpecifier
          : ts.isExportSpecifier(declaration)
            ? declaration.parent.parent.moduleSpecifier
            : undefined;
        if (
          specifier &&
          moduleName(specifier) === '@qoggy/paneon/ui' &&
          (ts.isImportSpecifier(declaration) || ts.isExportSpecifier(declaration))
        )
          return (declaration.propertyName ?? declaration.name).getText();
      }
      if (!(current.flags & ts.SymbolFlags.Alias)) break;
      current = checker.getImmediateAliasedSymbol(current);
    }
    if (ts.isPropertyAccessExpression(node)) {
      const namespace = checker.getSymbolAtLocation(node.expression);
      if (
        namespace?.declarations?.some(
          (declaration) =>
            ts.isNamespaceImport(declaration) &&
            moduleName(declaration.parent.parent.moduleSpecifier) === '@qoggy/paneon/ui',
        )
      )
        return node.name.text;
    }
  }

  function read(node: ts.Node | undefined, env: Env, seen = new Set<ts.Node>()): unknown {
    if (!node) return undefined;
    if (seen.has(node)) return UNKNOWN;
    seen = new Set(seen).add(node);
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node)
    )
      return read(node.expression, env, seen);
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isVoidExpression(node)) return undefined;
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node))
      return node;
    if (ts.isIdentifier(node)) {
      const binding = symbol(node);
      if (env.has(binding)) return env.get(binding);
      const declaration = binding?.valueDeclaration;
      if (node.text === 'undefined' && !declaration) return undefined;
      if (declaration && ts.isVariableDeclaration(declaration))
        return read(declaration.initializer, env, seen);
      if (declaration && ts.isFunctionDeclaration(declaration)) return declaration;
      return UNKNOWN;
    }
    if (ts.isObjectLiteralExpression(node)) {
      const result: Record<string, unknown> = {};
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) {
          const spread = read(property.expression, env, seen);
          if (!record(spread)) return spread == null ? result : UNKNOWN;
          Object.assign(result, spread);
        } else if (
          ts.isPropertyAssignment(property) ||
          ts.isShorthandPropertyAssignment(property)
        ) {
          const key = keyName(property.name);
          if (key === UNKNOWN) return UNKNOWN;
          result[key] = read(
            ts.isPropertyAssignment(property) ? property.initializer : property.name,
            env,
            seen,
          );
        }
      }
      return result;
    }
    if (ts.isArrayLiteralExpression(node))
      return node.elements.map((item) => read(item, env, seen));
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const object = read(node.expression, env, seen);
      if (object === UNKNOWN && ts.isPropertyAccessExpression(node)) {
        // Namespace imports such as parts.Note resolve through the type checker.
        const declaration = symbol(node.name)?.valueDeclaration;
        if (declaration && ts.isFunctionDeclaration(declaration)) return declaration;
        if (declaration && ts.isVariableDeclaration(declaration))
          return read(declaration.initializer, env, seen);
      }
      return field(
        object,
        ts.isPropertyAccessExpression(node)
          ? node.name.text
          : read(node.argumentExpression, env, seen),
      );
    }
    if (ts.isConditionalExpression(node)) {
      const condition = read(node.condition, env, seen);
      if (condition !== UNKNOWN) return read(condition ? node.whenTrue : node.whenFalse, env, seen);
    }
    return UNKNOWN;
  }

  /** A computed value whose type can never be undefined still counts as present. */
  function attributeValue(expression: ts.Expression | undefined, env: Env) {
    const value = read(expression, env);
    if (value !== UNKNOWN || !expression) return value;
    const type = checker.getTypeAtLocation(expression);
    const optional =
      ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Any | ts.TypeFlags.Unknown;
    return (type.isUnion() ? type.types : [type]).some((item) => item.flags & optional)
      ? UNKNOWN
      : PRESENT;
  }

  function attributes(opening: ts.JsxOpeningLikeElement, env: Env) {
    const values = new Map<string, unknown>();
    let unknownSpread = false;
    for (const attribute of opening.attributes.properties) {
      if (ts.isJsxSpreadAttribute(attribute)) {
        const spread = read(attribute.expression, env);
        if (record(spread))
          for (const [key, value] of Object.entries(spread)) values.set(key, value);
        else if (spread != null) {
          values.clear();
          unknownSpread = true;
        }
      } else {
        const initializer = attribute.initializer;
        const expression =
          initializer && ts.isJsxExpression(initializer) ? initializer.expression : undefined;
        // Rendered JSX in any prop is followed like children; render functions stay callable.
        if (expression && !ts.isFunctionLike(expression) && containsJsx(expression)) {
          values.set(attribute.name.getText(), {
            childrenNodes: [expression],
            env,
          } satisfies Children);
          continue;
        }
        values.set(
          attribute.name.getText(),
          !initializer
            ? true
            : ts.isJsxExpression(initializer)
              ? attributeValue(initializer.expression, env)
              : ts.isStringLiteral(initializer)
                ? initializer.text
                : UNKNOWN,
        );
      }
    }
    return {
      get: (key: string) =>
        values.has(key) ? values.get(key) : unknownSpread ? UNKNOWN : undefined,
      values,
      unknownSpread,
    };
  }

  function requireTarget(node: ts.Node, value: unknown, label: string) {
    if (value === undefined) report(node, 'missing', `${label} has no annotation target.`);
    else if (value === UNKNOWN)
      report(node, 'unchecked', `Cannot determine the annotation target of ${label}.`);
  }

  function bind(pattern: ts.BindingName, value: unknown, env: Env) {
    if (ts.isIdentifier(pattern)) env.set(symbol(pattern), value);
    else if (ts.isObjectBindingPattern(pattern))
      for (const item of pattern.elements) {
        let value_ = field(value, keyName(item.propertyName ?? item.name));
        if (value_ === undefined && item.initializer) value_ = read(item.initializer, env);
        bind(item.name, item.dotDotDotToken ? UNKNOWN : value_, env);
      }
  }

  function invoke(fn: Fn, props: unknown, env: Env, site: ts.Node) {
    if (active.has(fn)) {
      if (ts.isJsxOpeningLikeElement(site))
        report(site, 'unchecked', 'Recursive component content was not checked.');
      return;
    }
    const inner = new Map(env);
    if (fn.parameters[0]) bind(fn.parameters[0].name, props, inner);
    active.add(fn);
    walk(fn.body, inner);
    active.delete(fn);
  }

  function text(node: ts.Node, value: string) {
    if (hasLetter(value)) report(node, 'text', 'Text is not annotatable.');
  }

  function children(nodes: readonly ts.Node[], env: Env) {
    for (const node of nodes) {
      if (ts.isJsxText(node) || ts.isStringLiteralLike(node)) text(node, node.text);
      else if (ts.isJsxExpression(node)) {
        if (!node.expression) continue;
        const value = read(node.expression, env);
        if (isChildren(value)) children(value.childrenNodes, value.env);
        else if (typeof value === 'string') text(node, value);
        else if (value === UNKNOWN) {
          if (containsJsx(node.expression)) walk(node.expression, env);
          else {
            // Follow calls such as {render()} into local functions that return JSX.
            walk(node.expression, env);
            // Only expressions that are always text count; ReactNode values may hold annotated JSX.
            const type = checker.getTypeAtLocation(node.expression);
            const parts = (type.isUnion() ? type.types : [type]).filter(
              (item) =>
                !(
                  item.flags &
                  (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.BooleanLiteral)
                ),
            );
            if (parts.length && parts.every((item) => item.flags & ts.TypeFlags.StringLike))
              report(node, 'text', 'Text is not annotatable.');
          }
        }
      } else walk(node, env);
    }
  }

  function containsJsx(node: ts.Node): boolean {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node))
      return true;
    return ts.forEachChild(node, containsJsx) ?? false;
  }

  /** `Fragment` / `React.Fragment` imported from react. */
  function isReactFragment(tag: ts.JsxTagNameExpression) {
    const name = ts.isPropertyAccessExpression(tag) ? tag.name : tag;
    if (name.getText() !== 'Fragment') return false;
    const declaration = checker.getSymbolAtLocation(
      ts.isPropertyAccessExpression(tag) ? tag.expression : tag,
    )?.declarations?.[0];
    const module = declaration && ts.findAncestor(declaration, ts.isImportDeclaration);
    return !!module && moduleName(module.moduleSpecifier) === 'react';
  }

  function jsx(node: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment, env: Env) {
    if (ts.isJsxFragment(node)) return children(node.children, env);
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const childNodes = ts.isJsxElement(node) ? node.children : [];
    if (isReactFragment(opening.tagName)) return children(childNodes, env);
    const name = publicName(opening.tagName);
    const literal = opening.tagName.getText();
    const intrinsic = ts.isIdentifier(opening.tagName) && /^[a-z]/.test(literal);
    const props = attributes(opening, env);
    const hidden = props.get('aria-hidden');
    if (
      skipped.has(name ?? (intrinsic ? literal : '')) ||
      (name && /^(Alert|Empty|NavigationMenu|Pagination|Select)/.test(name)) ||
      // Menus and tooltips wrap page content in their root and trigger; only their popups are chrome.
      (name && /^(Tooltip|DropdownMenu|ContextMenu)./.test(name) && !name.endsWith('Trigger')) ||
      hidden === true ||
      hidden === 'true' ||
      ['button', 'textbox', 'combobox', 'checkbox', 'switch', 'radio', 'status', 'alert'].includes(
        props.get('role') as string,
      )
    )
      return;
    const local = !name && !intrinsic && isFn(read(opening.tagName, env));
    if (!local)
      for (const [key, value] of props.values)
        if (key !== 'children' && isChildren(value)) children(value.childrenNodes, value.env);
    if (name === 'AnnotationText') return requireTarget(opening, props.get('target'), name);
    if (name && sources.has(name)) {
      requireTarget(opening, props.get('annotationTarget'), name);
      if (name === 'Markdown' && props.get('components') !== undefined)
        report(opening, 'unchecked', 'Markdown with custom components may not map annotations.');
      return;
    }
    if (name === 'DiffView') {
      const targets = props.get('annotationTargets');
      for (const side of ['old', 'new'])
        requireTarget(opening, field(targets, side), `DiffView ${side} side`);
      return;
    }
    if (name === 'Page' || name === 'Section') {
      for (const key of ['title', 'description']) {
        const value = props.get(key);
        if (value !== undefined && value !== '' && value !== null && value !== false)
          requireTarget(opening, props.get('annotationTarget'), `${name} ${key}`);
      }
    } else if (!name && !intrinsic) {
      const fn = read(opening.tagName, env);
      if (isFn(fn) && !fn.getSourceFile().isDeclarationFile) {
        const values = props.unknownSpread ? UNKNOWN : Object.fromEntries(props.values);
        if (record(values) && !props.values.has('children'))
          values.children = { childrenNodes: childNodes, env } satisfies Children;
        invoke(fn, values, env, opening);
      } else {
        opaque = true;
        report(opening, 'unchecked', `Cannot inspect component ${literal}.`);
        children(childNodes, env);
      }
      return;
    } else if (literal === 'svg') {
      return; // Icons and drawings; neither can carry annotations.
    } else if (literal === 'img' || literal === 'canvas') {
      report(
        opening,
        'unchecked',
        `<${literal}> cannot be annotated; use Image or Mermaid if it is content.`,
      );
      return;
    }
    if (childNodes.length) return children(childNodes, env);
    const value = props.get('children');
    if (isChildren(value)) children(value.childrenNodes, value.env);
    else if (typeof value === 'string') text(opening, value);
  }

  function walk(node: ts.Node | undefined, env: Env) {
    if (!node) return;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node))
      return jsx(node, env);
    if (ts.isFunctionDeclaration(node)) return;
    if (ts.isCallExpression(node)) {
      if (publicName(node.expression) === 'usePageAnnotations') session = true;
      else if (publicName(node.expression) === undefined) {
        const fn = read(node.expression, env);
        if (
          isFn(fn) &&
          !fn.getSourceFile().isDeclarationFile &&
          !fn.getSourceFile().fileName.replaceAll('\\', '/').includes('/node_modules/')
        )
          invoke(fn, read(node.arguments[0], env), env, node);
      }
    }
    ts.forEachChild(node, (child) => walk(child, env));
  }

  const env: Env = new Map();
  let render: unknown;
  for (const statement of root.statements) {
    if (ts.isExportAssignment(statement)) {
      const expression = statement.expression;
      const definition = read(
        ts.isCallExpression(expression) ? expression.arguments[0] : expression,
        env,
      );
      render = record(definition) ? definition.render : definition;
    } else if (
      ts.isFunctionDeclaration(statement) &&
      statement.modifiers?.some((item) => item.kind === ts.SyntaxKind.DefaultKeyword)
    )
      render = statement;
  }
  if (isFn(render)) invoke(render, UNKNOWN, env, render);
  else {
    opaque = true;
    report(root, 'unchecked', 'Cannot find the panel render function; the whole file was scanned.');
    walk(root, env);
  }
  if (!session)
    report(
      root,
      opaque ? 'unchecked' : 'missing',
      'The rendered page never calls usePageAnnotations, so nothing on it can be annotated.',
    );

  const { missing, text: plain, unchecked } = found;
  const summary =
    [
      missing.length &&
        `${missing.length} annotatable component(s) or heading(s) have no annotation target.`,
      plain.length && `${plain.length} piece(s) of text are not annotatable.`,
      unchecked.length && `${unchecked.length} item(s) could not be checked statically.`,
    ]
      .filter(Boolean)
      .join(' ') || 'Every checked component and heading has an annotation target.';
  const next =
    [
      missing.length &&
        'Add a target to each listed item the human should be able to annotate, then rerun.',
      plain.length &&
        'Wrap listed text that is page content in AnnotationText or a targeted component; leave interface text such as labels and status messages as is.',
      unchecked.length && 'Inspect the unchecked items in source.',
    ]
      .filter(Boolean)
      .join(' ') || 'Nothing to fix.';
  return { summary, next, missingTargets: missing, unannotatedText: plain, unchecked };
}
