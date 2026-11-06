# Choose

Run `<skill>/assets/panels/choose/panel.tsx`. The human answers one question at a time, can explain each chosen option or type an own answer under **Other**, reviews a summary and submits all answers together.

```json
{
  "questions": [
    {
      "id": "storage",
      "title": "Which storage fits?",
      "options": [
        {
          "id": "sqlite",
          "label": "SQLite",
          "description": "Simple single-machine setup",
          "recommended": true
        },
        {
          "id": "postgres",
          "label": "PostgreSQL",
          "details": "## Trade-off\n\nShared data across instances."
        }
      ]
    },
    {
      "id": "features",
      "title": "Which features are needed?",
      "mode": "multiple",
      "options": [
        { "id": "backup", "label": "Backup" },
        { "id": "audit", "label": "Audit log" }
      ]
    }
  ]
}
```

Input:

- `questions`: nonempty ordered array. Each question has a unique nonblank `id`, a nonblank `title`, optional Markdown `description`, optional `mode` (`single`, the default, or `multiple`), nonempty `options` and optional `selectedIds`. The panel adds **Other** after the options of every question.
- Each option has an `id` unique within its question, a nonblank `label`, an optional plain `description`, optional Markdown `details` (shown on demand; supports code, tables and Mermaid) and optional `recommended`. Recommendation marks an option but never selects it.
- `selectedIds` preselects options of that question, without duplicates and at most one in single mode.

`answers-submitted` contains one answer per question, in input order.
