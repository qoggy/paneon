import { useLocale } from '../../shared/i18n';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { GitCommit, GitCommitDetails } from './git.ts';
import { layoutGitGraph } from './graph.ts';
import type { GraphRow } from './graph.ts';

// Colors identify graph lanes only; the surrounding UI keeps its default theme.
const colors = Array.from({ length: 6 }, (_, i) => `var(--git-lane-${i})`);
const x = (lane: number) => 10 + lane * 16;
const rowHeight = 28;
function Graph({ row, width, head }: { row: GraphRow; width: number; head: boolean }) {
  return (
    <svg aria-hidden="true" width={width} height={28} data-commit-graph="">
      {row.strokes.map((stroke, index) => {
        const from = x(stroke.from),
          to = x(stroke.to);
        const path =
          stroke.kind === 'incoming'
            ? `M ${from} 0 V 14`
            : stroke.kind === 'through'
              ? `M ${from} 0 V 28`
              : `M ${from} 14 C ${from} 22, ${to} 20, ${to} 28`;
        return (
          <path
            key={index}
            d={path}
            fill="none"
            stroke={colors[stroke.color % colors.length]}
            strokeWidth={1.5}
          />
        );
      })}
      <circle
        cx={x(row.lane)}
        cy={14}
        r={head ? 4 : 3}
        fill={head ? 'var(--background)' : colors[row.color % colors.length]}
        stroke={colors[row.color % colors.length]}
        strokeWidth={head ? 2 : 0}
      />
    </svg>
  );
}
function shortDate(value: string, language: string) {
  return new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}
export function HistoryRows({
  commits,
  selected,
  onSelect,
}: {
  commits: GitCommit[];
  selected?: string;
  onSelect: (commit: GitCommit) => void;
}) {
  const { language } = useLocale();
  const graph = useMemo(() => layoutGitGraph(commits), [commits]);
  const graphWidth = Math.max(42, graph.lanes * 16 + 10);
  const list = useRef<HTMLDivElement>(null);
  const focusTarget = useRef<string | undefined>(undefined);
  const [viewport, setViewport] = useState({ top: 0, height: 400 });
  useEffect(() => {
    const scroll = list.current?.parentElement;
    if (!scroll) return;
    const update = () =>
      setViewport((previous) => {
        const next = { top: scroll.scrollTop, height: scroll.clientHeight };
        return previous.top === next.top && previous.height === next.height ? previous : next;
      });
    const observer = new ResizeObserver(update);
    observer.observe(scroll);
    scroll.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      scroll.removeEventListener('scroll', update);
    };
  }, []);
  useLayoutEffect(() => {
    if (!focusTarget.current) return;
    const row = list.current?.querySelector<HTMLButtonElement>(
      `[data-commit-id="${focusTarget.current}"]`,
    );
    if (row) {
      row.focus({ preventScroll: true });
      focusTarget.current = undefined;
    }
  });
  // Small histories keep their native rows; large ones retain geometry with spacer rows.
  const virtual = commits.length > 200;
  const start = virtual ? Math.max(0, Math.floor(viewport.top / rowHeight) - 8) : 0;
  const end = virtual
    ? Math.min(commits.length, Math.ceil((viewport.top + viewport.height) / rowHeight) + 8)
    : commits.length;
  const selectedIndex = commits.findIndex((commit) => commit.oid === selected);
  const tabIndex = selectedIndex >= start && selectedIndex < end ? selectedIndex : start;
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const row = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-commit-id]');
    if (!row || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const current = commits.findIndex((commit) => commit.oid === row.dataset.commitId);
    const page = Math.max(1, Math.floor(viewport.height / rowHeight));
    const index = (
      {
        ArrowDown: current + 1,
        ArrowUp: current - 1,
        Home: 0,
        End: commits.length - 1,
        PageDown: current + page,
        PageUp: current - page,
      } as Record<string, number>
    )[event.key];
    if (index === undefined || !commits.length) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(commits.length - 1, index));
    const commit = commits[next];
    const target = list.current?.querySelector<HTMLButtonElement>(
      `[data-commit-id="${commit.oid}"]`,
    );
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else {
      const scroll = list.current?.parentElement;
      if (scroll) {
        focusTarget.current = commit.oid;
        scroll.scrollTop = next * rowHeight;
        setViewport({ top: scroll.scrollTop, height: scroll.clientHeight });
      }
    }
    if (next !== current) onSelect(commit);
  }
  return (
    <div ref={list} onKeyDown={navigate} data-history-count={commits.length}>
      {start > 0 && <div aria-hidden="true" style={{ height: start * rowHeight }} />}
      {commits.slice(start, end).map((commit, offset) => {
        const index = start + offset;
        return (
          <button
            type="button"
            key={commit.oid}
            tabIndex={index === tabIndex ? 0 : -1}
            data-commit-id={commit.oid}
            aria-pressed={selected === commit.oid}
            title={`${commit.oid} ${commit.subject} · ${commit.refs.map((ref) => ref.name).join(', ')} · ${commit.author} · ${commit.date}`}
            className="grid h-7 w-full items-center gap-3 px-2 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-accent"
            style={{
              gridTemplateColumns: `${graphWidth}px minmax(0,1fr) 7rem 7rem`,
              minWidth: graphWidth + 520,
            }}
            onClick={() => onSelect(commit)}
          >
            <Graph
              row={graph.rows[index]}
              width={graphWidth}
              head={commit.refs.some((ref) => ref.kind === 'head')}
            />
            <span className="flex min-w-0 items-center gap-2" title={commit.subject}>
              <span
                className={`min-w-0 truncate ${commit.parents.length > 1 ? 'text-muted-foreground' : ''}`}
                data-commit-subject=""
              >
                {commit.subject}
              </span>
              {!!commit.refs.length && (
                <span
                  className="flex max-w-[60%] shrink-0 gap-1 overflow-hidden"
                  title={commit.refs.map((ref) => ref.name).join(', ')}
                >
                  {commit.refs.map((ref) => (
                    <span
                      key={`${ref.kind}:${ref.name}`}
                      data-commit-ref={ref.kind}
                      className="inline-flex h-5 min-w-0 items-center gap-1 rounded border bg-background px-1.5 text-[11px] font-normal text-muted-foreground first:shrink-0"
                    >
                      <svg
                        aria-hidden="true"
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                      >
                        {ref.kind === 'tag' ? (
                          <path d="M2 2h5l7 7-5 5-7-7V2Zm3 3h.01" />
                        ) : (
                          <>
                            <path d="M4 5v6M12 5v1c0 3-8 1-8 5" />
                            <circle cx="4" cy="3" r="2" />
                            <circle cx="4" cy="13" r="2" />
                            <circle cx="12" cy="3" r="2" />
                          </>
                        )}
                      </svg>
                      <span className="max-w-36 truncate">{ref.name}</span>
                    </span>
                  ))}
                </span>
              )}
            </span>
            <span className="truncate text-xs text-muted-foreground" title={commit.author}>
              {commit.author}
            </span>
            <time
              className="truncate text-xs text-muted-foreground"
              dateTime={commit.date}
              title={commit.date}
            >
              {shortDate(commit.date, language)}
            </time>
          </button>
        );
      })}
      {end < commits.length && (
        <div aria-hidden="true" style={{ height: (commits.length - end) * rowHeight }} />
      )}
    </div>
  );
}

export function CommitDetails({ commit }: { commit?: GitCommitDetails }) {
  const { t, language } = useLocale();
  return (
    <section
      aria-label={t('提交说明')}
      className="flex max-h-64 min-h-0 min-w-0 flex-col border-t md:max-h-none md:flex-1"
    >
      <div className="min-h-0 overflow-auto px-2 py-1.5" data-commit-details="">
        {commit ? (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              <span className="font-mono" title={commit.oid}>
                {commit.oid.slice(0, 10)}
              </span>{' '}
              · {commit.author} ·{' '}
              <time dateTime={commit.date} title={commit.date}>
                {shortDate(commit.date, language)}
              </time>
            </p>
            <p
              className="text-sm leading-relaxed break-words whitespace-pre-wrap"
              data-commit-message=""
            >
              {commit.message}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('选择提交查看说明。')}</p>
        )}
      </div>
    </section>
  );
}
