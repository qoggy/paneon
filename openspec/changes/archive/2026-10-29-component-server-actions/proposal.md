## Why

Packaged UI components cannot currently bring their own serverAction into the panel action registry. Markdown therefore cannot render ordinary local image references without panel-authored glue, while linked source previews depend on a separate runtime file route.

## What Changes

- Extend the existing action extraction and registration mechanism to packaged component libraries, using browser/Node outputs and a component-action manifest.
- Declare text reads in Markdown and image reads in the public Image component; ordinary Markdown reuses Image without panel-authored actions or renderers.
- Expose Image with src, alt, optional sourcePath and className; both remote and local image loading use Spinner.
- Share Image and Mermaid hover/focus controls. Image no longer shows a source tooltip; its more menu copies the original path/URL, copies the image, and downloads the original file through the existing browser bridge.
- Preserve cwd/sourcePath/absolute resolution, source previews, annotations and the existing image viewer.
- **BREAKING**: remove POST /api/panels/:instanceId/file and its unused SDK file-request entry. Do not change the runtime action executor or add runtime routes.

## Capabilities

### New Capabilities

- `component-server-actions`: Component-owned actions are split, discovered and registered through the existing mechanism.
- `markdown-local-resources`: Markdown automatically displays local images through Image's private action and previews linked text files through its own text action.

### Modified Capabilities

None. Existing panel action behavior remains unchanged.

## Impact

Action extraction, UI build configuration, package metadata, panel compilation, Markdown and internal preview/annotation reader plumbing. Runtime service changes are limited to deleting the old file route. No new public read APIs, UIProvider props or dependencies.
