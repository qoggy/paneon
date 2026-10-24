# Paneon

[![Node.js 24](https://img.shields.io/badge/Node.js-24-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org/en/download)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**English** | [简体中文](README.zh-CN.md)

**Turn AI answers into pages you can explore.**

Ask your agent to use Paneon. It creates a local page where you can explore an explanation, inspect data, or review code—and bring your feedback back to the conversation.

> Use Paneon to explain the dining philosophers problem

![Watching a deadlock develop step by step with the left-fork-first strategy](docs/readme/interactive-explanation.gif)

Watch each philosopher take a fork, then see why everyone gets stuck.

Your agent builds the page around your question, from interactive diagrams and simulations to tools for working with local data.

## Get started

Development preview. Requires **Node.js 24**; a public npm release is not available yet.

From a checkout of this repository:

```sh
npm ci
npm run build
npm install -g .
```

In the project where you use your agent, run:

```sh
paneon init
```

Choose your agent to install the skill. Then ask it to use Paneon and open the link it gives you. Works with agents that can run local commands, including Claude Code, Codex, and Cursor.

## Review code together

> Use Paneon to review this commit

Browse the changes and leave feedback directly on the code.

![Reviewing Git history, a side-by-side diff, and an annotation](docs/readme/git-review.png)

## Try it with your own work

- “Use Paneon to explain how this cache works.”
- “Use Paneon to analyze these benchmark results.”
- “Use Paneon to compare these architectures.”

Choices, forms, tables, and document review have ready-made pages. Your agent can also build a custom page for the task.

## License

[MIT](LICENSE)
