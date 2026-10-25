## Context

`src/ui/markdown.tsx` 使用 react-markdown、remark-gfm 和 GitHub Markdown CSS；`src/ui/index.ts` 为统一组件入口。Vite 将 UI 构建为本地包，面板编译后由带 CSP 的 sandbox iframe 加载。图表必须在这个真实运行环境中工作，不能用 CDN 或放宽网络策略解决打包问题。

当前分支基线为 `b9c97d5`。按 distributed-development 工作：主 agent 先维护本 change 文档，子 agent 在最新提交的独立 worktree 实现，主 agent 验收、合入、提交并清理；不推送。

## Goals / Non-Goals

**Goals:**

- 官方 npm `mermaid` 库渲染；一个实现同时供 TSX 与 Markdown 使用。
- `<Mermaid code={source} className? />` 从 `paneon/ui` 导出。
- Mermaid 围栏在 Markdown 中显示为图，非 Mermaid 内容和原有 GitHub 排版不变。
- 多图、动态源码、错误恢复和卸载安全；本地打包并在 iframe 中验收。

**Non-Goals:**

本期不实现编辑器、缩放/拖动、图片导出、服务端截图、主题选择、点击回调，也不改动 CLI 或业务调用协议。

## Decisions

### 官方库及样式

安装并锁定实施时可用的官方稳定版本；记录实际版本。仅设置 React 集成所需的 `startOnLoad: false`，保留官方默认 strict 安全等级，必要时显式设置 strict；不设置 theme、themeVariables、look、fontFamily 或覆盖 SVG 图形样式。当前 Mermaid v12 的部分图默认 redux-color/neo，其余图仍为 default/classic，因此不能将 `theme: 'default'` 误当作“使用全部官方默认值”。

参考：[API 用法](https://mermaid.js.org/config/usage.html#api-usage)、[主题默认值](https://mermaid.js.org/config/theming.html#per-diagram-defaults)。不使用第三方 React Mermaid 包或远程图片服务；它们会增加样式和行为来源。

### 渲染组件

渲染仅在浏览器 effect 中触发，按需加载官方库并共享初始化；普通页面不应在初次加载时无条件运行 Mermaid。每次渲染使用不会和其他图冲突的 DOM/SVG ID，调用官方异步 render API。使用组件独立的临时容器并在成功、错误、取消后清理，避免官方错误节点留在页面 body。

防止旧异步结果在源码更新或卸载后覆盖当前状态，确保失败后能以新源码恢复。加载和错误在当前组件内展示，错误源码只作为文本处理；不使其他图或整个 Markdown 失败。输出以官方 strict 模式处理的 SVG 为限，不启用 raw HTML 解析或作者 JavaScript 回调。容器只处理布局/横向溢出，不重新设计图形皮肤。

### Markdown 接入

在 react-markdown 的代码块边界识别 language-mermaid，并渲染同一个 Mermaid 组件。处理 pre 与 code 包装，不能生成 `<pre><div>…</div></pre>` 或保留代码块背景。行内 `mermaid` 文本及其他围栏仍走原渲染器；支持同文档多图以及嵌套在列表/引用中的围栏。

### 构建与示例

复用 Vite 打包 Mermaid 所需本地模块（包括动态加载的图类型模块）；所有浏览器资源均需在面板 manifest 中可访问。仅在确有产物问题时调整 UI 构建配置，不能放宽 iframe CSP 或添加运行时 CDN。

提供专用 `examples/mermaid-panel.tsx`：同时展示独立组件、Markdown 围栏、普通代码块以及源码更新/错误恢复。更新组件示例、英文 agent 指南、示例说明和 Markdown 项目记忆，不改已有 shadcn 上游样式。

## Risks / Trade-offs

- Mermaid 完整图类型库会增加包体积 → 按需加载，检查实际构建产物与安装包，不以第三方 tiny 替代库或静默裁减图类型。
- SVG ID、共享初始化及异步渲染可能相互干扰 → 多图、快速修改、错误后恢复、卸载时仍在渲染的测试。
- HTML 标签/链接或 frontmatter 影响内容 → 保留官方 strict 安全边界，真实验证脚本不执行、原 Markdown raw HTML 禁用规则不变。
- 默认主题/字体随官方版本变化 → 锁定实际 npm 版本，沿用该版本的默认值，不人为模仿旧样式。
- 原先 sandbox 禁止联网 → 真实 iframe 和安装包验证成功，不能仅凭开发页或源码 import 成功交付。

## Migration Plan

无数据迁移或 CLI 变更。构建新 UI 包后既有面板重新构建即可使用；旧调用 Markdown 的写法不变。撤销新增组件/Markdown 分支和依赖即可回退。

## Open Questions

无需要用户补充的产品决策。版本、异步清理和打包细节由实现与验收确认并记录。
