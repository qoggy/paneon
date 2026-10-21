---
name: cli-command-groups
description: Group all panel operations under panel and service management under server
type: tech
---

# CLI command groups

Paneon commands use explicit object groups:

- `paneon panel run/list/inspect/reload/close/events/ack`
- `paneon server status/stop`

Panel operations address a PanelInstance by instanceId; definitionId identifies the reusable PanelDefinition. Keep the paneon panel command group name.

`paneon panel list` is paginated: `--page` defaults to 1 and `--page-size` to 20 (maximum 1000). The API and browser list use the same database pagination; results include panels, page, pageSize, total and totalPages. Preserve ascending createdAt/instanceId ordering. The browser starts on page 1 with 20 instances per page.

All panel and interaction-event operations belong to panel, including run, list, events, and ack. Do not retain flat top-level operation aliases. Keep --help and --version at the root and provide help for both groups and each concrete command.

`paneon panel run` starts the local service when needed; grouping does not introduce a mandatory manual service-start step. Closing one panel and stopping the whole service remain distinct lifecycle operations, and both preserve interaction history.

`paneon panel inspect <instance-id>` returns the existing instance's regular browser URL on the current runtime. The link can be reused and has no access token or expiry. Run inspect again to obtain the current address after a runtime restart or port change. It must not create another instance, reload source, run business functions, or reopen a closed panel. Closed/unavailable instances retain their status; the link opens their status page. Browser access uses strict Host/origin checks, while CLI control requests use separate credentials.

Use `paneon panel events --wait-ms <ms>` for bounded event waiting. The option name explicitly states the unit; the default remains 0 and the accepted range is 0–60000 milliseconds (at most 60 seconds).

**Why:** There are already two operation objects. Explicit groups make command scope and help organization consistent, at the cost of one additional word for panel operations.
**How to apply:** Keep CLI registration, examples, error guidance, agent documentation, and checks consistent with the grouped paths. Preserve existing option semantics, including JSON output and explicit debug diagnostics on stderr.
