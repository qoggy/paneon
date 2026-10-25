# Review

Run `<skill>/assets/panels/review/panel.tsx`. The human reads the rendered Markdown, selects words, phrases or paragraphs, annotates them, and submits all annotations together.

```json
{
  "title": "Review the cache plan",
  "markdown": "# Cache strategy\n\nKeep entries for **24 hours**.\n\nOn failure, query the database."
}
```

Input: a nonblank `title` and one complete `markdown` string.

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

- `ref` is always `{kind:'document'}`. `text` gives UTF-16 offsets into the input `markdown` source, not the rendered text, so a quote can include Markdown syntax.
- One annotation can have several targets when its selection maps to separate source fragments.
- A correction carrying `replacesEventId` may have no annotations, which withdraws all earlier feedback.
