---
name: ui-selection-feedback
description: Share opt-in selection and annotation capabilities through public SDK and UI modules
type: tech
---

# Shared selection and comments

Selection and annotations belong to optional public Paneon SDK/UI modules reusable by standard panels, scene examples, and custom TSX. The product skill supplies integration guidance and examples; custom authors should not need to copy an independent interaction implementation.

Share selection and draft state, object and registered plain-text selection, editable comments with their own targets, composable controls, and explicit submission. Authors retain layout control and supply semantic references and content-version adapters. Preserve normal buttons, links, form answers, and text copying. Do not inject a fixed header/sidebar or promise arbitrary DOM annotation. Reuse declared agent.emit events and CLI events/ack rather than adding a feedback protocol or database.

Use one annotations list for selected targets and their optional opinions. Each entry has a stable id, nonempty targets, and a string comment; an empty comment means selection without an opinion. Do not emit a separate selected list or move entries between two result structures when a comment is added or cleared.

Supplied standard panels allow correcting submitted answers or feedback in the same instance and explicitly resubmitting a complete result with replacesEventId, preserving history. This is a supplied-page policy, not a mandatory runtime or common-component protocol: custom authors retain control of their schemas, callbacks, controls, and post-submit behavior. New question rounds still use new instances.

The public SDK/UI primitives are implemented and accepted in the first batch of add-paneon-skill-panels; table, Markdown, Git and read-only GitHub PR adapters are implemented and accepted in skill resources. Explicitly registered link text participates in source ranges; native link clicks retain their normal behavior. Text selection excludes form controls and feedback controls separately from the object-click interactive-element filter. The document mouseup/keyup collector also ignores events originating in those controls: locating a saved range may leave native selection active, and an ordinary button or input event must not turn that range into another annotation. SDK exports must cover index.ts, client.ts and server.ts because the compiler redirects server-side paneon/sdk to the server entry. The controller accepts editAnnotation(null) to finish editing without deleting an entry. See design.md for contracts and verification.md for acceptance evidence.

**Why:** Common interaction behavior should be maintained once while custom panels keep their own semantics and layout.
**How to apply:** Build shared SDK/UI primitives and let panels opt in; document composition in the skill and verify a real custom TSX integration before declaring the capability delivered.

The user-facing term is 评论 / comment, while existing Feedback/annotations/targets/comment SDK and event identifiers remain unchanged. The agreed B44 interaction replaces the independent editor/list section with normal text selection → nearby Comment action → anchored temporary editor → Save to page draft. Numbered markers reopen editing; Cancel discards only the current edit and Delete removes that comment. The toolbar submission button is labeled 提交评论 and submits the panel’s complete feedback to the agent. Saving is separate from explicit toolbar submission; unsaved edits must be saved or cancelled before submission. Existing source registration and snapshots remain authoritative. This correction is implemented and accepted in comment-interaction.md and verification.md. Object selection is two-stage: gather targets, then open the editor through 评论. Pending objects or an unsaved editor block submission; plain text selection alone does not. Object multi-selection remains available through compact controls; text selection must not require first enabling a global mode. No voice or side-chat feature is in scope.

Compose one FeedbackSurface per provider with a page-owned FeedbackToolbar or FeedbackSubmitButton. The compact 评论 (N) menu uses stable session numbers and adapter locate to reopen comments from unmounted views; it is not a permanent side section. Read-only selectionTargets reflects pending/editor object selection in page-owned checkboxes. Optional synchronous adapter.targetRanges returns precise DOM Range geometry for semantic interval references without changing source coordinates, snapshot validation or event data. Standard table row/column and whole Markdown objects must register actual DOM targets; Git/PR interval geometry reuses the exact diff source mapping.
