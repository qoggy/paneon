import type { AnnotationValue } from '@qoggy/paneon/sdk';
import { buildGitFeedback } from './feedback.ts';
import type { GitSnapshot } from './git.ts';
import type { GitRef, GitFeedbackResult } from './schema.ts';

type Draft = AnnotationValue<GitRef>;
const empty = (): GitFeedbackResult => ({ annotations: [], sources: {} });
function belongsTo(
  draft: Draft['annotations'][number],
  repositoryId: string,
  snapshots: ReadonlyMap<string, GitSnapshot>,
) {
  return draft.targets.some(
    (target) => snapshots.get(target.ref.sourceId)?.source.repositoryId === repositoryId,
  );
}

/** Browser-owned successful receipts, not server session state or persisted drafts. */
export class RepositoryFeedback {
  private baseline: Draft = { annotations: [] };
  private submitted: GitFeedbackResult = empty();
  private retired = empty();

  hasChanges(repositoryId: string, draft: Draft, snapshots: ReadonlyMap<string, GitSnapshot>) {
    const entries = (value: Draft) =>
      value.annotations
        .filter((annotation) => belongsTo(annotation, repositoryId, snapshots))
        .map(({ id, comment, targets }) => ({ id, comment, targets }));
    return JSON.stringify(entries(draft)) !== JSON.stringify(entries(this.baseline));
  }

  build(
    draft: Draft & { replacesEventId?: number },
    snapshots: ReadonlyMap<string, GitSnapshot>,
  ): GitFeedbackResult {
    const current = buildGitFeedback(draft, snapshots);
    return {
      ...current,
      annotations: [...this.retired.annotations, ...current.annotations],
      sources: { ...this.retired.sources, ...current.sources },
    };
  }

  accept(draft: Draft, submitted: GitFeedbackResult) {
    this.baseline = structuredClone(draft);
    this.submitted = structuredClone(submitted);
  }

  /** Only retire unchanged, successfully delivered feedback; return the editable IDs to remove. */
  retire(
    repositoryId: string,
    draft: Draft,
    snapshots: ReadonlyMap<string, GitSnapshot>,
  ): string[] {
    if (this.hasChanges(repositoryId, draft, snapshots))
      throw new Error('This repository has unsubmitted annotations.');
    const annotations = this.submitted.annotations.filter((annotation) =>
      belongsTo(annotation, repositoryId, snapshots),
    );
    const sourceIds = new Set(
      annotations.flatMap((annotation) => annotation.targets.map((target) => target.ref.sourceId)),
    );
    this.retired = {
      annotations: [...this.retired.annotations, ...annotations],
      sources: {
        ...this.retired.sources,
        ...Object.fromEntries(
          Object.entries(this.submitted.sources).filter(([id]) => sourceIds.has(id)),
        ),
      },
    };
    const removed = draft.annotations
      .filter((annotation) => belongsTo(annotation, repositoryId, snapshots))
      .map((annotation) => annotation.id);
    const ids = new Set(removed);
    this.baseline = {
      annotations: this.baseline.annotations.filter((annotation) => !ids.has(annotation.id)),
    };
    return removed;
  }
}
