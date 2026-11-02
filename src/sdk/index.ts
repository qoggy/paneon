export { definePanel, serverAction, z } from './server.js';
export type { PanelDefinition, Action, ActionContext } from './server.js';
export { usePanelInput, useQuery, agent } from './client.js';

export {
  annotationValueSchema,
  elementAnnotationRefSchema,
  isElementAnnotationRef,
} from './annotation.js';
export type {
  AnnotationValue,
  AnnotationTarget,
  Annotation,
  AnnotationTextRange,
  ElementAnnotationRef,
  JsonValue,
} from './annotation.js';

export { createDiffModel, sourceLines, diffChanges } from '../shared/diff-model.js';
export type { DiffModel, DiffLine, DiffRow, DiffHunk, DiffRef } from '../shared/diff-model.js';
