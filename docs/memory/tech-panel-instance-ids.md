---
name: tech-panel-instance-ids
description: SQLite allocates panel instance IDs and public APIs expose decimal strings
type: tech
---

# Panel instance IDs

Panel instance IDs use SQLite `INTEGER PRIMARY KEY AUTOINCREMENT`. CLI commands, API responses, bridge identities and artifact directory names use the decimal string representation, such as `"123"`.

Allocate the ID by saving an initial instance record before asynchronous compilation. Failed initial creation removes that record; gaps in the sequence are expected. Deleting a committed instance does not make its ID available for reuse.

The user chose to discard old UUID instance data rather than migrate it. Schema 2 does not read schema 1. Resetting legacy instance data concerns the runtime database and generated panel artifacts; configuration, logs, library and author source are separate.
