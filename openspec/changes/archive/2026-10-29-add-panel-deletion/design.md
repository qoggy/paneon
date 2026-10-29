## Context

Close marks an instance closed, cancels and retires its resources, and prunes generated output while preserving SQLite rows. Submitted events and consumer positions remain readable. The list already has status filtering and pagination, including concurrent uncommitted URL-state work which this change preserves.

## Goals / Non-Goals

**Goals:** Implement the four selected decisions: retain close, permit deletion in every existing state, delete permanently, and display both buttons directly. Cover CLI/API, open pages and waiting event readers as parts of the same lifecycle.

**Non-Goals:** Recovery, automatic deletion, batch operations, source deletion, external-effect rollback or acknowledgement-based eligibility rules.

## Decisions

- Share resource retirement and generated-output cleanup between close and delete, then remove events, consumers and the panel row in one SQLite transaction serialized after pending builds. Delete uses the identity returned by the existing store lookup for resource keys and notifications; ID allocation and lookup rules remain unchanged. Close alone publishes a closed-state snapshot, so cancellation cleanup of an initial creation cannot interrupt deletion before its final notification. No schema migration is needed.
- Publish a framework deletion notification after removal. Wake waiting event reads so they return the existing PANEL_NOT_FOUND result. Open hosts remove their frame, show that the instance no longer exists, and stop reconnecting. Missing-instance diagnostics must not recreate a deleted row.
- Add `DELETE /api/panels/:instanceId` and `paneon panel delete <instance-id>`, returning `{ deleted: true }`. The CLI performs the explicit command directly without a new force flag or interactive prerequisite; deleting an unknown instance uses the existing PANEL_NOT_FOUND behavior.
- Compose the existing AlertDialog and Button for browser confirmation, identifying the instance and explaining permanent deletion of the panel and its interaction history without exposing consumer positions. Cancel performs no mutation. Delete appears next to Close for all statuses; requests disable the same instance's mutation controls only while pending, using the list's existing pending-operation convention.
- Bundle the existing confirmation dialog with the management entry so showing confirmation needs no later chunk request. Management modules import their specific internal UI modules to stay below the unchanged 500 kB budget without unused lazy panel features. The public UI exports remain unchanged.
- Refresh the currently selected list after deletion, reusing existing filtering, page correction and URL replacement. Keep operation failures visible using the existing alert presentation, with no automatic mutation retries.
- If an instance was already removed by another client, reconcile the current list through its existing refresh rather than keep the stale card. Keep the pending Delete button focusable with aria-disabled and the same pending-operation restriction, so confirmation can restore keyboard focus even when the request fails.
- Recheck the existing inspect API on a state-stream close, including rejected reconnects. This lets the existing missing-instance branch stop reconnecting when deletion happened during disconnection.
- Preserve unknown content and author files through the existing artifact cleanup boundary. Cleanup failures retain existing logged behavior; no new cleanup fallback is introduced.

## Risks / Trade-offs

- Deletion can discard feedback that no agent has read. This is the selected permanent-delete behavior; browser confirmation explains it and CLI help explicitly states it.
- Builds, calls and event reads can overlap deletion. Marking closed before disposal blocks further publication; retirement and the build queue settle before the database transaction. Tests exercise reload cancellation and waiting reads.
- Removing records cannot undo effects already performed by a panel. Source files and external effects stay outside the deletion boundary.
- Database removal is permanent. Rollback of the code does not restore deleted data.

## Migration Plan

Deploy the additive CLI/API/UI changes together. Existing instances and close behavior need no migration. Rollback removes the new entry points but cannot restore explicitly deleted instances.

## Open Questions

None blocking implementation; the four product choices have been submitted and confirmed.
