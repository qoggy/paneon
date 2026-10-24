export type SourceNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: SourceNode[];
};
type Unit = { value: string; start: number; end: number };
/** Decode in source order inside the parser-provided range. Never search for a quote. */
export function markdownOffsets(
  source: string,
  start: number,
  end: number,
  value: string,
  kind: 'text' | 'inlineCode' | 'code' = 'text',
  decodeEntity: (entity: string) => string = (entity) => entity,
) {
  let raw = source.slice(start, end);
  if (kind === 'inlineCode') {
    const ticks = /^`+/.exec(raw)?.[0].length ?? 0;
    start += ticks;
    raw = raw.slice(ticks, ticks ? -ticks : undefined);
  }
  let units: Unit[] = [];
  let lineStart = true;
  const fence = kind === 'code' ? /^( {0,3})(`{3,}|~{3,})[^\r\n]*(?:\r\n|\n|\r)/.exec(raw) : null;
  if (fence) {
    start += fence[0].length;
    raw = raw.slice(fence[0].length);
    const closing = /(?:^|\n)(?:[ \t]{0,3}>[ \t]?)*[ \t]*(?:`{3,}|~{3,})[ \t]*$/.exec(raw);
    if (closing) raw = raw.slice(0, closing.index + (raw[closing.index] === '\n' ? 1 : 0));
  }
  let renderedLength = 0;
  for (let at = 0; at < raw.length;) {
    if (lineStart && kind !== 'inlineCode') {
      const displayedLine = /^[^\n]*/.exec(value.slice(renderedLength))?.[0] ?? '';
      let quote = /^[ \t]{0,3}>[ \t]?/.exec(raw.slice(at));
      while (quote && (!displayedLine || !raw.slice(at).startsWith(displayedLine))) {
        at += quote[0].length;
        quote = /^[ \t]{0,3}>[ \t]?/.exec(raw.slice(at));
      }
      const rawIndent = /^[ \t]*/.exec(raw.slice(at))?.[0].length ?? 0;
      const displayedIndent = /^[ \t]*/.exec(value.slice(renderedLength))?.[0].length ?? 0;
      if (rawIndent > displayedIndent) at += rawIndent - displayedIndent;
    }
    if (at >= raw.length) break;
    const begin = at;
    let part = raw[at++];
    if (part === '\r') {
      if (raw[at] === '\n') at++;
      part = '\n';
    }
    if (
      kind === 'text' &&
      part === '\\' &&
      /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(raw[at] ?? '')
    )
      part = raw[at++];
    else if (kind === 'text' && part === '&') {
      const entity = /^&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]+);/.exec(
        raw.slice(begin),
      )?.[0];
      if (entity) {
        const decoded = decodeEntity(entity);
        if (decoded !== entity) {
          part = decoded;
          at = begin + entity.length;
        }
      }
    }
    lineStart = part === '\n';
    if (kind === 'inlineCode' && part === '\n') part = ' ';
    units.push({ value: part, start: start + begin, end: start + at });
    renderedLength += part.length;
  }
  if (
    kind === 'inlineCode' &&
    units[0]?.value === ' ' &&
    units.at(-1)?.value === ' ' &&
    units.some((unit) => unit.value !== ' ')
  )
    units = units.slice(1, -1);
  // A synthetic trailing newline contributes no source characters.
  if (kind === 'code' && units.map((unit) => unit.value).join('') + '\n' === value)
    units.push({ value: '\n', start: end, end });
  if (units.map((unit) => unit.value).join('') !== value) return null;
  const offsets: (number | null)[] = [];
  for (const unit of units) {
    if (!offsets.length) offsets.push(unit.start < 0 ? null : unit.start);
    else if (unit.start >= 0 && offsets[offsets.length - 1] !== unit.start)
      offsets[offsets.length - 1] = unit.start;
    for (let index = 1; index <= unit.value.length; index++)
      offsets.push(index === unit.value.length && unit.end >= 0 ? unit.end : null);
  }
  return offsets.length ? offsets : [start];
}

/** Rehype plugin: retain AST source positions as explicit per-leaf DOM mappings. */
export function sourceMappingPlugin(source: string, decodeEntity: (entity: string) => string) {
  return () => (tree: SourceNode) => {
    let serial = 0;
    function walk(parent: SourceNode, fenced = false) {
      if (!parent.children) return;
      if (
        parent.tagName === 'code' &&
        Array.isArray(parent.properties?.className) &&
        parent.properties.className.includes('language-mermaid')
      )
        return;
      parent.children = parent.children.map((node) => {
        if (node.type === 'text') {
          const position =
            node.position ?? (parent.tagName === 'code' ? parent.position : undefined);
          const start = position?.start.offset,
            end = position?.end.offset;
          if (start === undefined || end === undefined) return node;
          const kind = parent.tagName === 'code' ? (fenced ? 'code' : 'inlineCode') : 'text';
          const offsets = markdownOffsets(source, start, end, node.value ?? '', kind, decodeEntity);
          if (!offsets) return node;
          return {
            type: 'element',
            tagName: 'span',
            properties: {
              'data-source-leaf': String(serial++),
              'data-source-offsets': JSON.stringify(offsets),
            },
            children: [node],
          };
        }
        walk(node, parent.tagName === 'pre');
        return node;
      });
    }
    walk(tree);
  };
}
