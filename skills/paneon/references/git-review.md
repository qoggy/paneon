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

Supply real revisions from the configured repository. Optional `file` is repository-relative and must exist in the selected change list; a history file requires a commit. Invalid initial targets produce an explicit error. The initial view does not restrict later navigation. A comparison requires `base`, defaults `head` to `HEAD` and `mode` to `branch`. Branch mode compares the unique merge base to head (three-dot semantics); direct commits mode compares the endpoints. Missing or multiple common ancestors are errors, without silently changing semantics. Version expressions are resolved to complete commit OIDs before content reads.

## Browse and annotate

History defaults to the current HEAD ancestry. Use the left sidebar (HEAD, local/remote branches and commit tags) or optional `initialView.branch` to browse a local/remote branch without checking it out. Names with slash-separated prefixes appear in collapsible groups; search filters branch and tag names. The selected reference tip is initially selected unless `commit` is supplied. The changed-file list and complete plain-text commit message follow that selection. History opens a diff only after a file is clicked, or when an explicit initial `file` is supplied. Selecting another commit or branch closes the diff until a file is chosen again; refreshing the same commit retains a file already opened. With no file open, history uses the full workspace. The message follows the file list without a separate title bar, preserving paragraphs and line breaks. Loading more retains the selected message.

History uses compact Git Log rows with parent graph connections, subjects, HEAD/branch/tag decorations, author and date. Hover a row for the full commit ID and original timestamp. The graph covers the existing fixed-tip history; it does not include unrelated branches. Loading more extends the same graph. Arrow keys, Home/End and PageUp/PageDown navigate loaded commits. After 200 loaded rows, only the visible window and a small buffer are mounted; graph layout still uses all loaded commits. On desktop, drag either vertical divider to resize the branch sidebar or the files/details area; focus it and use ArrowLeft/ArrowRight for keyboard resizing. Each column keeps a usable minimum width and its proportions stay in the page session. When a diff is open, drag the horizontal divider between the history/files area and the diff to resize them, or focus it and use ArrowUp/ArrowDown. Both areas retain minimum usable heights; the split stays in the current page session when switching views. Narrow screens keep the stacked layout without a draggable divider; scroll the history region horizontally to view all columns.

While a commit selection or refresh loads, the current selection, files and diff remain visible until the replacement is ready. A small loading status does not move the workbench. A failed read keeps the displayed content and reports the error.

The changed-file list is a collapsible directory tree shared by changes, history and comparisons. Single-child directory chains with no direct files compress into one row; branches and directories containing files keep their hierarchy. File rows show basenames, while hover and accessible names retain complete repository-relative paths. Working changes build separate trees for staged, unstaged and untracked snapshots, even when their paths match. Directory counts reflect real file rows. Deleted files remain clickable in muted gray, modified files use blue, and added/untracked files use green; status letters remain visible. Renames live under their new path and retain the old-to-new path in hover text. The standard Git page omits file-search and count headers. One-pixel desktop separators retain a larger drag hit area and keyboard resizing. Selecting a file or locating a comment on a listed snapshot reveals its ancestors. Long directory labels and filenames truncate within the list; hover retains their full text.

Changes distinguish staged, unstaged and untracked files, including separate comparisons when one path has both staged and unstaged changes. Ignored untracked files are excluded through Git's ignore rules; tracked changes remain visible even when matching ignore patterns. History follows one fixed complete tip in batches of 50 until explicitly refreshed. A merge commit uses its first parent, visibly identified; a root commit uses the empty tree. Empty repositories can show untracked files and have no fabricated HEAD/history.

Diffs default to side-by-side, support a unified view and expanded context, and use the same preserved source coordinates in every layout. Each side scrolls horizontally within its own pane, so long code remains accessible without covering the opposite side. History shows aligned graph/subject/author/date columns above the diff, beside the changed-file list; commit, file and diff regions scroll independently. Narrow screens stack these regions. Recognized code languages use the public CodeBlock highlighter. Normal browsing preserves text selection and copying. Select a word or phrase during normal browsing, click the nearby **评论** action, then save it in the anchored editor. Use **选择对象** to choose a file header, hunk header, single line, or same-side continuous line range. Different sides or disconnected selections remain separate targets, which can share one opinion. Comments may be empty. Comments from multiple repositories/files/views remain together until **提交评论** in the top toolbar. Saving a comment only changes the page draft. Numbered markers reopen editing; Cancel keeps the previous text, Save updates it, and Delete removes it. An unsaved editor must be saved or cancelled before submitting.

Click **刷新改动** to query current files. Local file changes never automatically replace the displayed text. Refresh keeps feedback and its original sources; use the annotation's locate control to revisit preserved content. A banner identifies that snapshot. Git reads cannot atomically lock a working directory, but each diff, hash, line number and quote derives from the same captured bytes. Symbolic links are read as link objects without following their targets. Gitlinks, binary and invalid-UTF-8 content support file-level feedback; conflicts explicitly show the unmerged working text without synthesizing staged content. CRLF and missing final newlines are preserved.

The page exposes no staging, commit, discard, merge or push controls. Query processes use argument arrays, explicit `-C`, `--` path separation, and disable external diffs/text conversion. A single Git command output is capped at 32 MiB; an oversized read reports failure rather than presenting incomplete content. Highly unrelated large texts may use a coarser exact replacement hunk to bound diff computation memory.

## Submitted feedback

Explicit submission emits `git-review-submitted` with the common `annotations`, optional overall `comment`, and only the referenced `sources`. Each annotation has a stable `id`, nonempty `targets` and string `comment`. Empty comment means selection without an opinion. No separate selected list, complete source file, repository list or full diff is duplicated into the event. A selected hunk carries that hunk's patch; text targets carry only the selected quote.

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
      "new": { "path": "a.ts", "contentHash": "sha256:actual-new-bytes", "type": "text" }
    }
  }
}
```

IDs and hashes above illustrate the shape; actual hashes use 64 hex characters. `old`/`new` describe this comparison, not successive refreshes; added/deleted files may omit one side. Sources include the repository ID, actual view and resolved commit IDs, side-specific paths and byte hashes. History records its commit and actual parent (null for root); branch comparisons record their merge-base OID. Sources are deduplicated by repository, view and content, never merely by file path.

`file` and `hunk` targets omit `text`. A hunk includes its exact `oldStart`, `oldLines`, `newStart`, `newLines` and `patch`. A `lines` target always carries `side`, one-based inclusive `startLine`/`endLine`, and `text`. Its UTF-16 offsets address the original string formed by those lines, including original separators. Text normalized from a whole-side DOM registration is narrowed to the actually selected lines before delivery. Server-side validation checks the retained original snapshot, not latest disk contents.

First empty feedback is rejected. After success, edit and explicitly submit the complete corrected result; `replacesEventId` references this page's last successful event. IDs survive comment edits; removed entries disappear from the new result. A complete empty correction can clear previous feedback. Previous events remain readable. Failed validation, transport or event saves preserve drafts and the last successful receipt. Events obey the 65536 UTF-16 serialized-character limit and the complete request's 262144-byte transport limit, without truncation or automatic event splitting. Read and acknowledge them through ordinary `paneon panel events` / `paneon panel ack`.

Drafts and content snapshots live only in this page's session and query environment. Browser reloads, service restarts and ordinary Vite/React source updates do not promise recovery or old-worker preservation. Parameter files are read once at instance creation, as for other standard pages.

## Reuse the diff adapter

[DiffView](../assets/shared/diff.tsx) accepts `sourceId`, either a preserved `model` or `oldText`/`newText`, optional side paths and `fileOnly`. It requires a public `FeedbackProvider<GitRef>` supplied by the author and performs no local Git or repository lookup. Optional `locateTarget` reveals the relevant side/context. Import `createDiffModel`, `sourceLines` and types from [diff-model.ts](../assets/shared/diff-model.ts), and `gitRefSchema`, `diffTargetText`, `normalizeDiffTarget` from [diff-schema.ts](../assets/shared/diff-schema.ts). After mounting the preserved source and setting `locateTarget`, the adapter supplies `targetRanges: (target) => diffTargetRanges(model, target)` for explicit line/range comment markers and can call the exported `locateDiffTarget(model, target)` to scroll and highlight exact same-side ranges, including line-button references that differ from the whole-side text registration. The page owns source identity/cache, adapter resolution/location, semantic validation and event submission; the public Provider owns interaction state. Other sources such as PRs can use this renderer with their own source map.

The geometry bridge uses the same preserved source/line mapping as location. It does not create feedback or search quotes; `FeedbackSurface` clips those ranges to each pane. Keep it when copying this renderer into another page, since line-button references cover an interval while native text registration covers a whole side.

Object comments: use **选择对象** to collect targets, then click toolbar **评论** to open the editor. Only **保存** adds the page draft; cancelling discards the temporary selection. Text selection uses its nearby action directly.

The shared diff toolbar offers explicit side-by-side (左右对比) and single-column (单列对比) modes. The difference count locates the current hunk; up/down arrows move between the existing diff hunks and disable at their boundaries. Context expansion and mode switches preserve comments and source coordinates. Native select-all and copy remain available; existing event limits may reject oversized feedback while retaining the draft.
