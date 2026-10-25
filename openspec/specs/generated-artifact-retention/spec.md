# Generated Artifact Retention Specification

## Purpose

Retain current generated panel revisions and remove eligible leftovers without deleting source or durable interaction history.

## Requirements

### Requirement: Retain the published current revision

The runtime SHALL retain only the database-referenced current generated revision after a panel build settles. Cleanup SHALL be serialized with compilation and publication for that panel and SHALL preserve the current revision on build or initialization failure.

#### Scenario: Successful revision replacement

- **WHEN** a different revision is successfully published
- **THEN** its generated assets SHALL remain usable and older generated revisions SHALL be removed

#### Scenario: Build or execution initialization fails

- **WHEN** an initial run or a replacement fails before publication
- **THEN** unreferenced generated output SHALL be removed and any previously published current output SHALL remain

#### Scenario: Unchanged revision is explicitly rebuilt

- **WHEN** a forced reload rebuilds the current hash
- **THEN** cleanup SHALL retain that current directory

### Requirement: Close removes only generated output

After closing actual runtime resources the runtime SHALL remove a closed panel's generated output and invalidate cached manifests. It SHALL preserve panel rows, events, consumers, author source and unknown content.

#### Scenario: Close during active compilation

- **WHEN** close cancels an ongoing build
- **THEN** compiler and execution resources SHALL finish retirement before final output deletion and close SHALL not deadlock

#### Scenario: Read history after close

- **WHEN** generated assets have been deleted
- **THEN** events and acknowledgement SHALL remain usable and inspect SHALL return the stored closed panel without a manifest

### Requirement: Sweep generated leftovers after successful listen

The service SHALL initiate one asynchronous startup sweep after successful listen. It SHALL serialize each directory's decision with panel publication, re-read current database state, preserve running and unavailable current revisions, and wait for sweep completion before closing SQLite.

#### Scenario: Startup leftovers

- **WHEN** startup finds orphan, closed or temporary generated directories
- **THEN** it SHALL remove eligible leftovers without evaluating historical author modules or starting workers

#### Scenario: Another daemon cannot bind

- **WHEN** listen fails because the configured port is occupied
- **THEN** that failed daemon SHALL NOT sweep generated output

#### Scenario: Sweep overlaps a first run

- **WHEN** an unpublished run is still building
- **THEN** sweep SHALL wait for its queued publication or failure before deciding which output is unreferenced

### Requirement: Limit destructive operations to generated directories

Cleanup SHALL process only recognized generated directories, SHALL NOT follow symbolic links, and SHALL preserve unknown files and directory names. Filesystem failures SHALL be logged without replacing a successful publication or the original build error with a cleanup error.

#### Scenario: Unknown or linked content exists

- **WHEN** a panel root contains unknown files, unknown directories or symbolic links
- **THEN** cleanup SHALL leave them and their targets untouched

#### Scenario: Removal fails

- **WHEN** filesystem permissions prevent removal
- **THEN** the failure SHALL be observable in runtime logs and the original panel operation outcome SHALL be preserved

### Requirement: Worker exits when its controller disconnects

Execution and metadata workers SHALL abort their environment signal and exit after losing their IPC controller. A disconnected worker SHALL NOT attempt to send further IPC messages.

#### Scenario: Worker with retained async work disconnects

- **WHEN** IPC disconnects while author code keeps timers or asynchronous work alive
- **THEN** the worker SHALL abort and exit without waiting for the normal initialization deadline

#### Scenario: Compiler is killed while metadata is alive

- **WHEN** the compiler is terminated without running its exit handler
- **THEN** the metadata worker SHALL exit on IPC disconnect
