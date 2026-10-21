---
name: tech-local-browser-access
description: Use regular local panel URLs with strict browser-origin checks instead of login or expiring links
type: tech
---

# Local browser access

Panel URLs are regular, reusable local links. Do not add one-time bootstrap credentials, login sessions, access cookies, token-exchange endpoints, or a URL expiry field. Run and inspect return the current runtime address; a restart or port change may require obtaining the current URL again.

Bind only to 127.0.0.1 and validate Host against the actual listening address. Browser operation APIs require an Origin matching the complete expected scheme, host, and port; reject foreign, null, empty, or missing Origin values. Do not infer trusted CLI identity from a missing Origin. CLI requests use a separate controlToken, which is never embedded in browser links.

Public page/static-resource GETs must not invoke author functions or perform state changes. For non-public browser GET APIs, check Origin when present and otherwise the full origin from Referer; reject an unverified source. Use a same-origin Referrer-Policy on the host. Do not expose API CORS to arbitrary sites.

Keep the iframe-to-host bridge and its source-window/channel/instance/revision checks. The sandbox's null origin is not an API exception: browser API calls come from the trusted host. Keep the existing memory-only business credential channel and its TTL; those secrets are unrelated to panel URL access.

**Why:** The user chose direct Origin/Host validation for browser cross-site requests and rejected an unnecessary login/expiring-link flow.
**How to apply:** Keep CLI output types, HTTP routes, runtime specifications, tests, and documentation consistent. Origin checks address browser requests, not arbitrary local programs impersonating headers.
