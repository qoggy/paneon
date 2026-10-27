# Generic Tree Specification

## Purpose

Provide a domain-independent tree component with explicit interaction, state, filtering and cancellable reveal contracts, reusable by Git and path comparison panels.

## Requirements

### Requirement: Accept domain-independent tree data

Paneon SHALL export `Tree<T>` with `getItemId`, `getItemLabel` and `getItemChildren` accessors. The public contract SHALL NOT require Git fields, path fields, proposal identities, versions or inheritance from a fixed node type. Accessors SHALL describe a finite, fully loaded tree with stable unique identities within the component instance. The tree SHALL preserve input order and original item objects. An undefined children value SHALL identify a leaf; an empty array SHALL identify an empty container.

#### Scenario: Use objects with unrelated field names

- **WHEN** a page supplies objects with `key`, `name` and `nodes` through accessors
- **THEN** the tree renders their hierarchy and delivers the original object to item callbacks without requiring `source`, `status` or `path`

#### Scenario: Distinguish an empty container from a leaf

- **WHEN** one item's children accessor returns an empty array and another returns undefined
- **THEN** render state identifies the former as a branch and the latter as a leaf without starting a lazy load

### Requirement: Separate presentation from interaction ownership

The tree SHALL own row buttons, expansion indicators and event handling. `renderItemContent` SHALL support display content only. Its state SHALL include selected, effective expanded, isBranch and a one-based level. A restricted presentation accessor SHALL support row classes, style, title, aria-description and data attributes without replacing event handlers, focus behavior or expansion semantics. The tree SHALL NOT interpret business status values to choose presentation.

#### Scenario: Preserve a Git row's presentation through adaptation

- **WHEN** a Git adapter supplies the existing status class, title, data-file attributes and content
- **THEN** these remain on the intended row while the shared tree continues to own selection and expansion handling

### Requirement: Support independently controlled selection and expansion

Selection and expansion SHALL independently support controlled props and initial uncontrolled defaults. Undefined SHALL select uncontrolled mode; selectedId null and expandedIds empty array SHALL be valid controlled values. Defaults SHALL be read only at initialization. Controlled operations SHALL request changes through callbacks without privately committing a replacement state. Expansion callbacks SHALL exclude search-only expansion and unchanged base expansion. Explicit user selection SHALL notify even when requesting the currently selected ID, preserving the Git adapter's handling of repeated selection without performing an action.

#### Scenario: Parent does not immediately accept expansion

- **WHEN** a controlled tree with no expanded nodes receives an expansion request
- **THEN** it requests the new base expanded IDs and does not render the requested expansion as committed until the parent returns it, except for an independently active search overlay

#### Scenario: Update items without reapplying defaults

- **WHEN** a mounted uncontrolled tree receives new item objects with the same identities
- **THEN** existing selection and expansion survive instead of being reset from default props

#### Scenario: Select the current file again during a read

- **WHEN** a user explicitly selects the currently selected leaf again
- **THEN** the selection callback receives that ID again so the Git adapter can cancel its pending read, without invoking the item action

### Requirement: Reveal items with observable completion and cancellation

`revealItem(id, { signal })` SHALL return `Promise<void>` and require an AbortSignal. It SHALL request missing ancestor expansion and resolve only after the target row is mounted, its ancestors are displayed and a non-smooth nearest scroll has been performed in layout processing. It SHALL NOT change selection, keyboard focus, search text or perform an item action. Missing and filtered items SHALL reject with stable TREE_ITEM_NOT_FOUND and TREE_ITEM_FILTERED codes respectively.

Controlled expansion SHALL wait for returned state rather than infer parent rejection from elapsed time. Signal cancellation, unmount, a newer reveal request or an intervening user expansion command SHALL cancel the old request with AbortError and release its waiting resources. A waiting request whose target is deleted or filtered SHALL reject with the corresponding code. The component SHALL NOT add an implicit timeout, retry or rollback of accepted expansion.

#### Scenario: Complete a controlled reveal after delayed acceptance

- **WHEN** reveal requests a deep item's ancestors and the parent accepts the expanded IDs in a later render
- **THEN** the promise remains pending until the row is rendered and scrolled, then resolves without selecting or activating it

#### Scenario: Cancel a request the parent has not accepted

- **WHEN** the parent keeps the old expanded IDs and the caller aborts the supplied signal
- **THEN** the promise rejects with AbortError and the component retains no listener or queued scroll for that request

#### Scenario: Locate the same item again

- **WHEN** a previously revealed item's ancestor is collapsed and the same ID is revealed again
- **THEN** the new call requests expansion and scrolls again without depending on a changed selection ID

#### Scenario: Stop an obsolete reveal

- **WHEN** another reveal supersedes a waiting call or its target is removed or filtered
- **THEN** the old call rejects with the defined cancellation or item error and never performs a later stale scroll

### Requirement: Filter with a temporary expansion overlay

A nonempty search term SHALL retain matching nodes and the ancestor paths needed to reach them. A matching container SHALL NOT automatically retain every descendant. Default matching SHALL use a case-insensitive label substring; a custom matcher SHALL receive the unmodified term. Filtering SHALL NOT rebuild or reorder supplied nodes. Matching paths SHALL temporarily expand without changing base expanded IDs or emitting expansion changes solely because search changed. Clearing search SHALL restore the base layout, including any separate explicit commands accepted during search.

#### Scenario: Search for a deep file in a folded directory

- **WHEN** a leaf matches but its ancestors do not
- **THEN** the leaf and its ancestor path are displayed, and clearing the term restores the earlier base expansion without a search-generated state change callback

#### Scenario: Search for a container label

- **WHEN** only a container's label matches
- **THEN** it and its ancestors remain while unrelated nonmatching descendants are excluded

#### Scenario: Reveal a filtered item

- **WHEN** an item exists in the complete data but not in the filtered result and revealItem is called
- **THEN** the call rejects with TREE_ITEM_FILTERED without changing search text or opening the item

### Requirement: Define global expansion behavior during search

`expandAll()` SHALL request base expansion of every container in the current complete data. `collapseAll()` SHALL request empty base expansion when search is empty. During nonempty search, collapseAll SHALL leave base expansion unchanged and SHALL NOT emit an expansion change callback. An explicit individual container click SHALL retain the existing request to update that container's base expansion, while the search overlay keeps required paths displayed. The Git adapter SHALL retain its disabled collapse-all control during search.

#### Scenario: Collapse all while search is active

- **WHEN** a caller invokes collapseAll during nonempty search
- **THEN** visible matching paths and base expanded IDs remain unchanged

#### Scenario: Explicitly expand all while search is active

- **WHEN** expandAll is accepted during search and the term is later cleared
- **THEN** the accepted full base expansion remains rather than reverting an independent command as if it were a search overlay

#### Scenario: Explicitly collapse one matching path during search

- **WHEN** a user clicks an effectively expanded ancestor during search and the base-state request is accepted
- **THEN** search keeps the path displayed, and clearing search reveals the base collapse explicitly requested by that click

### Requirement: Preserve distinct selection focus expansion and action

The component SHALL use the existing native-button interaction model. A leaf click SHALL request selection when selectable without activating it. Leaf Enter SHALL request selection when selectable and invoke onAction once; a leaf double-click SHALL invoke onAction once while preceding clicks retain normal click behavior. A container row or its indicator SHALL toggle expansion once per click or native keyboard activation, request selection only if explicitly selectable, and SHALL NOT invoke onAction. Container double-click SHALL retain native two-click behavior.

Space SHALL retain native button click behavior. Tab and Shift+Tab SHALL move focus without automatically changing selection. This change SHALL NOT add Arrow/Home/End navigation or claim the full APG treeview interaction model by adding tree/treeitem roles. Nonselectable items SHALL remain focusable; nonselectable leaves SHALL remain actionable and nonselectable containers expandable. Default selectability SHALL be leaves only.

#### Scenario: Select a file before opening its diff

- **WHEN** a user clicks a leaf then presses Enter
- **THEN** the click selects without opening, and Enter activates the original leaf object once without duplicate synthetic-click activation

#### Scenario: Operate a nonselectable container

- **WHEN** a user focuses a nonselectable container and activates its native button
- **THEN** it toggles expansion without selecting it or firing the leaf action

### Requirement: Define loading empty state and changing data

Loading SHALL express whole-tree busy state and SHALL NOT imply per-node loading or retain a private stale copy of items. An initially empty loading tree SHALL suppress emptyState; supplied existing items SHALL remain renderable during loading. When not loading and the visible result is empty, the caller-provided emptyState SHALL be rendered.

Controlled invalid IDs SHALL be ignored for display without rewriting props or emitting unsolicited corrections. Uncontrolled selection SHALL clear with one notification when its item is deleted or becomes nonselectable; deleted uncontrolled expansion identities SHALL be removed with notification only on change. Filtering SHALL NOT count as data deletion. If a focused row inside the tree disappears, focus SHALL recover to a visible ancestor, then a neighboring row, then the root when no rows remain; focus outside the tree SHALL NOT be stolen.

#### Scenario: Refresh a populated list

- **WHEN** loading becomes true while the parent continues passing the existing items
- **THEN** those items remain displayed with busy state and the tree does not show an initial empty message

#### Scenario: Delete an uncontrolled selected item

- **WHEN** a selected item is removed from complete data
- **THEN** uncontrolled selection clears once, while a controlled selected ID remains the parent's responsibility

#### Scenario: Filter away the focused row

- **WHEN** a search update hides the row currently holding focus inside the tree
- **THEN** focus recovers within the visible hierarchy without converting focus movement into selection or action

### Requirement: Adapt Git Review without changing its existing behavior

The Git adapter SHALL own working-area grouping, section containers, path construction and compression, sorting, flat mode, status presentation, exact old/new path search, toolbars, scope-specific state and annotation-to-item resolution. ChangedFileTree SHALL preserve its external contract. Git selection and action callbacks SHALL retain the complete original GitFile object. The shared core SHALL NOT import Git data types or enumerate Git-specific areas.

The integration SHALL preserve changes/history/compare layouts, wording, default grouping, status colors and tooltips, visible file counts, native mouse/keyboard flows, scroll behavior and repeated annotation location. Verification SHALL use real-browser before/after evidence at desktop and actual sidebar widths; type checking alone SHALL NOT count as compatibility proof. No Git read or annotation submission protocol SHALL change as part of this extraction.

#### Scenario: Represent one path in staged and unstaged areas

- **WHEN** the same repository-relative path has staged and unstaged entries
- **THEN** it remains two separately identifiable selectable files in the existing section order and actions return the correct GitFile

#### Scenario: Search a renamed file's old path

- **WHEN** the search term matches only the old path
- **THEN** the destination leaf and its existing compressed ancestor labels remain visible with correct filtered counts and the existing rename tooltip

#### Scenario: Locate an annotation after collapsing its section

- **WHEN** annotation navigation targets the current file in a collapsed working-area section, including repeated location to the same source
- **THEN** the Git adapter restores that section and directory path, reveals the correct row and retains the annotation's original displayed snapshot

### Requirement: Demonstrate non-Git reuse with a simple path adapter

The change SHALL include a built-in non-Git diff-review panel that builds directory nodes from flat file descriptors containing optional displayPath and nullable oldPath/newPath. At least one side SHALL be present. The adapter SHALL derive display hierarchy and stable internal identities without requiring agent-supplied node IDs, proposal IDs, versions or children. Distinct entries with identical display labels SHALL NOT overwrite one another. This panel SHALL demonstrate navigation and original-object callbacks, with page-owned UTF-8 file reads and a DiffView on the right. It SHALL NOT move filesystem reads into the shared tree. The panel entry SHALL be discoverable through the skill built-in table.

#### Scenario: Display a proposed prompt modification

- **WHEN** an entry has displayPath `prompts/analyze-session-worker.md` and original/proposed physical paths
- **THEN** the example shows the prompts directory and filename, and activation reads that entry's path pair and renders the actual text difference without Git-specific fields

#### Scenario: Keep entries with duplicate names

- **WHEN** separate entries share a basename or even the same displayPath
- **THEN** each entry retains its own identity and activation resolves the correct original descriptor

#### Scenario: Read absent or unreadable file sides

- **WHEN** an activated descriptor contains an explicit null side or a non-null path that cannot be read
- **THEN** null supplies empty text for an added/deleted file, while a read failure is displayed as an error rather than being treated as an absent side

#### Scenario: Switch files while reading

- **WHEN** a file read finishes after another entry has been activated
- **THEN** its late result does not replace the current entry's DiffView

#### Scenario: Operate the example file toolbar

- **WHEN** a user uses the view-diff, group-by-directory, expand-all or collapse-all icon action
- **THEN** the selected comparison opens, directory/flat mode preserves item identity, selection and the open diff, and expansion actions operate on directories with collapse-all disabled during search

#### Scenario: Distinguish file comparison states

- **WHEN** the page displays comparison entries
- **THEN** it uses file/folder icons, green A for an absent original, muted D for an absent proposal, blue M for successfully read differing texts, neutral = for equal texts and amber ! for read errors, with status descriptions available beyond color alone
- **AND** entries with both paths remain pending until read, physical path differences do not imply renames, grouping preserves known statuses, and no status input or Git field is required
