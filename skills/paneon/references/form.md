# Collect task parameters

Run [the form panel](../assets/panels/form/panel.tsx) with all fields in one input:

```sh
paneon panel run /absolute/skill/paneon/assets/panels/form/panel.tsx \
  --cwd /work/project --params '{"title":"Project configuration","fields":[{"name":"project","label":"Project name","type":"text","required":true},{"name":"replicas","label":"Instances","type":"number","min":0,"max":10,"defaultValue":0},{"name":"notify","label":"Notify on completion","type":"switch","required":true}]}' --json
```

Input fields (see [schema](../assets/panels/form/schema.ts)):

- `title`: nonblank string; optional `description`: Markdown.
- `fields`: nonempty ordered array. Each field has unique nonblank `name`, nonblank `label`, optional plain `description`, and optional `required` (default false).
- `text` / `textarea`: optional string `defaultValue`, nonnegative integer `minLength` / `maxLength`.
- `number`: optional finite number `defaultValue`, `min` / `max`.
- `select` / `radio`: nonempty `options` of `{value,label}`, optional string `defaultValue`.
- `multiselect`: the same options, optional string-array `defaultValue`.
- `checkbox` / `switch`: optional boolean `defaultValue`; defaults to false and always returns a boolean.

Option values and labels must be nonblank; values must be unique per field. Defaults must match the field type, bounds and options; multi-select defaults cannot repeat a value. Lower bounds cannot exceed upper bounds. Input configuration errors reject creation.

All fields appear together with descriptions, required markers and defaults. Short radio and multi-select options share a wrapping row; long labels wrap to fit. Checkbox and switch labels sit beside their controls and are clickable. Select and radio values can be cleared with the small adjacent clear action; clearing changes only that field and required choices are still validated on submission. The submit action uses its content width rather than stretching across the form. Editing sends no events. Explicit submission validates every field and focuses the first error. Required text must contain non-whitespace content, a required choice must have a value, and required multiselect must have at least one item. `0` and `false` are valid, including for required fields; required boolean does not mean “must be checked.” Nonblank text preserves original spacing. Optional empty fields are omitted. The page collects values without executing task operations.

`form-submitted` returns the complete current values keyed by field name:

```json
{ "values": { "project": "demo", "replicas": 0, "notify": false } }
```

The result omits field definitions, labels and options. Success appears after durable saving. On failure, values remain editable. After success, explicitly submitting a correction appends another complete result with `replacesEventId` pointing to this page's previous successful receipt; the first result omits it. Failed saves never replace that receipt. Browser reloads do not recover unsent drafts or the page-local receipt. Create a new instance for a different form/question round.

Use exactly one of `--params <json>` or `--params-file <path>`. The file is UTF-8 JSON, resolved relative to the invoking directory rather than `--cwd`, and read once at instance creation. Later edits or deletion do not change the saved input.
