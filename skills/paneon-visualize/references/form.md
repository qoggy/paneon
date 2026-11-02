# Form

Run `<skill>/assets/panels/form/panel.tsx`. The human fills in all fields on one page and submits them together.

```json
{
  "title": "Project configuration",
  "fields": [
    { "name": "project", "label": "Project name", "type": "text", "required": true },
    {
      "name": "replicas",
      "label": "Instances",
      "type": "number",
      "min": 0,
      "max": 10,
      "defaultValue": 0
    },
    { "name": "notify", "label": "Notify on completion", "type": "switch" }
  ]
}
```

Input:

- `title`: nonblank string; optional Markdown `description`.
- `fields`: nonempty ordered array. Each field has a unique nonblank `name`, a nonblank `label`, an optional plain `description` and optional `required` (default false).
- `text` / `textarea`: optional string `defaultValue`, nonnegative integer `minLength` / `maxLength`.
- `number`: optional finite `defaultValue`, `min` / `max`.
- `select` / `radio`: nonempty `options` of `{value,label}`, optional string `defaultValue`.
- `multiselect`: the same `options`, optional string-array `defaultValue`.
- `checkbox` / `switch`: optional boolean `defaultValue`, default false.
- Option values must be unique per field. Lower bounds must not exceed upper bounds. A default must match its field's type, bounds and options.

`form-submitted` returns values keyed by field name:

```json
{ "values": { "project": "demo", "replicas": 0, "notify": false } }
```

- `checkbox` and `switch` always appear. Other optional fields left empty are omitted.
- `required` on a boolean field does not mean it must be true; `false` is a valid answer.
