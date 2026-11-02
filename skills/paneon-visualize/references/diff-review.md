# Diff review

Run `<skill>/assets/panels/diff-review/panel.tsx`. The human browses a file tree of original/proposed file pairs, reads each diff, annotates text on either side, and submits all annotations together. No Git repository is needed, and the page never modifies the files.

```json
{
  "title": "Review proposed changes",
  "files": [
    {
      "displayPath": "prompts/worker.md",
      "oldPath": "prompts/worker.md",
      "newPath": "/tmp/proposal/worker.md"
    },
    {
      "displayPath": "docs/new-guide.md",
      "oldPath": null,
      "newPath": "/tmp/proposal/new-guide.md"
    },
    { "displayPath": "docs/obsolete.md", "oldPath": "docs/obsolete.md", "newPath": null }
  ]
}
```

Input:

- `title`: optional string.
- `files`: nonempty. Each entry has `oldPath` and `newPath` (relative to `--cwd`, or absolute; UTF-8 files) and an optional `displayPath` for the tree, defaulting to the old file's name, else the new one's.
- `null` means that side is absent: `oldPath: null` is an added file, `newPath: null` a deleted one. Both cannot be `null`. A path that does not exist is shown as an error, not as an absent side.
- Both sides are read each time the page loads, so a reload of the same URL shows their current content and discards unsubmitted annotations.

`diff-review-submitted` groups the annotations by file pair as read when the human opened it. If a file has changed since, locate an annotation by its `quote`.
