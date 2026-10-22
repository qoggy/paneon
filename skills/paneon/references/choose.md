# Choice questions

Run [the choice panel](../assets/panels/choose/panel.tsx) with a single fixed input:

```sh
paneon panel run /absolute/skill/paneon/assets/panels/choose/panel.tsx \
  --cwd /work/project --params '{"title":"Choose storage","questions":[{"id":"storage","title":"Which storage fits?","options":[{"id":"sqlite","label":"SQLite","description":"Simple single-machine setup","recommended":true},{"id":"postgres","label":"PostgreSQL","details":"## Trade-off\n\nShared data across instances."}]}]}' --json
```

Input fields (see [schema](../assets/panels/choose/schema.ts)):

- `title`: nonblank string; `description`: optional Markdown.
- `questions`: nonempty ordered array. Each question has unique nonblank `id`, nonblank `title`, optional Markdown `description`, optional `mode` (`single`, the default, or `multiple`), nonempty `options`, and optional `selectedIds` (default empty).
- Each option has a nonblank `id` unique within its question, nonblank `label`, optional plain `description`, optional Markdown `details` (including code, tables and Mermaid), and optional `recommended`. Recommendation never selects an answer.
- Initial selected IDs must belong to that question, have no duplicates, and contain at most one item in single mode.

The page shows one question at a time. Previous returns without validation; Next validates the current answer. Both preserve drafts without emitting events. Each selected option has its own optional explanation inside its card. Deselecting an option keeps its explanation draft; reselecting restores it. Only selected options and their explanations are submitted.

The **Other** card always shows a **My answer** input: type directly to select it, without switching modes. For a single-choice question, Other and supplied options are mutually exclusive. Choosing a supplied option keeps any custom draft but excludes it from submission. For a multiple-choice question, Other is an additional checkbox at the same level as the supplied options: selecting or typing it keeps all supplied selections, and deselecting it keeps its text without submitting it. If Other is selected, its text must contain non-whitespace content; clearing it does not silently change the selection. At the last question, review the complete summary and explicitly submit all answers.

`answers-submitted` contains exactly one answer per question, ordered like the input:

```json
{
  "answers": [
    {
      "questionId": "storage",
      "selections": [
        { "kind": "option", "optionId": "sqlite", "comment": "  Keep the backup plan.  " }
      ]
    },
    {
      "questionId": "features",
      "selections": [
        { "kind": "option", "optionId": "backup", "comment": "Daily backups" },
        { "kind": "option", "optionId": "audit", "comment": "" },
        { "kind": "custom", "text": "Also support data export." }
      ]
    },
    {
      "questionId": "delivery",
      "selections": [{ "kind": "custom", "text": "Use the internal software center." }]
    }
  ]
}
```

The `features` and `delivery` answers illustrate additional questions; include them in the input when using this complete result. Each `selections` entry is either `{ kind: 'option', optionId, comment }` or `{ kind: 'custom', text }`. Option comments are always strings, including `""` when there is no explanation; each comment stays attached to its option. All text retains original spacing. Single-choice answers require exactly one entry; multiple-choice answers require at least one, and may contain supplied options, a custom answer, or both. Each custom answer must contain non-whitespace text and there can be at most one per question. Supplied IDs must be valid and unique within the question. Output follows input option order, with the custom answer last. Results omit the question and option definitions, the old question-level `kind`/`comment`, and result `selectedIds`.

After saving, the human can edit any answer and explicitly submit the entire corrected set. The new event includes `replacesEventId` referencing this page's previous successful event ID; the first result omits it. Save failures preserve all drafts and the prior receipt. New questions require a new instance, even when their IDs match an earlier round. Drafts and page receipts are in-memory and are not recovered after a browser reload.

Use exactly one of `--params <json>` or `--params-file <path>`. File paths resolve against the invoking directory, independently of `--cwd`. The CLI reads UTF-8 JSON once when creating the instance; editing or deleting that file does not change the existing questionnaire, including after reload or restart.
