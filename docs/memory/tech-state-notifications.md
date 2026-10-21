---
name: tech-state-notifications
description: Use WebSocket for framework state notifications so panel tabs do not exhaust the HTTP connection pool
type: tech
---

# Framework state notifications

Use browser-native WebSocket and `@fastify/websocket` for panel state notifications. Do not allocate an HTTP/1.1 SSE connection per tab: six such connections can block further page, asset and action requests to the same origin.

Keep this channel read-only and limited to framework state. Actions and durable event consumption retain their existing HTTP protocols. Validate the exact Host and a required same-origin Origin before upgrading; neither Referer nor CLI control credentials substitute for the upgrade Origin. Host CSP permits only the actual local WebSocket endpoint in addition to same-origin HTTP.

Reconnect with bounded backoff and reread current state after connecting. Do not replay mutations. Release sockets, reconnect timers, heartbeat timers and subscriptions when pages or the service close. Runtime state listeners are shared across subscriptions rather than added once per tab.

**Why:** Multiple panel tabs are a normal usage scenario; status notifications must not prevent ordinary requests from reaching the service.
**How to apply:** Browser regression checks must open at least ten tabs in one shared browser context. Separate `browser.newPage()` contexts do not reproduce a per-context connection pool limit. Cover actions, source updates, reconnect without mutation replay, and connection cleanup.
