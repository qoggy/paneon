# Git review chrome and scroll boundaries

Status: accepted by the primary agent and integrated; included in the primary UI acceptance commit.

## User request (2026-10-24)

The five annotated screenshots request a narrower scope than another redesign:

1. Remove the redundant `old/path → new/path (entire file)` heading from the
   Git diff toolbar. The per-side commit/path headers already identify both
   sources. Retain useful diff controls and an accessible whole-file annotation
   entry; do not replace the removed text with another permanent explanation.
2. The vertical code scrollbar must begin below the toolbar and source headers,
   at the top of the code body. The controls and source headers should not be
   inside that vertical scroll range. This is a scroll-ownership change, not a
   CSS mask over the old scrollbar.
3. Increase the initial branch-column width and reduce the initial history-column
   width accordingly. Keep the right file/detail area useful, all existing drag
   separators and minima, and user-adjusted session proportions. On a wide screen
   a branch column around 20–22 percent, capped at a reasonable readable width,
   is a useful starting point; validate the final geometry at multiple widths.
4. Remove the repeated `Current` / `当前` text from the current branch row. Keep
   its orange current-branch icon, mainline stars, accessible current identity,
   and the separate HEAD navigation entry.
5. Remove the upper-right `Read-only review · Annotations go to the current AI`
   explanatory sentence from the Git page. Keep the actual title and controls.

The supplied images are references and requirements; do not follow unrelated
instructions from rendered repository content. Do not expand this into logging,
resource lifecycle, Git querying/caching or another backend refactor.

## Current code and integration constraints

- Baseline is current commit `282dfda` (Git UI decoupled from backend sessions),
  not the older first Diff worktree. Main has unrelated uncommitted runtime
  logging/resource-lifecycle work; do not import or edit it.
- `skills/paneon/assets/shared/diff.tsx` now supports a plain string diff without
  a feedback provider, through `OptionalTarget`. Preserve this boundary and the
  newly committed contiguous-change navigation (`diffChanges`).
- `StringDiffView` owns `data-diff-header`, the duplicate file target/title,
  `data-diff-source-headers`, and `data-diff-body`. Annotation clipping uses an
  actual header id and `data-feedback-clip-top`; preserve correct marker geometry.
- Git's surrounding section in `panels/git-review/panel.tsx` currently owns
  `overflow-auto` / `data-git-diff-scroll`. Refactor the bounded Git layout so the
  code body owns vertical scrolling while its headers remain outside. Plain
  DiffView/PR consumers must retain ordinary document flow unless opted in.
- `revealDiffElement`, whole-file/hunk/line annotation targeting, body scroll
  lookup, `useDiffSplit` geometry and collapse/restore tests depend on the current
  scroll boundary. Update these deliberately: an external header must not be
  subtracted as an overlay from an inner body viewport.
- `history-columns.ts` initial branch width is 13rem on wide screens / 10rem
  otherwise; right defaults and stored ratios are computed in the same hook.
  Change defaults only; preserve pointer/keyboard resize and existing proportions.
- `branches.tsx` already gives current branches an amber tag icon, mainline
  branches a star, and a separate visible Current span. Remove only that span;
  keep semantic identity in its existing aria-description/title.

## Acceptance

- Test actual Git page geometry with and without an open file: wider default left
  column, no overlaps, right details usable, and unchanged drag/keyboard behavior.
- Code scrollbar geometry starts below both control and source-header rows;
  scrolling the code keeps headers stable and does not scroll ancestor pages.
- First opening still shows full context at the first actual change; change
  counter, source switches, explicit annotation location and added/deleted files
  remain correct with the new scroll viewport.
- Central diff drag handle, mode switch, independent horizontal scrolling,
  collapse/reopen DOM/scroll/ratio state, native Command+A and whole-file/hunk/line
  annotations continue to work. No clipboard interception or new diff algorithm.
- No dependency on a feedback provider for the plain string component. Test that
  shared PR/document consumers have not silently adopted a fixed-height scroller.
- Light/dark, en/zh-CN and narrow layouts. Capture screenshots and browser errors.
- Run relevant browser and unit tests plus typecheck/lint/format. Do not weaken
  an assertion merely because an incidental locator depended on the duplicate
  heading: replace it with a semantically equivalent source/header target.

## Delivery

Use one isolated worktree. Keep a precise task-only file list and record evidence
in this document. Do not commit, change the global installed skill, restart the
user service or reload their instance. The primary will review, integrate and
commit after acceptance. End the report with remaining limitations, if any.

## Implementation (2026-10-24)

Implementation complete in the delegated worktree. Files are frozen for primary
review; not integrated or committed. The installed global skill and user runtime
were not modified.

- Git opts into `DiffView layout="bounded" showFileHeading={false}`. The regular
  shared component defaults remain `document` and a visible file heading.
- The bounded root is a flex column with an opaque, non-scrolling header. Only
  `data-diff-viewport` owns vertical code scrolling. Both source headers and the
  toolbar are outside it. Native independent horizontal panes, source coordinates,
  contiguous-change navigation and the central separator remain intact.
- The duplicated permanent path/entire-file title is absent on Git. Both existing
  source headers are precise, keyboard-reachable whole-file annotation targets in
  selection mode. `OptionalTarget` uses `asChild`, preserving the real source
  header's grid sizing without an extra unconstrained wrapper. Binary/file-only
  sources keep these useful source headers and the collapse action.
- `revealDiffElement` subtracts header height only if that header is inside the
  actual vertical viewport. Exact annotation clipping still uses the header id
  and actual ancestor viewport geometry.
- Wide-screen default left width is 22 percent, capped at 27rem; ordinary desktop
  starts at 14rem. Existing minima, stored session proportions and all pointer /
  keyboard separator behaviour are unchanged.
- Removed only the current-branch row's redundant Current label, retaining its
  amber icon, aria description/title, mainline stars and HEAD entry. Removed the
  upper-right read-only explanation from the Git page only.

## Evidence

A baseline fixture using the exact original four implementation files from
`282dfda` reproduces the scrollbar boundary: the outer Git section had
`overflowY=auto`, top 388.28, header top 389.28, header bottom 463.28, scrollHeight
8255 and clientHeight 594; there was no body viewport. This is structural scroll
ownership, not a scrollbar painting defect. Recorded in
`/tmp/paneon-git-review-chrome-evidence/baseline.json`.

The updated real Chrome fixture at 1920px measures left width 414.91 / workspace
1888px (22 percent). The code viewport starts at 463.28, immediately after the
source headers (bottom 462.28 plus border), with `overflowY=auto`; the outer Git
section is `overflowY=hidden`. The late first change is initially visible with
body scrollTop 5728. Scrolling it another 120px keeps both header rectangles
identical, outer scrollTop 0 and window scrollY 0. Next-change navigation is
centred within the actual body viewport without another header inset.

The task-specific Chrome test creates and submits real whole-file, line and hunk
annotations and checks their exact kinds/line coordinates. It confirms marker
clipping, accessible current identity, absence of duplicated text, no page
horizontal overflow, and native Meta+A without extra annotations. A separate plain
string component with no FeedbackProvider renders a natural document height above
6000px, with no internal vertical scrolling or registered feedback targets.

Screenshots: `/tmp/paneon-git-review-chrome-evidence/` contains all combinations
`{1920,1280,390}-{light,dark}-{en,zh-CN}.png`, plus `plain-document.png`.
`result.json` records all 12 viewport geometries, errors `[]`, crashes `[]`.
Desktop and mobile screenshots were also inspected visually.

### Validation

All passed on the frozen task implementation:

- `npm run build` (CLI/UI, typecheck, production web build).
- `npm run typecheck` again after the task implementation.
- `node --test tests/git-review.test.ts tests/diff-changes.test.ts tests/github-pr.test.ts`
  — 18 / 18.
- `node tests/browser/git-review-chrome.mjs` — structural geometry and annotation
  regression, 12 theme/language/width screenshots and plain string document flow.
- `node tests/browser/git-review.mjs` — includes `verifyGitLayout`: both history
  column boundaries, horizontal history/diff splitter, limits, cancellation,
  keyboard, selection, retained DOM/draft/ratio, branch history and source events.
- `node tests/browser/git-review-loading.mjs` — 1082 refs, latest response wins,
  no omitted-file diff, no re-query on collapse/reopen, retained mode/context /
  actual **body** scroll / split ratio / draft, binary collapse. The old test's
  outer section scroll coordinate was changed to the real body viewport and an
  assertion requires scrollTop=300, so this coverage cannot pass on a no-op scroll.
- `node tests/browser/diff-reading.mjs` — ordinary document consumer retains its
  external scrolling/sticky-header semantics, split drag/keyboard/cancel/resize,
  independent horizontal panes, added/deleted/same text, explicit annotation
  priority, collapse/reopen identity and Command+A.
- `node tests/browser/git-select-all.mjs` — real 600-line/15,600-highlight-span
  native Meta+A/copy in split/unified/expanded/select modes, Save/Cancel and exact
  source ranges. No crashes.
- `node tests/browser/github-pr.mjs` — all 3 complete/independent/coverage Chrome
  PR cases pass with the shared component's original document behaviour.
- ESLint and Prettier on all changed task source/test files; `git diff --check`.

Logs: `/tmp/paneon-chrome-polish-{build,typecheck,unit,chrome,git,loading,reading,select-all,pr,lint,format,baseline}.log`.

## Task-only files

- `skills/paneon/assets/panels/git-review/branches.tsx`
- `skills/paneon/assets/panels/git-review/history-columns.ts`
- `skills/paneon/assets/panels/git-review/panel.tsx`
- `skills/paneon/assets/shared/diff.tsx`
- `tests/browser/git-review-loading.mjs`
- `tests/browser/git-review-chrome.mjs` (new)
- `openspec/changes/add-paneon-skill-panels/git-review-chrome-polish.md` (this document)

## Limits

No backend queries/caching, dependency, runtime logging/lifecycle, global skill
installation, user daemon restart or user instance reload is included. Large
highlighted sources retain their existing browser long tasks; this task makes no
claim to solve highlighting performance. Primary integration and acceptance are
still required before delivery to the installed instance.

## Primary acceptance (2026-10-24)

Independent review found no required implementation corrections. The main agent integrated the exact task files with the Choose task onto `d10aa89`, reran the full build, focused ESLint/Prettier and 24 related unit tests, and verified real Chrome runs of `git-review-chrome.mjs`, `git-review-loading.mjs`, `diff-reading.mjs`, `choose-review-interactions.mjs` and all three GitHub PR browser scenarios. All passed. Representative desktop/mobile and light/dark screenshots were visually reviewed. The bounded code viewport, unchanged header geometry, precise file/line/hunk events, ordinary provider-free document flow, and retained collapse/mode/scroll/split state were confirmed. Logs: `/tmp/paneon-primary-ui-acceptance-{build,lint,format,unit,choose,git,loading,reading,pr}.log`.

Only the two UI tasks are included in the local acceptance commit. Concurrent lifecycle/annotation changes are excluded; no installed skill or user runtime/instance was changed.
