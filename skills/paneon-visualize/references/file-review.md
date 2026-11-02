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
- Files are read each time the page loads, so a reload of the same URL shows their current content and discards unsubmitted annotations. An unreadable file appears as an error in the page, not as a `panel run` failure. Pass the files under review; write a temporary file only for content that exists nowhere on disk.

`file-review-submitted` groups the annotations by file. Offsets refer to each file as read when the human opened it; if the file has changed since, locate an annotation by its `quote`.
