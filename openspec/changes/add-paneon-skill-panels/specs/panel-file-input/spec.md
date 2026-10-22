## ADDED Requirements

### Requirement: Read generic panel input from a JSON file

The panel run command SHALL accept --params-file <path> as an alternative to --params <json>. The caller SHALL provide exactly one of these options. Both standard skill panels and custom TSX panels SHALL use the same interface. The CLI SHALL resolve relative input file paths against its invoking directory, independently of --cwd, read UTF-8 JSON, and use the existing panel input schema validation for the parsed value.

#### Scenario: Run a supplied panel with a data file

- **WHEN** a caller supplies a readable JSON file with data matching the panel input schema
- **THEN** the panel receives the parsed JSON as its input using the existing instance creation behavior

#### Scenario: Run a custom panel with a data file

- **WHEN** a caller uses --params-file with a custom TSX source
- **THEN** the command supports it in the same way as a supplied standard panel

#### Scenario: Separate input path from action working directory

- **WHEN** the invoking directory differs from the supplied --cwd and --params-file is relative
- **THEN** the file path is resolved against the invoking directory and --cwd remains the panel function working directory

### Requirement: Reject invalid input sources before creating an instance

The CLI SHALL fail with a clear diagnostic and SHALL NOT create a panel instance if neither input option is supplied, both are supplied, or the file cannot be read or parsed as JSON. Parsed input SHALL still be rejected by the existing schema validation when it does not match the panel definition.

#### Scenario: Conflicting input options

- **WHEN** both --params and --params-file are supplied
- **THEN** the command rejects the conflicting sources without creating an instance

#### Scenario: Invalid file

- **WHEN** the supplied file is missing, unreadable, or contains invalid JSON
- **THEN** the command reports the failure without creating an instance

#### Scenario: Missing input source

- **WHEN** neither --params nor --params-file is supplied
- **THEN** the command reports the missing input source without creating an instance

### Requirement: File input is a creation-time snapshot

The CLI SHALL read the parameter file when creating the instance and persist the parsed JSON through the existing params storage. Changes to or deletion of the original parameter file SHALL NOT change an existing instance's input. Browser refresh, panel reload, and service restart SHALL continue using the saved input without rereading the original parameter file. Source watch options SHALL retain their existing source-update meaning and SHALL NOT enable parameter-file watching.

#### Scenario: Edit the file while a person is answering

- **WHEN** the parameter file changes after an instance has been created
- **THEN** the instance keeps its original question/configuration input and the file change does not reload or reset the active questionnaire

#### Scenario: Reload or restart after the file has been removed

- **WHEN** the original parameter file has been removed and an existing instance is reloaded or restored after service restart
- **THEN** the instance uses its persisted input without depending on that file

#### Scenario: Create a new instance with edited data

- **WHEN** the caller runs the panel again with the modified parameter file
- **THEN** the new instance receives the new JSON snapshot while the earlier instance keeps its previous input

### Requirement: File input obeys the transport size limit

File input SHALL use the same 262144-byte complete HTTP request limit as other panel creation requests. The CLI SHALL preflight UTF-8 size after JSON parsing and request serialization, including entryPath, cwd and other envelope fields, and SHALL report an English BODY_TOO_LARGE diagnostic before sending an oversized request. It SHALL NOT describe file input as unlimited or create a partial instance.

#### Scenario: Read an oversized parameter file

- **WHEN** valid JSON produces a creation request larger than the transport limit
- **THEN** the CLI rejects it with a size diagnostic and no instance is created
