## MODIFIED Requirements

### Requirement: Display code as read-only local content

系统 SHALL 提供接受 code 字符串及可选 language 的 CodeBlock，保留空格和换行，支持等宽字体、默认长行换行、通过内置换行控制切换到长行横向滚动，以及 javascript/js、typescript/ts、jsx、tsx、json、bash/sh、yaml/yml、diff 高亮。高亮引擎、语言语法与主题 SHALL 打包为本地依赖及资源，不依赖运行时 CDN 或外网加载。未指定或不支持的语言 SHALL 使用明确的纯文本模式。

CodeBlock MUST NOT 将内容当作 HTML、脚本或命令执行，也 MUST NOT 承担终端、编辑器或业务日志采集职责。

#### Scenario: Render code without interpreting it

- **WHEN** 作者传入包含换行、缩进、HTML 标签文本和命令片段的字符串
- **THEN** CodeBlock 保留文本格式，默认换行且可通过控制切换为横向滚动，不创建该字符串表示的 HTML 元素，不执行脚本或命令

#### Scenario: Highlight bundled languages without a network service

- **WHEN** 从已安装的 Paneon 包打开面板并请求支持语言的高亮，禁止访问外网
- **THEN** 本地高亮能力和主题正常工作，不向 CDN 请求语言资源；未指定或不支持的语言按纯文本模式显示
