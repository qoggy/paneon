## Context

The existing resolvePaths action returns absolute paths using the same panel cwd as readFile. The panel currently uses that result for search only, while fileTree splits raw strings and preserves their different roots.

## Goals / Non-Goals

**Goals:** Group files by their resolved directory, preserve common ancestors, and expand the asynchronously resolved tree initially.

**Non-Goals:** Filesystem scanning, symlink canonicalization, changing file identities, changing flat-mode labels, or changing file reads and annotations.

## Decisions

- Build the grouped tree from resolvePaths data. Keep it empty while resolution is pending instead of showing an incorrect temporary tree. Reuse the existing error display.
- Keep expansion undefined until a user changes it; derive default expansion from the resolved tree. This avoids a mount-time empty expansion state or an effect that resets the user's choices.
- Retain supplied paths for the path bar, flat mode, search, and file icons. Keep original fileIndex values, including duplicate paths.

## Risks / Trade-offs

- Absolute directory prefixes can be long → retain existing single-child directory compression and truncation.
- Path resolution is asynchronous → browser regression tests cover delayed resolution, initial expansion, and collapse/mode-switch behavior.
