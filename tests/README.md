# Release tests

Use Node.js 24 and an installed Chrome browser. The bundled panels must accept the
version in package.json; browser and package phases check this before starting
their suites. The runner does not change the package version.

```bash
npm run test:release -- --coverage
npm run test:release -- --phase=browser --jobs=3
npm run test:release -- --phase=package --jobs=1
npm run test:release -- --phase=browser --match=git-review-layout
npm run test:release -- --list
```

The browser phase defaults to three concurrent processes; the package phase stays
at two. `--jobs=N` overrides both phases. Use `--jobs=1` to diagnose a failure
serially; the allowed range is 1–6. `--list` reports the per-phase `concurrency`
limits. Node tests retain their
existing six-process limit. Phases run in order, with one shared build.

Each command gets its own HOME, temporary directory, screenshots and captured
output. Clipboard users and overlapping legacy screenshot paths are serialized,
including fixture imports and package wrappers. Declare dynamically selected
child suites in the runner's resource detection when they use shared resources.
Logs print when each command finishes, followed by individual durations, exit
codes and total wall time. A failed suite remains a failure; other suites can finish. Interruption
stops admission, terminates active process groups and runs cleanup.

The runner also reports phase wall time, setup/cleanup time and each suite's queue
and execution time in milliseconds. Queue time measures waiting for a worker or
shared-resource lock after phase preparation. `PANEON_TEST_TIMING` records measure
packing, npm installation, tarball/installation copies, runtime startup and
`runtime.run` calls made through `runtime-fixture.ts`. `panel.run` includes
compilation and instance creation, not just compiler CPU time. Stage totals are
cumulative across child suites and can overlap; do not add them to wall time.
Stage failure counts include expected rejections exercised by tests; suite exit
codes remain the pass/fail result.
Standalone suites can enable these diagnostics with `PANEON_TEST_TIMINGS=1`.

The package phase packs once and performs one real npm installation. Every suite
receives a private filesystem copy of that installation and the same tarball;
writes cannot affect another suite or the baseline. Copy-on-write is used where
the filesystem supports it. Package scripts still pack and install independently
when run directly. Package contents, browser interactions and CLI assertions stay
in their existing suites.

`browser/code-block-pack.mjs` reuses the complete CodeBlock and Markdown highlighting
interaction suites against the installed runtime from an external cwd. Its fresh
browser pages block external HTTP(S) requests and fail if any are attempted, while
retaining real copy/wrap controls, themes and exact annotation assertions. Run it
through the release runner to isolate HOME, serialize clipboard use and clean up:

```bash
npm run test:release -- --phase=package --match=code-block-pack
```

Only npm's download cache persists, in `~/.cache/paneon-tests/npm/`, outside the
repository so development watchers do not scan downloads. The release runner
resolves this path before isolating HOME and passes it to child suites.
`PANEON_TEST_NPM_CACHE=/absolute/path` selects a different dedicated cache for
release runs and standalone package suites. Every run still packs and performs a
real npm installation in a new directory, using the configured registry and
ordinary npm cache freshness checks. There is no offline-install requirement or
reuse of `node_modules`, runtime databases or HOME. npm logs stay in temporary
directories and are removed with the run. To clear the retained cache explicitly:

```bash
npm cache clean --cache "$HOME/.cache/paneon-tests/npm" --force
```

The full Git layout suite runs through `git-review`, so the release runner omits
its duplicate standalone invocation when both are selected. A targeted layout
run still works, and the separate history/annotation assertions remain enabled.

Temporary homes, fixtures, installations, build caches and logs are removed after
each run; the dedicated npm download cache is retained. Previous dist output and
pre-existing fixed screenshot paths are restored.
No tests publish packages, commit or push repository changes.

## Concurrency comparison

Compare the same representative desktop suites with two and three workers. The
set covers Git repository management, file/media review and real clipboard operations.
All assertions and resource locks remain enabled. Run in 2, 3, 3, 2 order to reduce
ordering effects; compare the printed **browser phase** wall time and retain every
failure in the result. Builds and setup/cleanup are measured separately.

```bash
npm run test:release -- --phase=browser --jobs=2 --match=git-review-repositories,file-review,media-annotations,code-block,markdown-images,file-references
npm run test:release -- --phase=browser --jobs=3 --match=git-review-repositories,file-review,media-annotations,code-block,markdown-images,file-references
```

`--match` uses substrings. Inspect `--list` before a comparison when a name can
match multiple suites. This comparison does not replace the full release suite.

## Measured baseline

Measured on 2026-10-31 against product commit `d63f4d2`, using Node.js 24.16.0,
Chrome 156.0.8078.76 and an Apple M3 Pro Mac (11 logical CPUs, macOS arm64).
These measurements include the test-runner changes described above.

Two consecutive `--phase=package --match=package-cli-bin` runs used an initially
empty dedicated download cache, followed by the populated cache. Both created a
fresh installation and passed the installed CLI checks.

| Measurement                                   | Cold download cache | Warm download cache |
| --------------------------------------------- | ------------------: | ------------------: |
| Real npm installation                         |            193.25 s |             16.36 s |
| Copy private installation                     |             10.70 s |             10.62 s |
| Package phase wall time                       |            209.66 s |             32.21 s |
| Whole invocation, including build and cleanup |            238.35 s |             62.85 s |

The installation saved about 177 seconds in this comparison. Registry/network
conditions affect this result; it is not a projected duration for the complete
release suite. Installation copies remain a measurable cost. Runtime startup was
roughly 0.1 seconds in most measured browser fixtures, while individual panel runs
took several seconds, so compilation and copying are more useful follow-up
targets than server startup.

The six browser suites listed above ran in 2, 3, 3, 2 worker order. All 24 suite
executions passed, without retries or disabled assertions/resource locks.

| Workers | First browser phase | Second browser phase |   Median |
| ------- | ------------------: | -------------------: | -------: |
| 2       |            140.12 s |             133.38 s | 136.75 s |
| 3       |             83.31 s |              83.60 s |  83.46 s |

Three workers reduced the representative browser phase median by about 39%, so
the browser default is now three. Package concurrency remains two because this
comparison did not measure parallel package suites. The complete release suite
was subsequently run with three browser workers; the results below record its
observed duration. There is no matching full two-worker run, so the representative
39% improvement must not be presented as the complete suite's speedup.

## Release verification on 2026-10-31

Tested with Node.js 24.16.0 and Chrome 156.0.8078.76 on macOS 14.4.1 arm64.
The starting commit was `aaf055b`, compared with `v0.1.0` (13 commits, 175 changed
files). Authorized table title/description and PR title annotation changes landed
in the shared working tree during the run. Their four functional files matched
the installed package snapshot and received focused checks after they stabilized.
These are observed timings with concurrent development, not a controlled speed
comparison or a claim that every phase ran against one frozen checkout.

At the final audit, external Git operations had moved HEAD to `efe5d12`. The
starting tree at `aaf055b` was identical to the rewritten base `edad2c5`; the final
functional files still matched the tested installation. The external commit also
included the new offline test and release registration. This testing session did
not commit or push changes; this report was left in the working tree as requested.

The complete invocation was:

```bash
npm run test:release -- --coverage
```

All 100 commands exited successfully: build, bundled-version preflight, lint,
formatting, 434 Node tests across 71 files, three acceptance suites, 80 desktop
browser suites, package preparation and 11 installed-package suites. Lint reported
zero errors and 69 warnings. Node reported zero skipped tests. The new code-block package
suite was registered after this invocation started and was verified separately.

Node coverage was 91.20% lines, 89.26% branches and 88.18% functions. The runner's
coverage filter includes `src/**/*.ts` and `dist/**/*.js`, excluding UI/web bundles;
it does not measure the Skill TSX files or browser UI behavior. Those paths are
covered by the browser and installed-package assertions, not by these percentages.

Observed phase wall times:

- Build: about 19 seconds; static checks: 24.46 seconds.
- Node tests: 311.80 seconds; acceptance: 51.29 seconds.
- Desktop browser phase, three workers: 916.86 seconds.
- Package phase, two workers including preparation: 572.84 seconds.
- Cleanup: 7.06 seconds; complete invocation: 1,904 seconds (31 minutes 44 seconds).

The package was packed once in 1.92 seconds and installed once in 33.88 seconds
using a temporary copy of the existing npm download cache. The eleven private
installation copies each took 11.17–26.37 seconds, about 172.32 seconds cumulatively.
Copies overlap other jobs; their sum is not additional phase wall time.
The installed tarball SHA-256 was
`f536e110d190bb2b7aff099cb2ffdd3da9737ca77500894a94964ec40b8160a9`.

The longest suites were installed Git review (282.10 seconds), installed standard
pages (244.74 seconds), source Git review including layout (157.40 seconds), source
PR review (136.87 seconds) and installed PR review (127.50 seconds). Instrumented
fixtures recorded about 926.50 cumulative seconds in 151 panel runs, versus 13.65
seconds in 86 server starts. Git review fixtures currently bypass the shared timing
wrapper, so these stage samples cannot explain all Git-suite time. Further speed
work should first measure those stages, then assess duplicate source/package
layout work while retaining installed-package resolution and feedback checks.
No timeouts, assertions, resource locks or existing suites were removed.

Additional verification after the full invocation:

- The newly registered installed CodeBlock/Markdown offline suite passed in 52.78
  seconds, including a fresh private installation copy (9.77 seconds). Both real
  browser suites completed with zero external asset requests.
- The latest table/PR changes passed 22 existing Node tests and full type checking.
  Two direct installed-package desktop scenarios passed in 23.84 seconds: table
  title and Markdown description select/save, closing and reopening the description
  for locate/edit, and PR title select/save, switching PRs, returning to the original
  snapshot for edit, and explicit submission with exact original quotes and source
  identities. Saving and browsing emitted no events. These probes reused tracked
  fixtures and interaction helpers; their temporary driver was removed.
- The installed `panel check-annotations` CLI returned the expected structured
  result from an external cwd. This was an execution/shape check, not an assertion
  that every advisory finding should be fixed.
- The release scheduling/timing regression tests passed 7/7 after registration.
- Both existing real-GitHub read-only suites passed against `cli/cli` PR #14768:
  CLI/API snapshots and real Chrome detail, fixed-object diff and check observations.
  `npm run test:release -- --phase=live` took 57 seconds including its build and
  cleanup; it did not publish reviews, comments or other GitHub changes.

No product defect was confirmed by this verification. An initial sandbox attempt
could not listen on loopback (`EPERM`), which a minimal listener reproduced; the
complete successful run used an environment allowing local HTTP/WebSocket and
Chrome. Interrupting that unsupported attempt also produced `ENOTEMPTY` during
runner cleanup. Its exact cleanup race remains unconfirmed; its temporary directory
was removed after residual test processes exited. This test-infrastructure issue
was recorded without modifying the runner's cancellation behavior.

A temporary PR probe initially used an accessibility role locator for the underlying
heading while the modal annotation editor was open. DOM evidence showed the correct
original heading under an `aria-hidden=true` ancestor. The probe was corrected to
check DOM text and persisted source/event data; no product workaround was added.
Diagnostic attempts and supplemental checks are not included in the 1,904-second
full-invocation duration.
