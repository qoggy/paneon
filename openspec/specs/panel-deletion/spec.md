# Panel Deletion Specification

## Purpose

Permanently delete panel instances through the CLI, API and management interface while preserving author files and notifying viewers and event readers.

## Requirements

### Requirement: Permanently delete an instance in any state

An explicit deletion SHALL stop a running, unavailable or closed instance using the existing resource-retirement lifecycle, clean its generated artifacts, and remove its panel row, events and consumer positions. Deletion SHALL NOT require a prior close or acknowledged feedback. It SHALL preserve author source, project files, unknown content and effects already performed outside Paneon. It SHALL NOT provide recovery. Close SHALL remain available with its existing history-preserving semantics.

#### Scenario: Delete with unacknowledged feedback

- **WHEN** a running instance with submitted unacknowledged events is explicitly deleted
- **THEN** its resources and instance data are removed and the events can no longer be read
- **AND** its author files and external effects remain

#### Scenario: Delete unavailable and closed instances

- **WHEN** a person deletes an unavailable or closed instance
- **THEN** deletion succeeds directly and the instance no longer appears in lists

#### Scenario: Delete while reloading

- **WHEN** deletion overlaps an active reload
- **THEN** compilation and execution retirement settle before deletion completes and no late publication restores the instance

#### Scenario: Delete during initial creation

- **WHEN** an instance is deleted before its initial compilation completes
- **THEN** cancellation cleanup SHALL NOT prevent deletion from succeeding and notifying waiting readers

#### Scenario: Retire the stored instance identity

- **WHEN** the existing store lookup resolves a deletion request to an instance
- **THEN** deletion SHALL use that stored instance identity consistently for resources, artifacts and notifications without changing ID allocation or lookup rules

### Requirement: Expose explicit deletion through CLI and API

The service SHALL expose `DELETE /api/panels/:instanceId` and the CLI SHALL expose `paneon panel delete <instance-id>`. Success SHALL return `{ deleted: true }`. An unknown instance SHALL use the existing PANEL_NOT_FOUND error. The CLI SHALL explain permanent deletion without adding a force flag or acknowledgement prerequisite.

#### Scenario: Delete through the CLI

- **WHEN** an agent explicitly invokes panel delete for an existing instance
- **THEN** the CLI removes that instance through the service and reports deletion
- **AND** inspect, actions, event reads and acknowledgements for that instance subsequently report PANEL_NOT_FOUND

### Requirement: Show separate close and delete controls

Management cards SHALL display Close and Delete directly. Delete SHALL be available for every instance status and SHALL open an existing shared confirmation dialog that identifies the instance and explains permanent deletion of the panel and its interaction history without exposing consumer positions. Cancel SHALL leave the instance unchanged. A successful deletion SHALL refresh the current status/page and use existing last-page correction. Pending operations and failures SHALL use the existing list conventions. These controls and messages SHALL support English and Chinese.

#### Scenario: Cancel permanent deletion

- **WHEN** a person selects Delete and cancels the confirmation
- **THEN** no deletion request is sent and the instance remains

#### Scenario: Delete the final card on a later filtered page

- **WHEN** confirmed deletion empties the current final page
- **THEN** the list shows the preceding available page with the same status filter and replaces its URL using existing pagination behavior

#### Scenario: Confirm with an unavailable service

- **WHEN** a loaded management page loses its service before the person first selects Delete
- **THEN** confirmation remains available without loading an additional code chunk and the management page remains visible

#### Scenario: Preserve focus and reconcile stale cards

- **WHEN** deletion is pending or fails
- **THEN** confirmation can restore focus to Delete while duplicate activation stays blocked
- **AND** if another client already deleted the instance, its stale card is removed through the current list refresh

### Requirement: Notify existing viewers and event readers

Deletion SHALL notify subscribed hosts and wake pending event reads. A deleted instance's host SHALL stop showing its former frame, display that the instance no longer exists, and stop reconnecting. Pending event reads SHALL return PANEL_NOT_FOUND without waiting for their normal timeout. Reading or acknowledging another instance SHALL remain unaffected.

#### Scenario: Delete an instance with a waiting reader and open page

- **WHEN** the instance is deleted while a page is subscribed and a consumer is waiting for events
- **THEN** the page switches to the missing-instance view and the waiting read reports PANEL_NOT_FOUND

#### Scenario: Open an old deleted link

- **WHEN** a person opens the URL of a deleted instance
- **THEN** the host displays that the instance no longer exists without continually reconnecting

#### Scenario: Delete while the host is disconnected

- **WHEN** an instance is deleted during a host disconnection and a later stream reconnect is rejected
- **THEN** the host rechecks the instance through the existing inspect API, removes its former frame and stops reconnecting
