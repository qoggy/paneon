# Review

Run `<skill>/assets/panels/review/panel.tsx` on a local Markdown file. The human reads the rendered Markdown, selects words, phrases or paragraphs, annotates them, and submits all annotations together.

```json
{
  "title": "Review the cache plan",
  "markdownFilePath": "docs/cache-plan.md"
}
```

Input: a nonblank `title` and `markdownFilePath`, absolute or relative to `--cwd`, read as UTF-8. Pass the path of the document under review; only for content that exists nowhere on disk, write it to a temporary file first.

`review-submitted` contains the complete set of annotations:

```json
{
  "annotations": [
    {
      "id": "generated-stable-id",
      "targets": [
        {
          "ref": { "kind": "document" },
          "text": { "start": 37, "end": 45, "quote": "24 hours" }
        }
      ],
      "comment": "Please shorten this duration."
    }
  ]
}
```

- `ref` is `{kind:'document'}` for the reviewed file. `text` gives UTF-16 offsets into the file's Markdown source, not the rendered text, so a quote can include Markdown syntax. The example assumes the file contains `# Cache strategy\n\nKeep entries for **24 hours**.\n\nOn failure, query the database.`
- A target that also has `sourceRef: {path, snapshotId}` annotates a local file the human opened from a link in the document; its `text` offsets refer to that file, not the Markdown.
- Offsets refer to the file as the page read it when opened. If the file has changed since, locate each annotation by its `quote`.
- A correction carrying `replacesEventId` may have no annotations, which withdraws all earlier feedback.
