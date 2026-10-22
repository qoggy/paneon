# Contextual comments — B44

用户提供六张交互参考图，明确将用户界面的“批注”统一称为“评论”，移除 Git 页底部“选择与批注”区块，顶部操作栏放“提交评论”。文字划选后在附近出现“评论”气泡；点击后原位打开输入框；保存后在内容旁显示编号；点击编号编辑，支持取消修改、保存和删除。该交互由公共组件实现，标准页、示例及自定义页复用。此修正已交付并通过源码及最终独立安装包验收，主 agent 记录见 verification.md。

按钮文案已由用户确认统一为“提交评论”，含义为将当前面板累积的整份评论提交给 AI；不执行 Git commit 或发布 GitHub 评论。

## Scope and terminology

- 界面、可访问名称、agent 使用说明统一为中文“评论”或英文 comment。用户图片里的“注释”按钮按本次明确名称显示“评论”。不添加图片中的语音、侧边聊天或其他无关功能。
- SDK 内部及已发事件仍使用 Feedback、annotations、targets、comment、稳定 id 和原文坐标。仅改变交互和对外称呼，不改事件协议、数据库、Git 查询或业务接口。
- 已选内容无评论仍按 comment: '' 保存，与有评论同结构。保留跨仓库、视图、分页、PR 的原快照引用，以及明确提交、失败草稿、完整更正/replacesEventId。

## Interaction contract

1. 正常浏览即可划选已登记文字，无需先找全局模式按钮。仅对合法已登记目标显示气泡；这时不创建评论、不改变已保存草稿、不发事件，也不妨碍正常复制或链接/按钮操作。
2. 点击“评论”才开启临时编辑器，选择范围在点击和聚焦后仍被正确记住。新评论保存才进入页面草稿；取消/Escape 退出新编辑器，不增加空条目或残留编号。允许保存空字符串表达仅选择。
3. 编辑已有评论时，输入框使用独立临时缓冲；保存更新同一 id；取消/Escape 丢弃本次输入并恢复原文；删除移除该评论和对应标记。点击编号不会自动发事件。
4. 每条已保存草稿在对应内容附近有可点击编号。编号在同一页面会话中与评论 id 稳定对应，删除一条不把其他编号改挂；编号只用于 UI，不增加事件字段。多目标评论共用一个编号，可在各已挂载目标附近显示。目标未挂载时保留评论，恢复原视图后标记恢复；不得把旧坐标贴到新快照。
5. 编号/高亮/气泡随 iframe 自身滚动、窗口尺寸、内容重排和目标挂载更新；紧贴对应内容，窄屏不越出可见区域。使用原登记映射定位；不得根据相同文字搜索第一个匹配，不改写/切割已登记文本节点来插入 marker，不破坏 Markdown/diff 映射或合法 table DOM。
6. 对象选择也分两阶段：点击对象只累积 pending targets，不写 annotations、不开完整编辑器；选完后通过工具栏“评论”或 Surface 小气泡打开编辑器，保存才写草稿。selectionTargets 提供 pending 勾选态；验证相邻两行、多列及窄屏，不能用 force 点击或仅固定换浮层方向掩盖遮挡。对文件、hunk、行、列、单元格及其他对象的选择能力保留。可在页面工具栏提供紧凑“选择对象”模式入口，内容文字仍无需该模式。该模式只操作显式登记对象和页面专用选择控件，支持一条评论包含多个不连续目标；普通链接、业务按钮和表单保持正常。不要恢复独立的大块“选择和评论”列表/编辑区。
7. 选择新文字默认开启新的评论，不暗中追加到正在编辑的另一条评论。追加多个对象必须通过明确的对象选择操作。点击/键盘操作评论编辑器或普通控件，不得把 locate 遗留的原生 selection 再采集成评论。
8. 编辑器的“保存”仅保存当前页面草稿；页面工具栏“提交评论”才发送一份完整结果。若有未保存编辑，阻止提交并就地提示先保存或取消，不能静默丢弃或擅自保存。提交中冻结编辑/删除/重复提交；失败保留草稿，不假报成功。外层成功后“修改反馈”沿用现有页面策略。
9. 为跨仓库/视图/分页后暂未挂载的评论提供紧凑“评论 (N)”菜单，显示同一稳定编号和摘要，复用 adapter.locate 找回各目标；菜单不常驻、不复制编辑器、不修改草稿或发事件，定位失败保留原评论并如实提示。
10. 保留整体意见的可选能力，以工具栏“整体评论”小入口打开编辑，不再常驻大文本框。页面可只使用独立提交按钮并自行安排可选入口；不强制展示整体意见。
11. 使用现有 shadcn 默认组件/样式、正常焦点顺序、键盘划选/打开/保存/取消、可访问标签。编号可用清楚的强调色；不复制截图所有尺寸，也不另建主题。

## Public UI composition shared by both implementation units

使用同一 FeedbackProvider 和登记器，无新增协议或业务任务。以下 API 从 paneon/ui 导出：

```tsx
// overlay only; render once inside provider, no layout wrapper
<FeedbackSurface />
// a button placed in the page's existing toolbar; errors/editor gating handled by shared state
<FeedbackSubmitButton />
// optional compact row: object-selection toggle, overall-comment entry, submit
<FeedbackToolbar />
```

三个组件均允许可选 className；SubmitButton 可通过 children 自定义文案，默认“提交评论”。默认工具栏的对象按钮为“选择对象”/“结束选择”，整体入口为“整体评论”。FeedbackControls 保留导出作为便捷组合（Surface + 紧凑 Toolbar），但不再输出旧大编辑区。标准页/示例使用独立 Surface + Toolbar/SubmitButton，避免重复挂载 Surface。无条件只读/禁用遵循 provider.disabled。

FeedbackAdapter 增加可选同步 targetRanges(target): readonly Range[]，只供 Surface 将已校验的语义目标映射为真实DOM几何；默认文本登记不能直接匹配时使用，公共层按嵌套滚动区域剪裁。不修改source引用/quote/事件字段，不按文字搜索；Git/PR复用现有source-offset映射。

原有 useFeedback、FeedbackTarget/Text 及原文登记 API 保持可用；公共组可增加内部 UI 状态或辅助方法，不迫使各页复制一次编辑/编号定位逻辑。Surface 存在时，Provider 原先 mouseup/keyup 自动写入 annotations 的路径必须改为待操作选择，避免旧自动收集和新气泡重复执行。其他低层控制器行为如需更改应说明具体影响并保留意义相同的回归。

## Parallel ownership

- comment-core：src/ui/feedback*.ts(x)、src/ui/index.ts，以及必要的新 src/ui/feedback-* 模块/相关局部样式；tests/feedback.test.ts、tests/browser/feedback*.mjs/feedback-fixture.txt；skills/paneon/references/feedback.md；reports/comment-core.md。负责公共交互、正确原文 anchor/编号/取消缓冲、独立提交门控及公共自定义 TSX 验证。不要改各页面源码/适配器、中央文档、依赖或 SDK 事件结构。
- comment-pages：skills/paneon/assets/panels/{git-review,review,table}/panel.tsx；assets/examples/{github-pr,concurrency}/panel.tsx；必要的 assets/shared/{diff,markdown-feedback}.tsx UI 接入；references/{git-review,review,table,github-pr,examples}.md；必要的 SKILL.md 可见称呼；tests/browser/{git-review,table-review,github-pr,explanations}*.mjs 中实际已有且相关文件；reports/comment-pages.md。不改变查询/model/schema 或通用源映射算法；保留各页全部能力与业务边界。先按上述稳定 API 接入，公共产物就绪后在临时组合目录进行真实验证，不提交对方文件或假 stub。

两组只更新自己的交付报告，不并发改中央 design/tasks/development/spec/memory。基于当前文档提交建立两个新的独立 worktree；主 agent 后续接受/合入；不推送或发布。若发现本文件的某个文件名与实际不符，先 rg --files 查找准确现有文件，不创建平行替代文件。

## Acceptance

公共 Chrome 必须实际验证：正常划选→气泡（零新增事件/条目）→编辑→取消无新增；空评论保存；编号打开；修改取消保持原文，保存保留 id，删除移除标记；多条重叠文字/多目标、中文/emoji、重复词和 Markdown 跨格式原文坐标；滚动/窄屏/重排 marker 正确；普通链接/按钮/输入/复制不被劫持；未保存编辑阻止提交；失败保留、冻结快照和 CLI events/ack。不能仅改选择器让旧测试通过，保留旧测试的语义保障。

页面 Chrome 必须覆盖 Git 未提交/history/compare、多仓库与旧快照、diff 两侧/行/块/整文件，review 文字/段落、表格跨页对象与格内文字、真实只读 PR 页面及并发讲解。确认五个页面无旧独立区块，顶部/页面自己的工具栏统一提交，已提交结果/更正历史仍能读取。保存符合参考交互的截图，主 agent 检查截图。至少一份完整 npm 包在独立安装目录通过公共交互与 Git 页面验证，实际运行相关 build/typecheck/lint/format；不访问真实写业务接口。
