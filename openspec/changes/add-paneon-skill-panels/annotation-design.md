# 公共批注设计

## 当前 API 与职责

本节替代原 design.md 中的 FeedbackProvider/FeedbackTarget/FeedbackControls/useFeedback 草案。当前不保留旧名别名；这些旧标识只会出现在历史交付记录中。中文统一称“批注”，英文为 annotation。

- paneon/sdk 导出 AnnotationValue、Annotation、AnnotationTarget、AnnotationTextRange 和 annotationValueSchema。数据结构为 `{annotations: [{id, targets, comment}]}`；正文仍叫 comment，不是 annotation 字段，也没有顶层 comment。
- paneon/ui 导出 AnnotationRoot、AnnotationText、AnnotationMenu、AnnotationSubmitButton 和 useAnnotations；适配器类型为 AnnotationAdapter。
- AnnotationRoot 接收 onSubmit、可选 adapter/disabled，不强加固定页头、侧栏或整页布局；AnnotationText 的正文通过 children 传入。AnnotationTarget 是 SDK 数据类型，不是 UI 组件。
- 完整接入方法只在 [annotations 使用参考](../../../skills/paneon/references/annotations.md) 维护，类型依据为 [SDK](../../../src/sdk/annotation.ts)、[UI 类型](../../../src/ui/annotation-types.ts) 和 [公共导出](../../../src/ui/index.ts)。

## 浏览与编辑

正常浏览中划选已注册文字，再通过附近的批注入口打开临时编辑器。保存只更新浏览器内草稿；取消或 Escape 不覆盖已保存条目；删除移除该条目及对应标记。普通按钮、链接、表单、复制行为保持各自含义。

当前公共 API 没有 browse/select 模式切换或通用对象选择按钮。页面仍可通过自己的语义目标调用 createAnnotation；既有对象 ref 和空 comment 能力不因此删除。表格的默认行/列/整页勾选已移除，保留文字批注、整体批注、目录、定位和明确提交。

每条批注拥有稳定 id、非空 targets 和字符串 comment，空 comment 表示只标记目标。独立意见独立保存；添加、清空正文或编辑不改变 id，也不生成第二份 selected 结果。未保存的编辑缓冲阻止整体提交，不隐式保存或丢弃。成功提示必须等待实际提交完成，失败保留草稿。

## 语义目标与原文

AnnotationTarget 是 `{ref, text?}`。ref 是页面定义的有限 JSON；整对象省略 text，文字范围为 `{start, end, quote}`，坐标按原始字符串 UTF-16 计。DOM、CSS 选择器或点击坐标不能代替业务身份。

适配器负责 resolve/locate，以及必要的 targetRanges；普通 AnnotationText 使用登记的原文。Markdown/diff 使用明确的 DOM 边界到原文映射，不按首个同名词搜索猜位置。sourceOffsets 长度为 Text 节点长度加一，不可映射边界为 null；跨格式、中文、emoji、CRLF、重复词和跨节点需保留真实 quote 与字素边界。

排序、过滤、翻页及组件卸载不改变已存目标。locate 恢复对应来源/视图/页码后定位；匹配原文缺失时返回 missing/stale 并保留草稿，不将旧偏移套用新内容。异步旧响应不能覆盖当前视图。Git/PR 的版本不是源码 revision；浏览器持有所见业务原文，后台完整校验当次提交，不依赖旧执行进程 Map。

## 结构校验、提交与存储

annotationValueSchema(refSchema) 负责公共结构、JSON 有限性、ID 唯一、非空目标、范围及 comment 类型，不知道 Git 或业务 ref 的真实原文。页面自己的适配器/serverAction 负责来源、版本、quote 和坐标一致性；不能重新查询最新数据替换所见快照。这不是业务语义校验与 SQLite 写入合并的外部事务。

Root 冻结提交快照并锁定重复提交；页面 onSubmit 负责语义校验后 agent.emit，事件继续由 definePanel.events 声明，再由已有 events/ack 读取和确认。不新增批注数据库、统一事件名、自动唤醒或公共业务执行器。

草稿保存在浏览器内，不保证刷新、reload 或关闭后恢复。公共组件不强制提交后锁定、清空或更正策略；标准页面按 B34 明确提交完整修正版并关联 replacesEventId，保留此前事件。首次空反馈不提交；标准页修正后允许空 annotations 表示撤回原意见。

HTTP 完整请求上限为 262144 UTF-8 字节，事件 payload 的 JSON.stringify 长度上限仍为 65536 UTF-16 code units；页面预检与服务端权威限制都保留，不截断文本或自动拆分事件。
