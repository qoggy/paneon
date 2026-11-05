import { Fragment } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from '@qoggy/paneon/ui';
import { useLocale } from '../../shared/i18n';
import type { CommitDecoration } from './git.ts';
import { commitRefRevision, groupCommitRefs, summarizeCommitRefs } from './commit-ref-model.ts';
import { RevisionContextMenu } from './revision-context-menu.tsx';

const labels = {
  branch: '本地分支',
  remote: '远程分支',
  tag: '标签',
  head: 'HEAD',
} as const;
const colors = {
  branch: 'text-green-600 dark:text-green-400',
  remote: 'text-violet-500 dark:text-violet-400',
  tag: 'text-muted-foreground',
  head: 'text-amber-500 dark:text-amber-400',
};

function RefIcon({ kind }: { kind: CommitDecoration['kind'] }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="var(--background)"
      stroke="currentColor"
      strokeWidth="1.3"
      className={`shrink-0 ${colors[kind]}`}
    >
      <path d="M2 8 8 2h6v6l-6 6-6-6Z" />
      <circle cx="11" cy="5" r="1" strokeWidth="1" />
    </svg>
  );
}

export function CommitRefSummary({
  refs,
  currentBranch,
  mainlines,
  onCompare,
}: {
  refs: CommitDecoration[];
  currentBranch?: string;
  mainlines?: string[];
  onCompare?: (revision: string) => void;
}) {
  const { t, message } = useLocale();
  const groups = groupCommitRefs(refs, currentBranch, mainlines);
  const summary = (
    <span
      data-commit-refs=""
      className="ml-auto inline-flex max-w-[60%] min-w-0 shrink-0 items-center gap-1 text-xs font-normal text-muted-foreground"
      title={refs.map((ref) => ref.name).join(', ')}
    >
      <span className="flex shrink-0 -space-x-2" aria-hidden="true">
        {[...groups].reverse().map((group) => (
          <span key={group.kind} data-commit-ref={group.kind}>
            <RefIcon kind={group.kind} />
          </span>
        ))}
      </span>
      <span className="truncate" data-commit-ref-summary="">
        {summarizeCommitRefs(refs, currentBranch, mainlines)}
      </span>
    </span>
  );
  if (!onCompare) return summary;
  return (
    <ContextMenu>
      <ContextMenuTrigger render={summary} />
      <ContextMenuContent onClick={(event) => event.stopPropagation()}>
        {groups.map((group) => (
          <ContextMenuGroup key={group.kind}>
            <ContextMenuLabel>{message(labels[group.kind])}</ContextMenuLabel>
            {group.refs.map((ref) => (
              <ContextMenuItem
                key={ref.name}
                aria-label={`${t('Compare with current branch')}: ${commitRefRevision(ref)}`}
                onClick={() => onCompare(commitRefRevision(ref))}
              >
                <RefIcon kind={ref.kind} />
                <span>{ref.name}</span>
              </ContextMenuItem>
            ))}
          </ContextMenuGroup>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function CommitRefDetails({
  refs,
  onCompare,
  currentBranch,
  mainlines,
}: {
  refs: CommitDecoration[];
  onCompare?: (revision: string) => void;
  currentBranch?: string;
  mainlines?: string[];
}) {
  const { message } = useLocale();
  return (
    <div className="mt-3 text-sm leading-6" data-commit-ref-details="">
      {groupCommitRefs(refs, currentBranch, mainlines).map((group) => (
        <span
          key={group.kind}
          role="group"
          aria-label={message(labels[group.kind])}
          className="mr-3 inline last:mr-0"
        >
          <span className="mr-1.5 inline-flex align-middle">
            <RefIcon kind={group.kind} />
          </span>
          <span className="break-words">
            {group.refs.map((ref, index) => (
              <Fragment key={ref.name}>
                {index > 0 && ', '}
                <RevisionContextMenu revision={commitRefRevision(ref)} onCompare={onCompare}>
                  <span
                    data-commit-detail-ref={ref.kind}
                    data-ref-name={ref.name}
                    title={commitRefRevision(ref)}
                    className="break-all"
                  >
                    {ref.name}
                  </span>
                </RevisionContextMenu>
              </Fragment>
            ))}
          </span>
        </span>
      ))}
    </div>
  );
}
