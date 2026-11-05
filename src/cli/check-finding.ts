import ts from 'typescript';
import { isAbsolute, relative } from 'node:path';

export type Finding = { location: string; message: string; excerpt: string };

/** A finding located relative to the current directory when the file lies below it. */
export function findingAt(node: ts.Node, message: string, file = node.getSourceFile()): Finding {
  const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
  const path = relative(process.cwd(), file.fileName);
  const location = `${path.startsWith('..') || isAbsolute(path) ? file.fileName : path}:${line + 1}:${character + 1}`;
  return { location, message, excerpt: node.getText(file).replace(/\s+/g, ' ').slice(0, 120) };
}
