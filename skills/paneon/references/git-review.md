# Git review

Run `<skill>/assets/panels/git-review/panel.tsx`. The human browses working changes, commit history and branch/version comparisons of the given repositories and any they add, double-clicks a file to open its diff, annotates text, lines, hunks or whole files, and submits all annotations together. The page also offers explicit local Git checkout from the history sidebar's context menus. It never stages, commits or pushes.

```json
{
  "repositories": ["/work/web", "/work/api"],
  "initialView": { "repositoryPath": "/work/web", "type": "changes", "file": "src/auth.ts" }
}
```

Input:

- `repositories`: a nonempty array of unique absolute directory paths. Relative paths and `~` are rejected. A path may point inside a repository; file paths are then relative to its Git root.
- `initialView`: optional; omitting it opens working changes of the first repository. When provided, `repositoryPath` is required and must exactly match an entry in `repositories`.

```json
{ "repositoryPath": "/work/web", "type": "changes" }
{ "repositoryPath": "/work/web", "type": "history", "branch": "main" }
{ "repositoryPath": "/work/web", "type": "history", "commit": "a1b2c3d", "file": "src/auth.ts" }
{ "repositoryPath": "/work/web", "type": "compare", "base": "main", "head": "HEAD", "mode": "branch" }
{ "repositoryPath": "/work/web", "type": "compare", "base": "v1.0.0", "head": "v1.1.0", "mode": "commits" }
```

- `history` defaults to `HEAD`.
- `compare` requires `base`; `head` defaults to `HEAD` and `mode` to `commits`. `branch` compares the merge base with head (three-dot); `commits` compares the two endpoints directly.
- Optional `file` is repository-relative and must be in that view's changed files; a `history` file also requires `commit`.

## Repository management

The human can add and remove repositories within the page; added ones are lost on reload. Submitted files and checkout events identify a repository by `repositoryPath`: its real Git root, which can differ from the input path when that points inside a repository or through a symlink. Removing a repository never changes files or Git, and its submitted annotations stay in later corrections.

A successful checkout emits `git-checkout-completed`:

```json
{
  "operationId": "2d9e5487-4990-46c0-a2ad-c03a67d66878",
  "repositoryPath": "/work/web",
  "target": {
    "kind": "remote",
    "ref": "refs/remotes/origin/feature",
    "commit": "complete-target-commit-oid"
  },
  "before": { "branch": "main", "commit": "complete-previous-commit-oid" },
  "after": { "branch": "feature", "commit": "complete-target-commit-oid" }
}
```

- `target.kind` is `branch`, `remote` or `tag`. `before.branch` and `after.branch` are local branch names, or `null` for a detached HEAD. Commit IDs are complete.
- The event reports a completed checkout, not a request. Recheck the repository before writing to it; a failed checkout emits nothing.

## Annotation submission

`git-review-submitted` contains the complete set of annotations and the sources they reference:

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

- Every `ref` has a `sourceId` pointing into `sources`, plus a `kind`:
  - `file`: the whole file, without `text`.
  - `hunk`: `oldStart`, `oldLines`, `newStart`, `newLines` and `patch`, without `text`.
  - `lines`: `side` (`old` or `new`) and one-based inclusive `startLine` / `endLine`. `text` gives UTF-16 offsets into those original lines, including their line separators.
- A source records `repositoryId` and the actual `view` with complete commit IDs:
  - `changes`: `area` (`staged`, `unstaged` or `untracked`) and optional `headCommit`;
  - `history`: `commit` and its `parent` (`null` for a root commit);
  - `compare`: `mode`, `baseCommit`, `headCommit` and optional `mergeBaseCommit`.
- `old` / `new` give each side's path, `sha256:` content hash and `text` or `binary` type; an added or deleted file omits one side.
- `evidence` holds the original content the targets refer to: complete selected lines for `lines`, the patch with its old/new text for `hunk`, nothing for `file`.
- Working-tree content is captured when the human opens the file and may since have changed on disk.
- A correction carrying `replacesEventId` may have no annotations, which withdraws all earlier feedback.
