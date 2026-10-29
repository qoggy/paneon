## Context

Panel actions already compile to browser proxies and a Node action table. Packaged UI modules do not participate in source extraction. Runtime changes are limited to removing the old file route; existing user edits to code highlighting and diff rendering remain untouched.

## Goals / Non-Goals

**Goals:** Generic packaged-component action support; component-owned Markdown reads; automatic relative/absolute images and linked text previews; existing panel actions and annotation snapshots retained.

**Non-Goals:** New runtime endpoints/executors, public read APIs, UIProvider props, file watching or new dependencies.

## Decisions

1. Generalize the existing extractor with configurable entry exports, stable action IDs and a library mode that permits existing UI dynamic imports. Panel defaults and IDs remain unchanged.
2. A reusable UI-build plugin extracts library actions before bundling, emits browser proxies and Node-only action entries, and writes a versioned manifest keyed by emitted browser module. Package metadata identifies that manifest. This keeps Node imports out of browsers without scanning already-minified code.
3. Panel compilation collects component modules retained in browser output, loads their manifests, merges ordinary action records and emits the existing action table. Artifact inputs participate in revision/cache validation. Runtime execution is unchanged.
4. Markdown declares its text action and Image declares its image action at module top level. Text reads reuse the existing bounded UTF-8 helper; image reads retain the initial internal 20 MiB limit and return Data URLs. Expected failures are structured results, so action exception wrapping does not erase file error codes. The limit is an implementation default, not a new setting.
5. Markdown supplies readers within its own subtree. Page-level annotation previews carry the originating reader with their internal open request; callback functions never enter events or serialized targets.
6. Explicit Markdown barrel exports keep component actions private. Remove the old generated file-reader injection and SDK file request; delete only the runtime file-route registration, leaving other runtime code unchanged.
7. Image exports only src, alt, optional sourcePath and className. Markdown's default image adapter uses the same implementation. Image and Markdown's delegated custom-image preview share the existing viewer hook, preserving linked images, custom renderers and focus return. Loading uses Spinner through both local reads and the browser load event, including remote URLs and cached images. This extraction adds no read validation or runtime changes.
8. Image and Mermaid share an internal hover/focus toolbar. Image's menu copies its original src as text, copies pixels through the existing clipboard bridge, and downloads original bytes rather than re-encoding the download. Source tooltips are removed. Ordinary image data URLs extend the existing browser action payload alongside Mermaid SVG payloads; runtime routes, CSP, panel props and iframe permissions stay unchanged. For remote copy/download, Image's existing action fetches original bytes on demand and returns a Data URL; display and expansion remain direct browser loads. This avoids host CSP and iframe connect-src restrictions without new runtime routes. The host decodes Data URLs directly for original downloads. Clipboard and network failures use toast. Existing local read limits are unchanged; no new remote size policy or authentication forwarding is added.

9. The shared toolbar is a vertical column to the right of Image and Mermaid content, aligned with its top. It occupies normal layout space with an 8px gap, so it neither overlaps content nor escapes its container. It stays outside Mermaid's inner scrolling content. The outer Mermaid host does not become a scroll container for its controls. Image's expanded viewer reuses the original-file download action and captures its selected image URL at opening; Mermaid keeps its existing PNG download label and behavior. This correction adds no input validation, runtime changes or public props.

## Risks / Trade-offs

- Base64 increases payload/memory use → bound image reads and avoid duplicate viewer reads.
- Library and panel action IDs could collide → use package/version/module/declaration IDs and reject conflicting metadata.
- Library actions could prevent tree shaking → mark generated proxies pure and discover only retained component modules; verify basic bundles exclude Markdown actions and rich code.
- Annotation overlays sit outside Markdown → retain the original reader with each file view and preserve source snapshots.

## Migration Plan

Build CLI, then split/build UI and web; verify compiler and browser regressions before delivery. No release or service restart is included. Existing runtimes need restarting before they can use the rebuilt compiler; verification uses isolated runtimes.
