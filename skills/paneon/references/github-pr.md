# Read-only GitHub PR workspace

Run [the example](../assets/examples/github-pr/panel.tsx) with an explicit repository:

```sh
paneon panel run /absolute/skill/paneon/assets/examples/github-pr/panel.tsx \
  --cwd /work/project --params '{"repository":"cli/cli","initialPullRequest":14768}' --json
```

Use a real accessible PR number. Input is `{repository: "owner/repo", initialPullRequest?: positiveInteger}`. Without `initialPullRequest`, the page opens the open-PR list and waits for a selection; it never infers a PR from the local branch. `--params-file` can supply the same JSON through the normal creation-time snapshot mechanism. The local `gh` CLI must be installed, authenticated where needed, and able to read the repository. The page uses its existing credentials, without collecting tokens in the interface.

This is a copyable scene example. Queries run directly through example-owned server actions, while explicit requests and feedback become ordinary Paneon events for the current agent. No GitHub comments/reviews are published, and there are no approve, merge, close, push or CI-trigger actions. REST calls use GET; the GraphQL operation is a read-only query.

## Read the PR

The list shows title/number, author, source/target branches, draft/state and update time. Search and open/closed/merged/all filters query `gh pr list --repo`; changing the scope resets the maximum to 30. Loading more raises `--limit` by 30 and queries again, deduplicating by PR number. The loaded count is visible. This is a growing maximum over mutable data, not a cursor, fixed snapshot or promise to have loaded the whole repository.

Open an explicit PR for its metadata, review/merge state and Markdown description. The **文件改动** tab reads a fixed-version comparison and per-file content; **检查** reads `statusCheckRollup` for the preserved complete head OID, paging its contexts and using GraphQL node IDs as stable check keys. A failed check is displayed as an observed business state. A failed query has its own error and is never represented as an empty successful check list or unchanged file.

Refreshing a PR queries a new detail snapshot. Switching PRs or refreshing leaves existing feedback attached to the original description, check observation or code source. The annotation list can revisit the preserved content with its original PR number/head. This session cache is example-owned; browser reloads, service restarts and ordinary Vite/React source updates do not promise recovery of unsent drafts or retention of old workers.

## Fixed code and coverage

The code path first reads complete base/head OIDs from the explicit PR, then uses `gh api` compare to resolve the merge base. File contents come from the exact merge-base/head Git commit, tree and blob objects. Nonrecursive tree traversal preserves modes and avoids truncated recursive trees. Blob SHA-1 and byte count are verified before SHA-256 content hashes and a diff are derived from those same bytes. The page does not attach mutable `gh pr diff` output to separately fetched OIDs.

GitHub's compare API returns changed files only on its first paginated page, with a maximum of 300 files. The workspace always displays its returned file count, the PR detail's reported count and the original GitHub file-change link. A count mismatch or a result at the 300-file ceiling is visibly incomplete or unproven; omitted files are never called unchanged. Missing API patch data is disclosed, and readable fixed blobs still produce a diff. If a tree/blob is unavailable, truncated, corrupt or exceeds the per-command 32 MiB JSON-output buffer, the selected file reports a read failure, preserving existing feedback. No patch, source or feedback is silently truncated into a purported complete result.

Renames retain old/new paths. Added/deleted files can omit one side. Valid UTF-8, CRLF and missing final newlines retain source semantics. Binary/invalid-UTF-8 data, symlinks and gitlinks support file-level feedback; symlink targets are not followed and submodules are not recursively read. The shared renderer defaults to left/right diff, supports unified view and expanded context, and uses the same original positions in every layout. Large unrelated texts may use coarser exact replacement hunks to bound diff computation memory.

The API behavior is documented in [Compare two commits](https://docs.github.com/en/rest/commits/commits#compare-two-commits), [Get a tree](https://docs.github.com/en/rest/git/trees#get-a-tree) and [Get a blob](https://docs.github.com/en/rest/git/blobs#get-a-blob). The 300-file list ceiling is distinct from the single-commit endpoint's file pagination.

## Request analysis or submit opinions

**请 AI 审阅此 PR** emits only `review-requested` with the viewed PR's fixed versions:

```json
{
  "repository": "cli/cli",
  "number": 14768,
  "baseCommit": "76400a44d3d0910597bb301667a2e91013a4a786",
  "headCommit": "e8e24f4c540b5dd6344e7061eb0cdad0fb1622ed"
}
```

These are observed example OIDs; a new run queries its own actual versions. Clicking this button does not send annotation drafts. It does not wake an ended agent automatically; the agent must be waiting or later resume and read events.

Select text normally to show a nearby **批注** action, then save in its anchored editor. Select the registered text in descriptions and code directly, including complete paragraphs or continuous code ranges. Use independent annotations for separate selections; the default toolbar has no object-selection mode. Annotations may be empty. Plain browsing, text copying, links, tabs and inputs keep their usual meaning. Browsing and draft edits emit no events.

A numbered marker reopens a saved annotation for editing, cancellation or deletion. Saving only changes the page draft; pending edits must be saved or cancelled before submission.

**提交批注** in the page toolbar validates the preserved snapshots and emits `pr-feedback-submitted`:

- `repository` identifies the configured repository.
- `annotations` is the common list of stable-ID entries, each with nonempty `targets` and string `comment`.
- `sources` contains only actual referenced sources, deduplicated by PR, content kind and observed content/version. Targets reference it with `sourceId`.
- Every source includes PR `number` and complete `baseCommit`/`headCommit`. PR overviews add title/update time; descriptions add the complete original body hash; checks add stable key/name/status/conclusion/details URL/observation time; code sources add the actual merge-base and side-specific path/type/byte hash.
- Overview/check targets are whole objects without text. Description text uses complete original Markdown UTF-16 offsets and exact quotes, preserving formatting markers/entities when a selection crosses them. File/hunk/line coordinates reuse the shared Git contract: file/hunk omit `text`; hunk retains its exact selected patch; line offsets address the preserved selected lines, including original separators. Whole-side DOM selections are normalized to the actual selected line range before delivery.

Results do not duplicate the PR description or whole diff; they preserve selected quotes/hunks and source identities. One opinion may cross PRs and content kinds. Description/check changes remain distinct even if head is unchanged. Server-side validation uses the original session cache, never newly queried content as a substitute.

First empty feedback is rejected. Failed query, validation, transport or event writes retain drafts. Event saving must succeed before the UI reports delivery. The existing 65536 UTF-16 serialized-character event limit and 262144-byte complete HTTP request limit remain in effect; oversized drafts are retained without automatic splitting or truncation.

This example keeps feedback editable after success. Another explicit submission appends the complete current result, preserving annotation IDs; it uses the declared `PRFeedbackSubmitted` contract without standard-page `replacesEventId`. Previous events remain intact. Customizing this example can choose a different submission policy without changing the common SDK/UI.

Read the two event types using ordinary `paneon panel events <instanceId> --consumer <name>` and acknowledge delivered IDs using `paneon panel ack`. Receiving feedback through Paneon never publishes it to GitHub.

## Reuse notes

The example uses the public Provider/controls plus the existing shared Markdown and diff adapters, without another selection state machine.

The shared diff adapter supplies `targetRanges` through `diffTargetRanges(snapshot.model, target)` so saved annotations with line-range references have numbered markers beside the exact preserved old/new source. Keep this geometry bridge when reusing the example; it does not alter event references or GitHub data.

Text selection uses its nearby **批注** action directly. Only **保存** adds the page draft; cancelling discards the temporary edit.
