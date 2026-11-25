/** Map rendered LF boundaries back to the exact UTF-16 source snapshot. */
export function fileSourceOffsets(source: string): number[] {
  const offsets = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\r' && source[index + 1] === '\n') index++;
    offsets.push(index + 1);
  }
  return offsets;
}
export function fileTextSegments(root: HTMLElement, source: string) {
  return textSegmentsAt(root, fileSourceOffsets(source), 0);
}

export function textSegmentsAt(root: HTMLElement, offsets: number[], cursor: number) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const segments: { node: Text; sourceOffsets: number[] }[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    segments.push({ node, sourceOffsets: offsets.slice(cursor, cursor + node.data.length + 1) });
    cursor += node.data.length;
  }
  return segments;
}
