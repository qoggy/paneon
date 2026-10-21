---
name: architecture-responsibilities
description: Paneon provides human-agent interfaces without owning business backends or execution policies
type: tech
---

# Product responsibility boundary

Paneon is a CLI-first tool for creating human–agent interfaces with TypeScript and React. It provides default components, panel rendering and local function calls, explicit interaction events for agents, and a temporary secret-input channel.

A panel's calls to a CLI, HTTP/OpenAPI service, or local library are application code. Paneon does not require those systems to implement a Paneon protocol and does not own their scheduling, monitoring, logging, retries, business persistence, or external process management. The panel author chooses and implements those behaviors. Framework compilation, connection, and invocation diagnostics remain Paneon's responsibility.

**Why:** CLI deployment is one use case, not a product-level backend contract. Treating it as a core feature would couple the framework to application behavior.
**How to apply:** Keep SDKs and runtime storage generic. Do not introduce a CLI executor, business task system, or business log collection/persistence as core requirements. Examples may implement those behaviors in ordinary author-owned modules without promoting them to framework guarantees.
