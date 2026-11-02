## 1. References and geometry

- [x] 1.1 Add the element reference type/schema and 30-grapheme excerpt/path helpers.
- [x] 1.2 Support actual element geometry and route generated references through the shared store and callback types.

## 2. Shared interaction

- [x] 2.1 Implement element picking, adjacent range review, keyboard navigation and layered cancellation.
- [x] 2.2 Compose the icon action into the draggable floating capsule and add translated labels.

## 3. Submission and documentation

- [x] 3.1 Preserve generated element refs through supplied panel schemas, adapters and agent-facing mappings.
- [x] 3.2 Document the agreed interaction and complete payload, including the single excerpt-length constant and DOM-path scope.

## 4. Verification

- [x] 4.1 Add focused reference/excerpt/submission tests and a browser acceptance scenario for the approved interaction.
- [x] 4.2 Run typecheck, focused annotation regressions, formatting and OpenSpec validation; record results.

## 5. Visible targets and consistent editing

- [x] 5.1 Keep a faint outline around saved element targets and emphasize the matching range on marker/directory hover or focus and throughout editing.
- [x] 5.2 Anchor existing-annotation editing to the corresponding marker from both marker and directory entry points.
- [x] 5.3 Verify nested ranges, deletion, scrolling and consistent editor placement; update documentation and the live preview.

## 6. Unavailable targets and sticky-header investigation

- [x] 6.1 Open the existing editor at the bottom-right when a selected element target is hidden or removed, preserving its saved target and comment without attempting view restoration.
- [x] 6.2 Verify hidden, removed and offscreen element editing with the existing save/cancel/delete protections.
- [x] 6.3 Reproduce positioning and marker/editor overlap with a floating tab bar, record measurements and screenshots, and report without implementing sticky-header avoidance.

## 7. Height-aware location and automatic top-bar avoidance

- [x] 7.1 Automatically measure common wide fixed/sticky top bars without author configuration, and share the available region with marker/editor positioning.
- [x] 7.2 Center short element targets and center the opening half-screen portion of tall targets, preserving normal location waits and hidden-target editing.
- [x] 7.3 Verify the original reproduction, short/tall targets, sticky/header exclusions and existing annotation behavior; update the preview and verification notes.
