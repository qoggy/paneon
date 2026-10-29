## 1. Generic component actions

- [x] 1.1 Extend source extraction for library entries without changing panel defaults.
- [x] 1.2 Build library browser proxies, Node action modules and versioned metadata.
- [x] 1.3 Discover retained component actions during panel compilation and track their build inputs.

## 2. Markdown resources

- [x] 2.1 Declare bounded text/image reads in the Markdown module and keep actions private.
- [x] 2.2 Connect local images and text previews, including page-level annotation readers.
- [x] 2.3 Remove the old SDK file request/injection and only the specialized runtime route.

## 3. Verification and documentation

- [x] 3.1 Verify ordinary actions, an independent packaged component, tree shaking and cache invalidation.
- [x] 3.2 Verify real-browser local image paths, sourcePath, image viewer and annotated text previews.
- [x] 3.3 Run relevant build/type/lint checks and record the changed files and validation results.

## 4. Public Image extraction

- [x] 4.1 Export Image with src, alt, sourcePath and className; reuse it from Markdown and share the existing preview behavior.
- [x] 4.2 Show Spinner until local or remote images load, preserving existing read rules and failure behavior.
- [x] 4.3 Verify Image and Markdown paths, loading, preview/custom-renderer behavior and update public documentation.

## 5. Shared image and diagram interactions

- [x] 5.1 Share the hover/focus expand and more toolbar between Image and Mermaid, remove image source tooltips, and add Copy path beside image copy/download actions.
- [x] 5.2 Extend the existing browser action bridge for ordinary image clipboard and original-byte downloads, with Spinner and toast feedback.
- [x] 5.3 Verify toolbar interactions, path copying, image copying/downloads, loading and existing viewer/Markdown behavior; update documentation and evidence.

## 6. Experience-page corrections

- [x] 6.1 Keep the shared toolbar outside Mermaid's scrolling content (the initial horizontal interpretation is superseded by task 7.1).
- [x] 6.2 Connect original-file download to the expanded Image viewer, reusing existing actions and feedback.
- [x] 6.3 Verify layout, original-byte viewer downloads and existing interactions; reload the current experience panel.

## 7. Screenshot-aligned toolbar placement

- [x] 7.1 Place the shared toolbar vertically outside the content on its right, with top alignment and no overlap.
- [x] 7.2 Verify Image and Mermaid geometry and existing interactions; reload the same experience panel and capture the corrected layout.
