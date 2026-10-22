# Read-only table feedback

Run `assets/panels/table/panel.tsx` with ordinary `paneon panel run` and either `--params-file <json-file>` or `--params '<json>'`. Supply one creation-time snapshot; create a new instance to change the data.

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

`title`, `columns` and `rows` are required. `description` is optional Markdown. Columns have only `key`, `label` and optional `type` (`text`, `number`, `boolean`; default `text`). Keys must be unique and nonblank. Each declared key must be an own field of every row; use `null` for an empty cell. Cell values are strings, finite numbers, booleans or null. Number/boolean columns accept their native type or null. Extra row fields are retained but not shown. Rows may be empty. `pageSize` is an integer from 1 through 1000, default 20. There is no rowKey, required business id, preselection, format, overflow or detailsKey option.

The compact page places **整体评论** and **提交评论** beside the title. Optional Markdown description stays available through the **说明** Popover, including keyboard and touch activation. The toolbar groups search and **筛选** on the left, with object selection, pending-comment action and saved-comment catalog on the right; controls wrap to fit the panel.

Search and per-column filters perform case-insensitive text containment on declared columns. Open **筛选** for the existing per-column contains inputs; active filters appear below the toolbar and can be removed individually. Search has its own clear action. **重置视图** appears only while search, filters or sorting are active and clears all three. Numeric/boolean sorting uses native values; text sorting uses displayed text, null stays last in either direction, and equal values retain original row order. A filter/sort change returns to page one and preserves feedback drafts.

The table keeps its existing appearance with compact headers and rows. Declared number columns align right, booleans remain raw `true`/`false`, and text cells use the remaining width and naturally wrap without changing their source. Multiple columns scroll within the table region. The footer shows the visible range and match count, includes the original total when filtered, and provides compact previous/next controls. Empty input and no matches remain distinct states.

Select a word or phrase inside an original string cell while browsing, then use the nearby **评论** action and anchored editor. Use **选择对象** to choose rows, columns or cells; the selection-only **选择帮助** Popover explains the scope when needed. A column means the complete original column; the header row checkbox affects only the current page. Several targets may share one opinion. Save the current comment before creating another independent comment. Saving is page-local; a numbered marker reopens its editor, where Cancel discards only the current edit and Delete removes the comment. **整体评论** opens an optional overall editor. **提交评论** in the top toolbar submits the complete result, and unsaved edits must first be saved or cancelled. Ordinary browsing preserves copying and controls; data is never edited.

The `table-submitted` event contains one complete result:

```json
{
  "annotations": [
    {
      "id": "generated-stable-id",
      "targets": [
        { "ref": { "kind": "cell", "rowIndex": 0, "columnKey": "latency" } },
        { "ref": { "kind": "cell", "rowIndex": 1, "columnKey": "latency" } }
      ],
      "comment": "Why are these so different?"
    }
  ],
  "comment": "Please explain the tradeoffs."
}
```

References are `{kind:'row',rowIndex}`, `{kind:'column',columnKey}` or `{kind:'cell',rowIndex,columnKey}`. `rowIndex` is the original input's zero-based index and remains unchanged by sorting, filtering or pagination. Only string cell targets may carry `text:{start,end,quote}`. Offsets use UTF-16, match the original string slice, and do not split a grapheme. Empty annotation comments mean selection without an opinion; there is no separate selected result. Locating an offscreen target clears filters, restores its original-order page and highlights it without deleting drafts.

Only explicit submission emits an event. First-time empty feedback is rejected. After success, click “修改反馈”, edit the retained result and submit again. Each correction appends the full replacement and `replacesEventId` referencing this page's previous successful event. An empty correction explicitly clears prior feedback. Failures retain drafts and do not advance that association. Reading and acknowledging results uses normal `paneon panel events <instanceId> --consumer <name>` and `paneon panel ack <instanceId> --consumer <name> --through <eventId>`.

The page validates targets against its fixed snapshot in its adapter and again through its own `validateTable` serverAction before `agent.emit`. Generic event schema validation does not independently retrieve business data. Input/source revision and user feedback history remain separate. Drafts and the last successful receipt live in the current browser page; full reload does not restore them.

Object comments: use **选择对象** to collect targets, then click toolbar **评论** to open the editor. Only **保存** adds the page draft; cancelling discards the temporary selection. Text selection uses its nearby action directly.
