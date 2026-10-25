## Why

面板需要用图解释流程和结构；现有 Markdown 将 mermaid 围栏显示为源码，独立 TSX 也没有可复用的图表组件。使用 Mermaid 官方库满足这两种入口，并保持官方默认外观。

## What Changes

- 从 `paneon/ui` 导出 `<Mermaid code={source} />`，可选 `className`，使用官方库生成 SVG。
- Markdown 中标为 mermaid 的围栏代码块复用相同组件；普通代码块、行内代码和 GitHub Markdown 样式保持原行为。
- Mermaid 及所需模块随包本地构建，不依赖 CDN 或网络渲染服务，不更改 iframe 网络策略。
- 使用库的默认主题、字体和布局，不覆盖 theme/themeVariables/fontFamily；处理加载、语法错误、源码更新、多个图与卸载。
- 补充可体验的示例、agent 指南和真实浏览器验收。

## Capabilities

### New Capabilities

- `mermaid-rendering`: 官方 Mermaid 渲染组件、Markdown 围栏识别、默认样式和浏览器生命周期。

### Modified Capabilities

无。现有能力尚在未归档 change 中，本 change 单独定义扩展行为，不重复创建旧 capability。

## Impact

影响 UI 组件与导出、Markdown 渲染入口、npm 依赖和 UI 构建产物、示例、指南及验收。CLI、serverAction、事件存储、服务接口不变。本期不增加缩放、导出、图形编辑、自定义主题配置或 Mermaid 点击回调。
