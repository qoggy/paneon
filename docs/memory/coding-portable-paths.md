---
name: coding-portable-paths
description: Keep personal machine paths out of repository files and use portable path references
type: coding
---

# Portable paths

Keep real personal directory paths out of repository documentation, source code, tests, examples and acceptance evidence. This includes usernames, personal workspace locations, home directories and system-assigned per-user temporary directories. Inspect and sanitize logs, screenshots and other evidence before adding them to version control.

- Use repository-relative paths in file lists and commands that reference repository files. Make Markdown links relative to the containing document.
- Use portable notation such as `~` for home directories in documentation. In code, obtain home and temporary directories through `homedir()`, `tmpdir()` and path-joining APIs. Derive repository locations from existing module locations, working directories or configuration.
- When illustrating absolute paths or testing their resolution, use fictional paths such as `/workspace/project`. Keep the product's existing support for absolute paths at runtime.

**Why:** Real machine-specific paths expose personal environments and make references, commands and tests fail on other machines.
**How to apply:** Before writing or committing repository files, check new content for machine-specific paths. Replace repository references with relative paths, anonymize personal directories and obtain runtime paths through existing path APIs. Include copied logs, stack traces, file lists, acceptance reports and screenshots in this check.
