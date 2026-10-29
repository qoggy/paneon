# Verification

## Delivered behavior

Panel authors use ordinary Markdown without reader actions, image imports, custom image renderers or registration code:

```tsx
<Markdown>
  {`![Relative image](./picture.png)

![Absolute image](/tmp/picture.png)`}
</Markdown>
```

Relative resources resolve from the action process's working directory, or the directory of `sourcePath` when supplied. Absolute resources use their given path. As with existing actions, Node's working directory resolves filesystem directory aliases (for example macOS `/var` to `/private/var`). Local images support PNG, JPEG, WebP, GIF, SVG and AVIF with a 20 MiB internal limit. Text previews retain their existing 1 MiB UTF-8 limit.

Markdown declares its private text action in its own module, and Image declares its private image action in the Image module. The generic component-library build emits browser proxies, Node handlers and a versioned action manifest. Panel compilation adds only retained actions to its existing action table. No new public SDK read API, UIProvider prop or runtime executor was introduced. The runtime server diff only removes the four-line registration of `POST /api/panels/:instanceId/file`.

## Validation evidence

- Independent packaged-component integration: ordinary panel actions and component actions execute together; browser output excludes Node handlers; changed Node output changes the revision; unused component actions are omitted.
- Vite development-server integration: a source edit refreshes the component's browser transform without exposing handler code.
- Local-resource Node integration: cwd, sourcePath and absolute paths; bounded reads; missing files, directories, unsupported formats, invalid references and binary text.
- Chrome `tests/browser/local-resources.mjs`: relative/absolute/encoded/document-relative images; sourcePath changes; image viewer; plain and annotated text previews; retained snapshots; no old `/file` requests or page errors.
- Chrome `tests/browser/markdown-images.mjs`: existing remote images, zoom/pan/fit/actual size, keyboard, close paths, focus return, links, custom renderers, annotations, themes and Mermaid viewer.
- Chrome `tests/browser/file-references.mjs`: path bases, Unicode, line ranges, focus return, resize, read errors, custom reader snapshots, exact file annotations, retained-source locate and edit/resubmit events.
- Targeted watcher, cache and runtime regression: 19/19 passed.
- OpenSpec strict validation passed.

Final checks:

| Check                                                 | Result                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm run build`                                       | Passed, including CLI, UI, type checking and web build                       |
| `npm run typecheck`                                   | Passed independently                                                         |
| `npm run lint`                                        | Passed: zero errors, 50 warnings                                             |
| Formatting of changed files / `git diff --check`      | Passed                                                                       |
| `openspec validate component-server-actions --strict` | Passed                                                                       |
| `npm pack --dry-run --ignore-scripts --json`          | Includes the browser manifest, Node action module and compiler support files |
| Final default `npm test` (concurrency 6)              | 340 tests: 331 passed, 5 failed, 4 cancelled                                 |
| Serial reproduction of all affected test files        | All 9 originally failed/cancelled cases passed                               |

The parallel failures were compilation/CLI deadlines and a source-watch deadline, with no failures in the new component-action or local-resource cases. During this run the host load averages were approximately 8 / 13 / 11; serial reproduction returned the LRU case from a 60-second compilation timeout to a passing 13-second run. Resource contention is a plausible explanation, not a proven root cause. The default full-suite result remains non-green; no runtime behavior or test deadlines were changed to hide it.

The serial group had one additional failure because the final build was mistakenly run at the same time: the UI build temporarily removed `dist/ui/index.js`. After the build finished, that exact test passed independently (1/1). The rest of the serial group passed (26/27), including all original parallel failures. This was a validation scheduling error, not a source fix.

Logs: `/tmp/paneon-component-full-tests-final.log`, `/tmp/paneon-component-timeout-reproduction.log`, `/tmp/paneon-component-compile-wait.log`, `/tmp/paneon-component-build-final.log`, `/tmp/paneon-component-lint-final.log`. Browser logs: `/tmp/paneon-local-resource-browser.log`, `/tmp/paneon-image-regression-browser.log`, `/tmp/paneon-file-reference-browser.log`.

## Scope and running services

Verification uses isolated runtime services, which are stopped by the tests. The already-running shared runtime was not restarted. Existing panels require a runtime restart/reload to use the rebuilt package. No release, commit or push was performed. Pre-existing changes in `src/ui/code-highlighting.ts` and `src/ui/diff.tsx` were left untouched.

## Independent audit follow-up

The user requested the `code-audit` skill with conduct's `run-kiro` workflow. Run `run-kiro-20261028-173002` completed successfully. The original, unmodified report is `/tmp/paneon-code-audit/kiro-report.md`, with the full result in `/tmp/paneon-code-audit/run-result.json`. Its pre-fix rating was B: 0 Critical, 1 Warning and 8 Info entries. The reviewer made no project edits or builds.

| Finding                                                                | Evaluation and action                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Warning 1: standalone UI treats a generated proxy as a connected panel | Reproduced with the built library: local links became interactive and both image URLs became loading indicators. Fixed using the existing panel input context as the presence marker, preserving `usePanelInput()`'s previous standalone `{}` default and accepting all JSON inputs, including null/false/0. No new SDK export or UIProvider prop.                                                                                                        |
| Info 1: legacy file protocol/host/runtime paths remain                 | Confirmed unused paths, intentionally retained. The authorized server scope only deletes the route; the current SDK no longer emits these requests. No speculative protocol/runtime cleanup.                                                                                                                                                                                                                                                              |
| Info 2: library extraction imposes source restrictions                 | Accepted the documentation improvement. Recorded top-level declaration, side-effect import and source-map limitations in `src/ui/README.md`. No current UI source was shown to lose required initialization.                                                                                                                                                                                                                                              |
| Info 3: Node globals become available to browser source type checking  | No change: mixed component/action modules require the Node types. Splitting handlers would change the approved authoring model; broader lint policy is outside this feature.                                                                                                                                                                                                                                                                              |
| Info 4: image/text read helper duplication                             | No refactor. Limits, MIME handling and return formats differ, while path parsing already shares `markdownLink`. No additional functional defect was demonstrated.                                                                                                                                                                                                                                                                                         |
| Info 5: large image copies, deduplication and cancellation             | Retain the accepted bounded 20 MiB/Data URL design. No cache, cancellation protocol or binary transport was added without measured need.                                                                                                                                                                                                                                                                                                                  |
| Info 6: unnamed nested package.json hides component metadata           | Reproduced by adding `dist/package.json` containing only `type: module` to the independent fixture: its component action disappeared. Fixed metadata lookup to continue through unnamed module scopes and stop at a named package boundary. The same integration test now passes, including calls, cache invalidation and unused-action exclusion. Invalid/missing package artifacts still fail compilation; optional diagnostic rewording was not added. |
| Info 7: missing-dist fallback may fail                                 | Not adopted. Existing type checking already needs built UI declarations; a missing build is not a supported normal invocation. No unproven fallback change.                                                                                                                                                                                                                                                                                               |
| Info 8: resource reads depend on the action worker and process.cwd     | This is an accepted consequence of using the existing serverAction mechanism. No runtime changes or special handling for actions that call process.chdir.                                                                                                                                                                                                                                                                                                 |

Audit verification:

- The new standalone regression initially failed 2/3 tests against the built library, then passed 3/3 after the context fix. The SSR harness selects the entity-decoder package's Node implementation because the distributed UI intentionally contains its DOM decoder; application and proxy code are unchanged.
- The nested-package integration initially failed because the component action was missing; it passes after lookup is corrected.
- Final focused suite: 43/43 passed across component actions, standalone Markdown, local resources, source previews, frontmatter, Mermaid, compiler exports, bridge identity and tree shaking.
- CLI/UI builds, type checking and lint passed. Lint remains at 0 errors / 50 warnings. The shared acceptance page showed loaded remote, relative-local and absolute-local images with the new compiled revision.
- Logs: `/tmp/paneon-code-audit/standalone-before.log`, `standalone-after.log`, `nested-package-before.log`, `regression-tests-final.log`, `build-cli-final.log`, `build-ui.log`, `typecheck.log`, `lint.log`, and `build-web.log` in the same directory. The default parallel full suite was not rerun; its earlier non-green result remains recorded above.

During review the earlier image-authoring paragraph in `skills/paneon/references/authoring.md` disappeared from the worktree. This audit did not restore or overwrite that file. The current changed-file list below excludes it and includes the new standalone regression instead.

Files changed during this audit follow-up:

```text
/Users/yuguo/IdeaProjects/paneon/src/sdk/client.ts
/Users/yuguo/IdeaProjects/paneon/src/ui/markdown.tsx
/Users/yuguo/IdeaProjects/paneon/src/compiler/component-actions.ts
/Users/yuguo/IdeaProjects/paneon/src/ui/README.md
/Users/yuguo/IdeaProjects/paneon/tests/component-actions.test.ts
/Users/yuguo/IdeaProjects/paneon/tests/markdown-standalone.test.ts
/Users/yuguo/IdeaProjects/paneon/tests/file-references.test.ts
/Users/yuguo/IdeaProjects/paneon/tests/markdown-frontmatter.test.ts
/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/verification.md
```

## Changed files

Paths below are relative to the repository root; generated `dist/` output is ignored by Git.

```text
docs/memory/MEMORY.md
docs/memory/architecture-file-access.md
package.json
src/compiler/action-transform.ts
src/compiler/build-inputs.ts
src/compiler/component-actions.ts
src/compiler/component-library.ts
src/compiler/index.ts
src/runtime/server.ts
src/sdk/client.ts
src/ui/README.md
src/ui/annotation-controls.tsx
src/ui/annotation-environment.ts
src/ui/annotation-root.tsx
src/ui/annotation-store.ts
src/ui/file-preview.tsx
src/ui/index.ts
src/ui/locales/en.ts
src/ui/locales/zh-CN.ts
src/ui/markdown.tsx
tests/browser/file-references.mjs
tests/browser/local-resources.mjs
tests/browser/markdown-image-fixture.mjs
tests/component-actions.test.ts
tests/file-references.test.ts
tests/markdown-frontmatter.test.ts
tests/markdown-resources.test.ts
tests/markdown-standalone.test.ts
tests/runtime-integration.test.ts
tsconfig.app.json
tsconfig.ui.json
vite.config.ts
vite.ui.config.ts
openspec/changes/component-server-actions/.openspec.yaml
openspec/changes/component-server-actions/proposal.md
openspec/changes/component-server-actions/design.md
openspec/changes/component-server-actions/specs/component-server-actions/spec.md
openspec/changes/component-server-actions/specs/markdown-local-resources/spec.md
openspec/changes/component-server-actions/tasks.md
openspec/changes/component-server-actions/verification.md
```

## Public Image extraction verification (2026-10-28)

- Exported `Image` with only `src`, `alt`, `sourcePath` and `className`. Markdown uses its internal native-attribute adapter. Both share the original image viewer behavior.
- Local image reads moved to Image's private component action; Markdown's private action now handles text only. No runtime source or endpoint changed during this extraction.
- Local and remote images show the existing Spinner through the browser load/error event, including the local file-read phase. Cached images are recognized on attachment. Failures stay inline.
- Focus boundary: no new read restrictions or validation policy. The bounded image reader is identical to the pre-extraction helper apart from whitespace; existing path rules, formats and size limit are retained.
- UI build, project typecheck and targeted lint passed (0 lint errors; 1 existing runtime-test non-null assertion warning).
- Focused Node suite: 31/31 passed across component actions, resource reads, standalone rendering, frontmatter, file references, Mermaid and runtime integration.
- Three browser suites passed: markdown-images, local-resources and file-references. Controlled delayed remote responses proved Spinner visibility before load and removal after load in both Image and Markdown; preview opened once. Path bases, source changes, local previews, keyboard/focus, links, custom renderers, annotations and Mermaid behavior also passed.
- Sandbox runs were interrupted/retried outside the sandbox because local test servers could not listen (`EPERM`). Successful results above come from the completed unrestricted test runs. The earlier historical default-parallel full-suite result was not rerun or reclassified.
- Logs: `/tmp/paneon-image-extraction/build-ui-final.log`, `typecheck-final.log`, `lint-final.log`, `node-final.log`, `browser-images.log`, `browser-resources.log` and `browser-files.log`.

Files changed in this extraction:

- [src/ui/image.tsx](/Users/yuguo/IdeaProjects/paneon/src/ui/image.tsx)
- [src/ui/image-preview.tsx](/Users/yuguo/IdeaProjects/paneon/src/ui/image-preview.tsx)
- [src/ui/markdown.tsx](/Users/yuguo/IdeaProjects/paneon/src/ui/markdown.tsx)
- [src/ui/index.ts](/Users/yuguo/IdeaProjects/paneon/src/ui/index.ts)
- [src/ui/locales/en.ts](/Users/yuguo/IdeaProjects/paneon/src/ui/locales/en.ts)
- [src/ui/locales/zh-CN.ts](/Users/yuguo/IdeaProjects/paneon/src/ui/locales/zh-CN.ts)
- [tests/markdown-resources.test.ts](/Users/yuguo/IdeaProjects/paneon/tests/markdown-resources.test.ts)
- [tests/markdown-standalone.test.ts](/Users/yuguo/IdeaProjects/paneon/tests/markdown-standalone.test.ts)
- [tests/runtime-integration.test.ts](/Users/yuguo/IdeaProjects/paneon/tests/runtime-integration.test.ts)
- [tests/browser/markdown-image-fixture.mjs](/Users/yuguo/IdeaProjects/paneon/tests/browser/markdown-image-fixture.mjs)
- [tests/browser/markdown-images.mjs](/Users/yuguo/IdeaProjects/paneon/tests/browser/markdown-images.mjs)
- [tests/browser/local-resources.mjs](/Users/yuguo/IdeaProjects/paneon/tests/browser/local-resources.mjs)
- [tests/browser/file-references.mjs](/Users/yuguo/IdeaProjects/paneon/tests/browser/file-references.mjs)
- [src/ui/README.md](/Users/yuguo/IdeaProjects/paneon/src/ui/README.md)
- [skills/paneon/references/authoring.md](/Users/yuguo/IdeaProjects/paneon/skills/paneon/references/authoring.md)
- [docs/memory/MEMORY.md](/Users/yuguo/IdeaProjects/paneon/docs/memory/MEMORY.md)
- [docs/memory/architecture-file-access.md](/Users/yuguo/IdeaProjects/paneon/docs/memory/architecture-file-access.md)
- [openspec/changes/component-server-actions/proposal.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/proposal.md)
- [openspec/changes/component-server-actions/design.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/design.md)
- [openspec/changes/component-server-actions/specs/markdown-local-resources/spec.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/specs/markdown-local-resources/spec.md)
- [openspec/changes/component-server-actions/tasks.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/tasks.md)
- [openspec/changes/component-server-actions/verification.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/verification.md)

## Public Image independent audit follow-up (2026-10-28)

The requested conduct workflow `run-kiro` completed as `run-kiro-20261028-194940`, using its unchanged `claude-opus-5.5` / high configuration. The Kiro node succeeded with no error. Its original report is `/tmp/paneon-image-audit/kiro-report.md`; the complete result with trace is `/tmp/paneon-image-audit/run-result.json`. Rating: A, 0 Critical, 0 Warning, 4 Info. Kiro performed static review and did not run browser reproductions. Project file hashes were unchanged throughout its review.

| Finding                                                                           | Evaluation and action                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Info 1: two stale action-owner descriptions                                       | Confirmed. Updated the proposal capability and delivered-behavior paragraph: Markdown owns text reads, Image owns image reads. Historical completed tasks remain unchanged.                                                                                 |
| Info 2: an image unmount also unmounts its viewer                                 | Not adopted as a fix. This is explicitly an unverified source-level inference about externally changing Markdown structure while a viewer is open. No demonstrated defect warrants extending this extraction to preserve a viewer across component removal. |
| Info 3: future clickable viewer images could reach the Markdown delegated handler | Not adopted. Current viewer targets and event handling already prevent a second viewer, as exercised by the browser suite. A conditional future UI change does not justify a new target exclusion or propagation policy now.                                |
| Info 4: hidden-mounted-image and single-viewer assertions can be explicit         | Accepted. The delayed-image cases now assert one mounted img with the hidden attribute; the ordinary Markdown preview also explicitly asserts one viewer.                                                                                                   |

Post-review verification: the complete `tests/browser/markdown-images.mjs` suite passed with the stronger assertions. Its log is `/tmp/paneon-image-audit/browser-images-after.log`. Targeted ESLint, formatting, OpenSpec strict validation and `git diff --check` passed. No implementation source or runtime behavior changed during this audit follow-up.

Files changed during this audit follow-up:

- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/proposal.md`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/verification.md`
- `/Users/yuguo/IdeaProjects/paneon/tests/browser/markdown-images.mjs`

## Image and Mermaid interaction unification (2026-10-28)

Final user decision: image content hover does not show a path. Its more menu offers Copy path, matching Mermaid's Copy code placement, followed by Copy image and Download original. Image and Mermaid use the same internal hover/focus toolbar; public Image props and panel authoring remain unchanged.

- Added an internal MediaToolbar using the existing Button, DropdownMenu, Tooltip and Spinner components. Clipboard/download completion and failures use the existing toast system.
- Retained image click/keyboard expansion, linked-image navigation, loading Spinner, the shared viewer, custom Markdown images and annotated file previews. Toolbar expansion restores focus to its trigger.
- Extended the existing authenticated browser action payload for ordinary image data alongside Mermaid SVGs. Original downloads decode Data URLs to bytes without re-encoding; clipboard copies use PNG pixels.
- Confirmed remote clipboard failure was caused by host img-src CSP. Remote copy/download now reads source bytes on demand through Image's existing serverAction, then passes a Data URL to the host. Display and expansion remain direct browser loads. No runtime endpoint, CSP, iframe permission, compiler rule, public prop or dependency was added.
- Focus boundary: the local reader and its existing MIME/20 MiB rules are unchanged. New bridge fields use the existing typed-payload validation pattern; HTTP failures are ordinary action errors. No remote size limit, allowlist, retry, cache or cookie-forwarding policy was added. Remote action reads require source access from the Node worker and buffer original bytes for the existing JSON/Data URL transport; browser-only login cookies are not forwarded.
- A real browser regression exposed focus restoration failing because visibility:hidden prevented focusing the toolbar trigger. Opacity and pointer-event hiding now preserve keyboard/final-focus access and reveal controls on focus.
- At this historical stage, the local small-SVG test targeted the media wrapper because its toolbar overlapped the image; the later screenshot-aligned layout removes that overlap. It also waits for each previous menu's closing animation before opening the next one; this avoids ambiguous test selectors during transitions without adding production retries or delays.

Validation:

- CLI, UI and web builds passed. Project typecheck and targeted ESLint passed.
- Focused Node suite: 16/16 passed (bridge identity/payloads, local/remote Image actions, standalone rendering, Mermaid and tree shaking).
- All three Chrome suites passed: markdown-images, local-resources and mermaid-viewer.
- Verified real clipboard text for original relative/absolute paths and HTTP/HTTPS URLs, PNG clipboard writes from a cross-origin source and local SVG, exact original-byte downloads for remote PNG and local SVG, busy Spinner, disabled busy actions, error/success toasts, focus return and unchanged sandbox/CSP behavior.
- The earlier historical default-parallel full-suite result remains recorded; the full suite was not rerun for this scoped change.
- Logs: `/tmp/paneon-image-toolbar/build-cli.log`, `build-ui-final.log`, `build-web-final.log`, `typecheck.log`, `lint.log`, `node-tests.log`, `browser-images.log`, `browser-resources.log` and `browser-mermaid.log`.

Files changed for this interaction update:

- [src/shared/browser-actions.ts](/Users/yuguo/IdeaProjects/paneon/src/shared/browser-actions.ts)
- [src/ui/browser-actions.ts](/Users/yuguo/IdeaProjects/paneon/src/ui/browser-actions.ts)
- [src/ui/image.tsx](/Users/yuguo/IdeaProjects/paneon/src/ui/image.tsx)
- [src/ui/image-preview.tsx](/Users/yuguo/IdeaProjects/paneon/src/ui/image-preview.tsx)
- [src/ui/media-toolbar.tsx](/Users/yuguo/IdeaProjects/paneon/src/ui/media-toolbar.tsx)
- [src/ui/mermaid.tsx](/Users/yuguo/IdeaProjects/paneon/src/ui/mermaid.tsx)
- [src/ui/locales/en.ts](/Users/yuguo/IdeaProjects/paneon/src/ui/locales/en.ts)
- [src/ui/locales/zh-CN.ts](/Users/yuguo/IdeaProjects/paneon/src/ui/locales/zh-CN.ts)
- [src/ui/README.md](/Users/yuguo/IdeaProjects/paneon/src/ui/README.md)
- [skills/paneon/references/authoring.md](/Users/yuguo/IdeaProjects/paneon/skills/paneon/references/authoring.md)
- [tests/ui-bridge.test.ts](/Users/yuguo/IdeaProjects/paneon/tests/ui-bridge.test.ts)
- [tests/markdown-resources.test.ts](/Users/yuguo/IdeaProjects/paneon/tests/markdown-resources.test.ts)
- [tests/browser/markdown-image-fixture.mjs](/Users/yuguo/IdeaProjects/paneon/tests/browser/markdown-image-fixture.mjs)
- [tests/browser/markdown-images.mjs](/Users/yuguo/IdeaProjects/paneon/tests/browser/markdown-images.mjs)
- [tests/browser/local-resources.mjs](/Users/yuguo/IdeaProjects/paneon/tests/browser/local-resources.mjs)
- [openspec/changes/component-server-actions/proposal.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/proposal.md)
- [openspec/changes/component-server-actions/design.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/design.md)
- [openspec/changes/component-server-actions/specs/markdown-local-resources/spec.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/specs/markdown-local-resources/spec.md)
- [openspec/changes/component-server-actions/tasks.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/tasks.md)
- [openspec/changes/component-server-actions/verification.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/verification.md)

## Experience-page corrections (2026-10-29)

The horizontal-overlay layout recorded in this section is superseded by the screenshot-aligned correction below.

Scope: only the three approved experience corrections. The shared Image/Mermaid toolbar is horizontal; Mermaid's toolbar sits outside its scrolling content; the expanded default Image/Markdown viewer reuses the existing original-file download action. Existing Spinner and toast feedback are reused. Mermaid keeps its PNG download. No new input validation, limits, runtime endpoints, CSP rules or public props were added.

Root cause and live evidence:

- Previously the 58px Mermaid content lived in an outer horizontal scroller, whose computed vertical overflow became auto. The vertical toolbar plus its top offset extended to 78px, producing a false vertical scrollbar.
- The content retains horizontal scrolling, while the outer container now has visible vertical overflow and the toolbar remains outside the content scroller. On the reloaded experience page, client height and scroll height both equal 58px.
- The shared toolbar changed from 38×70px to 70×38px, with both buttons on the same row.
- The Image viewer previously received no download callback. It now receives the existing original-file action and a Download original label; a pending download shows Spinner.

Validation:

- UI and web builds, project typecheck, targeted ESLint and formatting passed.
- Focused Node tests: 16/16 passed (bridge, resources, standalone Markdown, Mermaid and tree shaking).
- All three browser suites passed: markdown-images, local-resources and mermaid-viewer.
- Browser tests downloaded original PNG and SVG from expanded viewers and compared their bytes/text with the source files. Existing Mermaid PNG download and viewer interaction checks passed.
- The historical full-suite result above is unchanged; the full suite was not rerun for this focused correction.
- Logs and screenshots: `/tmp/paneon-image-layout-fix/` (`build-ui.log`, `build-web.log`, `typecheck.log`, `lint.log`, `node-tests.log`, `browser-images.log`, `browser-resources.log`, `browser-mermaid.log`, `toolbar-fixed.png`, `viewer-download-fixed.png`).

The existing experience panel was reloaded in place without restarting the shared runtime. Its URL is [the image/Mermaid experience page](http://127.0.0.1:49321/panels/instance-37631521-4b66-427a-ae16-aa86d6d681d7). Revision changed from `sha256:54fbfa38f85cefa4c1fb06a074468c06bae79687cbae35f58c708c1b38e03ecb` to `sha256:b94ddf2e35235af7528d22eb1bdae641a4d7b9aea8e74398c6eb5bf9676c1f13`. Live accessibility inspection confirmed the expanded viewer's Download original button.

Files changed for these corrections:

- [src/ui/media-toolbar.tsx](/Users/yuguo/IdeaProjects/paneon/src/ui/media-toolbar.tsx)
- [src/ui/mermaid.tsx](/Users/yuguo/IdeaProjects/paneon/src/ui/mermaid.tsx)
- [src/ui/image-viewer.tsx](/Users/yuguo/IdeaProjects/paneon/src/ui/image-viewer.tsx)
- [src/ui/image-preview.tsx](/Users/yuguo/IdeaProjects/paneon/src/ui/image-preview.tsx)
- [src/ui/image.tsx](/Users/yuguo/IdeaProjects/paneon/src/ui/image.tsx)
- [tests/browser/markdown-images.mjs](/Users/yuguo/IdeaProjects/paneon/tests/browser/markdown-images.mjs)
- [tests/browser/local-resources.mjs](/Users/yuguo/IdeaProjects/paneon/tests/browser/local-resources.mjs)
- [tests/browser/mermaid-viewer.mjs](/Users/yuguo/IdeaProjects/paneon/tests/browser/mermaid-viewer.mjs)
- [src/ui/README.md](/Users/yuguo/IdeaProjects/paneon/src/ui/README.md)
- [skills/paneon/references/authoring.md](/Users/yuguo/IdeaProjects/paneon/skills/paneon/references/authoring.md)
- [openspec/changes/component-server-actions/design.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/design.md)
- [openspec/changes/component-server-actions/specs/markdown-local-resources/spec.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/specs/markdown-local-resources/spec.md)
- [openspec/changes/component-server-actions/tasks.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/tasks.md)
- [openspec/changes/component-server-actions/verification.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/verification.md)

## Screenshot-aligned right toolbar (2026-10-29)

The user's annotated screenshot clarified that the controls belong vertically outside the image on its right. The earlier horizontal overlay was an incorrect interpretation and is superseded by this correction.

- Image and Mermaid use a normal-flow content row with an 8px gap and a non-shrinking vertical toolbar. Both are top-aligned, so controls do not cover content or overflow the parent to its right. Mermaid retains its separate inner horizontal scroller; short diagrams do not acquire a false vertical scrollbar.
- Existing hover/focus visibility, menu actions, viewer original downloads, Spinner and toast are unchanged. No new validation, limits, runtime changes or public props were added.
- Updated browser assertions check vertical button order, right-side non-overlap and top alignment for Image and Mermaid.
- UI/web builds, project typecheck, targeted ESLint and formatting passed. All three browser suites passed: markdown-images, local-resources and mermaid-viewer, including existing copy, download, loading, file preview and viewer behavior. The first sandboxed attempts could not listen on localhost (EPERM); the same tests passed outside the sandbox. No product fallback was added.
- The full Node suite was not rerun for this layout-only correction.
- Reloaded the same experience panel in place, from revision `sha256:b94ddf2e35235af7528d22eb1bdae641a4d7b9aea8e74398c6eb5bf9676c1f13` to `sha256:667b09b0fc88e49b2a48bef896af53f08f783fb03d750dee075ae8facd6b4c1a`. Live geometry: image 432×240px; toolbar 38×70px, flex-direction column, 8px right gap, 0px top difference.
- Logs, reload result and screenshot: `/tmp/paneon-image-right-toolbar/`, including `right-toolbar.png`.

Files changed for this correction:

- [src/ui/media-toolbar.tsx](/Users/yuguo/IdeaProjects/paneon/src/ui/media-toolbar.tsx)
- [src/ui/image.tsx](/Users/yuguo/IdeaProjects/paneon/src/ui/image.tsx)
- [src/ui/mermaid.tsx](/Users/yuguo/IdeaProjects/paneon/src/ui/mermaid.tsx)
- [tests/browser/markdown-images.mjs](/Users/yuguo/IdeaProjects/paneon/tests/browser/markdown-images.mjs)
- [tests/browser/mermaid-viewer.mjs](/Users/yuguo/IdeaProjects/paneon/tests/browser/mermaid-viewer.mjs)
- [src/ui/README.md](/Users/yuguo/IdeaProjects/paneon/src/ui/README.md)
- [skills/paneon/references/authoring.md](/Users/yuguo/IdeaProjects/paneon/skills/paneon/references/authoring.md)
- [openspec/changes/component-server-actions/design.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/design.md)
- [openspec/changes/component-server-actions/specs/markdown-local-resources/spec.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/specs/markdown-local-resources/spec.md)
- [openspec/changes/component-server-actions/tasks.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/tasks.md)
- [openspec/changes/component-server-actions/verification.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/verification.md)

## Right-toolbar independent audit follow-up (2026-10-29)

The requested conduct workflow `run-kiro` completed as `run-kiro-20261029-002422`, with unchanged Kiro configuration `claude-opus-5.5` / high, status completed and error null. The untouched original report is `/tmp/paneon-toolbar-kiro-audit/report.md`; the original result with trace is `run-result.json` in that directory. Kiro rated the reviewed version B: 0 Critical, 1 Warning and 6 Info. It performed static review only; all 14 scoped file hashes were unchanged during the independent review. This rating predates the parent agent's fix below and has not been independently reassigned.

Evaluation and actions:

- W1: confirmed by a browser regression. Start a clipboard operation, open the viewer while busy, finish the operation, then click the re-enabled Download original button. Before the fix, no download event arrived within the test's 5-second deadline (`repro-before.log`). The viewer retains the opening callback to preserve its selected source, but that callback captured a permanently true render-state busy value. The existing operation lock now uses a live ref shared across renders, while busy state continues to drive Spinner/disabled UI. This retains the selected image/source snapshot instead of replacing it with a callback for a subsequently changed source. No new input validation or policy was added.
- I1 (Mermaid measurement versus content-column width): not changed. The report identifies a possible effect on container-sized diagrams without a reproduced defect. It does not justify adding layout measurement logic in this focused fix.
- I2 (small inline images reserve toolbar space): retained as a direct consequence of the approved external, non-overlapping controls. Linked images still omit the toolbar. No unrequested size threshold or alternative small-image mode was added.
- I3 (long parse-error text overflow): not changed. This is an unverified edge-case concern; no demonstrated failure warrants expanding the correction to error-layout behavior.
- I4 (Spinner wording): clarified README wording to match the existing shared busy state, which covers every image action while the viewer is open.
- I5 (outer TooltipProvider): not changed. It is harmless optional cleanup, with no demonstrated functional issue or need to alter tooltip grouping.
- I6 (historical layout wording): explicitly marked the previous horizontal-overlay section as superseded and clarified the older small-SVG overlap description as historical.

Post-review validation:

- The new busy-open-viewer regression passes after the fix. It asserts disabled/Spinner while busy, re-enabled download afterward, a real download event and original PNG bytes. Existing focus, source-change and viewer checks remain in the same passing suite.
- All three browser suites passed: markdown-images, local-resources and mermaid-viewer.
- UI/web builds, project typecheck, targeted ESLint, formatting, strict OpenSpec validation and scoped git diff checks passed. The full test suite was not rerun.
- All logs are under `/tmp/paneon-toolbar-kiro-audit/`, including `build-ui-after.log`, `build-web-after.log`, `typecheck-after.log`, `lint-after.log`, `browser-images-after.log`, `browser-resources-after.log` and `browser-mermaid-after.log`.
- Reloaded the existing experience panel in place to revision `sha256:8e0e4220e373ae947aa921e7f7dbeb3d0f313542ed79732ea4d28c03049b1b9a`. Live inspection confirmed that revision; the screenshot is `experience-after.png` in the audit directory. No shared runtime restart, commit or push was performed.

Files changed during this audit follow-up:

- [src/ui/image.tsx](/Users/yuguo/IdeaProjects/paneon/src/ui/image.tsx)
- [tests/browser/markdown-images.mjs](/Users/yuguo/IdeaProjects/paneon/tests/browser/markdown-images.mjs)
- [src/ui/README.md](/Users/yuguo/IdeaProjects/paneon/src/ui/README.md)
- [openspec/changes/component-server-actions/verification.md](/Users/yuguo/IdeaProjects/paneon/openspec/changes/component-server-actions/verification.md)
