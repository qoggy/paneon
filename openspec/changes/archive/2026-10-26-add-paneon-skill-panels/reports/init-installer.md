# init installer delivery

## Scope and commits

- Base: `6ecf59c`.
- Implementation: `b03c50a` — `feat(init): install bundled skills with centralized records`.
- Isolated worktree: `/Users/yuguo/.codex/worktrees/init-installer/paneon`.
- Implements only the backend of task 2.13. Does not implement `paneon update`, npm self-upgrade, a remote skill catalog, runtime startup, or the terminal UI owned by the other unit.

## Delivered behavior

`src/cli/skill-install/index.ts` exports the agreed environment, registry, plan and execution APIs and all contract types. Eleven agent IDs and directory/detection mappings were checked against the pinned Vercel Skills source. Universal agents share `.agents/skills` in both scopes; explicitly selected other agents get their target roots even if those roots do not yet exist. Detection is only a preselection hint and does not invoke agent binaries or claim discovery by an agent.

Plans are read-only. The installer resolves existing parent links, deduplicates physical destinations, normalizes a single destination to Copy, and otherwise defaults to Symlink. It installs the complete bundled skill, including references and TSX resources. Correct links retain their inode; ordinary target directories are removed and recreated, clearing obsolete files and overwriting local modifications. Incorrect or broken links are repaired without deleting their previous destination. Other skills and parent skill directories are preserved.

Execution recomputes the plan before and after obtaining the metadata lock. Changed or externally edited plans are rejected. Paths overlapping the bundled skill source, including final and parent link aliases, are rejected before destructive operations. The source and pending metadata are staged before replacing installed directories. A failed link is not converted to Copy. Failures report completed targets and state that changed files have not been rolled back; they do not record a successful version.

Only `~/.paneon/skill-installations.json` stores installation metadata. Version 1 records retain scope, canonical project identity, selected agents, effective method, package version, and relative actual targets. Reinstallation replaces the matching scope/project entry while preserving other installations. Invalid JSON, unsupported schemas, malformed entries and a symbolic-link record file are rejected without silently discarding prior records. A temporary file, file sync and rename avoid truncating existing JSON; an exclusive lock serializes the entire read/modify/write operation across processes.

Agent definitions retain upstream attribution and the complete applicable MIT notice in `src/cli/skill-install/UPSTREAM-LICENSE.md`. The CLI unit was asked to include that notice in the package file list.

## Verification

All installation operations below used temporary project, home, metadata and package directories. No real personal agent directory was modified and no global npm install was run.

| Check                                                                      | Result                                                                                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npm ci --prefer-offline --no-audit --no-fund`                             | Passed, 568 packages                                                                                                      |
| `npm run build`                                                            | Passed, including CLI/UI/typecheck/web; final home-alias normalization was followed by fresh CLI build and full typecheck |
| Final `npm run build:cli`                                                  | Passed                                                                                                                    |
| Final `npm run typecheck`                                                  | Passed                                                                                                                    |
| `node --test tests/skill-install.test.ts`                                  | 19/19 passed, no skips                                                                                                    |
| Full `npm run lint`                                                        | 0 errors, 15 existing warnings outside this unit                                                                          |
| Scoped ESLint on `src/cli/skill-install` and `tests/skill-install.test.ts` | Passed without warnings                                                                                                   |
| Scoped Prettier and `git diff --cached --check`                            | Passed                                                                                                                    |

The 19 tests cover the registry/environment overrides; read-only planning and explicit selection; complete Project Symlink installation; Copy replacement and stale-reference deletion; all eleven Global targets; correct-link preservation and broken/wrong-link repair; parent links, project aliases and physical deduplication; direct/final-link/parent-link source protection; missing source; malformed records; altered plans; metadata path failure; unsupported source files; link failure; failed atomic rename; record symlinks/absolute target validation; multiple projects/global coexistence; six separate concurrent installer processes; and Global home aliases/relative configuration paths.

Failure evidence is deliberately concrete: a real Unix socket in the source makes staging fail before existing skill deletion. Injected OS errors at `symlink` and `rename`, with actual temporary directory operations around them, prove that no Copy fallback or false successful record is produced and that prior JSON remains byte-for-byte intact. Mocks are restored after each test. Six independent Node processes concurrently install into separate projects using the same metadata home; all six records remain and temporary files/locks are cleaned afterward.

The initial Unix-socket fixture exceeded macOS's socket name limit and failed with `EINVAL`; the fixture was corrected to access the same source through a short temporary alias. The final test passes without a skip.

Local logs for this run:

- `/tmp/paneon-init-installer-build.log`
- `/tmp/paneon-init-installer-tests.log`
- `/tmp/paneon-init-installer-lint.log`
- `/tmp/paneon-init-installer-typecheck.log`

## Boundaries and remaining acceptance

- This unit did not independently verify the terminal selector, source/built CLI help, or installed-package PTY behavior; the CLI unit and main agent own combined acceptance. It did not rerun unrelated Chrome panel tests.
- The exclusive lock has a bounded approximately 30-second wait. It intentionally does not automatically reap a lock based on PID: competing stale-lock cleaners could delete a new owner's lock. An abruptly killed process can leave `skill-installations.lock`; the busy error supplies its path and instructs removal only after confirming no installer is running. Normal success and handled failures remove the lock.
- Filesystem replacement is not transactional across all target directories. A failure after some targets changed leaves those actual changes in place, reports failure/partial completion and preserves the previous successful metadata. There is no automatic rollback claim.
- Path verification prevents stale-plan use and checks parent aliases again at mutation time; it is not an operating-system sandbox against a hostile process continuously racing filesystem writes.
- Project identity is the canonical absolute cwd passed to init. No automatic parent-project discovery, disk scan or future update behavior is introduced.
- No push, release, main-branch integration or worktree deletion was performed by this unit. Main-agent acceptance remains required.

## Changed files

- `/Users/yuguo/IdeaProjects/paneon/src/cli/skill-install/UPSTREAM-LICENSE.md`
- `/Users/yuguo/IdeaProjects/paneon/src/cli/skill-install/agents.ts`
- `/Users/yuguo/IdeaProjects/paneon/src/cli/skill-install/index.ts`
- `/Users/yuguo/IdeaProjects/paneon/src/cli/skill-install/installer.ts`
- `/Users/yuguo/IdeaProjects/paneon/src/cli/skill-install/types.ts`
- `/Users/yuguo/IdeaProjects/paneon/tests/skill-install.test.ts`
- `/Users/yuguo/IdeaProjects/paneon/openspec/changes/add-paneon-skill-panels/reports/init-installer.md`
