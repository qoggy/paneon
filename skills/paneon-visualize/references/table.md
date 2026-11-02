# Table

Run `<skill>/assets/panels/table/panel.tsx`. The human can search, filter, sort and page the rows, select text in the title, description, column labels or cells, annotate it, and submit all annotations together.

```json
{
  "title": "Compare services",
  "description": "Select the relevant values and explain your questions.",
  "columns": [
    { "key": "name", "label": "Service" },
    { "key": "latency", "label": "Latency (ms)", "type": "number" },
    { "key": "description", "label": "Description" }
  ],
  "rows": [
    { "name": "API", "latency": 120, "description": "Synchronous requests" },
    { "name": "Worker", "latency": 900, "description": "Eventual consistency" }
  ],
  "pageSize": 20
}
```

Input:

- `title`: nonblank string; optional Markdown `description`; optional `pageSize` from 1 through 1000, default 20.
- `columns`: nonempty. Each has a unique nonblank `key`, a nonblank `label` and an optional `type`: `text` (default), `number` or `boolean`.
- `rows`: may be empty. Every row must contain every declared key as its own field; use `null` for an empty cell. Values are strings, finite numbers, booleans or `null`; `number` and `boolean` columns accept only that type or `null`. Extra fields are kept but not shown.

`table-submitted` contains all annotations. A cell's `rowIndex` is its index in the input `rows`, unaffected by sorting, filtering or paging.
