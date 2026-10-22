# Development capability samples

Product pages and usage instructions live in the [Paneon skill](../skills/paneon/SKILL.md). Its standard pages accept input data directly: choice, form, readonly table, Markdown review and multi-repository Git review. Its concurrency and Sentinel examples demonstrate complete, interactive explanations.

The files in this directory are smaller capability samples used for development and acceptance. They are not the recommended product page catalog.

| Files                                                      | Purpose                                                  |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| `components-panel.tsx`                                     | Component-family gallery and composition checks          |
| `decision-panel.tsx`, `form-panel.tsx`, `table-panel.tsx`  | Earlier interaction and validation samples               |
| `mermaid-panel.tsx`                                        | Standalone/Markdown Mermaid rendering and error recovery |
| `release-panel.tsx`, `business.ts`, `demo-release-cli.mjs` | Simulated CLI calls; no application is deployed          |
| `http-panel.tsx`, `demo-http-server.mjs`                   | Local HTTP query/mutation and connection-error sample    |
| `gh-panel.tsx`, `github.ts`                                | Earlier readonly GitHub CLI sample                       |

The simulated CLI owns `.paneon-demo-release.json` in its working directory; the HTTP demo owns an in-memory counter. Those are sample business state, not Paneon runtime logs or monitoring. Real GitHub reads require the operator's existing gh authentication and repository access. None of these samples writes to GitHub.

For run commands, events, compatibility and authoring, use the skill's [CLI reference](../skills/paneon/references/cli.md) and [authoring reference](../skills/paneon/references/authoring.md). Standard page implementations and contracts are maintained there rather than duplicated here.
