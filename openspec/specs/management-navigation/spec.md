# Management Navigation Specification

## Purpose

Provide navigable Panels, Server and Settings management pages while preserving page state and explicit save behavior.

## Requirements

### Requirement: Navigate between management spaces

The management interface SHALL provide Panels, Server and Settings as top-level navigation at /, /server and /settings. Direct access, refresh and browser back/forward SHALL work. Navigating away and back SHALL preserve panel list pagination, loaded data and scroll without creating/closing panels or causing unrelated refreshes. Individual /panels/:instanceId pages SHALL remain outside management navigation.

#### Scenario: Return to a paginated panel list

- **WHEN** a person leaves the panel list for Settings or Server and returns through navigation or browser history
- **THEN** the list retains its page, loaded data and scroll position without creating or closing an instance

#### Scenario: Open a management URL or a panel directly

- **WHEN** a person opens or refreshes /settings, /server or /panels/:instanceId
- **THEN** the corresponding content loads and the individual panel page has no management navigation injected

### Requirement: Edit preferences on a dedicated settings page

Settings SHALL present appearance and language as ordinary page content rather than a modal. Changes SHALL save immediately using the shared preferences path, with accurate pending/success/failure feedback and protection against duplicate writes. The page SHALL NOT add a separate Save/Cancel step, preview-only copy, system-follow mode or additional preference scopes.

#### Scenario: Save from the settings page

- **WHEN** a person selects a new theme or language
- **THEN** the page uses the existing save/synchronization path and shows the actual save state without a separate confirmation step

### Requirement: Show actual service health without adding controls

The Server page SHALL read the existing health response and display actual runtime identity, status, version, PID, address and start time. A failed read SHALL show failure rather than stale or invented running status. The page SHALL NOT add background monitoring, fabricated metrics or stop/restart controls; it SHALL NOT claim to manage a stopped service from a page served by that service.

#### Scenario: Read service health or encounter a failure

- **WHEN** a person visits Server and its health request succeeds or fails
- **THEN** the page displays the returned health or an accurate error without background polling or service mutations
