以下记录 file-review 实施任务与验证进度。现有 CodeBlock 完整 props、批注/行号/复制/换行、Markdown 与 CodeBlock 的私有共享外壳，以及 CodeText 死分支清理已完成，不在本 change 重复开发或勾选完成任务。

## 1. 文件清单与快照契约

- [x] 1.1 分别定义严格的 file-review 输入 `{title?, files: string[]}`、内部 `{fileIndex, snapshotId}` target/验证证据，以及公开 `files[].annotations` 和完整修正事件 schema；验证空数组、空白值、对象或其他非字符串项、顶层额外字段、重复实际路径及越界索引，保留合法路径原始字符，不接受展示别名，不把内部 id/ref/fileIndex 或分离 sources 输出给 Agent。
- [x] 1.2 实现按清单项读取的 serverAction，复用必要的有界 UTF-8 读取逻辑并保留现有链接读取行为；验证绝对/相对路径、特殊文件名、空文件、不可读/不存在/非普通文件、无效文本及 1 MiB 边界。
- [x] 1.3 生成由解析后绝对路径和精确原文确定的快照身份，完成显式证据驱动的提交校验；验证来源去重、篡改范围/引用和无前次 worker 状态的请求，不在提交时重读磁盘。

## 2. 接入现有组件与页面批注会话

- [x] 2.1 配置持续挂载的页面批注会话与 adapter.resolve，使用浏览器快照校验未挂载主预览的批注；通过现有 Markdown/CodeBlock annotationTarget 接入，不修改公开 props、不新增 ref handle 或复制源文映射。
- [x] 2.2 实现 adapter.locate 的快照恢复及预览布局/注册就绪协调，由现有会话完成精确滚动和选区；验证跨文件重挂载、中文/emoji、CRLF/孤立 CR、重复文本和异步高亮前后定位，以及失效范围报错，不用固定延时或近似文本查找。
- [x] 2.3 验证 Markdown 链接文件的会话快照在入口 Markdown 卸载、代码文件预览时仍可重开与定位；确认内部 sourceRef 不被按入口 Markdown 文本校验，保留现有批注编辑器 modal 保护。

## 3. File Review 页面与导航

- [x] 3.1 创建 file-review 面板入口，复用 Tree 和共享 FileReviewSplit；实现目录优先名称排序、路径搜索、目录展开/折叠、单击/键盘打开和初始第一项预览，单文件隐藏树及分隔条。
- [x] 3.2 按实际路径选择现有 Markdown/CodeBlock：Markdown 传正确 sourcePath，统一以传入路径字符串显示文件路径栏，CodeBlock 显式传 header=false、lineNumbers=true、defaultWrap=false 及快照 annotationTarget，复用内置悬浮复制/换行，避免双重标题、边框和代码外层留白；验证 Markdown 扩展名大小写、未知语言纯文本及相对资源解析，不改变组件默认值或 Markdown 内容渲染。
- [x] 3.3 实现按需读取、浏览器快照缓存、文件级错误/空态和请求结果归属；验证快速切换晚到响应、切走再返回以及读取后修改/删除文件，不同时挂载全部文件预览。
- [x] 3.4 接入共享批注草稿与导航：跨文件保留已保存反馈，主预览定位时清除阻挡搜索、展开祖先并恢复快照；编辑期间要求显式保存/取消后再切换，保留输入且不自动保存或提交。

## 4. 提交与修正验收

- [x] 4.1 连接 `file-review-submitted` 与现有 submission/receipt 机制，验证后将内部草稿转换成按文件嵌套的公开反馈；每个文件快照只输出一份元数据，无展示别名、批注 id/fileIndex/ref/sourceRef、分离 sources 或完整原文，保留一条意见的全部 text targets；验证相对字符串路径在反馈中解析为实际绝对 path。
- [x] 4.2 覆盖混合 Markdown/代码/链接文件反馈及重复清单项；链接文件按自己的 path/snapshotId 归组，不额外输出无批注入口文档。验证初次非空、空 comment、完整修正与 `{files: [], replacesEventId}` 撤回、原文 UTF-16 坐标、磁盘变化后提交、校验/限额/保存失败保留草稿及成功回执。
- [x] 4.3 完成桌面浏览器验收：多文件/单文件、中英文、深浅主题、长行/长文档滚动、接近上限文件响应、鼠标/键盘导航与分栏取消；确认导航/缩放不隐式提交，调整分栏不触发读取。

## 5. 入口替换与交付验证

- [x] 5.1 更新产品 Skill 入口表及 `references/file-review.md` 的用途、输入、按文件嵌套结果、链接文件来源和修正说明，删除旧 review 入口和 reference，更新相关 fixtures、测试；保持公开 CodeBlock authoring 契约不变，不向 Agent 介绍私有组合零件、内部引用或面板布局规格。
- [x] 5.2 在英文 changelog 记录入口、输入及事件的 BREAKING 迁移，保留历史事件格式，不增加旧入口别名或自动迁移实例，不在该任务里执行发布。
- [x] 5.3 运行相关单元/浏览器测试、类型检查、构建、格式检查和 Skill 校验；回归现有 CodeBlock、Markdown 链接预览、Diff review 和 Git review，确认读取复用与面板接入不改变其行为。
- [x] 5.4 验证打包后的完整 Skill 在仓库外通过已安装 SDK/UI 运行 file-review，确认入口、相对 cwd、跨文件批注和事件可读；记录结果后再申请后续归档，不提前勾选未验证任务。

## 6. 文件导航与 Diff Review 对齐

- [x] 6.1 补齐目录/平铺切换、随搜索更新的目录计数、平铺父路径提示和分组/展开/折叠三项工具栏；保留单击打开、目录展开、选中项、当前预览、快照与批注；删除独立查看按钮及其专用焦点逻辑，不引入选中但未打开状态。
- [x] 6.2 验证上述导航切换与批注定位、读取次数、事件和单击打开行为，运行相关单元/浏览器与类型检查，更新 panel 55 实际效果，并通过新增 panel 56 验证深层 Java 文件的连续目录一行展示，记录验收结果。

## 7. 文件路径文字批注

- [x] 7.1 用现有 AnnotationText 接入路径栏选区批注；内部区分路径与正文，保留精确坐标、跨文件定位及快照归组；对外仅新增 `{path: {quote}}` target，正文及其余提交结构不变，不增加 pathText 或 displayPath。
- [x] 7.2 同步契约和 reference，验证路径与正文混合提交、原始路径校验、跨文件定位、修正和撤回；更新现有验收页面并记录结果。
