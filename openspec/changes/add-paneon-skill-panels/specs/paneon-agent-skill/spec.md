## ADDED Requirements

### Requirement: Standard panels and scene examples belong to the product skill

Paneon SHALL distribute standard panel sources and reusable scene examples as resources of its user-facing skill. Agents SHALL be able to run a standard panel with the ordinary panel run source entry and supplied input, without rewriting its TSX. Panel-specific input and result guidance SHALL be discoverable from the skill without requiring every example to be loaded into context.

Agent-facing usage instructions SHALL be maintained only within the product skill. SKILL.md SHALL provide the entry and load detailed CLI, API, authoring and feedback references on demand. Paneon SHALL NOT maintain a parallel standalone agent guide outside the skill. The human-facing README MAY link to the skill.

#### Scenario: Read detailed usage instructions

- **WHEN** an agent needs CLI or custom-panel authoring instructions
- **THEN** the skill directs it to references inside the complete skill directory without depending on a separate docs/agent-guide.md

#### Scenario: Reuse a supplied choice page

- **WHEN** an agent needs a standard choice interaction
- **THEN** the skill provides the page source and its input/result contract so the agent can prepare data and use the ordinary CLI entry

### Requirement: Supply an interactive data table as a standard panel

The product skill SHALL include a ready-to-run interactive data table panel. The caller SHALL be able to supply task-specific table data without rewriting the panel's TSX. The panel SHALL keep supplied cell data read-only and support selecting rows, columns, and individual cells for feedback. Results SHALL distinguish selection kinds and identify rows by their original zero-based index in the instance's input rows snapshot, columns by column key, and cells by both rather than visible positions. The input SHALL NOT require a rowKey option or a caller-supplied id field. Sorting, filtering, and pagination SHALL preserve that original index. The panel SHALL reuse the common feedback capabilities, allow mixed row, column, cell, and cell-text targets within one submission, and support multiple independent annotations. All selected targets SHALL use annotations entries, with an empty annotation representing selection without a written opinion rather than a separate selected list. Exact validation and location contracts SHALL be finalized in the design before implementation.

#### Scenario: Present data without authoring a table page

- **WHEN** an agent supplies data matching the standard table's input contract
- **THEN** the supplied panel can present that data and collect the supported selection/feedback without requiring a new TSX implementation

#### Scenario: Supply records without business identifiers

- **WHEN** the caller supplies valid rows without id fields
- **THEN** the panel can display them and locate feedback by their original zero-based indices without requiring rowKey

#### Scenario: Distinguish identical rows

- **WHEN** two input records have identical field values and the person selects one
- **THEN** the result identifies the selected record by its original rowIndex rather than merging the records

#### Scenario: Select a column

- **WHEN** a person selects a column and submits feedback
- **THEN** the result identifies it as a column selection using its column key rather than returning a row identifier

#### Scenario: Select a cell after sorting

- **WHEN** a person sorts the data and selects an individual cell
- **THEN** the selection identifies the original rowIndex and column key without using the sorted display position or modifying the cell value

#### Scenario: Submit mixed targets and independent annotations

- **WHEN** a person selects a column, adds a comparison annotation to two cells, and annotates a word in another cell
- **THEN** one explicit submission can contain those different target kinds and their independently associated opinions

### Requirement: Release skill resources with the CLI version

Paneon SHALL maintain one canonical product skill source and include the matching skill resources in its CLI package release. The skill resources SHALL follow the CLI release version rather than an independent release sequence. The CLI SHALL be the installation entry and SHALL provide installation of its matching bundled skill into an agent-discoverable location. Users SHALL NOT be required to independently locate and install another skill package. Merely installing the CLI package SHALL NOT be claimed to make the skill discoverable before the skill installation step is completed. Supplied panels SHALL retain requires.paneon compatibility declarations and validation.

#### Scenario: Install a packaged CLI release

- **WHEN** a caller installs a Paneon CLI package release
- **THEN** its matching product skill instructions, references, and assets are available in that package for installation through the CLI

#### Scenario: Use one installation entry

- **WHEN** a user completes skill installation through the CLI entry
- **THEN** the matching skill instructions, references and assets are installed without requiring the user to locate and copy a separate skill distribution

#### Scenario: Existing installed skill copy

- **WHEN** an agent already has a copy of skill resources from an earlier release
- **THEN** a CLI upgrade does not imply that copy has been updated, and panel compatibility remains governed by requires.paneon

### Requirement: Collect form fields on one page and submit together

The standard form panel SHALL present all supplied fields on the same page and submit the complete form through one explicit submission. It SHALL NOT require navigating through field groups as separate steps. Editing fields SHALL remain page-local and SHALL NOT emit partially submitted form values.

#### Scenario: Fill and revise related parameters

- **WHEN** a person fills in the supplied form
- **THEN** all fields are available on the same page for review and modification before submission

#### Scenario: Submit the complete form

- **WHEN** the person explicitly submits the form
- **THEN** the panel submits the complete result together rather than emitting individual field answers

### Requirement: Supply standard form fields and validate explicit submission

The standard form panel SHALL support text, textarea, number, select, radio, multiselect, checkbox, and switch fields using the default shadcn styling. Each field SHALL have a unique name and label and MAY supply a description, required flag, and type-appropriate default value. Choice fields SHALL declare their options. The panel SHALL validate its input configuration and validate required values, types, and declared bounds on explicit submission. Boolean false SHALL remain a valid value rather than meaning a required field is missing.

The panel SHALL emit form-submitted with a values object keyed by field name, without repeating field definitions or option lists. It SHALL show submission success only after the event is saved. Validation or save failures SHALL preserve entered values and SHALL NOT be shown as successful submission. The standard form SHALL collect information without executing business operations itself.

#### Scenario: Fill a supplied standard form

- **WHEN** an agent supplies valid fields with descriptions, requirements, options, and defaults
- **THEN** the standard panel renders the corresponding controls on one page without requiring the agent to write TSX

#### Scenario: Correct an invalid submission

- **WHEN** a person submits a form with missing required text or an out-of-range number
- **THEN** the panel shows errors next to the corresponding fields, locates the first error, preserves all entered values, and does not emit a form-submitted event

#### Scenario: Save complete values

- **WHEN** a person explicitly submits valid values and event storage succeeds
- **THEN** the panel confirms submission and the agent can read the form-submitted values through the existing event mechanism

#### Scenario: Preserve values after a save failure

- **WHEN** saving a submitted form event fails
- **THEN** the panel retains the entered values and allows another explicit submission without claiming success

### Requirement: Review a complete Markdown document with precise feedback

The skill SHALL provide a content-review panel accepting title and a complete markdown string without requiring callers to split the document into sections or assign paragraph identifiers. The panel SHALL render that document using the existing Markdown presentation and allow feedback on the whole document, body paragraphs, and selected body words or phrases. It SHALL preserve ordinary reading and text copying and allow editing or deleting feedback drafts before explicit submission.

The panel SHALL use the common annotations structure, including empty annotations for selection without an opinion, and SHALL emit review-submitted only on explicit submission. Whole-document targets SHALL use a document reference without a text range. Paragraph and phrase targets SHALL retain source Markdown UTF-16 offsets and an exact quote matching the saved input substring. A Markdown-specific adapter SHALL map rendered selections to their original source ranges rather than treating display offsets as source offsets. A discontiguous source mapping SHALL use multiple targets in the same entry without silently dropping selected content. This requirement SHALL NOT imply selecting arbitrary internal coordinates of rendered diagrams.

The instance SHALL retain its original input while being reviewed. Results SHALL NOT duplicate the complete Markdown. Event-saving failures SHALL preserve feedback drafts and SHALL NOT be shown as successful submissions. The page SHALL collect opinions while leaving edits to the document itself to the agent.

#### Scenario: Open a document without splitting it

- **WHEN** an agent supplies a title and complete Markdown document
- **THEN** the panel can display it for review without requiring sections or paragraph identifiers

#### Scenario: Annotate a body phrase

- **WHEN** a person selects a phrase in the rendered body and writes an opinion
- **THEN** the feedback identifies the corresponding original Markdown range and exact quote rather than an unrelated DOM character offset

#### Scenario: Select across Markdown formatting

- **WHEN** a selected body phrase crosses inline formatting markers
- **THEN** the adapter retains the appropriate source range or ranges and can associate the feedback with the original rendered selection

#### Scenario: Submit several opinions together

- **WHEN** a person adds or revises several annotations and explicitly submits
- **THEN** one review-submitted event contains the current annotations and optional overall opinion, and editing alone does not emit feedback

### Requirement: Keep the GitHub PR example read-only and deliver opinions to the agent

The skill SHALL include a real gh CLI scene example for reading pull request lists, descriptions, file changes, and check status. It SHALL accept an explicit repository and an optional initialPullRequest; without that number it SHALL initially show the open PR list. Data queries SHALL run directly through example-owned server actions. Browsing or refreshing SHALL NOT require the agent to execute each query.

Explicit review requests and opinions SHALL be delivered to the current agent through existing Paneon events. A request SHALL identify the viewed repository, PR number, and base/head commits. Specific opinions SHALL reuse the common annotations structure and preserve their original content/version association. The example SHALL NOT publish GitHub comments or reviews, approve, merge, close PRs, or perform other GitHub write operations. Submitting to the agent SHALL NOT be interpreted as publishing feedback to GitHub or automatically waking an ended agent session.

#### Scenario: Browse a pull request directly

- **WHEN** the person opens a PR or refreshes its data
- **THEN** the example invokes gh through a server action and displays the result without requiring an agent turn

#### Scenario: Request agent analysis

- **WHEN** the person explicitly asks the agent to review a PR or submits specific opinions
- **THEN** the agent can read the event with its original PR/content association through the existing event channel, and no GitHub comment or review is published

### Requirement: Demonstrate a self-contained explanatory page

The skill SHALL include a copyable one-off concurrency-and-queue explanation example. Its topic, title, fixed tasks and durations, and initial concurrency SHALL be defined directly in TSX source rather than supplied through dedicated business input parameters or a task configuration file. Agents SHALL be able to use that source as a reference or modify it to create a one-off explanation for their current task. This example SHALL NOT introduce a general-purpose scheduling service or parameterized standard-panel contract.

The example SHALL allow page-local concurrency adjustment, playback, pausing, and replay to explain its fixed scheduling model. Adjusting these controls SHALL NOT require editing instance input or an agent turn. It SHALL preserve the existing generic CLI input contract; any required empty object SHALL carry no topic, task, or concurrency configuration.

#### Scenario: Run the supplied explanation

- **WHEN** an agent runs the example through the ordinary TSX entry
- **THEN** the page presents the topic and fixed task data from its source without requiring an external task dataset

#### Scenario: Explore the explanation locally

- **WHEN** the person changes concurrency or pauses playback
- **THEN** the page updates its own explanatory state without emitting an agent event for each adjustment or changing instance params

#### Scenario: Adapt the example to another explanation

- **WHEN** an agent needs a different one-off topic or fixed dataset
- **THEN** the agent can copy or edit the example source rather than having to fit the explanation into a dedicated external input schema

### Requirement: Allow explicit corrections in supplied standard panels

Supplied choice, form, table, Git review, and content-review panels SHALL allow the person to correct submitted answers or feedback in the same instance and explicitly submit a complete revised result. Editing alone SHALL NOT emit a revision. Each correction SHALL pass the same validation as an initial submission and SHALL carry replacesEventId referencing the page's prior successful result of the same event type. Initial results SHALL omit that field. A failed revision save SHALL preserve edits and SHALL NOT update the successful receipt.

Revisions SHALL append ordinary events and retain previous results rather than overwrite history or reverse agent actions. Existing annotation identities SHALL be retained for unchanged or corrected entries; new entries SHALL receive new identities and deleted entries SHALL be absent. This behavior SHALL apply to the provided standard pages without forcing the runtime or common components to enforce it on custom panels. A new questionnaire round SHALL continue to create a new instance; correcting answers SHALL NOT replace the questions or the content being reviewed.

#### Scenario: Correct a submitted answer or form value

- **WHEN** the person changes a previously submitted answer or form value and explicitly submits again
- **THEN** a new complete result identifies the prior successful event through replacesEventId, and the previous event remains readable

#### Scenario: Edit without resubmitting

- **WHEN** the person edits a submitted result but has not explicitly submitted the correction
- **THEN** no new result event is emitted and the prior submission remains the saved result

#### Scenario: Save a correction fails

- **WHEN** saving the revised result fails
- **THEN** the edited values remain available and the last successful result receipt is not replaced

### Requirement: Standard instances use ordinary management

The browser home SHALL manage standard panel instances like other instances. This change SHALL NOT add a dedicated standard-page directory or special launch area to the home page.

#### Scenario: Open a supplied page

- **WHEN** a standard page has been run
- **THEN** it is an ordinary panel instance in the existing list and uses the existing lifecycle commands

### Requirement: Git review identifies multiple repositories

The standard Git review page SHALL support explicitly identifying multiple local repositories. Its input and feedback SHALL distinguish repositories independently of the panel's cwd and distinguish identically named files in different repositories.

#### Scenario: Same file name in two repositories

- **WHEN** a person selects package.json from one of two configured repositories
- **THEN** the feedback identifies both the repository and its repository-relative file path

### Requirement: Git review covers working changes and version comparisons

The standard Git review panel SHALL support reviewing staged, unstaged, and untracked working changes as well as changes between branches or committed versions. Version comparisons SHALL NOT implicitly include uncommitted working changes. Exact input fields and branch-versus-endpoint comparison semantics SHALL be finalized in the design before implementation.

#### Scenario: Review current working changes

- **WHEN** the requested scope is the current working tree
- **THEN** the panel can present staged, unstaged, and untracked changes

#### Scenario: Review already committed changes

- **WHEN** the requested scope is a branch or committed-version comparison
- **THEN** the panel can present changes within that comparison even if the working tree is clean

### Requirement: Browse current branch history and individual commits

The Git panel SHALL display the current branch's commit history and allow opening an individual commit's changed files and per-file diffs. Its working-change view SHALL exclude ignored untracked files according to Git rules while retaining changes to tracked files that later match ignore patterns.

#### Scenario: Inspect an individual commit

- **WHEN** a person opens a commit from the current branch history
- **THEN** the panel shows that commit's changed files and lets the person inspect their diffs

#### Scenario: Respect Git ignore semantics

- **WHEN** ignored untracked files and modified tracked files both match ignore patterns
- **THEN** the ignored untracked files are excluded and the tracked changes remain visible

### Requirement: Precisely annotate changes and text

The Git panel SHALL support precise annotations on displayed changes and text, allow correcting annotation text after it has been entered, and make submitted annotations readable by the agent. Annotation locations SHALL identify their repository, file, selected content/range, and relevant content version rather than an unqualified line number. The git-review-submitted payload SHALL use a self-contained sources map and common feedback targets. Sources SHALL identify the configured repository, actual view and resolved revisions, and old/new file paths and content hashes. Targets SHALL identify a file, a displayed hunk with its patch, or a side-specific line range with an exact common text selection. Line numbers SHALL be one-based and refer to the preserved source content rather than a newer disk file.

#### Scenario: Correct an annotation

- **WHEN** a person corrects a typo in an annotation
- **THEN** the corrected annotation can be supplied to the agent without losing its location and identity

#### Scenario: Identify an annotation after files change

- **WHEN** the person submits an annotation on preserved old content after the working file has changed
- **THEN** the result includes the original source identity and exact selected text, and does not reinterpret the annotation against the current file's line numbers

#### Scenario: Share one source across several opinions

- **WHEN** several targets refer to the same preserved file comparison
- **THEN** the event contains that source once and each target references it by sourceId without depending on a live page lookup

#### Scenario: Submit annotations across different comparison views

- **WHEN** a person annotates an uncommitted change, switches to a branch comparison, annotates the same file there, and explicitly submits
- **THEN** one event retains both entries and their distinct sources, including each original comparison scope and content identity, without reinterpreting the first annotation against the last opened view

### Requirement: Explicitly submit Git annotations after editing

The Git panel SHALL allow repeated annotation editing before explicit submission. Editing, saving a draft, and navigation SHALL NOT emit annotation submissions to the agent. An explicit submission SHALL make the completed set of annotations readable through the existing event channel. Correcting already-submitted annotations SHALL require a new explicit submission and SHALL append an identifiable revision rather than rewriting previously delivered events. Revisions SHALL submit complete current feedback with replacesEventId referencing the page's prior successful event; unchanged and corrected annotations SHALL preserve their identifiers, new annotations SHALL have new identifiers, and removed annotations SHALL be absent. A revision SHALL NOT imply reversing agent actions already taken.

#### Scenario: Correct a draft before sending

- **WHEN** a person edits an annotation repeatedly before clicking submit
- **THEN** no annotation submission event is emitted and the final corrected text is available for explicit submission

#### Scenario: Submit the annotation set

- **WHEN** the person explicitly submits the completed annotations
- **THEN** the agent can read the submitted set through the event channel

#### Scenario: Resubmit corrected annotations

- **WHEN** the person corrects submitted annotations and explicitly submits again
- **THEN** a new revision event identifies the corrected annotations while prior events remain intact

### Requirement: Refresh displayed Git changes explicitly

Local file changes SHALL NOT automatically replace a diff currently being read or annotated. The Git panel SHALL provide an explicit refresh-changes action to load current data without reloading the whole browser page. This action SHALL preserve annotation drafts and their original content references. Existing annotations SHALL NOT silently move to the same line number in the refreshed content. The page SHALL retain the referenced original content for reviewing those annotations during the current page session. This requirement SHALL NOT introduce recovery of unsent drafts after a browser reload or service restart.

#### Scenario: Files change during review

- **WHEN** a local file changes while the person is reading or annotating its displayed diff
- **THEN** the displayed content remains unchanged until the person explicitly refreshes the changes

#### Scenario: Refresh with existing annotation drafts

- **WHEN** the person explicitly refreshes changes after adding annotation drafts
- **THEN** current Git data is loaded, the drafts remain associated with their original content, and reviewing an old annotation does not reinterpret it against the new line numbers

### Requirement: Open at an agent-specified initial view

The Git panel SHALL accept configured repositories and an initial display location so the agent can open the working-change view, commit history or a commit detail, or a comparison. Initial navigation SHALL NOT prevent the person from navigating other supported views afterwards.

The initialView input SHALL use repositoryId and type with changes, history, or compare. History SHALL accept commit to open an individual commit. Compare SHALL accept base/head and mode branch for branch-introduced changes or commits for direct endpoint comparison. A file location SHALL be repository-relative; history file locations SHALL include a commit. Omitting initialView SHALL open the first configured repository's working changes.

#### Scenario: Start in commit history

- **WHEN** the agent configures a repository and requests its commit history as the initial view
- **THEN** the page starts at that view and the person can subsequently navigate to working changes or comparisons

#### Scenario: Start at a commit file

- **WHEN** the agent provides a history initialView with an existing commit and file
- **THEN** the page starts at that commit's file diff in the selected repository

#### Scenario: Omit initial navigation

- **WHEN** no initialView is supplied
- **THEN** the page opens the first configured repository's working changes

### Requirement: Include a one-off Sentinel LeapArray explanation example

The skill SHALL include a self-contained one-off example explaining com.alibaba.csp.sentinel.slots.statistic.base.LeapArray from [alibaba/Sentinel](https://github.com/alibaba/Sentinel). Its topic, scenarios, and data SHALL be defined in example code without dedicated business input. Detailed source investigation, interactive presentation, and validation SHALL be completed when implementing the panel rather than requiring further product decisions in advance.

#### Scenario: Reference the public source repository

- **WHEN** the example panel is implemented
- **THEN** its explanation is checked against [alibaba/Sentinel](https://github.com/alibaba/Sentinel), its documentation and page do not contain developer-machine Sentinel paths, and it provides a directly experienceable page for user acceptance

### Requirement: Preserve precise PR feedback sources

The PR example SHALL declare pr-feedback-submitted using PRFeedbackSubmitted from the design. Targets SHALL identify deduplicated sources for PR overviews, original Markdown descriptions, check observations, or fixed-version file diffs. Description sources SHALL carry content hashes, check sources SHALL preserve observed status and identity, and diff sources SHALL identify merge-base/head content. Selecting another PR or refreshing SHALL NOT rewrite existing targets. Fixed OID reads SHALL supply diff content rather than attaching separately fetched mutable diffs to an assumed version. API coverage limits SHALL be visible and omitted files or patches SHALL NOT be presented as unchanged.

#### Scenario: PR content changes without changing head

- **WHEN** a person annotations on a description or check and later refreshes that PR
- **THEN** the submitted feedback retains the original content association and observation, rather than treating the unchanged head OID as the description or check version

### Requirement: Keep table navigation separate from target identity

The table SHALL validate column keys, declared values and page size against TableParams. It SHALL provide local text search, per-column text filtering, stable type-aware sorting and pagination according to the design. These operations SHALL preserve original row indices and existing annotations. Navigation to a hidden target SHALL reveal and highlight it without silently retargeting it. Whole-column selection SHALL refer to the entire original column, while the page-header row selector SHALL refer to the current page.

#### Scenario: Locate an annotated row after filtering

- **WHEN** a person locates an annotation whose original row is hidden
- **THEN** the table restores its visible range, navigates to the relevant page and highlights the original target

### Requirement: Read Git history and diffs from explicit snapshots

The Git page SHALL paginate history in batches of 50 using one resolved tip until an explicit refresh. Commit diffs SHALL use the first parent for merge commits and an empty tree for root commits, with the chosen basis visible. Displayed diff coordinates, source hashes and feedback quotes SHALL derive from the same captured contents. Binary, conflicted, renamed and nonordinary Git objects SHALL NOT be silently misrepresented as ordinary text. File lists SHALL safely handle Git-delimited paths, and refresh SHALL retain original feedback snapshots for the active session.

#### Scenario: The branch tip changes during history browsing

- **WHEN** the person loads another history batch after the branch has moved
- **THEN** that batch still belongs to the resolved original tip until the person refreshes

### Requirement: Render a compact Git history graph

The Git history page SHALL present compact rows containing a parent-relation graph, commit subject and reference decorations, author and date. HEAD, local branches, remote branches and tags SHALL be attached to the actual commit they reference; annotated tags SHALL resolve to their target commit. Full commit IDs and timestamps SHALL remain available without a dedicated hash column. The graph SHALL preserve its existing rows and parent connections when more fixed-tip history is appended. Narrow screens SHALL scroll the history region without expanding the document width. Viewing references SHALL NOT perform Git writes or expand the history scope.

#### Scenario: Browse a fork and merge

- **WHEN** a displayed commit has multiple parents which join a shared ancestor
- **THEN** the graph shows the corresponding fork and joining connections aligned with the actual commit rows

#### Scenario: Append history while retaining graph context

- **WHEN** another batch of commits is appended
- **THEN** the existing graph prefix remains consistent and its parent connections continue into the newly loaded rows

#### Scenario: Switch commits without clearing the workbench

- **WHEN** a commit query is pending or fails after content has already loaded
- **THEN** the displayed commit, files and diff stay consistent until a successful replacement, and the loading status does not move the workbench

### Requirement: Keep installation metadata in Paneon's runtime home

Any persisted Paneon skill installation metadata SHALL be stored inside the fixed ~/.paneon home. Project-level installation SHALL NOT create Paneon metadata files within the project. Skill resources SHALL remain in the selected agent skill directories. This requirement SHALL NOT imply that the future update command is implemented in this change.

#### Scenario: Record a project skill installation

- **WHEN** Paneon persists metadata for a project-level skill installation
- **THEN** that metadata is stored under ~/.paneon and no project-local .paneon/skill-install.json is created

### Requirement: Replace installed skill content on reinstall

Reinstalling a packaged Paneon skill SHALL clean and recreate each ordinary target skill directory before copying the complete packaged resources. This SHALL remove obsolete files and overwrite user modifications instead of merging them. When retaining the symlink installation method, correctly targeted symbolic links SHALL remain in place, with their central skill content refreshed. Cleanup SHALL be limited to the Paneon skill targets rather than their parent skills directories or other skills.

#### Scenario: A packaged release removes a reference file

- **WHEN** the previous installation contains a reference absent from the packaged skill being installed
- **THEN** the obsolete reference is absent after reinstallation

#### Scenario: A person edits an installed skill

- **WHEN** reinstallation proceeds after the installation summary and overwrite confirmation
- **THEN** the installed content is replaced by packaged content rather than merged with local edits

### Requirement: Initialize bundled skill installation through the CLI

The paneon init command SHALL install the current CLI package's complete Paneon skill with an interactive agent selection, Project default or explicit Global scope, an installation method choice when target directories differ, and a summary with overwrite confirmation. Shared-directory targets SHALL be written once. Explicit noninteractive agent/scope/method parameters with --yes SHALL support --json without terminal prompts. Init SHALL NOT start the panel runtime, download another skill version, upgrade the CLI, or implement the future update command.

#### Scenario: Confirm a project installation

- **WHEN** a person selects agents and Project, reviews the installation summary and confirms
- **THEN** the complete packaged skill is installed using the effective copy/symlink method and successful installation metadata is stored only under ~/.paneon

#### Scenario: Cancel before installation

- **WHEN** the person cancels agent selection or declines the final confirmation
- **THEN** no installation or metadata is written

#### Scenario: Install without a terminal

- **WHEN** a caller supplies valid explicit agents and --yes with --json
- **THEN** init installs without prompts and returns one structured JSON result with effective targets

### Requirement: Browse a selected branch with complete commit details

The supplied Git panel SHALL use its own history renderer and default to the current HEAD ancestry. A history branch selector and optional initialView.branch SHALL support viewing one local or remote branch without checking it out or including unrelated branch tips. Changing the branch SHALL resolve a new tip and reset the old page and commit selection. History pagination SHALL retain that resolved tip until explicit refresh.

The selected commit SHALL show its complete message as plain text with paragraphs and line breaks preserved in a separately scrollable details region below the changed-file list. History SHALL initially select its tip unless an explicit commit is supplied. Loading more SHALL retain the current details; selecting a commit beyond the first batch SHALL retain already loaded history.

#### Scenario: View another branch

- **WHEN** the person selects a different history branch
- **THEN** that branch's tip and ancestry are displayed without changing the repository's checked-out HEAD or including commits exclusive to other branches

#### Scenario: Read a multiline commit message

- **WHEN** the selected commit has a subject and several body paragraphs
- **THEN** all paragraphs are available as plain text while the history row remains compact

### Requirement: Navigate large commit lists without mounting all rows

The Git history SHALL support arrow, Home/End and PageUp/PageDown keyboard navigation within loaded commits. Lists exceeding 200 loaded commits SHALL render a bounded visible window with overscan while retaining graph geometry computed from the entire loaded history. Offscreen keyboard navigation SHALL reveal and focus the intended row. Browsing SHALL NOT emit feedback events.

#### Scenario: Navigate to an offscreen loaded commit

- **WHEN** the person uses End in a windowed history list
- **THEN** the last loaded commit is revealed and focused, and its details and changed-file list become selected together after a successful query; the diff opens only when a file is chosen

### Requirement: Adjust the history and diff split without replacing review state

The desktop history view SHALL provide a pointer-draggable and keyboard-accessible horizontal separator between the entire history/files/details region and the diff region. Resizing SHALL change only layout and SHALL preserve mounted review content, selected commits/files, loaded history, scroll positions where still valid, and annotation drafts without querying Git or emitting events. Minimum sizes SHALL accommodate each pane's real children; short windows SHALL allow page scrolling rather than overlap panes. Ending or cancelling a drag, leaving history, or switching to a narrow layout SHALL release capture and restore temporary interaction styles. Narrow layouts SHALL retain stacked content without the desktop separator.

#### Scenario: Resize while reviewing a commit

- **WHEN** the person drags the separator or adjusts it with arrow keys
- **THEN** the two regions change height in opposite directions within usable limits without replacing the current review state

#### Scenario: Use a short desktop viewport

- **WHEN** the viewport cannot contain the combined minimum pane heights
- **THEN** files and commit details do not overlap the separator or diff and the diff remains reachable by scrolling

### Requirement: Browse changed files in a compact directory tree

The Git page SHALL organize changed-file snapshots into an expandable directory tree. A chain containing only one subdirectory and no direct files SHALL be compressed into one path row until a branch or direct file is encountered. Files SHALL retain their full old/new paths and snapshot identities for search, selection, diffs and feedback. Working-tree staged, unstaged and untracked comparisons SHALL remain distinct even for identical paths.

Deleted files SHALL be visually muted but selectable, modified files blue, and added/untracked files green. Textual or accessible status information SHALL remain available. Renames SHALL use their destination path in the tree and retain the original path in explanatory information. The directory model MAY retain path-filtering support, but the standard Git page SHALL omit the file-search and changed-file count headers. Browsing or collapsing unrelated directories SHALL NOT unexpectedly scroll back to a selected file.

#### Scenario: Compress a shared directory prefix

- **WHEN** changed files share a sequence of single-child directories before branching
- **THEN** the sequence occupies one directory row while the branching children remain separately expandable

#### Scenario: Review a deleted or renamed file

- **WHEN** the person chooses a deleted or renamed leaf
- **THEN** its original snapshot opens in the diff and remains eligible for precise feedback

#### Scenario: Select the same path from separate working comparisons

- **WHEN** a path has both staged and unstaged changes
- **THEN** distinct grouped leaves open the respective snapshots instead of merging them

### Requirement: Choose history references from the left sidebar

The desktop history workspace SHALL place a branch sidebar to the left of the commit list. It SHALL show HEAD and distinguish local branches, remote branches and commit tags, with collapsible slash-prefix groups and name search. Filtering SHALL temporarily reveal matches without discarding saved expansion state. Choosing a reference SHALL use its full reference name with the existing read-only fixed-tip history navigation and SHALL NOT check it out. Narrow screens SHALL stack the sidebar and retain bounded internal scrolling.

#### Scenario: Select a remote branch or tag

- **WHEN** the person selects an item in the remote branch or tag group
- **THEN** its tip and ancestors replace the history after a successful query, while the repository's checked-out HEAD remains unchanged

### Requirement: Resize history sidebars independently

The desktop history region SHALL provide two vertical draggable separators around the commit list. Each boundary SHALL resize its adjacent sidebar while preserving the opposite sidebar width and a usable minimum commit-list width. Separators SHALL support horizontal arrow keys and accessible width bounds. Resizing SHALL retain mounted review state and drafts without Git queries or feedback events. Session proportions SHALL survive view changes and re-constrain on container resize. Narrow layouts SHALL hide these separators and stack the content; cancellation, lost capture, viewport changes or leaving history SHALL restore temporary interaction styles.

#### Scenario: Expand the branch sidebar

- **WHEN** the person drags the left separator rightward
- **THEN** the branch sidebar grows and the commit list shrinks within their limits while the files area keeps its width

#### Scenario: Expand the files area

- **WHEN** the person drags the right separator leftward
- **THEN** the files/details area grows and the commit list shrinks within their limits while the branch sidebar keeps its width

### Requirement: Compact history with explicit file opening

The standard Git history page SHALL use visually one-pixel separators while preserving pointer drag hit areas and keyboard access. It SHALL omit the visible commit-details title bar, retain complete plain-text messages and metadata, and place the message directly after the changed-file tree. Selecting another branch or commit SHALL clear the open file and hide the diff; history SHALL use the available workspace until a file is chosen. An explicit initial file SHALL open its diff, refreshing the same commit SHALL preserve a chosen file, and locating a retained annotation SHALL reveal its original snapshot.

#### Scenario: Browse history before opening a file

- **WHEN** the user selects another commit
- **THEN** its files and complete message appear with no default file diff, and clicking a file opens the diff without discarding annotations

### Requirement: Explicit diff modes and hunk navigation

The shared diff SHALL offer explicit side-by-side and single-column mode buttons with their current pressed state. Its toolbar SHALL show the current and total contiguous changed ranges, navigate using accessible up/down arrow buttons, and locate the current changed range when its count is clicked. Separate edits SHALL remain separate navigation stops when their surrounding context windows merge into one display hunk. Boundary and empty navigation SHALL be disabled. Mode changes and context expansion SHALL preserve exact original source coordinates and annotations. Narrow layouts SHALL wrap controls without widening the page.

#### Scenario: Navigate and change diff display

- **WHEN** the user advances to another hunk, switches display mode, and clicks the difference count
- **THEN** the same hunk is revealed, its position remains accurate, and annotations still identify the original source

### Requirement: Preserve native selection without repeated full-source work

Shared feedback SHALL preserve normal native select-all and copy behavior. Selection normalization and registered text geometry SHALL avoid repeatedly scanning complete source text or all syntax nodes for every selected target. Geometry measurements SHALL not retain thousands of live DOM ranges. Source mappings, grapheme boundaries, exact quotes and existing event size limits SHALL remain authoritative.

#### Scenario: Select a long highlighted diff

- **WHEN** the user selects and copies a long diff, saves an annotation and changes its display mode
- **THEN** the complete selection and Unicode text remain intact, the draft remains editable, and oversized submission is rejected without discarding it
