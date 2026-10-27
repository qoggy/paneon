import { Composer, Parser, isAlias, isMap, isPair, isScalar, isSeq, visit } from 'yaml';
import type { CST, Pair, ParsedNode } from 'yaml';

export type FrontmatterText = { value: string; offsets: (number | null)[] };
export type FrontmatterValue = {
  properties: FrontmatterText[];
} & (
  | { kind: 'text'; text: FrontmatterText }
  | { kind: 'map'; entries: { key: FrontmatterValue | null; value: FrontmatterValue | null }[] }
  | { kind: 'sequence'; items: (FrontmatterValue | null)[] }
);
export type Frontmatter = {
  raw: FrontmatterText;
  markdown: string;
  value: FrontmatterValue | null;
  errors: { code: string; message: string; offset: number }[];
};

/** Keep only the agreed Markdown envelope here; YAML syntax belongs to yaml. */
export function parseFrontmatter(source: string): Frontmatter | null {
  const opening = /^(?:\uFEFF)?---[ \t]*(?:\r\n|\r|\n)/.exec(source);
  if (!opening) return null;
  const closing = /^(?:---|\.\.\.)[ \t]*(?:\r\n|\r|\n|$)/gm;
  closing.lastIndex = opening[0].length;
  const end = closing.exec(source);
  if (!end) return null;
  const start = opening[0].length;
  const bodyStart = end.index + end[0].length;
  const raw = source.slice(start, end.index);
  const tokens = [...new Parser().parse(raw)];
  const [document] = new Composer({
    version: '1.2',
    schema: 'core',
    resolveKnownTags: false,
    intAsBigInt: true,
    keepSourceTokens: true,
    uniqueKeys: true,
    merge: false,
  }).compose(tokens, true, raw.length);
  const errors: Frontmatter['errors'] = document.errors.map((error) => ({
    code: error.code,
    message: error.message,
    offset: start + error.pos[0],
  }));
  const anchors = new Set<string>();
  visit(document, (_key, node) => {
    if ((isMap(node) || isSeq(node) || isScalar(node)) && node.anchor) anchors.add(node.anchor);
    if (isAlias(node) && !anchors.has(node.source))
      errors.push({
        code: 'UNRESOLVED_ALIAS',
        message: `Unresolved alias: ${node.source}`,
        offset: start + (node as ParsedNode).range[0],
      });
  });

  function text(from: number, to: number, value = raw.slice(from, to)): FrontmatterText {
    const original = raw.slice(from, to);
    if (original === value)
      return {
        value,
        offsets: Array.from({ length: value.length + 1 }, (_, i) => start + from + i),
      };
    if ((original[0] === '"' || original[0] === "'") && original.slice(1, -1) === value)
      return {
        value,
        offsets: Array.from({ length: value.length + 1 }, (_, i) => start + from + 1 + i),
      };
    // Transformed scalars can be annotated as a whole. Do not invent character
    // coordinates for YAML folding, indentation or escapes.
    const offsets: (number | null)[] = Array.from({ length: value.length + 1 }, () => null);
    offsets[0] = start + from;
    offsets[value.length] = start + to;
    return { value, offsets };
  }
  function pairValue(pair: Pair<ParsedNode, ParsedNode | null>) {
    return {
      key: nodeValue(pair.key, pair.srcToken?.start, true),
      value: nodeValue(pair.value, pair.srcToken?.sep),
    };
  }
  function nodeValue(
    node: ParsedNode | Pair<ParsedNode, ParsedNode | null> | null,
    props: CST.SourceToken[] = [],
    literal = false,
  ): FrontmatterValue | null {
    if (!node) return null;
    if (isPair(node)) return { kind: 'map', properties: [], entries: [pairValue(node)] };
    const properties = props
      .filter((token) => token.type === 'anchor' || token.type === 'tag')
      .map((token) => text(token.offset, token.offset + token.source.length));
    if (!literal && isMap(node) && node.items.length)
      return { kind: 'map', properties, entries: node.items.map(pairValue) };
    if (!literal && isSeq(node) && node.items.length)
      return {
        kind: 'sequence',
        properties,
        items: node.items.map((item, index) => nodeValue(item, node.srcToken?.items[index]?.start)),
      };
    const [from, to] = node.range;
    const value =
      !literal && isScalar(node) && typeof node.value === 'string' && node.value !== ''
        ? node.value
        : raw.slice(from, to);
    return { kind: 'text', properties, text: text(from, to, value) };
  }
  const root = tokens.find((token) => token.type === 'document');
  const value = nodeValue(document.contents, root?.start);
  return {
    raw: text(0, raw.length),
    // Blank the envelope without changing UTF-16 offsets or line endings. The
    // Markdown parser's body positions still address the complete source.
    markdown: source.slice(0, bodyStart).replace(/[^\r\n]/g, ' ') + source.slice(bodyStart),
    value,
    errors,
  };
}
