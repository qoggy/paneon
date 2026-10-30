## ADDED Requirements

### Requirement: Annotate whole standalone and Markdown media

Image and Mermaid SHALL accept optional generic annotationTarget props, preserving the supplied value as target.ref in the page annotation session. Default Markdown image and Mermaid renderers SHALL inherit their annotated document identity and exact original AST occurrence ranges without extra per-media author setup. Ordinary Markdown image targets SHALL retain their complete image-syntax quote. Mermaid targets SHALL carry type='mermaid'; standalone Mermaid SHALL omit text, and Markdown Mermaid SHALL contain the complete fence's UTF-16 start/end without source quote. Neither draft targets nor onSubmit values SHALL automatically contain Mermaid source or exported source paths.

#### Scenario: Annotate a standalone diagram

- **WHEN** the person annotates a Mermaid configured with annotationTarget and an enabled page session
- **THEN** the callback receives the same reference and type='mermaid' without code or a temporary source file

#### Scenario: Carry the standalone image source

- **WHEN** the person annotates an Image configured with annotationTarget and src
- **THEN** the target SHALL contain the unchanged annotationTarget as ref and the exact original src as a separate src field in both the draft and onSubmit
- **AND** the expanded viewer SHALL retain that same target without substituting a Data URL or viewer URL
- **AND** Markdown image and Mermaid target formats SHALL remain unchanged

#### Scenario: Identify repeated Markdown media

- **WHEN** an annotated Markdown includes repeated images or identical Mermaid fences
- **THEN** each whole-media target retains the document ref and its own original AST range, including in documents containing only media

#### Scenario: Use existing Markdown integration

- **WHEN** an author renders one annotated Markdown with image syntax and Mermaid fences
- **THEN** the default renderers provide whole-media actions without custom renderers, AST parsing or per-target transformations in the author's callback

### Requirement: Reuse one draft across inline media and its viewer

Enabled media SHALL expose a direct annotation icon in the existing right-side vertical toolbar and its expanded viewer. Both presentations SHALL use the same target, saved opinion and numbered marker. The existing editor SHALL open beside the actual clicked toolbar button or marker, automatically focus its input and avoid viewport clipping. Saved whole media SHALL not receive a persistent area tint or heavy frame. Existing expand/link/copy/download interactions SHALL retain their meaning.

#### Scenario: Edit the same annotation after expansion

- **WHEN** the person saves an inline annotation, opens the media viewer and edits through its action or marker
- **THEN** the same number and opinion are edited, and closing the viewer after save retains exactly one annotation

#### Scenario: Edit beside the trigger

- **WHEN** a media toolbar action is activated near a viewport edge
- **THEN** the input receives focus and its compact editor appears next to that action with visible save/cancel controls

#### Scenario: Preserve an open edit

- **WHEN** the person presses Escape or attempts to close the viewer while editing an annotation
- **THEN** existing annotation-editor save/cancel protection is respected before the viewer closes, without clearing saved drafts or emitting events

#### Scenario: Keep ordinary displays unchanged

- **WHEN** the page session or media annotation target is absent
- **THEN** no media annotation action is shown and existing media interactions continue normally
