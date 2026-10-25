# Verification

Date: 2026-10-25 (Asia/Shanghai). Scope: suggestions 6–8 only. No commit or push.

## Final implementation

- UI output preserves modules, externalizes ordinary package imports and retains the existing library-stage compression of Mermaid/React Markdown/remark-gfm and their dependencies. All browser dependencies are still bundled locally per panel.
- Runtime shares one lazy Vite watcher. Local source/probe/env subscriptions update in place, are reference-counted across panels and close independently. Parent registrations survive child subscribers; later subscriptions reopen Chokidar's retired directory prefixes. No subscribers closes the server.
- Compiler snapshots publish local watch evidence on success and through private IPC on failure. Failed evidence is combined with the last successful graph and checked against the latest attempt, so persistent errors do not loop. A pending dirty flag and fingerprint reconciliation handle saves during compilation/subscription changes.
- Existing production env files participate in revision hashing; all four production env candidates are watched without Vite restarts. Unchanged automatic saves retain execution, credentials and browser drafts. Explicit reload still compiles.
- No business validation, action replay, package-manager watching, new dependency, database migration, client minification or shared browser chunks.

## Size comparison and selected trade-off

The all-external prototype reduced basic panel output by about 81%, but increased the Markdown+CodeBlock sample from 9,955,895 to 13,271,511 bytes. It was replaced before delivery.

The selected preserve-modules boundary produced these isolated samples:

| Client output        |                    Before |             Selected build |
| -------------------- | ------------------------: | -------------------------: |
| Basic Button         | 9,556,019 bytes, 91 files |   1,863,265 bytes, 3 files |
| Markdown + CodeBlock | 9,955,895 bytes, 91 files | 10,550,727 bytes, 93 files |

Basic output falls about 80.5%; the rich sample grows about 6%. The UI library itself has more module files. This trade-off avoids dead lazy output and the 33% rich-content increase of the first prototype without adding final-client minification. These samples are not startup or peak-memory measurements. Final Chrome's richer interactive fixture totals 10,495,588 client bytes and passes highlighting, Markdown and controls.

## Checks

| Check                                                    | Result                                                                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Final full npm test                                      | 242/242 passed, 0 failed/cancelled/skipped, 483.19 seconds                                                                               |
| New watching + UI output tests                           | 9/9 passed, 66.51 seconds                                                                                                                |
| Prior full run before final parent-retirement regression | 240/240 passed, no skips, 517.14 seconds                                                                                                 |
| Independently installed npm package                      | Passed full CLI/Chrome acceptance after npm pack and production-only install                                                             |
| Chrome source watching                                   | Passed controls/highlighting/Markdown, unchanged draft/worker, env add/delete/change, external dependency and failed-new-import recovery |
| Chrome Mermaid                                           | Passed standalone and nested Markdown diagrams, updates, errors/recovery, unique IDs, lifecycle, local assets                            |
| Chrome resource lifecycle                                | Passed cold restore, unchanged save, bounded residency/LRU and history                                                                   |
| Chrome credentials                                       | Passed sandbox, input, expiry/revoke, source-failure recovery, revision/close/restart boundaries                                         |
| Chrome production runtime                                | Passed independent panels, interactive Base UI, inherited action environment, invalid-source recovery and reload                         |
| Chrome artifact retention                                | Passed startup sweep, cold rendering/action, replacement, close, historical events and acknowledgement                                   |
| Full build                                               | Passed through npm prepack (CLI, UI, all typechecks, web); final standalone typecheck also passed                                        |
| Lint                                                     | 0 errors; 47 pre-existing warnings                                                                                                       |
| Changed-file formatting / diff check                     | Passed                                                                                                                                   |
| Whole-repository formatting                              | Four pre-existing failures listed below                                                                                                  |
| OpenSpec strict validation                               | Passed                                                                                                                                   |

Whole-repository formatting failures, untouched by this change:

- `docs/20261025/panel资源治理与serverAction边界-handoff.md`
- `openspec/changes/add-panel-resource-lifecycle/server-action-capabilities.md`
- `openspec/changes/refactor-git-review-stateless/verification.md`
- `src/ui/README.md`

An early browser attempt overlapped a full UI rebuild; emptyOutDir temporarily removed declarations. Root cause was test orchestration. Final build and browser acceptance were run sequentially, without weakening assertions. A separate real-event self-check reproduced Chokidar parent unwatch suppressing a remaining child subscription; the implementation and regression now cover parent retirement and later subtree reactivation.

## Runtime deployment

The existing runtime was stopped using the user's prior restart authorization to free port 49321 for the original test suite. Final runtime `runtime-2c2a86e1-3e6f-451c-a1b8-a4dbfa06f435` (PID 50729) started at 2026-10-25 21:41:17 Asia/Shanghai on 127.0.0.1:49321. Health and a current panel frame returned HTTP 200; the new log contained zero error/fatal records. Read-only SQLite comparison preserved all six panels' stable fields, historical events and consumer state (counts: 6 panels, 0 events, 1 consumer). Existing visible panels recompiled lazily; at the recorded check, artifacts decreased from 67,393,978 to 56,739,429 bytes. No eager migration or rewrite of every historical panel was introduced.

## Evidence

Logs: `/tmp/paneon-678-full-test-final.log`, `/tmp/paneon-678-targeted-final.log`, `/tmp/paneon-678-pack.log`, `/tmp/paneon-678-chrome-{source,mermaid,lifecycle,credentials,production,artifacts}.log`, `/tmp/paneon-678-lint-final.log`, `/tmp/paneon-678-format-full.log`, `/tmp/paneon-678-live-{before,after,health}.json`. Installed-package browser artifacts: `/var/folders/01/7961y03s2xbdldhx3v2vfcmr0000gp/T/paneon-evidence-5Ow1Nj`.

## Changed files

- `/Users/yuguo/IdeaProjects/paneon/vite.ui.config.ts`
- `/Users/yuguo/IdeaProjects/paneon/src/compiler/index.ts`
- `/Users/yuguo/IdeaProjects/paneon/src/compiler/source-snapshot.ts`
- `/Users/yuguo/IdeaProjects/paneon/src/compiler/build-inputs.ts`
- `/Users/yuguo/IdeaProjects/paneon/src/compiler/watch-inputs.ts`
- `/Users/yuguo/IdeaProjects/paneon/src/compiler/process.ts`
- `/Users/yuguo/IdeaProjects/paneon/src/compiler/worker.ts`
- `/Users/yuguo/IdeaProjects/paneon/src/shared/types.ts`
- `/Users/yuguo/IdeaProjects/paneon/src/runtime/source-watcher.ts`
- `/Users/yuguo/IdeaProjects/paneon/src/runtime/lifecycle.ts`
- `/Users/yuguo/IdeaProjects/paneon/tests/ui-tree-shaking.test.ts`
- `/Users/yuguo/IdeaProjects/paneon/tests/source-watching.test.ts`
- `/Users/yuguo/IdeaProjects/paneon/tests/browser/source-watching.mjs`
- `/Users/yuguo/IdeaProjects/paneon/docs/memory/tech-source-updates.md`
- `/Users/yuguo/IdeaProjects/paneon/docs/memory/tech-resource-residency.md`
- `/Users/yuguo/IdeaProjects/paneon/skills/paneon/references/cli.md`
- `/Users/yuguo/IdeaProjects/paneon/skills/paneon/references/authoring.md`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/reduce-bundles-and-fix-source-watching/.openspec.yaml`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/reduce-bundles-and-fix-source-watching/proposal.md`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/reduce-bundles-and-fix-source-watching/design.md`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/reduce-bundles-and-fix-source-watching/specs/lean-panel-bundles/spec.md`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/reduce-bundles-and-fix-source-watching/specs/precise-source-watching/spec.md`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/reduce-bundles-and-fix-source-watching/tasks.md`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/reduce-bundles-and-fix-source-watching/verification.md`
