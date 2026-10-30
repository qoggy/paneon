## Why

People can annotate document text but cannot identify an entire image or Mermaid diagram with the same feedback workflow. Media feedback should preserve the author's target identity and original Markdown occurrence without repeatedly sending diagram source or requiring per-panel target transformations.

## What Changes

- Add optional `annotationTarget` to Image and Mermaid; inherit annotated Markdown targets and AST ranges automatically.
- Standalone Image targets automatically carry the original `src` beside the unchanged author-defined `ref`, including in the viewer and onSubmit.
- Add a direct annotation button to the existing vertical media toolbar and expanded viewer. Reuse the existing numbered markers, editor and list with one draft across inline and expanded views; open the editor beside its actual trigger.
- Add `type: 'mermaid'` targets with quote-free optional ranges. Keep full source/AST evidence internally so authors can emit the existing targets directly.
- Extend file-review events to retain Mermaid type and range; preserve image-syntax quotes and ordinary text feedback.
- Document and verify a complete minimal Markdown/image/Mermaid panel without Mermaid-specific filtering.
- Do not add source export files, source-reading APIs, node/region selection, disk drafts or automatic content migration.

## Capabilities

### New Capabilities

- `media-annotations`: Whole-media annotations across standalone and Markdown media, inline/viewer identity and nearby editing.

### Modified Capabilities

- `panel-feedback`: Mermaid target type and compact ranges with internal validation evidence.
- `file-review`: Publish Mermaid type/ranges under the existing original-file groups without diagram source.

## Impact

SDK annotation types/schema/identity; shared annotation store/surface; Image, Mermaid, Markdown renderers and viewer/toolbar; file-review validation and mapping; authoring references; targeted unit and desktop browser coverage. No new dependencies, runtime endpoints, automatic file writes or business validation policies.
