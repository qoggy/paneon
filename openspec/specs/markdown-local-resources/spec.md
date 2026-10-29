# Markdown Local Resources Specification

## Purpose

Provide local image rendering and linked text previews through component-owned actions, with shared Image and Mermaid controls and loading feedback.

## Requirements

### Requirement: Consistent image and diagram controls

Image and Mermaid SHALL share the same hover/focus expand and more toolbar. Image SHALL NOT show its source address on content hover. Its more menu SHALL offer Copy path using the original src, Copy image and Download original. Downloads SHALL preserve original bytes and format. Both direct Image and default Markdown images SHALL provide these controls without panel-authored glue. Existing linked-image behavior and loading feedback SHALL be retained.

The shared toolbar SHALL arrange its buttons vertically in a separate column to the right of the content, with top alignment and a gap. It SHALL NOT overlap the image or contribute to Mermaid's scrolling content. The expanded Image viewer SHALL offer Download original through the same action as its menu; Mermaid's expanded viewer SHALL retain Download PNG.

#### Scenario: Short diagram hover controls

- **WHEN** a fitted Mermaid diagram is shorter than the vertical toolbar
- **THEN** hovering or focusing its right-hand toolbar does not create a vertical scrolling area around the diagram

#### Scenario: Download from the expanded image

- **WHEN** the user downloads an original file from the expanded Image or default Markdown-image viewer
- **THEN** the original format and bytes are retained, with existing busy and toast feedback

#### Scenario: Copy image path

- **WHEN** the user selects Copy path from a loaded image's more menu
- **THEN** the existing browser clipboard bridge copies its original relative path, absolute path or remote URL and reports the result with toast

#### Scenario: Image browser operations

- **WHEN** the user copies or downloads a local or browser-readable remote image
- **THEN** the existing browser bridge writes a PNG to the clipboard or downloads the original bytes, showing busy and result feedback without a runtime endpoint

### Requirement: Public Image and shared loading feedback

The UI library SHALL export Image and ImageProps with src, alt, optional sourcePath and className. Markdown's default image renderer SHALL reuse the same implementation. Local reads SHALL preserve the existing resolution and file rules. Image SHALL show the shared Spinner until the local read and browser image load finish, including remote URLs, and retain the existing viewer and linked/custom-image behavior.

#### Scenario: Direct Image usage

- **WHEN** a panel renders Image with a local source
- **THEN** the component supplies its own action, resolves the file, and opens the existing image viewer without panel-authored loading or preview code

#### Scenario: Remote loading

- **WHEN** a remote image request is pending
- **THEN** Spinner remains visible until the image loads or fails and the loaded image replaces it

### Requirement: Automatic local resources

Ordinary Markdown SHALL load relative and absolute local image references without panel-authored actions or image renderers. Relative paths SHALL use sourcePath's directory when supplied, otherwise panel cwd. Existing file previews, annotations and image-viewer interactions SHALL be retained.

#### Scenario: Relative and absolute images

- **WHEN** Markdown contains readable relative and absolute image paths
- **THEN** both images display and open the existing image viewer

#### Scenario: Document-relative resource

- **WHEN** Markdown has sourcePath and a relative image or text link
- **THEN** that reference resolves relative to the document directory

#### Scenario: Annotated file preview

- **WHEN** a linked file is opened from annotated Markdown
- **THEN** its originating component reader supplies the retained text snapshot and annotations preserve their existing source identity

### Requirement: Remove specialized file route

The runtime SHALL no longer register POST /api/panels/:instanceId/file. Markdown reads SHALL use ordinary actions. Other runtime handlers and execution mechanisms SHALL remain unchanged.

#### Scenario: File route removed

- **WHEN** a request targets the old file route
- **THEN** no specialized file-reading handler executes
