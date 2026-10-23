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

The page shows one question at a time. Previous and Next browse questions without validating answers. Both preserve drafts without emitting events, so unanswered or unfinished questions never block browsing. Each selected option has its own optional explanation inside its card. Deselecting an option keeps its explanation draft; reselecting restores it. Only selected options and their explanations are submitted.

The questionnaire uses a centered narrow column and compact choice rows with clear selected states. Its compact header puts the questionnaire title and current single/multiple-choice progress on one line. Optional questionnaire Markdown is visible immediately below that line, before the question title, without a disclosure, truncation or a fixed height. No empty description block is rendered when it is absent. A question’s own description remains visible below its title and wraps naturally. Review reuses this context header with Answer summary instead of a question number. Click anywhere in a row's label to choose it; its explanation and View details button stay separate from that click target. Details open in a nonblocking right-side reading pane on wide screens (1024px and above), or in a dismissible dialog on smaller screens. Clicking the open option’s details button again closes it; clicking another option’s button switches the content. Viewing, switching, or closing details preserves answers and explanation drafts without emitting events; changing questions closes the previous details. Previous and Next/Submit sit at opposite edges, with Previous hidden on the first question. The layout uses existing shadcn components and theme values.

The **Other** row always shows a compact **My answer** input: type directly to select it, without switching modes. It expands as text wraps. For a single-choice question, Other and supplied options are mutually exclusive. Choosing a supplied option keeps any custom draft but excludes it from submission. For a multiple-choice question, Other is an additional checkbox at the same level as the supplied options: selecting or typing it keeps all supplied selections, and deselecting it keeps its text without submitting it. If Other is selected, its text must contain non-whitespace content; clearing it does not silently change the selection. After the last question, Next opens a separate Review all answers step, even when some answers are unfinished. The summary shows missing answers as No answer, and the answered count includes only valid answers. Every incomplete row has explicit status text, an icon and themed emphasis; selected blank custom answers are incomplete too. Each summary row is a keyboard-operable button that returns directly to its question, preserving all drafts. After entering review, a Return to summary action lets the human return directly from any question. The review shows only the complete summary and submission controls; Previous returns to the last question with all drafts preserved. Only the review step offers Submit all answers (or Submit corrected answers after a saved result). Entering review never emits an event. Final submission validates every question. Invalid submission stays on the summary, displays and focuses an inline error with the incomplete count, and emits no event or discards drafts. Only an explicit summary-row click enters a question. This also applies to corrected submissions.

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

The `features` and `delivery` answers illustrate additional questions; include them in the input when using this complete result. Each `selections` entry is either `{ kind: 'option', optionId, comment }` or `{ kind: 'custom', text }`. Option explanations are always strings, including `""` when there is no explanation; each explanation stays attached to its option. All text retains original spacing. Single-choice answers require exactly one entry; multiple-choice answers require at least one, and may contain supplied options, a custom answer, or both. Each custom answer must contain non-whitespace text and there can be at most one per question. Supplied IDs must be valid and unique within the question. Output follows input option order, with the custom answer last. Results omit the question and option definitions, the old question-level `kind`/`comment`, and result `selectedIds`.

After saving, the human can edit any answer and explicitly submit the entire corrected set. The new event includes `replacesEventId` referencing this page's previous successful event ID; the first result omits it. Save failures preserve all drafts and the prior receipt. New questions require a new instance, even when their IDs match an earlier round. Drafts and page receipts are in-memory and are not recovered after a browser reload.

Use exactly one of `--params <json>` or `--params-file <path>`. File paths resolve against the invoking directory, independently of `--cwd`. The CLI reads UTF-8 JSON once when creating the instance; editing or deleting that file does not change the existing questionnaire, including after reload or restart.
