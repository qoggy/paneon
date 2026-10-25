# Runtime Log Inspection Specification

## Purpose

Inspect retained framework logs independently with bounded output and truthful runtime logging status.

## Requirements

### Requirement: Truthful logging status

GET /health and paneon server status SHALL expose additive effective logging metadata: level, active/off/unavailable state, directory, current file when present and a safe error code when unavailable. CLI discovery SHALL validate the runtime identity before using current health metadata. Control tokens MUST NOT appear in log records or returned public status.

#### Scenario: Writer status changes after startup

- **WHEN** the writer becomes unavailable after the descriptor was created
- **THEN** server status reports the current unavailable state rather than the initial disk descriptor state

#### Scenario: Legacy service lacks logging fields

- **WHEN** a compatible service provides no logging metadata
- **THEN** the CLI truthfully reports that the information is not provided without inventing an active log file

### Requirement: Independent read-only inspection

Paneon server logs SHALL independently read local retained logs without starting, stopping, contacting or rebuilding the runtime. It SHALL support tail, follow, minimum level, optional instance/runtime context filters and JSON output. Filters SHALL combine with AND and MUST NOT require every record to contain instance context. The command MUST NOT accept arbitrary file paths.

#### Scenario: Service is stopped

- **WHEN** a developer reads retained logs after service exit
- **THEN** matching logs remain readable and the service stays stopped

#### Scenario: Directory is absent or inaccessible

- **WHEN** no log directory exists
- **THEN** the command succeeds with an empty result
- **AND** file access or permission failure instead produces a clear nonzero error without starting a service

### Requirement: Bounded readable output

Finite reads SHALL default to the newest 100 matching records, accept tail values from 1 to 10000 and cap output at 4 MiB with explicit truncation. Readers SHALL process bounded chunks, preserve the original order within a runtime group and provide deterministic group ordering. Human output SHALL show English level names, message, useful context and readable error stacks/causes. Finite JSON output SHALL use the existing success envelope with records/files/truncated/warnings; invocation diagnostics SHALL stay on stderr.

#### Scenario: Error log is inspected

- **WHEN** a retained error contains message, stack and cause
- **THEN** human output exposes the retained details readably and JSON preserves their structure

#### Scenario: Output limits are exceeded

- **WHEN** more matching records exist than the selected tail or output byte limit permits
- **THEN** the command returns a bounded newest subset and marks truncation rather than reading or buffering unbounded content

### Requirement: Follow across rotation and restart

Follow SHALL emit the initial bounded tail, then follow appended records across rotation and new runtime groups using open file positions without duplicate delivery caused by archive renaming. It SHALL handle stdout backpressure with bounded memory and warn when retention may remove unread records. Ctrl+C SHALL stop only the reader. Follow JSON SHALL use one envelope per record/warning with no extra finite-result wrapper.

#### Scenario: Runtime rotates or restarts while being followed

- **WHEN** a writer rotates a file or a new runtime starts
- **THEN** the reader drains existing handles, discovers new data and continues without itself starting a service or silently replaying renamed archives

#### Scenario: Slow stdout falls behind retention

- **WHEN** output backpressure persists beyond the retained window
- **THEN** the reader remains bounded and emits an explicit possible-gap warning

### Requirement: Framework log parsing

Readers SHALL process framework-produced records within the defined record/buffer bounds and never modify source files. A finite query SHALL warn and skip an incomplete trailing line left by interrupted writing; follow SHALL wait for that line to complete. An invalid middle record or unsupported schema SHALL produce an explicit error, without guessing, skipping arbitrary records or repairing files. Manually edited or replaced log files are outside the supported scenario.

#### Scenario: Crash leaves partial JSON at the end

- **WHEN** a terminated writer leaves an incomplete last line
- **THEN** finite inspection returns valid preceding records and a warning without repairing the file
