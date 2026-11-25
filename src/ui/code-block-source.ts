import { createScanner } from 'jsonc-parser';

type SourceLine = { start: number; end: number };
export type JsonSection = {
  start: number;
  end: number;
  line: number;
  endLine: number;
  column: number;
  rootObject: boolean;
};
export type CodeSourcePart = { from: number; to: number; line: number };
export type CodeRow = { line: number; parts: (CodeSourcePart | JsonSection)[] };

function jsonSections(source: string): JsonSection[] {
  const scanner = createScanner(source, true);
  const stack: { start: number; line: number; column: number; token: string }[] = [];
  const sections: JsonSection[] = [];
  // Only inspect token starts, so comments and quoted delimiters cannot create folds.
  for (scanner.scan(); scanner.getTokenLength() > 0; scanner.scan()) {
    const offset = scanner.getTokenOffset();
    const token = source[offset];
    if (token === '{' || token === '[') {
      stack.push({
        token,
        line: scanner.getTokenStartLine(),
        column: scanner.getTokenStartCharacter(),
        start: scanner.getPosition(),
      });
    } else if (token === '}' || token === ']') {
      const opening = stack.pop();
      const expected = token === '}' ? '{' : '[';
      const endLine = scanner.getTokenStartLine();
      if (opening?.token === expected && opening.line < endLine) {
        sections.push({
          start: opening.start,
          line: opening.line,
          column: opening.column,
          end: offset,
          endLine,
          rootObject: token === '}' && stack.length === 0,
        });
      }
    }
  }
  return sections.sort((a, b) => a.start - b.start);
}

export function codeBlockSource(code: string, json: boolean) {
  const display = code.replace(/\r\n?/g, '\n');
  let start = 0;
  const lines: SourceLine[] = display.split('\n').map((line) => {
    const end = start + line.length;
    const span = { start, end };
    start = end + 1;
    return span;
  });
  const sections = json ? jsonSections(display) : [];
  const bulkFolded = new Set(
    sections.filter((section) => !section.rootObject).map(({ start }) => start),
  );
  return { display, lines, sections, bulkFolded };
}

export function visibleCodeRows(
  model: ReturnType<typeof codeBlockSource>,
  folded: ReadonlySet<number>,
): CodeRow[] {
  const { display, lines, sections } = model;
  const rows: CodeRow[] = [];
  let next = 0;
  for (let line = 0; line < lines.length; line++) {
    const row: CodeRow = { line, parts: [] };
    let cursor = lines[line].start;
    while (sections[next]?.line === line) {
      const section = sections[next++];
      row.parts.push({ from: cursor, to: section.start, line }, section);
      cursor = section.start;
      if (folded.has(section.start)) {
        // Jump to the closing delimiter, keeping the rest of that line verbatim.
        cursor = section.end;
        line = section.endLine;
        while (next < sections.length && sections[next].start < cursor) next++;
      }
    }
    const end = Math.min(lines[line].end + 1, display.length);
    if (cursor < end) row.parts.push({ from: cursor, to: end, line });
    rows.push(row);
  }
  return rows;
}
