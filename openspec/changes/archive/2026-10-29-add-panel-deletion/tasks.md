## Runtime and command

- [x] 1.1 Add transactional data removal after shared resource retirement and wake waiting event readers.
- [x] 1.2 Add deletion API/notifications and CLI command; document explicit close/delete usage for agents.

## Management and host

- [x] 2.1 Display both controls, compose permanent-deletion confirmation, localize copy and refresh filtered pagination.
- [x] 2.2 Handle deletion notifications and old links without stale content or reconnect loops.

## Verification

- [x] 3.1 Cover all states, unacknowledged feedback, source preservation, other instances, reload cancellation, CLI/API and waiting readers.
- [x] 3.2 Verify browser cancellation, confirmation/failure, page correction, open/old links and Chinese presentation.
- [x] 3.3 Run build, lint, formatting and relevant regression checks; review added conditions against the agreed scope.

## Verification results

- `npm test`: 373 passed, zero failures, cancellations or skips.
- Browser deletion, status filtering, management navigation and host lifecycle: all passed.
- CLI/UI/web builds and TypeScript checks passed; initial management JavaScript is 496.9 kB, below the unchanged 500 kB budget, with confirmation bundled and no dynamic chunk request.
- ESLint: zero errors and 55 existing warnings. Prettier, diff whitespace checks and strict OpenSpec validation passed.
- The existing compiler timeout fixture's recovery phase now uses its existing controlled clock, removing an unrelated 2-second cold-start assumption while retaining the actual timeout assertion and overall test deadline.
- Focus review: no status, acknowledgement, source-presence or force-flag prerequisites were added. Existing authentication and missing-instance lookup remain. Browser confirmation and pending controls implement the chosen permanent-deletion interaction; missing-instance and late-response handling prevent deleted content from reappearing.

## Independent audit follow-up

- Conduct run-kiro completed an independent review of the implementation and copy. Its three warnings and two actionable information items were addressed in the deletion path, reconnect behavior, dialog loading, keyboard focus and stale-list reconciliation.
- A supplementary reproduction found deletion during initial creation could fail before notification; shared retirement now avoids that closed-state publication dependency.
- Focused deletion, existing ID contracts, bundle and compiler tests passed (12 tests). Browser coverage now includes deletion while disconnected, service-stopped confirmation, pending/failure focus and stale cards.
- No ID allocation, schema, lookup policy, migration, or ID specification changes were made. No speculative assertOpen guard or unrelated ID presentation change was added.
