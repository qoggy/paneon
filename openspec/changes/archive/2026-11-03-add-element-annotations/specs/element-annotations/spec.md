## ADDED Requirements

### Requirement: Enter element selection from the shared floating capsule

Enabled pages SHALL provide an icon-only selection action with a purpose tooltip on the left of the existing floating annotation directory trigger. Both actions SHALL share one draggable capsule. Directory-side dragging SHALL move the whole capsule. Entering selection SHALL close the directory; explicitly opening the directory SHALL end selection. The picker SHALL reuse existing disabled, submitting and open-editor behavior.

#### Scenario: Select from an empty directory

- **WHEN** a person activates the selection icon with no saved annotations
- **THEN** the page enters element picking without per-element author setup and the icon indicates the active mode

#### Scenario: Preserve the directory

- **WHEN** a person hovers, clicks or drags the directory side during normal browsing
- **THEN** the existing directory, pinning, whole-capsule movement and explicit submission remain available

### Requirement: Review the range beside the selected element

Picking SHALL outline rendered content without executing its normal click actions. Clicking SHALL lock a visible ancestor chain and show a range popup anchored beside the selected element, including SVG. The popup and outline SHALL follow scroll, resize and ancestor-range changes. Framework annotation controls SHALL remain operable and SHALL NOT become picked content.

#### Scenario: Change the selected ancestor

- **WHEN** a person selects text inside a card and presses Left, then Right
- **THEN** the selected range expands to its parent and narrows toward the initial child, and the popup follows the current range

#### Scenario: Open the shared editor

- **WHEN** a person presses Enter or activates Add annotation while reviewing a range
- **THEN** the existing editor opens for that element, with the existing markers, local saving and explicit submission

### Requirement: Cancel selection one level at a time

Escape and Cancel during range review SHALL clear the selected range and return to picking. Escape during picking SHALL return to normal browsing. Existing annotation-editor Escape behavior SHALL remain unchanged.

#### Scenario: Pick again after cancellation

- **WHEN** a person selects a range and presses Escape
- **THEN** they can pick another element without reactivating selection, and no annotation is created by cancellation

### Requirement: Generate compact element references

An element annotation SHALL use `{ref:{element:{path,tag,excerpt}}}` with no text range, page or revision field. Path SHALL identify the element relative to the page body, including elements selected inside overlays. Excerpt SHALL use aria-label or otherwise textContent, normalize whitespace, retain 30 visible grapheme clusters and append an ellipsis only when truncated. The length SHALL be defined in one named constant. Saved element geometry SHALL use the entire selected element rather than its first descendant SVG. SDK schema composition and supplied panel submissions SHALL accept these references while preserving author-defined text/media targets.

#### Scenario: Retain a short emoji-safe excerpt

- **WHEN** content contains more than 30 visible characters including combined emoji
- **THEN** the excerpt contains the first 30 complete characters followed by `…`, without splitting a character

#### Scenario: Submit an unregistered card

- **WHEN** a person annotates a card without annotationTarget or a wrapper and explicitly submits
- **THEN** the existing callback receives the generated element ref and comment, and supplied agent events omit the internal draft id

### Requirement: Keep the annotated element range visible

Saved element annotations SHALL retain a faint thin outline of the selected element, preserving its border radius and following its visible geometry during scrolling and resizing. Hovering or focusing a marker or directory row SHALL emphasize only that annotation's outline. An open editor SHALL keep its annotation's outline emphasized until closed. Nested targets SHALL retain their own boundaries. Outlines SHALL NOT intercept content interactions or change the annotation payload, editor or author-defined text/media styling.

#### Scenario: Distinguish nested annotations

- **WHEN** a card and its inner SVG each have a saved annotation and the SVG marker is hovered
- **THEN** both boundaries remain visible and only the SVG boundary is emphasized

#### Scenario: Delete an element annotation

- **WHEN** a saved element annotation is deleted
- **THEN** its marker and outline disappear together, leaving other annotations intact

### Requirement: Locate by target height and avoid common top bars automatically

Generated-element location SHALL center a target that fits in the available viewport region. For taller targets it SHALL center the opening half-screen portion so the title and initial content remain visible. The available region SHALL reserve space below common wide fixed/sticky top bars without author attributes, wrappers or configuration. Markers and the existing editor SHALL use this region to avoid overlapping those bars. Candidate detection SHALL exclude annotation controls, normal content, hidden bars and narrow floating actions. The implementation SHALL preserve authored scroll margins and wait for location to settle before opening an editor. This heuristic SHALL NOT promise arbitrary floating-content detection, business-identity recovery or automatic Tab restoration.

#### Scenario: Locate a tall block under a fixed tab bar

- **WHEN** the target is taller than the usable viewport and a wide fixed tab bar occupies its top
- **THEN** the opening half-screen portion is centered below that bar and the annotation marker and editor remain below it

#### Scenario: A bar becomes sticky during location

- **WHEN** scrolling pins a previously unpinned top bar
- **THEN** the available area is measured again and the final location accounts for the pinned bar before opening the editor

#### Scenario: Center a short target without false exclusions

- **WHEN** a short target is located with only ordinary content, a hidden bar or a small floating action at the top
- **THEN** the full target is centered without reserving space for those elements
