import ts from 'typescript';
import { findingAt, type Finding } from './check-finding.js';

/** Static, best-effort check of original-source and precise-text annotation coverage. */

const UNKNOWN = Symbol('unknown');
const PRESENT = Symbol('present');
/** Alternatives are kept separate from objects so a branch is never treated as a target itself. */
class Alternatives {
  readonly values: unknown[];
  constructor(values: unknown[]) {
    this.values = values;
  }
}
class TypedValue {
  readonly type: ts.Type;
  readonly node: ts.Node;
  constructor(type: ts.Type, node: ts.Node) {
    this.type = type;
    this.node = node;
  }
}
const alternatives = (...values: unknown[]): unknown => {
  const distinct = [
    ...new Set(values.flatMap((value) => (value instanceof Alternatives ? value.values : [value]))),
  ];
  return distinct.length === 1 ? distinct[0] : new Alternatives(distinct);
};
const truth = (value: unknown): boolean | undefined => {
  if (value === UNKNOWN || value === PRESENT) return undefined;
  if (value instanceof Alternatives) {
    const results = value.values.map(truth);
    return results.every((result) => result === results[0]) ? results[0] : undefined;
  }
  return Boolean(value);
};
type Env = Map<ts.Symbol | undefined, unknown>;
type Fn = ts.FunctionLikeDeclaration & { body: ts.Node };
type Children = { childrenNodes: readonly ts.Node[]; env: Env };
type Group = 'missing' | 'text' | 'unchecked' | 'conditional';
/**
 * `enabled`: the rendered page calls usePageAnnotations. `disabled`: it certainly does not.
 * `undetermined`: it does not as far as the check can see, but an opaque component might.
 */
export type AnnotationStatus = 'enabled' | 'disabled' | 'undetermined';
export type AnnotationCheck = {
  status: AnnotationStatus;
  missingTargets: Finding[];
  unannotatedText: Finding[];
  unchecked: Finding[];
  /** Known optional DiffView targets: omitting a side intentionally disables its annotations. */
  conditionalTargets: Finding[];
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
  'Slider',
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
  !(value instanceof Alternatives) &&
  !(value instanceof TypedValue) &&
  !('kind' in value && 'pos' in value);
const isFn = (value: unknown): value is Fn =>
  typeof value === 'object' &&
  value !== null &&
  'kind' in value &&
  ts.isFunctionLike(value as ts.Node) &&
  (value as ts.FunctionLikeDeclaration).body !== undefined;
const isChildren = (value: unknown): value is Children =>
  typeof value === 'object' && value !== null && 'childrenNodes' in value;
/** Static property name: `a`, `'a'` and `1` are keys; computed names are not. */
const keyName = (name: ts.PropertyName | ts.BindingName) =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
    ? name.text
    : UNKNOWN;
const moduleName = (node: ts.Node) =>
  ts.isStringLiteral(node) ? node.text : node.getText().replace(/^['"]|['"]$/g, '');
const uiModule = (name: string) =>
  name === '@qoggy/paneon/ui' || name.startsWith('@qoggy/paneon/ui/');
const hookName = (name: string) => /^use[A-Z0-9]/.test(name);
/** A package outside the page whose hooks this check cannot read, unlike React's and Paneon's. */
const foreignPackage = (name: string) =>
  !/^(\.|\/|node:)/.test(name) &&
  !['react', 'react-dom'].includes(name.replace(/\/.*$/, '')) &&
  !name.startsWith('@qoggy/paneon');

/** The import declaration that brings a namespace or default binding from a foreign package. */
function foreignImport(declaration: ts.Declaration) {
  const clause = ts.isNamespaceImport(declaration)
    ? declaration.parent
    : ts.isImportClause(declaration)
      ? declaration
      : undefined;
  return !!clause && foreignPackage(moduleName(clause.parent.moduleSpecifier));
}

/**
 * Whether the page's own sources could reach usePageAnnotations at all: they name it anywhere,
 * load @qoggy/paneon/ui other than through named imports, which hides the names they use, or
 * take a hook from another package, whose implementation this check does not read.
 */
function mayReachHook(program: ts.Program) {
  const checker = program.getTypeChecker();
  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile || file.fileName.replaceAll('\\', '/').includes('/node_modules/'))
      continue;
    const found = (node: ts.Node): boolean => {
      if (
        (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) &&
        node.text === 'usePageAnnotations'
      )
        return true;
      // `import {useFeedback} from 'kit'`, `export {useFeedback} from 'kit'` and `export * from 'kit'`.
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        foreignPackage(moduleName(node.moduleSpecifier))
      ) {
        const names = ts.isImportDeclaration(node)
          ? [
              node.importClause?.name,
              ...(node.importClause?.namedBindings &&
              ts.isNamedImports(node.importClause.namedBindings)
                ? node.importClause.namedBindings.elements.map(
                    (item) => item.propertyName ?? item.name,
                  )
                : []),
            ]
          : node.exportClause && ts.isNamedExports(node.exportClause)
            ? node.exportClause.elements.map((item) => item.propertyName ?? item.name)
            : undefined;
        if (!names || names.some((name) => name && hookName(name.text))) return true;
      }
      // `kit.useFeedback()` through `import * as kit from 'kit'` or `import kit from 'kit'`.
      if (
        ts.isPropertyAccessExpression(node) &&
        hookName(node.name.text) &&
        ts.isIdentifier(node.expression) &&
        checker.getSymbolAtLocation(node.expression)?.declarations?.some(foreignImport)
      )
        return true;
      if (ts.isStringLiteralLike(node) && uiModule(node.text)) {
        const parent = node.parent;
        const named =
          ts.isImportDeclaration(parent) &&
          !parent.importClause?.name &&
          (!parent.importClause?.namedBindings ||
            ts.isNamedImports(parent.importClause.namedBindings));
        const reexport =
          ts.isExportDeclaration(parent) &&
          !!parent.exportClause &&
          ts.isNamedExports(parent.exportClause);
        if (!named && !reexport) return true;
      }
      return ts.forEachChild(node, found) ?? false;
    };
    if (found(file)) return true;
  }
  return false;
}

export function checkAnnotations(program: ts.Program, root: ts.SourceFile): AnnotationCheck {
  const checker = program.getTypeChecker();
  const found: Record<Group, Finding[]> = { missing: [], text: [], unchecked: [], conditional: [] };
  const emitted = new Set<string>();
  const active = new Set<ts.Node>();
  let session = false;
  let opaque = false;

  /** Use the checker for computed values; never execute page functions or their side effects. */
  function typedValue(type: ts.Type, node: ts.Node): unknown {
    if (type.isUnion()) return alternatives(...type.types.map((part) => typedValue(part, node)));
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter))
      return UNKNOWN;
    // Void/never do not prove a value: a helper may throw instead of returning a target.
    if (type.flags & (ts.TypeFlags.Never | ts.TypeFlags.Void)) return UNKNOWN;
    if (type.flags & ts.TypeFlags.Undefined) return undefined;
    if (type.flags & ts.TypeFlags.Null) return null;
    if (type.isStringLiteral() || type.isNumberLiteral()) return type.value;
    if (type.flags & ts.TypeFlags.BooleanLiteral) return checker.typeToString(type) === 'true';
    return type.flags & ts.TypeFlags.Object ? new TypedValue(type, node) : PRESENT;
  }

  function field(value: unknown, key: unknown): unknown {
    if (value instanceof Alternatives)
      return alternatives(...value.values.map((part) => field(part, key)));
    if (value === UNKNOWN || value === PRESENT || key === UNKNOWN) return UNKNOWN;
    if (value instanceof TypedValue) {
      if (typeof key !== 'string') return UNKNOWN;
      const property = checker.getPropertyOfType(value.type, key);
      if (!property)
        return checker.getIndexTypeOfType(value.type, ts.IndexKind.String) ? UNKNOWN : undefined;
      return typedValue(checker.getTypeOfSymbolAtLocation(property, value.node), value.node);
    }
    return record(value) && typeof key === 'string'
      ? value[key]
      : Array.isArray(value) && typeof key === 'number'
        ? value[key]
        : undefined;
  }

  function report(node: ts.Node, group: Group, message: string) {
    const finding = findingAt(node, message);
    const key = `${finding.location}:${message}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    found[group].push(finding);
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
        return declaration.initializer ? read(declaration.initializer, env, seen) : UNKNOWN;
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
      const condition = truth(read(node.condition, env, seen));
      return condition === undefined
        ? alternatives(read(node.whenTrue, env, seen), read(node.whenFalse, env, seen))
        : read(condition ? node.whenTrue : node.whenFalse, env, seen);
    }
    return UNKNOWN;
  }

  /** A computed value whose type can never be undefined still counts as present. */
  function attributeValue(expression: ts.Expression | undefined, env: Env) {
    const value = read(expression, env);
    if (value !== UNKNOWN || !expression) return value;
    return typedValue(checker.getTypeAtLocation(expression), expression);
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

  function requireTarget(node: ts.Node, value: unknown, label: string, allowConditional = false) {
    if (value instanceof Alternatives) {
      if (value.values.includes(UNKNOWN))
        report(node, 'unchecked', `Cannot determine the annotation target of ${label}.`);
      else if (value.values.includes(undefined))
        report(
          node,
          allowConditional ? 'conditional' : 'unchecked',
          allowConditional
            ? `${label} enables annotations conditionally; omitting its target disables annotations on that side.`
            : `${label} may have no annotation target in some branches.`,
        );
      return;
    }
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
    if (hasLetter(value)) report(node, 'text', 'Text has no precise text-range mapping.');
  }

  function children(nodes: readonly ts.Node[], env: Env) {
    for (const node of nodes) {
      if (ts.isJsxText(node) || ts.isStringLiteralLike(node)) text(node, node.text);
      else if (ts.isJsxExpression(node)) {
        if (!node.expression) continue;
        const value = read(node.expression, env);
        if (isChildren(value)) children(value.childrenNodes, value.env);
        else if (typeof value === 'string') text(node, value);
        else if (value === UNKNOWN || value instanceof Alternatives) {
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
              report(node, 'text', 'Text has no precise text-range mapping.');
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

  /** Resolve component aliases; an unknown condition makes both choices relevant. */
  function componentTags(node: ts.Node, env: Env, seen = new Set<ts.Node>()): ts.Node[] {
    if (seen.has(node) || publicName(node)) return [node];
    seen = new Set(seen).add(node);
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node)
    )
      return componentTags(node.expression, env, seen);
    if (ts.isIdentifier(node)) {
      const binding = symbol(node);
      const declaration = binding?.valueDeclaration;
      if (!env.has(binding) && declaration && ts.isVariableDeclaration(declaration))
        return declaration.initializer ? componentTags(declaration.initializer, env, seen) : [node];
    }
    if (ts.isConditionalExpression(node)) {
      const condition = truth(read(node.condition, env));
      return condition === undefined
        ? [...componentTags(node.whenTrue, env, seen), ...componentTags(node.whenFalse, env, seen)]
        : componentTags(condition ? node.whenTrue : node.whenFalse, env, seen);
    }
    return [node];
  }

  /** `Fragment` / `React.Fragment` imported from react. */
  function isReactFragment(tag: ts.Node) {
    const name = ts.isPropertyAccessExpression(tag) ? tag.name : tag;
    if (name.getText() !== 'Fragment') return false;
    const declaration = checker.getSymbolAtLocation(
      ts.isPropertyAccessExpression(tag) ? tag.expression : tag,
    )?.declarations?.[0];
    const module = declaration && ts.findAncestor(declaration, ts.isImportDeclaration);
    return !!module && moduleName(module.moduleSpecifier) === 'react';
  }

  function jsx(
    node: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment,
    env: Env,
    tag?: ts.Node,
  ) {
    if (ts.isJsxFragment(node)) return children(node.children, env);
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const childNodes = ts.isJsxElement(node) ? node.children : [];
    if (!tag) {
      for (const choice of componentTags(opening.tagName, env)) jsx(node, env, choice);
      return;
    }
    if (isReactFragment(tag)) return children(childNodes, env);
    const name = publicName(tag);
    const literal = opening.tagName.getText();
    const intrinsic = ts.isIdentifier(opening.tagName) && /^[a-z]/.test(literal);
    const props = attributes(opening, env);
    const hidden = props.get('aria-hidden');
    const role = props.get('role');
    const roles = role instanceof Alternatives ? role.values : [role];
    if (
      skipped.has(name ?? (intrinsic ? literal : '')) ||
      (name && /^(Alert|Empty|NavigationMenu|Pagination|Select)/.test(name)) ||
      // Menus and tooltips wrap page content in their root and trigger; only their popups are chrome.
      (name && /^(Tooltip|DropdownMenu|ContextMenu)./.test(name) && !name.endsWith('Trigger')) ||
      hidden === true ||
      hidden === 'true' ||
      roles.every((role) =>
        [
          'button',
          'textbox',
          'combobox',
          'checkbox',
          'switch',
          'radio',
          'status',
          'alert',
        ].includes(role as string),
      )
    )
      return;
    const local = !name && !intrinsic && isFn(read(tag, env));
    if (!local)
      for (const [key, value] of props.values)
        if (key !== 'children' && isChildren(value)) children(value.childrenNodes, value.env);
    if (name === 'AnnotationText') return requireTarget(opening, props.get('target'), name);
    if (name && sources.has(name)) {
      requireTarget(opening, props.get('annotationTarget'), name);
      if (
        name === 'Markdown' &&
        props.values.has('components') &&
        props.get('components') !== undefined
      )
        report(opening, 'unchecked', 'Markdown with custom components may not map annotations.');
      return;
    }
    if (name === 'DiffView') {
      const targets = props.get('annotationTargets');
      for (const side of ['old', 'new'])
        requireTarget(opening, field(targets, side), `DiffView ${side} side`, true);
      return;
    }
    if (name === 'Page' || name === 'Section') {
      for (const key of ['title', 'description']) {
        const value = props.get(key);
        if (value !== undefined && value !== '' && value !== null && value !== false)
          requireTarget(opening, props.get('annotationTarget'), `${name} ${key}`);
      }
    } else if (!name && !intrinsic) {
      const fn = read(tag, env);
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
      return; // Whole SVGs can be picked; this check does not map their text to source ranges.
    } else if (literal === 'img' || literal === 'canvas') {
      report(
        opening,
        'unchecked',
        `<${literal}> has no original-source mapping; whole-element picking remains available when page annotations are enabled.`,
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
  // `disabled` must be certain: the walk only recognizes direct hook calls, so any other way the
  // page's own sources could reach usePageAnnotations, such as an alias, keeps it undetermined.
  if (!session && !opaque && !mayReachHook(program))
    return {
      status: 'disabled',
      missingTargets: [],
      unannotatedText: [],
      unchecked: [],
      conditionalTargets: [],
    };
  if (!session)
    report(
      root,
      'unchecked',
      'Cannot determine whether the rendered page calls usePageAnnotations; the findings assume it does.',
    );
  return {
    status: session ? 'enabled' : 'undetermined',
    missingTargets: found.missing,
    unannotatedText: found.text,
    unchecked: found.unchecked,
    conditionalTargets: found.conditional,
  };
}
