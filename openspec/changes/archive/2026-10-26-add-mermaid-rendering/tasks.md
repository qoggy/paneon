## 1. UI implementation

- [x] 1.1 安装并锁定官方 Mermaid 稳定版本，使用本地打包和按需加载，记录实际版本。
- [x] 1.2 实现并导出 Mermaid 组件，保留官方默认外观，覆盖独立 ID、异步更新、错误恢复和清理。
- [x] 1.3 在 Markdown 代码块边界复用 Mermaid 组件，保留普通代码、GFM、raw HTML 禁用和合法 DOM。

## 2. Examples and regression checks

- [x] 2.1 添加 Mermaid 专用体验面板及组件展示，包含独立图、Markdown 图、多图和更新/错误恢复。
- [x] 2.2 更新英文 agent 指南、示例说明与 Markdown 项目记忆，说明两种用法及官方默认值。
- [x] 2.3 添加有意义的回归检查和浏览器验收入口，覆盖 Markdown 包装、常见图类型、多图、更新、错误恢复、非 Mermaid 内容及资源加载。

## 3. Main-agent acceptance and delivery

- [x] 3.1 主 agent 代码审查与交叉检查，运行构建、类型、相关测试、lint、格式与 OpenSpec strict 校验。
- [x] 3.2 真实运行时 iframe 浏览器验收，核对 SVG 可见、交互与错误恢复、无外部渲染依赖；独立安装包验证并记录证据。
- [x] 3.3 合入当前分支并本地 commit，确认工作区/记录和交付文件清单，清理本次 worktree，不推送。
