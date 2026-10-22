## ADDED Requirements

### Requirement: Provide reusable selection and annotation SDK and UI

Paneon SHALL provide opt-in public SDK/UI capabilities for selection and annotations. Standard panels, scene examples, and custom TSX panels SHALL be able to reuse the same implementation. The product skill SHALL document integration rather than require custom authors to copy a separate implementation. The SDK SHALL export feedback types and feedbackSchema through both Node and browser entries. The UI SHALL export FeedbackProvider, FeedbackTarget, FeedbackText, FeedbackSurface, FeedbackSubmitButton, FeedbackToolbar, FeedbackControls, and useFeedback according to the finalized design contract. FeedbackControls SHALL compose the contextual surface and compact toolbar rather than an independent editor/list section.

#### Scenario: Integrate feedback in a custom panel

- **WHEN** an author marks selectable content and supplies a submission callback
- **THEN** the custom panel can reuse common selection state, annotation editing, and submission controls

### Requirement: Preserve normal interactions and author-controlled layout

The common UI SHALL allow registered text to be selected during normal browsing, presenting a contextual Comment action before creating a comment draft. Explicit object-selection controls MAY be composed for multi-object selection. It SHALL operate on registered content, preserve ordinary buttons, links, form input, and text copying, and SHALL NOT treat business actions or form answers as annotation submissions. Authors SHALL be able to place or compose controls without a mandatory fixed header or sidebar. Supporting original-element composition SHALL NOT introduce invalid table wrappers.

#### Scenario: Browse normally before selecting

- **WHEN** a person uses a registered panel in normal mode
- **THEN** ordinary controls retain their meaning and are not intercepted as feedback target selections

#### Scenario: Place controls in a custom layout

- **WHEN** an author places feedback controls below the content or composes a custom layout
- **THEN** the common state remains reusable without injecting a fixed host header or sidebar

### Requirement: Identify semantic objects and selected text

Submitted targets SHALL contain a JSON-serializable page-defined object reference and an optional common text range containing start, end, and quote. Whole-object targets SHALL omit the text range. Registered plain text SHALL support selecting a word or continuous fragment using original-string UTF-16 offsets and a quote consistent with that range. Page adapters SHALL define semantic identity, content association, validation, and navigation; arbitrary DOM positions SHALL NOT substitute for semantic targets.

#### Scenario: Select two objects together

- **WHEN** a person selects two registered nonadjacent objects and adds one annotation
- **THEN** that annotation retains both references as its own target set

#### Scenario: Select a word within plain text

- **WHEN** a person selects a word in registered plain text and adds an annotation
- **THEN** the target contains its object reference and the matching original-text range and quote

### Requirement: Keep independent editable annotation drafts

Common feedback SHALL use one annotations list for selected objects and their optional opinions, plus optional overall feedback. Every entry SHALL have a string comment; an empty comment SHALL represent selection without an opinion. A separate selected result list SHALL NOT be emitted. Adding, clearing, or editing a comment SHALL retain the same entry and identifier. A person SHALL be able to add, edit, and delete draft annotations before explicit submission. Each annotation SHALL retain a stable identifier and its own nonempty target set. Mode changes SHALL NOT clear drafts or send events. The common implementation SHALL NOT add disk-backed draft storage or promise draft survival after page reload.

#### Scenario: Annotate separate issues

- **WHEN** a person adds separate opinions at two locations and corrects one draft
- **THEN** each opinion retains its own targets and identity, and editing does not emit feedback

#### Scenario: Select without writing an opinion

- **WHEN** a person selects registered content and submits without writing a comment
- **THEN** the result contains an annotations entry with those targets and an empty comment, using the same structure as an entry with a written opinion

#### Scenario: Add or clear an opinion

- **WHEN** a person adds text to or clears an existing entry's comment
- **THEN** the entry keeps its identifier and targets without moving between separate result lists

### Requirement: Respect content identity and adapter boundaries

Adapters SHALL preserve target identity across presentation changes such as sorting and pagination. Dynamic-content integrations SHALL associate feedback with the content actually shown, retain drafts when content becomes stale, and SHALL NOT silently reinterpret text offsets against different content. Plain-text registration SHALL NOT be documented as automatically mapping arbitrary Markdown, diff, or virtualized DOM to source content. Specialized content SHALL use an appropriate adapter.

#### Scenario: Content changes after selecting text

- **WHEN** registered content changes such that an existing text target no longer matches
- **THEN** the integration marks the target stale and retains the draft rather than silently attaching it to the new text

#### Scenario: A selected target is no longer mounted

- **WHEN** sorting, filtering, or pagination unmounts the selected content
- **THEN** the draft remains and the page adapter validates and locates it against its original snapshot, without treating DOM unmounting as deletion

#### Scenario: Map formatted text to source

- **WHEN** an adapter registers text rendered from Markdown or a code diff
- **THEN** it provides explicit DOM-boundary-to-source mappings, preserves Unicode character boundaries, and validates the original-source quote rather than searching for the first matching text

### Requirement: Submit through existing declared events

The common controls SHALL deliver a feedback snapshot through an explicit page-provided submission callback. Pages SHALL declare an event schema and reuse agent.emit and the existing durable events/ack mechanism, without requiring a new protocol, database, or universal event name. Selection and draft editing SHALL NOT automatically emit events. Success SHALL be shown only after durable event submission completes; failed submission SHALL retain drafts. Existing page-specific answer and revision contracts SHALL remain authoritative.

#### Scenario: Submit and read feedback

- **WHEN** a person explicitly submits completed feedback through a page's declared event
- **THEN** the agent can read it through the existing CLI events command and acknowledge it through ack

#### Scenario: Submission fails

- **WHEN** the submission callback fails
- **THEN** the controls retain editable drafts and do not show a successful submission

### Requirement: Preserve custom post-submission policies

The common SDK and UI SHALL allow authors to supply their own submission callback, compose or replace controls, and choose post-submission state behavior. The provided standard panels' correction policy SHALL NOT become a mandatory runtime or common-component rule for every custom panel. Custom authors SHALL be able to implement read-only-after-submit behavior or another result/revision scheme using their own schemas and page logic.

#### Scenario: Choose a different custom workflow

- **WHEN** a custom author implements a panel that becomes read-only after its first successful submission
- **THEN** the common APIs allow that workflow without forcing standard-panel revision events or a mandatory edit-and-resubmit control

### Requirement: Align event transport capacity with payload validation

The HTTP request body limit SHALL be 262144 UTF-8 bytes while event payloads SHALL retain the existing JSON.stringify(payload).length limit of 65536 UTF-16 code units. Clients SHALL preflight the complete serialized request and the server SHALL enforce the limit independently. Oversized HTTP bodies SHALL return HTTP 413 with an English BODY_TOO_LARGE diagnostic, rather than a generic internal error. Neither text nor annotations SHALL be silently truncated or split into multiple submissions.

#### Scenario: Submit a long Chinese annotation

- **WHEN** an annotation payload is within the event limit and its complete HTTP request is within the byte limit
- **THEN** HTTP transport does not reject it solely because UTF-8 bytes exceed the previous 131072-byte limit

#### Scenario: Exceed a payload or transport limit

- **WHEN** a submission exceeds either applicable limit
- **THEN** the corresponding limit is reported accurately and the page retains the editable draft

### Requirement: Edit comments beside registered content

User-facing UI and guides SHALL call annotations comments, while existing annotations/targets/comment event fields SHALL remain unchanged. Selecting text SHALL show a nearby Comment action without creating a saved draft or emitting an event. Activating it SHALL open an anchored temporary editor. Save SHALL commit to page draft state only. Cancel or Escape SHALL discard the temporary edit, preserve an existing comment, and remove a cancelled new draft. Delete SHALL remove the selected comment and its markers. Each saved comment SHALL have a clickable session-stable UI number beside matching mounted targets; unmounting SHALL not delete the comment. No large independent selection-and-annotation section SHALL be required.

#### Scenario: Cancel editing an existing comment

- **WHEN** a person edits text through a comment's numbered marker and cancels
- **THEN** the previously saved comment remains unchanged and no event is emitted

#### Scenario: Cancel creating a comment

- **WHEN** a person selects text, opens the editor and cancels
- **THEN** no saved comment or numbered marker is added

#### Scenario: Revisit a commented target

- **WHEN** a target is unmounted by pagination or view navigation and later restored
- **THEN** its comment and matching numbered marker are restored against the same original source

### Requirement: Separate saving a comment from submitting feedback

Supplied pages SHALL place explicit submission in their own toolbar and compose the shared surface. Saving one comment SHALL not submit feedback. Pending unsaved edits SHALL block overall submission with a clear request to save or cancel, without discarding or implicitly saving them. Existing failure retention, submission locking, and page-specific complete corrections SHALL be preserved. Popovers and markers SHALL remain anchored during scrolling, resizing and reflow without modifying registered source text nodes or interfering with normal controls and copying.

#### Scenario: Submit while editing

- **WHEN** a person presses Submit to AI with an unsaved editor buffer
- **THEN** the page requests saving or cancelling that edit and emits no event

#### Scenario: Save and submit

- **WHEN** a person saves a comment and later explicitly submits feedback
- **THEN** only the final submission emits a complete feedback event
