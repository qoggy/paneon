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

Browser and package phases default to two concurrent processes. Use `--jobs=1`
to diagnose a failure serially; the allowed range is 1–6. Node tests retain their
existing six-process limit. Phases run in order, with one shared build.

Each command gets its own HOME, temporary directory, screenshots and captured
output. Clipboard users and overlapping legacy screenshot paths are serialized,
including fixture imports and package wrappers. Declare dynamically selected
child suites in the runner's resource detection when they use shared resources.
Logs print when each command finishes, followed by individual durations, exit
codes and total wall time. A failed suite remains a failure; other suites can finish. Interruption
stops admission, terminates active process groups and runs cleanup.

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

The full Git layout suite runs through `git-review`, so the release runner omits
its duplicate standalone invocation when both are selected. A targeted layout
run still works, and the separate history/annotation assertions remain enabled.

Temporary homes, fixtures, installations, caches and logs are removed after each
run. Previous dist output and pre-existing fixed screenshot paths are restored.
No tests publish packages, commit or push repository changes.
