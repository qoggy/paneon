# Paneon

[![Node.js 24](https://img.shields.io/badge/Node.js-24-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org/en/download)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**English** | [简体中文](README.zh-CN.md)

**Turn AI answers into pages you can explore.**

Paneon lets your agent build interactive pages on your machine. Explore an explanation, inspect data, or review code, then send your choices and annotations back to the conversation.

> Use Paneon to explain the dining philosophers problem

![Watching a deadlock develop step by step with the left-fork-first strategy](docs/readme/interactive-explanation.gif)

Watch each philosopher take a fork, then see why everyone gets stuck.

## Why not just a web page?

Your agent could write a one-off HTML page. With Paneon:

- **Your feedback reaches the agent.** Answers, form input and annotations on a specific line go straight back to the conversation.
- **Pages take less to build.** The agent uses ready-made pages and components instead of hand-writing UI, so pages come faster, use fewer tokens and look consistent.
- **Pages work with your local files.** They can read your repositories, files and command-line tools, and are served only on your machine.

## Get started

Development preview. Requires **Node.js 24**.

```sh
git clone https://github.com/qoggy/paneon.git
cd paneon
npm ci
npm run build
npm install -g .
```

In the project where you use your agent, run:

```sh
paneon init
```

Choose your agents, such as Claude Code or Codex, to install the skill. Then ask your agent to use Paneon and open the link it gives you.

## Review code together

> Use Paneon to review this commit

Browse the changes and leave feedback directly on the code.

![Reviewing Git history, a side-by-side diff, and an annotation](docs/readme/git-review.png)

## More to try

- “Use Paneon to explain how this cache works.”
- “Use Paneon to analyze these benchmark results.”
- “Use Paneon to compare these architectures.”

Ready-made pages cover choices, forms, tables, document review, Git review and GitHub pull requests. For anything else, your agent builds a custom page.

## Feedback

Report bugs and ideas in [Issues](https://github.com/qoggy/paneon/issues). Release notes are in the [changelog](CHANGELOG.md).

## License

[MIT](LICENSE)
