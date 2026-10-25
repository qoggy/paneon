# 公共选择与批注实现交付

## 状态

基于 `47f1d8d` 在分配的独立 worktree 实现任务 2.6、2.7、2.8，等待主 agent 验收。中央 design/tasks 未修改，任务未勾选；未合入、推送、发布或清理 worktree。

## 实现

- 公共类型和 `feedbackSchema(refSchema)` 单一来源位于 `src/sdk/feedback.ts`，`JsonValue` 沿用既有 shared 类型；SDK 默认、浏览器及实际服务端编译入口均导出同一能力。
- 结果只有统一 `annotations` 与可选整体 `comment`；空字符串说明表示仅选择，条目具有稳定 ID 和非空独立目标集合。schema 校验重复 ID、按 JSON 对象键归一后的重复目标、无损有限无环 JSON ref、整数 UTF-16 范围与 quote 长度。页面增加字段可用 Zod `safeExtend`；业务原文语义仍由页面/适配器校验。
- UI 导出 `FeedbackProvider`、`FeedbackTarget`、`FeedbackText`、`FeedbackControls`、`useFeedback` 及相关类型。Provider 无可见包装，不生成固定页头或侧栏；默认控件采用既有 Button/Label/Textarea。
- 支持浏览/选择模式、多对象同条目、多条意见、编辑、删除与整体意见。切换模式和编辑不会发事件或清空草稿。
- 明确提交同步上锁，复制并深冻结快照，依次完成结构和目标校验后调用作者 `onSubmit`。校验/发送期间禁修改与重复提交；失败保留原草稿并恢复编辑。组件不产生修订字段，不默认清空或锁定成功后的草稿；回执和成功提示由页面控制。
- `FeedbackTarget asChild` 保留原元素，包括合法 table row；嵌套目标以最内层为准，按钮、链接、输入和复制不被抢占，选文字不同时选整块。
- 普通 `FeedbackText` 自动登记 DOM Text 到原文的直接映射。选区按原文 UTF-16 坐标及完整字素归一，quote 取准确的 `source.slice`，重复词不靠搜索定位。
- `registerText` 校验映射数组长度、单调整数位置和边界，支持 null 不可映射边界，返回幂等注销函数；DOM 卸载不删除草稿。
- 一个 registration 表示一段连续的原文投影，可以包含多个格式化 DOM Text 节点；选区包含中间源码标记。非连续区域用独立 registration，保持同条目多个 target。跨节点拆分一个字素时合并归一后的重叠范围，避免重复目标。
- 静态目标依据已挂载注册与保留原文校验；未挂载目标需要 adapter。即使选中 quote 未变，只要完整原文改变也不会静默改挂；定位/提交失败指出条目和目标，保留草稿。
- adapter 可异步解析原始快照；过时 resolve 不再发起 locate，过时完成不应用公共高亮。高亮只使用与解析结果原文一致的 DOM 注册，旧快照不会高亮到同 ref 新原文上。

## 必要的签名与入口补全

已向主 agent 发消息说明两处事实：

- `editAnnotation` 兼容扩展为 `string | null`。null 表示结束当前编辑、保留已完成条目，使下一次选择生成独立条目。定稿中的仅 string 签名没有结束编辑操作；删除原条目或创建非法空 targets 均不符合既有契约。原 string 调用保持兼容，中央设计签名由主 agent 验收时同步。
- 编译器把服务端 `paneon/sdk` 直接重定向 `dist/sdk/server.js`。因此除 index/client 外，还必须在 `src/sdk/server.ts` 补相同导出。真实 TSX 的 `events: feedbackSchema(...)` 已复现仅 index 导出时的 `MISSING_EXPORT`；未改 compiler 源码。

`tsconfig.ui.json` 改为 `rootDir: src`、`outDir: dist`，UI 声明仍输出 `dist/ui`，可以引用唯一 SDK 类型；未复制两份类型或依赖旧 dist 绕过构建。

## 实际验证

- `npm run build` 通过：包含全部四份 typecheck 配置、CLI 编译、UI bundle/声明和 web build。
- `node --test tests/feedback*.test.ts`：8 个测试通过，覆盖结构/JSON/重复/范围、schema 组合、SDK 导出一致性、稳定 ID、非法更新原子性、取消最后目标、不可变状态/提交快照、disabled、同步锁定、重复调用、失败保留和映射注册校验。
- 改动的 SDK/UI TypeScript 与专属单测定向 ESLint：0 error、0 warning。
- 改动的源码、测试、配置和报告定向 Prettier 检查通过；TSX txt fixture 用 `--stdin-filepath feedback-fixture.tsx` 格式化。
- `node tests/browser/feedback.mjs`：真实自定义 TSX 经 Paneon 源码运行时编译，在宿主 Chrome 通过。覆盖多选、两条意见、空说明、编辑删除、嵌套/table row、普通控件、浏览/选择模式复制、物理鼠标拖选、中文重复词、emoji/ZWJ/组合字素、跨节点源码映射、不连续区域、跨节点字素、注册注销/重挂、失效阻止、旧快照高亮保护、异步定位竞争、失败保留、双提交/修改尝试、明确提交及真实 CLI events/ack；没有浏览器 pageerror。
- `node tests/browser/feedback-pack.mjs`：最新 build 打出 npm 包并安装到临时独立目录，无源码符号链接；验证安装后的 SDK 默认/浏览器导出和 UI 入口，再用安装产物的 runtime/CLI 跑同一浏览器回归。读取到唯一一次明确提交事件，并成功 ack。
- `git diff --check` 通过。

安装包 UI 在浏览器中验证。裸 Node 直接执行整个既有 UI bundle 会触发浏览器依赖对 document 的使用；包检查在 Node 解析 UI 入口，在真实浏览器验证其实际导出，不引入此次范围外的 SSR 改造。

## 边界

- 本组实现公共对象/普通文本与显式 DOM 原文映射，不实现 table、Git/diff、Markdown、PR 的业务快照适配器，也不强制标准页的修订策略。
- 原文有效性在定位/提交时检查；控制器没有另设响应式的逐目标状态列表。adapter 返回权威的 ready/missing/stale 结果。
- adapter 自己发起的异步查询及状态更新仍需在其内部按请求标识防止过时结果落地。Provider 保护 resolve 到 locate 的发起及其后高亮，但现有 `locate(target)` 签名无法撤销作者回调已产生的副作用。
- 浏览器验证使用宿主 Chrome，未测 Firefox/Safari；不提供刷新后的未提交草稿恢复。
- 未并发运行全项目大套回归。HTTP 字节/事件字符边界修复属于 input 工作单元，此报告不声称已交付该部分。

## 文件清单

- `src/sdk/feedback.ts`
- `src/sdk/index.ts`
- `src/sdk/client.ts`
- `src/sdk/server.ts`
- `src/ui/feedback-types.ts`
- `src/ui/feedback-context.ts`
- `src/ui/feedback-store.ts`
- `src/ui/feedback-selection.ts`
- `src/ui/feedback-provider.tsx`
- `src/ui/feedback.tsx`
- `src/ui/index.ts`
- `tsconfig.ui.json`
- `tests/feedback.test.ts`
- `tests/feedback-state.test.ts`
- `tests/browser/feedback-fixture.txt`
- `tests/browser/feedback-fixture.mjs`
- `tests/browser/feedback.mjs`
- `tests/browser/feedback-pack.mjs`
- `openspec/changes/add-paneon-skill-panels/reports/feedback.md`

下一步由主 agent 验收实现及 null 结束编辑的签名补全，再合入提交并按实际验收结果同步中央 design/tasks。本工作单元到此交付。
