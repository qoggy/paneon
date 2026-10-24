# Read-only Git review

Run [the Git review panel](../assets/panels/git-review/panel.tsx) with explicit repository scope:

```sh
paneon panel run /absolute/skill/paneon/assets/panels/git-review/panel.tsx \
  --cwd /work --params-file /work/git-review.json --json
```

```json
{
  "title": "Review the changes",
  "repositories": [
    { "id": "web", "path": "./web", "label": "Frontend" },
    { "id": "api", "path": "/work/api" }
  ],
  "initialView": { "repositoryId": "web", "type": "changes", "file": "src/auth.ts" }
}
```

`repositories` is nonempty with unique nonblank IDs and explicit local paths. Relative repository paths resolve against the worker's working directory (`--cwd`), independently of the parameter file's location. No repository discovery is performed. `title` and repository `label` are optional. A missing label uses the directory name. Configured paths may point inside a working-tree repository; displayed file paths are relative to its Git root.

`initialView` is optional; omitting it opens changes in the first repository. Its `repositoryId` must exist in the input. Supported values:

```json
{ "repositoryId": "web", "type": "changes" }
{ "repositoryId": "web", "type": "history" }
{ "repositoryId": "web", "type": "history", "branch": "main" }
{ "repositoryId": "web", "type": "history", "commit": "a1b2c3d", "file": "src/auth.ts" }
{ "repositoryId": "web", "type": "compare", "base": "main", "head": "HEAD", "mode": "branch" }
{ "repositoryId": "web", "type": "compare", "base": "v1.0.0", "head": "v1.1.0", "mode": "commits" }
```

Supply real revisions from the configured repository. Optional `file` is repository-relative and must exist in the selected change list; a history file requires a commit. Omitting `file` opens only the changed-file list in every view; it never automatically opens the first diff. Invalid initial targets produce an explicit error. The initial view does not restrict later navigation. A comparison requires `base`, defaults `head` to `HEAD` and `mode` to `branch`. Branch mode compares the unique merge base to head (three-dot semantics); direct commits mode compares the endpoints. Missing or multiple common ancestors are errors, without silently changing semantics. Version expressions are resolved to complete commit OIDs before content reads.

## Browse and annotate

History defaults to the current HEAD ancestry. Use the left sidebar (HEAD, local/remote branches and commit tags) or optional `initialView.branch` to browse a local/remote branch without checking it out. Names with slash-separated prefixes appear in collapsible groups; search filters branch and tag names. The selected reference tip is initially selected unless `commit` is supplied. The changed-file list and complete plain-text commit message follow that selection. History opens a diff only after a file is clicked, or when an explicit initial `file` is supplied. Selecting another commit or branch closes the diff until a file is chosen again; refreshing the same commit retains a file already opened. With no file open, history uses the full workspace. The message follows the file list without a separate title bar, preserving paragraphs and line breaks. Loading more retains the selected message.

History uses compact Git Log rows with parent graph connections, subjects, HEAD/branch/tag decorations, author and date. Hover a row for the full commit ID and original timestamp. The graph covers the existing fixed-tip history; it does not include unrelated branches. Loading more extends the same graph. Arrow keys, Home/End and PageUp/PageDown navigate loaded commits. After 200 loaded rows, only the visible window and a small buffer are mounted; graph layout still uses all loaded commits. On desktop, drag either vertical divider to resize the branch sidebar or the files/details area; focus it and use ArrowLeft/ArrowRight for keyboard resizing. Each column keeps a usable minimum width and its proportions stay in the page session. When a diff is open, drag the horizontal divider between the history/files area and the diff to resize them, or focus it and use ArrowUp/ArrowDown. Both areas retain minimum usable heights; the split stays in the current page session when switching views. Narrow screens keep the stacked layout without a draggable divider; scroll the history region horizontally to view all columns.

Commit selection is highlighted immediately. Its file list shows a loading state and the old diff closes; old files and message are never presented as belonging to the newly selected commit. Rapid selections keep only the latest result. Commit-only navigation reuses the fixed-tip graph and reference list; explicit refresh rereads them. A failed read reports the error without reassigning preserved annotation sources.

In working changes and branch/version comparisons, drag the thin divider between the file tree and the diff to resize their widths. Focus it and use Left/Right arrows (Shift for a larger step), Home or End for the limits. The current page retains the split across file and view changes; narrow screens keep the stacked layout. Resizing preserves the source snapshot and annotation drafts without querying Git.

The branch sidebar marks mainlines with an amber star and sorts them first within their local or remote directory. Recorded remote HEAD references take precedence; origin is preferred for the corresponding local mainline. Without recorded defaults, the first existing main, master or trunk is used for that group. The current local branch keeps its directory position and shows an amber marker plus a Current label; selecting another history branch does not change checkout.

The changed-file list and its compact icon toolbar are shared by changes, history and comparisons. The left controls open the selected file diff (or the first displayed file when none is selected) and toggle directory grouping. Changes default to a flat list; history and comparisons default to directory grouping. Each view retains its grouping choice within the current page session. Flat rows show a status-colored basename followed immediately by the muted repository-relative parent directory; the root directory has no path suffix. The right controls expand or collapse all Git-area groups and, when grouping is enabled, directories. Git-area groups remain collapsible even in flat mode; expand/collapse is disabled when no collapsible nodes exist. All four controls use icons with hover tooltips. Grouping and folding only change presentation and do not read Git or change the open diff or annotations. In directory mode, single-child directory chains with no direct files compress into one row; branches and directories containing files keep their hierarchy. File rows show basenames, while hover and accessible names retain complete repository-relative paths. Working changes build separate trees for staged, unstaged and untracked snapshots, even when their paths match. Directory counts reflect real file rows. Deleted files remain clickable in muted gray, modified files use blue, and added/untracked files use green; status letters remain visible. Renames live under their new path and retain the old-to-new path in hover text. The standard Git page omits file-search and count headers. One-pixel desktop separators retain a larger drag hit area and keyboard resizing. Selecting a file or locating an annotation on a listed snapshot reveals its ancestors. Long directory labels and filenames truncate within the list; hover retains their full text.

Changes distinguish staged, unstaged and untracked files, including separate comparisons when one path has both staged and unstaged changes. Ignored untracked files are excluded through Git's ignore rules; tracked changes remain visible even when matching ignore patterns. History follows one fixed complete tip in batches of 50 until explicitly refreshed. A merge commit uses its first parent, visibly identified; a root commit uses the empty tree. Empty repositories can show untracked files and have no fabricated HEAD/history.

The neutral collapse button at the far right of the diff toolbar hides the diff and its horizontal divider. The upper workbench takes the freed space; clicking any file (including the same file) reopens it. Collapse retains the snapshot, layout mode, expanded context, scroll positions, annotation drafts and split height without rereading file content. Diffs default to side-by-side, support a unified view and expanded context, and use the same preserved source coordinates in every layout. Each side scrolls horizontally within its own pane, so long code remains accessible without covering the opposite side. History shows aligned graph/subject/author/date columns above the diff, beside the changed-file list; commit, file and diff regions scroll independently. Narrow screens stack these regions. Recognized code languages use the public CodeBlock highlighter. Normal browsing preserves text selection and copying. Select a word or phrase during normal browsing, click the nearby **批注** action, then save it in the anchored editor. Select continuous code text directly, including a complete line or a range on the same side. Use independent annotations for separate selections; the default toolbar has no object-selection mode. Annotations may be empty. Annotations from multiple repositories/files/views remain together until **提交批注** in the top toolbar. Saving an annotation only changes the page draft. Numbered markers reopen editing; Cancel keeps the previous text, Save updates it, and Delete removes it. An unsaved editor must be saved or cancelled before submitting.

The directory query reads paths/status only, without loading every file or building every diff. Clicking a file captures only that comparison and retains it for the page session. For working changes, this captures working-file bytes at the time that file is opened, not at directory-list time. Click **刷新改动** to query current files and recapture an intentionally open file. Local file changes never automatically replace the displayed text. Refresh keeps feedback and its original sources; use the annotation's locate control to revisit preserved content. A banner identifies that snapshot. Git reads cannot atomically lock a working directory, but each diff, hash, line number and quote derives from the same captured bytes. Symbolic links are read as link objects without following their targets. Gitlinks, binary and invalid-UTF-8 content support file-level feedback; conflicts explicitly show the unmerged working text without synthesizing staged content. CRLF and missing final newlines are preserved.

The page exposes no staging, commit, discard, merge or push controls. Query processes use argument arrays, explicit `-C`, `--` path separation, and disable external diffs/text conversion. A single Git command output is capped at 32 MiB; an oversized read reports failure rather than presenting incomplete content. Highly unrelated large texts may use a coarser exact replacement hunk to bound diff computation memory.

## Submitted feedback

Explicit submission emits `git-review-submitted` with the common `annotations`, optional overall `comment`, and only the referenced `sources`. Each annotation has a stable `id`, nonempty `targets` and string `comment`. Empty annotation means selection without an opinion. No separate selected list, complete source file, repository list or full diff is duplicated into the event. A selected hunk carries its patch and the corresponding side fragments; text targets carry their selected quote and complete original lines in source evidence. File targets need metadata and hashes only.

```json
{
  "annotations": [
    {
      "id": "opinion-1",
      "targets": [
        {
          "ref": {
            "sourceId": "snapshot-1",
            "kind": "lines",
            "side": "new",
            "startLine": 2,
            "endLine": 2
          },
          "text": { "start": 6, "end": 11, "quote": "n = 4" }
        }
      ],
      "comment": "Check this value."
    }
  ],
  "sources": {
    "snapshot-1": {
      "repositoryId": "web",
      "view": { "type": "changes", "area": "unstaged", "headCommit": "complete-commit-oid" },
      "old": { "path": "a.ts", "contentHash": "sha256:actual-old-bytes", "type": "text" },
      "new": { "path": "a.ts", "contentHash": "sha256:actual-new-bytes", "type": "text" },
      "evidence": [
        { "kind": "lines", "side": "new", "startLine": 2, "endLine": 2, "text": "const n = 4;\r\n" }
      ]
    }
  }
}
```

IDs and hashes above illustrate the shape; actual hashes use 64 hex characters. `old`/`new` describe this comparison, not successive refreshes; added/deleted files may omit one side. Sources include the repository ID, actual view and resolved commit IDs, side-specific paths and byte hashes. History records its commit and actual parent (null for root); branch comparisons record their merge-base OID. Sources are deduplicated by repository, view and content, never merely by file path.

`file` and `hunk` targets omit `text`. A hunk includes its exact `oldStart`, `oldLines`, `newStart`, `newLines` and `patch`. A `lines` target always carries `side`, one-based inclusive `startLine`/`endLine`, and `text`. Its UTF-16 offsets address the original string formed by those lines, including original separators. Text normalized from a whole-side DOM registration is narrowed to the actually selected lines before delivery. The browser normalizes targets and builds evidence from its retained original text. Server validation uses only the complete submission and explicit repository configuration; it never looks up a previous backend snapshot or rereads latest disk contents.

First empty feedback is rejected. After success, edit and explicitly submit the complete corrected result; `replacesEventId` references this page's last successful event. IDs survive annotation edits; removed entries disappear from the new result. A complete empty correction can clear previous feedback. Previous events remain readable. Failed validation, transport or event saves preserve drafts and the last successful receipt. Events obey the 65536 UTF-16 serialized-character limit and the complete request's 262144-byte transport limit, without truncation or automatic event splitting. Read and acknowledge them through ordinary `paneon panel events` / `paneon panel ack`.

Drafts and displayed content live only in browser memory. The browser retains all displayed versions for this page, including every source referenced by a draft or correction; reading a new version never mutates an old one. Git backend reads have no session/listing/history/snapshot business Map. Browser reloads, service restarts and ordinary Vite/React source updates do not promise recovery or old-worker preservation. Parameter files are read once at instance creation, as for other standard pages.

## Reuse the diff adapter

[DiffView](../assets/shared/diff.tsx) accepts `oldText`/`newText` or a supplied `model`, optional side paths/revisions, `fileOnly` and an optional `onCollapse` callback. `<DiffView oldText="before\n" newText="after\n" />` works alone without a Git session, source ID or FeedbackProvider. Supplying `sourceId` opts into annotation integration and requires a public `FeedbackProvider<GitRef>` supplied by the author. With no collapse callback the header stays unchanged. It performs no local Git or repository lookup. Optional `locateTarget` reveals the relevant side/context. Import `createDiffModel`, `sourceLines` and types from [diff-model.ts](../assets/shared/diff-model.ts), and `gitRefSchema`, `diffTargetText`, `normalizeDiffTarget` from [diff-schema.ts](../assets/shared/diff-schema.ts). After mounting the preserved source and setting `locateTarget`, the adapter supplies `targetRanges: (target) => diffTargetRanges(model, target)` for explicit line/range annotation markers and can call the exported `locateDiffTarget(model, target)` to scroll and highlight exact same-side ranges, including line-button references that differ from the whole-side text registration. The page owns source identity/cache, adapter resolution/location, semantic validation and event submission; the public Provider owns interaction state. Other sources such as PRs can use this renderer with their own source map.

The geometry bridge uses the same preserved source/line mapping as location. It does not create feedback or search quotes; `FeedbackSurface` clips those ranges to each pane. Keep it when copying this renderer into another page, since line-button references cover an interval while native text registration covers a whole side.

Text selection uses its nearby **批注** action directly. Only **保存** adds the page draft; cancelling discards the temporary edit.

The shared diff toolbar offers explicit side-by-side (左右对比) and single-column (单列对比) modes. The difference count and up/down arrows navigate contiguous changed ranges, even when nearby edits share one context hunk. Clicking the count locates the current changed range; navigation disables at its boundaries. Context windows may still merge for display and hunk-level selection. Context expansion and mode switches preserve annotations and source coordinates. Native select-all and copy remain available; existing event limits may reject oversized feedback while retaining the draft.

## Independent Git readers

Import from [components.tsx](../assets/panels/git-review/components.tsx); the named server actions live in [actions.ts](../assets/panels/git-review/actions.ts). The [minimal custom TSX](../assets/examples/git-components/panel.tsx) combines the readers with an ordinary string Diff without copying the built-in page or creating a session. These are skill resource exports, not new `paneon/ui` package exports.

| Component         | Props                                                                                                           | Owned reads and callbacks                                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GitBranches`     | `repositoryPath: string`, `selected?: string`, `onSelect(ref: string)`                                          | Reads refs/current branch and reuses the existing searchable branch tree. Selection is controlled.                                                                                          |
| `GitCommitGraph`  | `repositoryPath: string`, `branch?: string`, `tip?: string`, `selected?: string`, `onSelect(commit: GitCommit)` | Resolves a branch tip once (HEAD by default), reads 50-commit pages, retains the initial decoration catalog and reuses the existing graph rows. A full `tip` fixes the ancestry explicitly. |
| `GitChangedFiles` | `repositoryPath: string`, `view: GitFilesView`, `selected?: string`, `onSelectFile(snapshot: GitSnapshot)`      | Reads the file tree first; only a file click reads its bytes. Callback includes source metadata, immutable texts/model and `fileId` for controlled selection.                               |

`GitFilesView` is `{type:'changes', area:'staged'|'unstaged'|'untracked'}` (optionally a displayed `headCommit`), `{type:'history', commit:fullOID, parent?:fullOID|null}`, or `{type:'compare', mode:'branch'|'commits', baseCommit:fullOID, headCommit:fullOID, mergeBaseCommit?:fullOID}`. History defaults to the first parent; an explicit parent must belong to that commit, and null is the root commit's empty tree. Branch comparison derives its unique merge base from the fixed endpoints. A working-tree query observes a new version when bytes are opened; `headCommit` does not freeze working contents.

Custom layouts can use `useGitBranches({repositoryPath})` → `{refs,currentBranch,pending,error}`, `useGitHistory({repositoryPath,branch?,tip?})` → `{commits,tip,hasMore,pending,error,loadMore}`, and `useGitFiles({repositoryPath,view})` → `{files,pending,error,readFile(file)}`. Hooks own asynchronous query ordering; the author owns selection/layout and decides how to display pending/error. The built-in page retains its existing loading controls and uses the shared `useGitReader(params)` named-action boundary to coordinate its existing multi-view layout.

### Explicit backend requests

`readGit(params, request, signal?)` lists metadata. The server action is `queryGit({params,request})`. `params.repositories` supplies the configured repository paths; a request selects its `repositoryId`. A subsequent history request carries a serializable context, not an in-process lookup key:

```jsonc
{
  "params": { "repositories": [{ "id": "web", "path": "/work/web" }] },
  "request": {
    "repositoryId": "web",
    "type": "history",
    "historyContext": { "repositoryId": "web", "branch": "HEAD", "tip": "<full OID>" },
    "offset": 50,
    "pageOnly": true,
  },
}
```

First history results include `historyContext`, `historyRefs` and `historyDecorations`. The browser retains that catalog and decorates subsequent raw commit pages against it, preserving the initial graph labels without resending a large ref catalog. A commit selection sends the same context and an explicit `commit`, with no `pageOnly`; refresh drops context/tip. `listingId` is a returned browser display/cache scope only and is never accepted for a backend lookup.

`readGitFile(params, file, signal?)` / `queryGitFile({params,file})` accepts a complete listed descriptor:

```jsonc
{
  "id": "<browser file identity>",
  "status": "M",
  "source": {
    "repositoryId": "web",
    "view": { "type": "history", "commit": "<full OID>", "parent": "<full OID>" },
    "old": { "path": "src/a.ts" },
    "new": { "path": "src/a.ts" },
  },
  "read": {
    "entry": {
      "oldMode": "100644",
      "newMode": "100644",
      "oldOID": "<blob OID>",
      "newOID": "<blob OID>",
      "status": "M",
      "oldPath": "src/a.ts",
      "newPath": "src/a.ts",
    },
    "working": false,
    "conflict": false,
  },
}
```

The result is `{id,fileId,source,model,status,notes,notesUI}`. `source` contains the actual side hashes/types and fixed view; `model` contains the captured original text and derived diff. Read descriptors are validated against configured repository IDs and relative paths, use argument arrays, and preserve the existing directory/symlink/binary/conflict boundaries. No backend cache is needed to interpret the next request.

### Preserved annotation evidence

`buildGitFeedback(feedback, snapshots)` in [feedback.ts](../assets/panels/git-review/feedback.ts) runs in the browser. It normalizes line targets, deduplicates identical targets per annotation, and adds only referenced sources and required evidence. `validateGitFeedback(params, completeEvent)` is pure and runs in any fresh backend environment. It checks the full schema, configured repository association, source sides, line counts, exact UTF-16 quote/grapheme coordinates, patch reconstruction and conflicting/duplicate evidence. It preserves `comment` and the complete optional `replacesEventId`.

Each source has `evidence: []` for file-only targets. Line evidence is `{kind:'lines',side,startLine,endLine,text}` with the complete original selected lines. Hunk evidence is `{kind:'hunk',oldStart,oldLines,newStart,newLines,patch,oldText,newText}` with the exact old/new fragments composing that patch. Repeated targets share a deduplicated source/evidence entry. Whole-content hashes identify the displayed version; selected fragments cannot independently prove those whole hashes or Git origin. This contract deliberately adds no signature, disk snapshot, SQLite business table, localStorage draft, automatic replay, retry, truncation or implicit batching.
