---
name: cli-output-and-debugging
description: English CLI output avoids redundant input echoes while preserving useful results and optional diagnostics
type: tech
---

# CLI output and debugging

Paneon CLI-generated help, prompts, warnings, errors, and framework diagnostics use English. Preserve user-provided content, including Chinese strings, as-is. This does not prescribe a panel's UI language.

Command results should be moderately concise: primarily remove repeated input echoes, while retaining useful execution results, actual state, versions, diagnostics, and event consumption information. Keep readable field names and complete data models. `run` returns creation results rather than the full configuration; `inspect` returns full instance details, including stored inputs and resolved paths. Information queries such as `list` and `server status` retain their defined details.

The CLI offers an explicit global `--debug` flag, disabled by default. Necessary warnings and errors remain visible without debugging. Debugging must not change command results, exit codes, or application behavior.

**Why:** Agents need stable, concise command output, and developers need optional diagnostics.
**How to apply:** Keep debug diagnostics limited to framework metadata and protect credentials; do not promote panel business logs into framework debugging. The flag applies to the current invocation and must not silently configure ongoing background service logging.
