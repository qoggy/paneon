---
name: architecture-file-access
description: Reuse serverAction for local file and image reads instead of adding component-specific runtime endpoints
type: tech
---

# Local file access through serverAction

本地文件与图片读取复用现有 `serverAction` 机制，不为 Markdown 图片展示新增专用 runtime HTTP 接口。组件需要访问本地资源时，优先考虑通过可复用的 action 实现；只有确有通用技术需求、现有机制不能满足时，再单独评估 runtime 接口。

Markdown 本地图片使用普通图片语法，不要求 Agent 为每次展示图片编写图片 `import`、自定义图片渲染器、读取 `serverAction` 或注册代码。公开的 `Image` 组件负责图片读取、加载状态和查看器；Markdown 默认图片渲染复用同一实现。图片 action 在 Image 模块声明，文本文件 action 在 Markdown 模块声明，均不通过公共 `paneon/ui` barrel 暴露。

组件库构建复用现有 action 提取器，分离浏览器代理与 Node handler，输出由包元数据 `paneon.componentActions` 定位的版本化清单。Panel 编译器把最终保留的组件 action 合入现有 action 表，并将相关产物纳入 revision 与缓存依据。这个机制不识别 Markdown 等具体组件名称，也不修改 runtime 的 action 执行机制。

已确认的路径规则：

- 相对路径且没有 `sourcePath`：相对 panel 的 `--cwd`。
- 相对路径且有 `sourcePath`：相对该 Markdown 文件所在目录。
- 绝对路径：直接使用该路径。

原 `POST /api/panels/:instanceId/file` 专用路由已移除，Markdown 文件读取通过自己的 action 完成。服务端的变更仅删除该路由，不为组件新增专用接口或修改执行机制。

现有 action 返回值要求 JSON 可序列化，图片可以用 Base64/Data URL 返回。无需为此新增图片专用接口；若后续实际需求证明需要二进制传输，应先评估通用 action 返回能力。

**Why:** 读取文件可以通过现有通用调用机制以少量代码完成，避免不同组件持续要求 runtime 增加针对性接口。
**How to apply:** 设计本地资源访问时先检查 `serverAction` 是否能承载。组件声明自己的 action，并复用通用的构建、注册机制；不要要求使用组件的 Agent 编写读取接入，也不要为每个组件增加专用 runtime 接口或编译器分支。
