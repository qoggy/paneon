# init CLI delivery

## Scope

Implemented `paneon init` using the internal installer API from
`src/cli/skill-install/index.ts`. This unit owns command registration, terminal
prompts, output handling, user/skill documentation, and CLI/PTY checks. It does
not implement `paneon update`, upgrade npm, start a runtime, download a remote
skill, or maintain a separate agent guide.

The runtime dependency is pinned to `@clack/prompts` 1.8.1. Interactive copy uses
the adopted Vercel Skills prompts: agents → Project/Global (default Project) →
Symlink/Copy when required → Installation Summary with `overwrites:` → Proceed
with installation. Universal is a fixed group; additional agents can be selected.
Explicit `--agent` requests do not add other agents. A single actual target skips
the method prompt and uses Copy. All path, deduplication, complete-copy, symlink,
record, and deletion logic belongs to the installer unit.

Supported flags are `--agent <agents...>`, `--project`, `--global`, `--copy`,
`--yes`, and inherited `--json` / `--debug`. Project/Global conflicts and unknown
agent IDs fail before writes. JSON and non-TTY calls require `--yes`; they never
prompt. `--yes` without agents selects Universal plus detected targets. Cancel
and No return `{ "cancelled": true }` with exit 0 and write nothing. JSON stdout
contains one existing result envelope; debug stays on stderr.

Source CLI help/version/init help use deferred imports and remain usable before
`dist` exists. Running source `init` itself uses the built module, matching the
existing client import pattern.

## Files owned by this unit

- `src/cli/index.ts`
- `src/cli/init.ts`
- `package.json`
- `package-lock.json`
- `README.md`
- `skills/paneon/SKILL.md`
- `skills/paneon/references/cli.md`
- `tests/init-cli.test.ts`
- `tests/init-interactive.mjs`
- `openspec/changes/add-paneon-skill-panels/reports/init-cli.md`

The package includes the installer unit's upstream MIT notice via
`src/cli/skill-install/UPSTREAM-LICENSE.md` in `files`.

## Validation

Validation combines this unit and the other unit's real installer files in an
isolated temporary copy. Neither worktree contains the other unit's source or
commits. No installer stubs are used. The final integrated branch must repeat
these checks after both commits are merged.

- Complete `npm run build` passed, including CLI/UI declaration generation,
  type checking, and web build. `npm run typecheck` also passed separately.
- `node --test tests/cli.test.ts tests/init-cli.test.ts`: **18/18** passed
  (12 new CLI cases, 6 existing help/version/error cases).
- Scoped ESLint for CLI registration, init, and init CLI tests passed with zero
  errors. The final combined tree passed full lint with 0 errors / 15 existing
  warnings. Scoped Prettier and `git diff --check` passed.
- A separate minimal copy containing source index, package metadata, and installed
  dependencies but no `dist` passed source `--help`, `--version`, `init --help`.
- `node tests/init-interactive.mjs`: **5 actual PTY scenarios** passed using
  Python's pseudo-terminal and real Clack: Ctrl-C, No, default Project/Symlink,
  overwrite summary on reinstall, Global/Copy. No mock prompt implementation.

### Final installer snapshot and one transient test failure

The final combined build/lint/package checks used installer implementation commit
`b03c50a`. A subsequent 37-case combined run (CLI plus installer tests) returned
36 passed and one `spawnSync ... ETIMEDOUT` in the built CLI invalid-options case.
The 15-second test child-process deadline expired; no assertion reported incorrect
CLI output or writes. Running that exact case alone then passed in 1.57 seconds.
The cause of that one process stall is not established. No timeout increase,
retry, or fallback was added to product code or tests. The integrated branch
should run the CLI/installer suite again; do not describe this combined run as
37/37 passed. The separate earlier CLI run above genuinely passed 18/18.

### Independent package

`npm pack --ignore-scripts --json` was run after the complete build. The tarball
was installed with `npm install --omit=dev --no-audit --no-fund` in a separate
temporary npm project; the installed package was confirmed to be an ordinary
directory, not a source symlink.

Final tarball SHA-256:
`c463c4bbf9c81deaa5f6373de6ad3ba6190a1809bf84b855abc1f1c4832947ce`.
It includes the final installer implementation `b03c50a` and this unit's CLI,
dependencies, and user/skill documentation. Only delivery-report edits followed
packing. The final-package PTY and file/compilation checks below passed after
installation of that tarball.

The package includes built init and installer modules, all skill resources, and
the installer upstream license. `docs/agent-guide.md` is absent.

- Running the same **5 PTY scenarios against the independent package** passed.
- Installed `init --yes --json` produced the expected Project/Symlink plan and
  succeeded using only a temporary home/project.
- All **37 skill files** installed into the project matched the package's complete
  skill tree byte-for-byte, including relative shared/example/reference resources.
- The installed package's real `compilePanel` successfully compiled the newly
  installed `choose` and `github-pr` entries. No business actions were executed.
- The only file created under the temporary `~/.paneon` was
  `skill-installations.json`; no runtime was started or runtime file created.

Reusable independent-package PTY invocation:

```sh
PANEON_INIT_PACKAGE_ROOT=/absolute/temporary/project/node_modules/paneon node tests/init-interactive.mjs
```

All installs, overwrites, and cancellation assertions used temporary project and
home directories. No personal agent directory or global npm installation was
modified. This delivery does not claim other OS terminal behavior, real agent
skill discovery, a public npm release, or the future update command.
