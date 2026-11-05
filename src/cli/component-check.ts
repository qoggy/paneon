import ts from 'typescript';
import { findingAt, type Finding } from './check-finding.js';

/**
 * Native form controls that a @qoggy/paneon/ui component replaces one to one.
 * Every rule is conservative: an element is reported only when its attributes are fully static
 * and the replacement certainly covers it. Missing a case is acceptable; a wrong report is not.
 */

const textInputTypes = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);

type Attributes = Map<string, ts.JsxAttribute['initializer'] | null>;

function staticAttributes(
  opening: ts.JsxOpeningLikeElement,
  file: ts.SourceFile,
): Attributes | undefined {
  const values: Attributes = new Map();
  for (const attribute of opening.attributes.properties) {
    if (ts.isJsxSpreadAttribute(attribute)) return undefined;
    values.set(attribute.name.getText(file), attribute.initializer ?? null);
  }
  return values;
}

/** The literal string of an attribute such as `type="text"` or `type={'text'}`. */
function literal(initializer: ts.JsxAttribute['initializer'] | null | undefined) {
  if (!initializer) return undefined;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (
    ts.isJsxExpression(initializer) &&
    initializer.expression &&
    ts.isStringLiteralLike(initializer.expression)
  )
    return initializer.expression.text;
}

function replacement(tag: string, attributes: Attributes): string | undefined {
  if (attributes.has('hidden') || attributes.has('aria-hidden')) return undefined;
  if (tag === 'select') {
    if (attributes.has('multiple') || attributes.has('size')) return undefined;
    return 'Native <select> has a Paneon equivalent: use Select from @qoggy/paneon/ui and pass items so it shows labels for values.';
  }
  if (tag === 'textarea')
    return 'Native <textarea> has a Paneon equivalent: use Textarea from @qoggy/paneon/ui.';
  if (tag === 'input') {
    const type = attributes.has('type') ? literal(attributes.get('type')) : 'text';
    if (type === undefined || !textInputTypes.has(type)) return undefined;
    return `Native <input type="${type}"> has a Paneon equivalent: use Input from @qoggy/paneon/ui.`;
  }
}

/** Reports native controls in the page's own source files, excluding packages and declarations. */
export function checkComponents(program: ts.Program): Finding[] {
  const findings: Finding[] = [];
  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile || file.fileName.replaceAll('\\', '/').includes('/node_modules/'))
      continue;
    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node;
        const tag = opening.tagName;
        if (ts.isIdentifier(tag)) {
          const attributes = staticAttributes(opening, file);
          const message = attributes && replacement(tag.text, attributes);
          if (message) findings.push(findingAt(opening, message, file));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return findings;
}
