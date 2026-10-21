---
name: ui-markdown-rendering
description: Read-only Markdown uses react-markdown, remark-gfm, and GitHub-style CSS
type: tech
---

# Markdown rendering

Include a read-only Markdown component in the initial iteration. Use [react-markdown](https://github.com/remarkjs/react-markdown) with remark-gfm for rendering and GitHub-flavored syntax. Use the light stylesheet from [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) for GitHub-style typography. Apply it through a markdown-body container without overriding surrounding shadcn controls. Pin dependency versions and record configuration when implementing it; do not design a Paneon-specific Markdown skin.

github-markdown-css is a community project that reproduces GitHub Markdown styles, not an official GitHub component. Keep task lists read-only; this component displays content rather than collecting user interactions.

Bundle rendering dependencies and styles with the product and load them inside the panel iframe. Treat Markdown as content, not executable JSX, scripts, or commands; do not enable raw HTML parsing by default. This requirement does not add editing, annotations, or document storage.

**Why:** Agents need a simple way to display readable explanations and documents without writing typography CSS.
**How to apply:** Export the component from paneon/ui and provide a usage example. Keep the standard community presentation rather than inventing another visual system.
