---
name: ui-annotation-payload-format
description: Annotation data sent to the agent is compact, grouped by the object it describes, and free of page-internal fields and repeated long values
type: tech
---

# Annotation payload format for agents

Public components, built-in panels and example panels must send annotation data in a shape designed for the agent that reads it, not in the page's internal state.

- **Leave out page-internal data.** Do not send fields that only the page TSX uses, such as annotation `id` values and `fileIndex`. The agent cannot act on them.
- **Group data under the object it describes.** Put each annotation inside the file (or other source) it belongs to. The agent should not have to join distant JSON nodes, such as matching a `ref` in `annotations` to an entry in a separate `sources` array, to understand one annotation.
- **Write each long value once.** Do not repeat long values such as `sha256:…` snapshot IDs across several fields. Put a shared value on the parent object once and let child entries inherit it.

Bad: annotations and sources are split, internal fields are exposed, and the snapshot ID appears twice.

```json
{
  "annotations": [
    {
      "id": "demo-diff-review",
      "targets": [
        {
          "ref": {
            "fileIndex": 0,
            "snapshotId": "sha256:6070366450f889b387e713cdf426a18f45f99ef20b07c6a8876aca0a18d2d80a",
            "side": "new"
          },
          "text": { "start": 42, "end": 46, "quote": "5000" }
        }
      ],
      "comment": "请调整这里。"
    }
  ],
  "sources": [
    {
      "fileIndex": 0,
      "snapshotId": "sha256:6070366450f889b387e713cdf426a18f45f99ef20b07c6a8876aca0a18d2d80a",
      "displayPath": "src/request.ts",
      "oldPath": "/tmp/paneon-annotation-format-review/request-old.ts",
      "newPath": "/tmp/paneon-annotation-format-review/request-new.ts"
    }
  ]
}
```

Good: annotations are nested under their file, and the snapshot ID appears once.

```json
{
  "files": [
    {
      "snapshotId": "sha256:6070366450f889b387e713cdf426a18f45f99ef20b07c6a8876aca0a18d2d80a",
      "displayPath": "src/request.ts",
      "oldPath": "/tmp/paneon-annotation-format-review/request-old.ts",
      "newPath": "/tmp/paneon-annotation-format-review/request-new.ts",
      "annotations": [
        {
          "targets": [
            {
              "side": "new",
              "text": { "start": 42, "end": 46, "quote": "5000" }
            }
          ],
          "comment": "请调整这里。"
        }
      ]
    }
  ]
}
```

**Why:** The agent reads this data as context. Internal fields, cross-node references and repeated hashes cost tokens and make the agent reconstruct relationships that the page already knows.
**How to apply:** When designing or reviewing a submitted event or any annotation output in public components, built-in panels or example panels, check every field: drop it if the agent cannot use it, nest it if it belongs to a parent object, and hoist it if the same long value repeats. Keep internal identities such as `fileIndex` and annotation `id` inside the page and map them to the agent-facing shape at submission time.
