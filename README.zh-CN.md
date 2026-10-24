# Paneon

[![Node.js 24](https://img.shields.io/badge/Node.js-24-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org/en/download)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](README.md) | **简体中文**

**让 AI 的回答变成可以动手探索的页面。**

让 Agent 使用 Paneon，它就能生成本地页面，帮你理解原理、探索数据、评审代码，再把你的反馈带回对话。

> 用 Paneon 解释哲学家就餐问题

![先拿左叉策略下，逐步演示死锁的形成过程](docs/readme/interactive-explanation.gif)

看每个人依次拿起叉子，再看为什么所有人都卡住了。

Agent 会围绕你的问题编写页面，从交互图解、模拟演示，到处理本地数据的工具。

## 开始使用

当前为开发预览版，需要 **Node.js 24**，尚未发布公共 npm 包。

在本仓库目录中运行：

```sh
npm ci
npm run build
npm install -g .
```

然后在你使用 Agent 的项目中运行：

```sh
paneon init
```

选择你的 Agent，安装 skill。之后让它使用 Paneon，打开它给你的链接即可。支持能运行本地命令的 Agent，包括 Claude Code、Codex 和 Cursor。

## 一起评审代码

> 用 Paneon 评审这次提交

浏览改动，把意见直接附在对应的代码上。

![查看 Git 历史、左右差异，并添加批注](docs/readme/git-review.png)

## 试试你自己的场景

- “用 Paneon 解释这个缓存的工作原理。”
- “用 Paneon 分析这些性能测试结果。”
- “用 Paneon 对比这几种架构。”

选择题、表单、表格和文档评审都有现成页面。Agent 也可以针对当前任务编写自定义页面。

## 许可证

[MIT](LICENSE)
