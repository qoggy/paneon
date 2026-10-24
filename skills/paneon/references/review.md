# Review a complete Markdown document

Run `assets/panels/review/panel.tsx` using ordinary `paneon panel run` with `--params-file <json-file>` or `--params '<json>'`:

```json
{
  "title": "Review the cache plan",
  "markdown": "# Cache strategy\n\nKeep entries for **24 hours**.\n\nOn failure, query the database."
}
```

Both fields are required strings; the title must not be blank. Supply one complete raw Markdown document. Do not split it into sections or assign paragraph IDs. New document content uses a new instance; the existing instance retains its creation-time snapshot.

Read and copy text or follow links normally. Select a word or phrase to reveal the nearby **批注** action; click it to open an anchored editor. **保存** stores the annotation in this page only. Click its numbered marker to edit; Cancel discards the temporary edit and Delete removes the annotation. Select a complete paragraph in the same way; the default toolbar has no object-selection mode. Empty annotations mean selection without a written opinion. **整体批注** opens an optional overall-annotation editor. **提交批注** in the page toolbar sends the complete result to AI; unsaved edits must first be saved or cancelled.

`review-submitted` carries a complete feedback result:

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

The example offsets correspond to the exact `markdown` above. Whole-document references omit `text`; paragraph and phrase targets use the same `{kind:'document'}` reference plus raw-source UTF-16 offsets. Every quote equals `markdown.slice(start,end)`, with complete grapheme boundaries. Repeated words retain distinct positions. Selections spanning emphasis or links can include intervening Markdown syntax in their source quote. Disconnected registered fragments use multiple targets in the same entry. Rendered text offsets are never treated as source offsets.

The reusable `assets/shared/markdown-feedback.tsx` exports `MarkdownFeedback<TRef>({source,target,className?,disabled?})`. Place it under a public `FeedbackProvider<TRef>` and provide any JSON semantic reference, such as a versioned PR description reference. It uses the existing react-markdown/remark-gfm rendering chain and GitHub styling, retains AST source positions, and explicitly registers each rendered Text node's UTF-16 boundary map against the full source. The component does not define ReviewRef, event schemas, snapshot storage or submission policy. The owner supplies an adapter that resolves the exact original snapshot and validates ranges. `markdown-feedback-schema.ts` exports `validSourceRange` for that validation. The renderer also exports `locateMarkdownFeedback(root,text?)` to restore and highlight a source range, including paragraph ranges whose edges contain Markdown syntax.

Escapes, entities, inline/fenced code, formatting, Unicode and repeated text map through source ranges. Raw HTML is not executed. Mermaid uses the existing Mermaid component; arbitrary graph-internal coordinates/text are not registered. Unmappable or synthetic text is left unregistered rather than assigned a guessed range.

Submission requires an explicit action. First empty feedback emits nothing. Successful feedback remains visible and can be edited with “修改反馈”; resubmission appends a full correction with `replacesEventId` pointing to the previous successful event. An empty correction clears old feedback while preserving event history. Submission failures retain drafts; duplicate submission is blocked while pending. Page adapters and the page's `validateReview` serverAction both validate against the original snapshot before `agent.emit`. The event result omits the document because the instance input already contains it.

Read and acknowledge events with `paneon panel events <instanceId> --consumer <name>` and `paneon panel ack <instanceId> --consumer <name> --through <eventId>`. Drafts and the current page's previous receipt are browser-local; page reload does not promise draft recovery.

Select text, including complete paragraphs, and use its nearby **批注** action. Only **保存** adds the page draft; cancelling discards the temporary edit.
