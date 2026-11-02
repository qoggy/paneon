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
- `compare` accepts `base: null` with `mode: "commits"` to compare the empty tree with head, including for a root commit.
- Optional `file` is repository-relative and must be in that view's changed files; a `history` file also requires `commit`.

## Repository management

The human can add and remove repositories within the page; added ones are lost on reload. Submitted files and checkout events identify a repository by `repositoryPath`: its real Git root, which can differ from the input path when that points inside a repository or through a symlink. Removing a repository never changes files or Git, and its submitted annotations stay in later corrections.

## Annotation submission

`git-review-submitted` groups the annotations by the file snapshot the human opened, with complete commit IDs. Working-tree content is captured when the human opens a file and may since have changed on disk.
