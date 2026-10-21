---
name: glossary-panel-definitions-and-instances
description: Distinguish reusable panel definitions from runtime panel instances
type: glossary
---

# Panel definitions and instances

Use PanelDefinition (面板定义) for the reusable definition authored in TSX, and PanelInstance (面板实例) for each runtime instance created by paneon panel run.

- definitionId identifies the definition. The author sets id in definePanel; external metadata exposes that value as definitionId.
- instanceId is generated for each run. One definitionId may correspond to multiple instanceId values. CLI operations, events, bridge requests, and credential bindings address the runtime instance using instanceId.
- runtimeId identifies the local service process, separately from panel instances.

Keep the paneon panel command group. Its positional identifier is documented as <instance-id>. The panels table stores runtime instances: panels.id maps to instanceId, definition_id stores definitionId, and event/consumer instance_id columns reference panels.id. This terminology does not add a definition registry, registration step, or instance deduplication.

**Why:** Definition and instance express the reusable-code versus running-instance distinction more clearly than the previous asset terminology.
**How to apply:** Keep SDK documentation, command arguments/results, manifests, storage definitions, and examples consistent. Preserve id inside definePanel; use definitionId when referring to that definition from an instance.
