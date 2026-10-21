# Component provenance

Base components are vendored from the official shadcn registry's `new-york-v4` style, retrieved on 2026-10-20. `upstream.json` records the exact registry URLs and SHA-256 hashes of the downloaded JSON. The source snapshot is committed; builds and installed panels do not fetch upstream. Local changes are limited to relative import paths and project Prettier formatting. Preserve `UPSTREAM-LICENSE.md` when redistributing these sources.

`components.json` records the equivalent generator configuration: TypeScript, React client components, Lucide icons, CSS variables, and the default Neutral color. `styles.css` contains the official Neutral light/dark variables from the recorded color registry, Tailwind theme mappings, and upstream base rules. `upstream-tailwind.css` comes from the fixed `shadcn@4.22.1` package (the recorded hash describes the upstream bytes before formatting). No Paneon palette, font, control sizing, or radius overrides are introduced.

Page, Section and Stack add only composition layout. StatusBadge re-exports Badge. Markdown uses react-markdown, remark-gfm, and the light github-markdown-css stylesheet, scoped by `markdown-body`. CodeBlock uses Shiki's JavaScript engine, GitHub Light theme, and static local grammar imports; unknown languages are plain text. All rendering dependencies are distributed locally. Package-lock pins the resolved dependency versions.

Build the public library with `vite build --config vite.ui.config.ts`. Its outputs are `dist/ui/index.js` and `dist/ui/theme.css`; the runtime includes the theme in each isolated panel, separately from the host stylesheet.

For repeatable real-browser checks, after the project dependencies and Chrome are available, run `node tests/browser/ui.mjs`. It renders the reusable `examples/components-panel.tsx` gallery plus behavior variants inside an `allow-scripts` sandbox, blocks external HTTP requests, and checks all component families. `PANEON_TEST_BROWSER_CHANNEL` can select another Playwright browser channel. `node --test tests/ui-bridge.test.ts` checks the host bridge identity boundary.
