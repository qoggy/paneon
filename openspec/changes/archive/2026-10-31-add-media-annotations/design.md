## Context

The approved interactive proposal covers Image, Markdown images, Mermaid and Markdown Mermaid. All use the page-owned session and explicit `onSubmit`; saving remains local. Existing text registration, retained original sources, modal editor protection and source-level file-review grouping must continue to work.

## Goals / Non-Goals

**Goals:** Preserve `annotationTarget` unchanged as `ref`; identify Mermaid with `type: 'mermaid'`; keep Markdown UTF-16 occurrence ranges; provide direct toolbar actions, nearby editing and one inline/viewer draft. Authors reuse SDK schemas and emit existing targets without Mermaid-specific transformations.

**Non-Goals:** Region/node/edge selection, source export or storage, source retrieval APIs, mobile-specific work, cross-refresh draft recovery, automatic content migration, new business validation or automatic event submission.

## Decisions

1. Extend the common target with an optional Mermaid discriminator. Mermaid ranges contain start/end without quote; ordinary text and image-syntax targets keep exact quotes. Preserve the schema's object shape for existing schema reuse, extending its existing range checks only to accommodate the approved Mermaid shape. Retain original source in the renderer/store, not in submitted Mermaid targets. Do not make each author remove source text.
2. Introduce an internal media target context and object registration alongside text registrations. Register exact rendered-element geometry and renderer-owned source evidence; use the Markdown parser's original node positions for image syntax and full Mermaid fences. No string/quote search or generated SVG identities. Pure-media documents must work even with zero text leaves.
3. Image/Mermaid expose optional generic annotationTarget. Markdown's existing public props remain unchanged; default img/pre renderers inherit document identity, source and AST range from internal context. Existing custom renderer behavior remains author-owned.
   Standalone Image targets additionally include the exact original `src` prop alongside `ref`. Include this field in the shared schema and canonical target key so the renderer bridge and expanded viewer retain it. Do not substitute a loaded Data URL or generated viewer URL, replace the author's ref, or require author-side target transformations. Markdown image syntax and Mermaid payloads retain their existing format.
4. Reuse the existing vertical MediaToolbar and ImageViewerDialog. Both expose the same direct annotation action, using the clicked button's live bounds for nearby editor placement; markers keep existing appearance. Reuse the current modal overlay container for editor and markers. Register the expanded image as another presentation of the same target and prefer the active viewer geometry.
5. Keep the existing store's edit protection, explicit save/cancel/delete and submit sequence. Add media geometry/source resolution to existing paths; hide media-area text highlights while retaining numbered markers. Viewer closure and Escape must respect the open editor before closing the viewer.
6. Extend built-in file-review validation and output mapping for type='mermaid' plus text start/end. Retain ordinary text/image quotes, original source grouping and existing snapshot evidence. No source writes or new hashes. Document the integration and verify a temporary experience panel whose callback only maps annotations to targets/comment; do not ship a new repository example.

## Risks / Trade-offs

- Modal layers can make markers inert → portal the shared surface into the existing active container and test pointer/focus/Escape in the actual viewer.
- Repeated media or frontmatter can shift source ranges → use parser node offsets against the preserved original Markdown, including CRLF/Unicode tests.
- Quote-free targets affect existing consumers → update schema/type/key and original range-validation branches together, retaining existing text behavior; run focused feedback/file/diff regressions.
- A ref alone does not retrieve arbitrary source → panel authors retain their known inputs and decide whether a particular event needs extra source; components do not invent storage or retrieval mechanisms.

## Migration Plan

All media annotation props are opt-in. Existing text target shapes and event names remain supported; the optional Mermaid type is added to supplied event schemas. Release integration is outside this development task; changes remain reviewable in the current development checkout.

## Open Questions

None blocking the approved scope. Additional defensive checks or unsupported scenarios will not be added without discussion.
