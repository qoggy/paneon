// Page-side readers and validators share the same pure model as the public renderer.
export { createDiffModel, sourceLines, diffChanges } from 'paneon/sdk';
export type { DiffModel, DiffLine, DiffRow, DiffHunk } from 'paneon/sdk';
