## Why

People need to annotate rendered SVG, cards and panels without authors wrapping each region or assigning a business reference. The reviewed prototype establishes a shared element picker that reuses the existing annotation editor, directory and explicit submission.

## What Changes

- Extend the existing draggable floating capsule with an icon-only element-selection button and a purpose tooltip, beside the unchanged directory action.
- Add hover outlines, DOM ancestor selection, an adjacent range popup, Left/Right parent-child navigation, Enter to annotate, and layered Escape/Cancel behavior.
- Reuse the existing editor, numbered markers, draft management and submission; do not add AnnotationBlock or a separate editor.
- Keep faint boundaries around saved element targets, emphasize the matching range during hover/focus/editing, and use the corresponding numbered marker for both existing-annotation editing entry points.
- Keep generated-element opinions editable at the bottom-right when their target is hidden or removed.
- Automatically avoid common wide fixed/sticky top bars without page configuration. Center short element targets and center the opening half-screen portion of tall targets; keep markers and the original editor below the detected bar.
- Generate `ref.element = { path, tag, excerpt }`. Retain 30 visible characters in excerpts, append an ellipsis when truncated, and keep the limit in one constant. Do not add page or revision fields.
- Accommodate generated element references in SDK schemas, page adapters and supplied panel feedback without changing existing author-defined references.

## Capabilities

### New Capabilities

- `element-annotations`: Select rendered elements through the shared page session without per-element author registration.

### Modified Capabilities

- `panel-feedback`: Add generated element references and the split floating entry while retaining existing text/media annotation and submission behavior.

## Impact

SDK annotation types/schemas, UI annotation controls/store/geometry/locales, supplied panel feedback mappings, authoring documentation and targeted annotation tests. No new dependencies, runtime endpoints, automatic source-code mapping, page-version protocol, cross-refresh draft recovery, or release work.
