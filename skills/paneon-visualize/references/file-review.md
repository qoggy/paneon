# File review

Run `<skill>/assets/panels/file-review/panel.tsx` on complete local text files, one or more directories, or their combination. The human reads the files, annotates text and submits all annotations together.

```json
{
  "title": "Review the cache implementation and tests",
  "directories": ["src/cache", "tests/cache"],
  "files": ["docs/cache-plan.md"]
}
```

Input:

- `title`: optional nonblank string.
- `files`: optional array of file paths.
- `directories`: optional array of directory paths; may be combined with `files`.

Paths must be nonblank literal strings, absolute or relative to `--cwd`. Supply at least one path across `files` and `directories`. Other fields are rejected. Reviewable files must be regular UTF-8 text files of at most 1 MiB.

`file-review-submitted` groups the annotations by file. Offsets refer to each file as read when the human opened it; if the file has changed since, locate an annotation by its `quote`.
