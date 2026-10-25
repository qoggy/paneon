# Mermaid Rendering Specification

## Purpose

Render reusable Mermaid diagrams and Markdown Mermaid blocks with bundled official defaults and recoverable asynchronous updates.

## Requirements

### Requirement: Render a reusable Mermaid component

系统 SHALL 从 @qoggy/paneon/ui 导出 Mermaid 组件，接受必需的 code 字符串及可选 className，使用官方 mermaid npm 库在浏览器生成可见图表。系统 MUST NOT 要求调用者手工生成 SVG、加载 CDN 或配置第三方渲染服务。

#### Scenario: Render diagrams in TSX

- **WHEN** 面板并列渲染具有合法流程图和时序图源码的 Mermaid 组件
- **THEN** 两个图各自显示独立 SVG，元素/样式 ID 不冲突，其他面板组件保持可操作

### Requirement: Render Mermaid fenced blocks in Markdown

Markdown SHALL 将语言标记为 mermaid 的围栏代码块交给同一个 Mermaid 渲染组件；普通围栏、行内代码、GFM 和禁用 raw HTML 的行为 MUST 保持不变。图表 MUST NOT 被包裹在原代码块 pre 中。

#### Scenario: Mix diagrams and code

- **WHEN** Markdown 包含两个 Mermaid 围栏、普通代码围栏、行内代码及引用/列表内的 Mermaid 围栏
- **THEN** Mermaid 块显示为图，其他内容保持原有排版，DOM 不出现 pre 内嵌图表容器

### Requirement: Preserve official defaults and bundled operation

系统 SHALL 锁定并本地打包官方 mermaid 版本，保留该版本的默认主题、字体、布局及 strict 安全行为。系统 MUST NOT 添加全局或每图主题覆盖以伪造默认样式，MUST NOT 放宽面板 iframe 网络和脚本策略来加载图表。

#### Scenario: Render in the installed runtime

- **WHEN** 面板从独立安装包在真实 sandbox iframe 中加载图表
- **THEN** 图表只使用该安装包提供的资源，普通图表不发起外部脚本或图像渲染请求，官方默认样式生效

### Requirement: Handle rendering updates and failures

组件 SHALL 处理异步加载、源码更新、错误恢复及卸载；旧渲染结果 MUST NOT 覆盖较新的源码。单个图失败 SHALL 显示局部错误，MUST NOT 阻止其他图或泄漏临时错误节点。用户输入 MUST NOT 作为脚本执行。

#### Scenario: Correct invalid source

- **WHEN** 某图源码由有效变为无效、随后改为新的有效源码
- **THEN** 错误仅出现在该图，修正后显示最新图，其他图仍正常，临时容器已清理

#### Scenario: Render while changing or unmounting

- **WHEN** 图在异步渲染期间被快速修改或卸载
- **THEN** 最终仅保留当前图与其当前源码，过期 SVG 不出现，没有未处理异常或遗留渲染节点
