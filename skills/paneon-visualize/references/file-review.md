# File review

Run `<skill>/assets/panels/file-review/panel.tsx` on one or more complete local text files, such as a plan with its code and configuration. The human reads them, annotates text and submits all annotations together.

```json
{
  "title": "Review the cache plan and example",
  "files": ["docs/cache-plan.md", "examples/cache.ts", "config/cache.json"]
}
```

Input:

- `title`: optional nonblank string.
- `files`: nonempty array of paths, absolute or relative to `--cwd`. Each must be a regular UTF-8 text file of at most 1 MiB; empty files are fine. `.md` / `.markdown` files are rendered, others shown as source.
- Files are read when the page opens; an unreadable file appears as an error in the page, not as a `panel run` failure. Pass the files under review; write a temporary file only for content that exists nowhere on disk.

`file-review-submitted` groups annotations by file:

```json
{
  "files": [
    {
      "path": "/workspace/cache/examples/cache.ts",
      "snapshotId": "sha256:…",
      "annotations": [
        {
          "targets": [{ "text": { "start": 176, "end": 182, "quote": "30_000" } }],
          "comment": "Please explain the default duration."
        }
      ]
    }
  ]
}
```

- `path` is the resolved absolute path; `snapshotId` identifies the content read when the human opened it.
- `text` gives UTF-16 offsets into that file's original source, end excluded; for Markdown that is the source, not the rendered text, and one selection may produce several targets. If the file has changed since, locate each annotation by its `quote`.
- `{path: {quote}}` annotates part of the file's path rather than its content.
- Annotations on a local file opened from a Markdown link form their own group with that file's `path` and `snapshotId`.
- The same path listed twice gives separate groups. Comments may be empty.
- A correction carrying `replacesEventId` may have `files: []`, which withdraws all earlier feedback.
