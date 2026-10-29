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

`diff-review-submitted` contains the complete set of annotations and the files they reference:

```json
{
  "annotations": [
    {
      "id": "generated-stable-id",
      "targets": [
        {
          "ref": { "fileIndex": 0, "snapshotId": "sha256:…", "side": "new" },
          "text": { "start": 12, "end": 20, "quote": "retry it" }
        }
      ],
      "comment": "Limit the retries."
    }
  ],
  "sources": [
    {
      "fileIndex": 0,
      "snapshotId": "sha256:…",
      "displayPath": "prompts/worker.md",
      "oldPath": "prompts/worker.md",
      "newPath": "/tmp/proposal/worker.md"
    }
  ]
}
```

- `fileIndex` is the index in the input `files`; `side` is `old` or `new`.
- `text` gives UTF-16 offsets into the complete text of that side as read when the human opened it. `snapshotId` identifies that read; the file may since have changed on disk.
- An annotation on a whole edit has a target on each changed side: old and new for a replacement, one side for a pure addition or deletion.
- A correction carrying `replacesEventId` may have no annotations, which withdraws all earlier feedback.
