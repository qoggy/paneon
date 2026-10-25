## ADDED Requirements

### Requirement: Preserve actionable build errors

Paneon SHALL preserve the original build error message and stage, plus file, one-based line and column and code frame when actually supplied by the tool. It MUST NOT invent source locations or replace specific errors with only a generic compilation message. Existing domain-specific diagnostic codes MUST remain intact.

#### Scenario: A dependency fails during bundling

- **WHEN** a real client or server build fails with a tool-supplied message and source location
- **THEN** the resulting BUILD_FAILED diagnostic contains that original reason, stage and available location and frame

#### Scenario: A failure has no source position

- **WHEN** the tool reports an error without a source position
- **THEN** the diagnostic retains its reason and stage without fabricated file or line values

### Requirement: Preserve bounded process failure details

The compiler SHALL preserve an abnormal exit code or signal and bounded stderr when no structured failure was returned. Diagnostic serialization MUST handle ordinary errors and cyclic causes without throwing, and MUST label truncated text. Cleanup failure MUST NOT replace the initiating build error.

#### Scenario: Compiler exits without failure IPC

- **WHEN** a compiler process exits abnormally without a structured error message
- **THEN** its diagnostic includes available exit information and at most 64KiB UTF-8 of stderr with truncation indicated when applicable

### Requirement: Reuse diagnostic transport and persistence

Paneon SHALL carry structured diagnostic fields through the existing IPC and panel diagnostic storage, and SHALL retain old-format readability. Successful builds SHALL clear the current failed-build diagnostic according to the existing runtime lifecycle.

#### Scenario: Read a stored failure after restart

- **WHEN** a failed build diagnostic is persisted and the store is reopened
- **THEN** its original reason and available details remain readable without a schema migration

### Requirement: Distinguish reading diagnostics from rebuilding

The inspect command SHALL return saved diagnostics without triggering compilation. A successful inspect SHALL return ok:true and exit zero even if the saved diagnostic reports BUILD_FAILED. Reload compilation failures SHALL exit nonzero. JSON command stdout SHALL remain one valid result envelope, while extra debug information SHALL go exclusively to stderr and SHALL NOT change result semantics.

#### Scenario: Inspect a previously failed build

- **WHEN** panel inspect --json successfully reads a panel whose diagnostic is BUILD_FAILED
- **THEN** stdout contains ok:true and the saved diagnostic in data, the exit code is zero, and no rebuild occurs

#### Scenario: Debug a failed reload

- **WHEN** panel reload --json fails with --debug enabled
- **THEN** stdout remains the same parseable failure envelope as without debug, while available stage, stack and process diagnostics are emitted only to stderr

### Requirement: Display useful build diagnostics in the panel host

The host SHALL show the original build reason and available source position, with an expandable bounded code frame. It MUST support old or position-less diagnostics and preserve the previous working panel behavior without forced reloads.

#### Scenario: View a failed update and then recover

- **WHEN** a source update fails with a location and code frame and is later corrected successfully
- **THEN** the failure view exposes that reason, position and expandable frame, the previous usable panel remains available during failure, and the current failure notice clears after successful compilation
