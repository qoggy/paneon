import ts from 'typescript';
import { resolve } from 'node:path';
import { checkAnnotations, type AnnotationCheck } from './annotation-check.js';
import { checkComponents } from './component-check.js';
import type { Finding } from './check-finding.js';

export type PanelCheck = {
  summary: string;
  next: string;
  /** Native controls to replace with @qoggy/paneon/ui components. */
  nativeControls: Finding[];
  /** Optional style suggestions; these do not affect the exit code. */
  suggestions: Finding[];
  annotations: AnnotationCheck;
};

/** Static checks of a custom page: native controls always, annotation coverage when enabled. */
export function checkPanel(entryPath: string): PanelCheck {
  const entry = resolve(entryPath);
  const program = ts.createProgram([entry], {
    jsx: ts.JsxEmit.ReactJSX,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ESNext,
    allowJs: true,
    noEmit: true,
    skipLibCheck: true,
    strictNullChecks: true,
  });
  const root = program.getSourceFile(entry);
  if (!root)
    throw Object.assign(new Error('The entry is not readable.'), { code: 'INVALID_ARGUMENT' });
  const { nativeControls, suggestions } = checkComponents(program);
  const annotations = checkAnnotations(program, root);
  const {
    status,
    missingTargets: missing,
    unannotatedText: plain,
    unchecked,
    conditionalTargets: conditional,
  } = annotations;

  const summary = [
    nativeControls.length
      ? `${nativeControls.length} native control(s) have a Paneon component equivalent.`
      : 'No native control with a Paneon component equivalent was found.',
    suggestions.length ? `${suggestions.length} optional component suggestion(s).` : '',
    status === 'disabled'
      ? 'The rendered page never calls usePageAnnotations, so the annotation check was skipped.'
      : [
          missing.length &&
            `${missing.length} component(s) or heading(s) have no original-source annotation target.`,
          plain.length && `${plain.length} piece(s) of text have no precise text-range mapping.`,
          unchecked.length && `${unchecked.length} item(s) could not be checked statically.`,
          conditional.length &&
            `${conditional.length} DiffView side(s) enable annotations conditionally; this is not a missing-target finding.`,
        ]
          .filter(Boolean)
          .join(' ') || 'Every checked component and heading has an annotation target.',
  ]
    .filter(Boolean)
    .join(' ');
  const next =
    [
      nativeControls.length && 'Replace each listed native control with the named component.',
      missing.length &&
        'Add a target to each listed component whose content the human may question word by word, such as code, data, command output and results; whole-element picking only annotates a component as a whole. For content that changes with page state, put the state in the ref.',
      plain.length &&
        'Use AnnotationText or a targeted component only where precise text-range selection is needed; ordinary content already supports whole-element picking when page annotations are enabled; leave interface text such as labels and status messages as is.',
      unchecked.length && 'Inspect the unchecked items in source.',
      suggestions.length &&
        'Consider the optional component suggestions where useful for the page.',
    ]
      .filter(Boolean)
      .join(' ') || 'Nothing to fix.';
  return { summary, next, nativeControls, suggestions, annotations };
}
