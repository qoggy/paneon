# Verification

## Standalone Image src follow-up

- Added optional string `src` to the SDK target type/schema and canonical target key. Standalone Image registration supplies the exact original src while preserving the author's ref. The viewer inherits the same descriptor. No path normalization, URL restriction, file check or extra I/O was added.
- Focused regression: **34/34 passed**, covering media, shared feedback, file annotations, annotation API, standalone Markdown/Image, Mermaid and Diff references. CLI/UI builds, full typecheck, scoped ESLint (zero errors/warnings), formatting, diff whitespace and strict OpenSpec validation passed. This follow-up did not rerun the earlier 409-test full suite.
- Real Chrome acceptance used isolated instance 65: all four media kinds saved; Image produced `{ref: 'image', src: './screen.svg'}`; expanding and editing kept four opinions and the same Image target. Markdown images retained their syntax quote; both Mermaid forms retained their previous source-free shapes. Explicit submission succeeded, and the stored event preserved Image src. Instance 65 was then closed.
- Updated the temporary experience page at instance 63. Read and backed up its four existing opinions from the visible JSON before reload, then restored their comments, original order and source ranges through the real annotation controls. Compared the restored JSON with the backup: only the independent Image target gained src. No repository example was added.
- The original Chrome iframe again stayed at about:blank after source watching while its src pointed to the new revision; the same revision loaded in the independent test tab. Reloading the original tab restored it. The cause is unconfirmed; this follow-up did not change hot-reload behavior.
- Evidence: `/tmp/paneon-media-experience-20261031/before-image-src.json`, `after-image-src.json`, `image-src-test-event.json`, and `image-src-data.png` in that same directory. The temporary page source is `panel.tsx` there.

## Desktop browser acceptance

Used the real compiled panel runtime with an isolated temporary home, then verified the shipped minimal example on the normal local service. Tested desktop layouts at the browser's actual widths, including a 563px side pane; no mobile claim.

| Area               | Observed result                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standalone Image   | Original object reference preserved; toolbar action, save, expand, edit and return retain one id/number.                                                         |
| Standalone Mermaid | Original reference plus `type: 'mermaid'`; no text, code or quote in the submitted target.                                                                       |
| Markdown image     | Document reference plus exact original image-syntax range and quote; viewer edits the same annotation.                                                           |
| Markdown Mermaid   | Document reference, `type: 'mermaid'`, complete fence range; no quote or code in draft or submission.                                                            |
| Repeated media     | Identical Mermaid-only blocks receive distinct ranges even with no text leaves.                                                                                  |
| Source mapping     | Emoji, CRLF, tilde fences, frontmatter, linked images and reference-style images locate their original occurrences.                                              |
| Linked image       | Link remains an anchor; annotation control is outside it, with no nested `a button`.                                                                             |
| Editor placement   | Autofocus; 8px gap below the clicked toolbar button in inline and viewer tests; controls remain visible. Marker opens the existing annotation beside the marker. |
| Viewer             | Same numbered annotation, clickable marker, retained draft, editor-first Escape behavior.                                                                        |
| Compatibility      | Unconfigured media has no annotation action; ordinary text and split Diff still annotate with exact quotes; directory locates and edits media.                   |
| Submission         | Six local saves emitted zero events; explicit submit emitted one event containing six opinions. No UI ids or Mermaid source in the example payload.              |

The browser exposed a 33px marker offset in the expanded dialog. Its translated dialog establishes the containing block for fixed descendants, while marker rectangles use viewport coordinates. The surface now removes that origin. Retest: image right/top `506 / 316.3125`, marker left/top `496 / 298.3125`, matching the existing marker placement formula.

Evidence saved locally:

- `/tmp/paneon-media-implementation/example.png`
- `/tmp/paneon-media-implementation/example-editor.png`
- `/tmp/paneon-media-implementation/markdown-mermaid-viewer.png`
- `/tmp/paneon-media-browser-event.json`

The isolated acceptance service was stopped after capture. The clean minimal example remains at `http://127.0.0.1:49321/panels/61`.

## Automated checks

- Final full `npm test`: **409/409 passed**, zero failures (312.49 seconds). Log: `/tmp/paneon-media-final-test.log`.
- `npm run typecheck`: passed across app, CLI, Node and examples.
- CLI/UI builds: passed as part of `npm test`; `npm run build:web` also passed.
- Prettier check over every changed supported file: passed.
- ESLint over changed TS/TSX: zero errors, nine non-null assertion warnings in existing file/Diff adapter paths, including assertions needed after making Mermaid quotes optional.
- `git diff --check`: passed.
- `openspec validate add-media-annotations --strict`: passed.

The initial sandboxed test run could not bind local listeners (`listen EPERM 127.0.0.1`); tests were rerun outside the sandbox. The first full run then passed 408/409 tests: the new acceptance fixture used a fixed version range instead of the repository's substitution token. Changed it to `__PANEON_TEST_VERSION__`; the fixture and new media tests passed 5/5 on immediate retest. No product workaround or relaxed assertion was introduced.

## Scope and validation audit

- New schema behavior implements only the approved optional Mermaid marker and quote-free range. Ordinary targets retain their required quote; existing JSON, integer, range and grapheme checks remain in place.
- Live object/modal filtering chooses geometry for the active presentation; it does not remove saved opinions or modify submitted targets.
- Existing editing guards, save/cancel/delete, source-change detection and explicit submission remain shared with text annotations. Diff keeps its highlight-before-stability-wait order.
- No automatic source files, source APIs, new hashes, disk drafts, automatic migration, retries or business rejection rules were added. The included SVG is an explicit example asset.
- Whole-media annotation only. Custom Markdown renderers own their integration. Cross-refresh recovery, mobile, region/node/edge annotations and release work are outside this change.
