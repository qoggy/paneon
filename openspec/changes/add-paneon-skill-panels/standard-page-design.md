# 标准页面输入与交互

本文件从原 design.md 聚合选择、表单、表格和 Markdown 审阅的设计。已删除与当前 schema/使用参考重复的类型大段抄录，避免一处修改、多处漂移。字段与可运行样例分别由 [choose](../../../skills/paneon/references/choose.md)、[form](../../../skills/paneon/references/form.md)、[table](../../../skills/paneon/references/table.md)、[review](../../../skills/paneon/references/review.md) 及各页面 schema 维护。历史决定见 [decision-history.md](decision-history.md)，公共 API 见 [annotation-design.md](annotation-design.md)。

## 选择问卷

一轮问答对应一个实例，输入为 title、可选 Markdown description 和非空 questions；每题有稳定 id、title、可选 description/mode/selectedIds，以及非空 options。问题 ID 在问卷内唯一，选项 ID 在题内唯一；推荐标记不默认选中。初始选择不能重复或引用未知项，single 最多一项。

页面逐题展示，Previous/Next 允许带未完成答案自由浏览，保留所有草稿但不发事件。问卷说明初始及汇总时完整可见；选项摘要、详情和推荐标记保留。详情在宽屏侧栏或较窄视口的对话框中阅读，重复点击当前入口关闭，切换详情不改答案或发事件。

每个已选选项有自己独立的说明输入，取消选择保留说明草稿。自填输入始终可见；single 中自填和已有选项互斥，multiple 中可以并存，最多一个自填项。选中的自填内容不能全为空白；正文和说明的原始空格不改写。

最后进入独立汇总页。每行可直接返回题目，进入汇总后题目页也能直接返回汇总；未完成项带文字/图标提示。无效提交留在汇总页、保留全部草稿并显示数量，不自动跳题、不发事件。只在明确最终提交时发一份 answers-submitted，恰好覆盖所有题目。

结果为 answers 数组，每项有 questionId 和 selections；已有项为 `{kind: "option", optionId, comment}`，自填项为 `{kind: "custom", text}`。single 恰好一项，multiple 至少一项。题目顺序与选项顺序跟随输入，自填项排末尾；不返回重复的题目定义或旧 selectedIds/整题 comment。B43、B47–B50 及后续导航验收见对应 choose 专题报告。

## 信息收集表单

所有字段在同一页依次展示，最后统一提交，不逐字段分步发送。字段支持 text、textarea、number、select、radio、multiselect、checkbox、switch，具有唯一 name、label、可选说明/required/类型相符默认值；选项值在字段内唯一。

创建时校验配置、默认值及上下限。明确提交时统一校验必填、类型和范围，在对应字段显示错误并定位第一个错误，保留其他值。required 文本不能全空白，必填单选要有值、多选至少一项；数字 0 和布尔 false 都是合法值。未填可选字段省略，布尔字段默认 false 并返回该值。

form-submitted 只含按 name 组织的完整 values，不重复字段定义，不执行业务操作。只有持久化成功才显示交付；填写和校验失败不发事件，保存失败保留内容。B12/B26 的单页与统一提交边界保持。

## 只读交互表格

AI 先取得结构化数据，再通过通用 run 的 params/params-file 提供创建时快照；表格不接管 CLI/API 数据源，也不允许改写单元格。

输入必填 title、columns、rows，可选 description/pageSize。columns 仅有 key、label、可选 type（text/number/boolean，默认 text），key 非空且唯一；每行必须拥有各声明列字段，缺值用 null。值只允许字符串、有限数字、布尔或 null；number/boolean 列接受对应原生类型或 null。额外字段不展示，rows 可为空，pageSize 为 1–1000 整数、默认 20。没有 rowKey、必填业务 id、预选、format、overflow 或 detailsKey。

rowIndex 永远是实例原始 rows 的零基下标。重复内容的行仍能区分，排序、筛选和分页不重排原始数据或改变引用身份。搜索/列筛选是可见文本的不区分大小写包含匹配；number/boolean 按原生值排序，text 按展示文本，null 始终排最后，等值保留原始顺序。筛选或排序回到第一页并保留批注，空数据与无匹配结果分开呈现。

当前默认入口是表头/字符串单元格原生划选后就近批注，以及整体批注、批注目录、定位和明确提交。已移除选择模式、行/列/整页勾选；排序按钮与可选表头文字分离，划选表头不排序。旧 B19/B21 的对象 ref 校验仍保留，不表示默认 UI 继续提供多对象勾选。

目标区分 `{kind: "header", columnKey}`、row、column 和 cell。header 的 text 针对原始 columns[].label，cell 的 text 针对原始字符串值；坐标和 quote 使用 UTF-16 且不切开字素，非字符串值不伪造文字范围。行/列对象不带文字范围；header 与整列数据含义不同，同名 label 仍按 columnKey 区分。

定位表头保留筛选、排序和页码；定位隐藏单元格/行恢复原始顺序的可见页并高亮，保留草稿。跨页卸载不删除批注。默认文本自然换行，多列宽内容在表格区域滚动；不恢复旧设计对 TableCell 永不换行的假设。后续实现依据见 [表头批注报告](table-header-annotations-report.md) 和 [table 使用参考](../../../skills/paneon/references/table.md)。

table-submitted 复用 AnnotationValue<TableRef> 加可选 replacesEventId，不重复整份 rows/columns。页面 adapter 与 validateTable action 都按固定输入核对 key、rowIndex、范围和 quote；通用 runtime 只做已声明 schema 校验，不替页面读取业务原文。

## 完整 Markdown 审阅

输入只需非空标题 title 与完整 markdown，不预分段、不要求段落 ID。新文档使用新实例，阅读期间不替换该实例原文。正文、复制、链接保持正常行为；划选段落或词句后就近编辑，整体批注使用同一 document ref，不提供选择模式切换。

Markdown 的 annotationTarget 与公共 AnnotationRoot 组合，保留原渲染链的 AST 来源，注册 Text 节点到完整原 Markdown 的 UTF-16 边界映射。普通渲染位置不能当原文位置；跨强调/链接可能包含中间语法，不连续片段拆成同条目的多个 targets。重复词、转义、实体、行内/围栏代码、中文和 emoji 保留精确范围；原始 HTML 不执行，图内部及无法映射内容不伪造坐标。

review-submitted 使用 annotations，ref 为 `{kind: "document"}`；整篇省略 text，段落/词句提供原 Markdown 的 `{start,end,quote}`。结果不重复完整文档或添加独立 sources，原文已有实例快照。页面 adapter 与 validateReview 按该原文校验，具体导航由 Markdown adapter 完成。

## 草稿、提交与更正

保存批注只改变浏览器草稿；编辑、翻页、切题不发事件。未保存编辑先保存或取消才能整体提交。首次空批注不提交；没有顶层 comment，每条正文仍叫 comment。提交失败保留草稿和上一份成功回执。

标准页成功后允许修改并明确重提当前完整结果，replacesEventId 指向本页面上一份成功的同类型事件。保留未修改条目的 ID，新增条目用新 ID，删除条目不再进入新结果；更正后允许空 annotations 表示清空原意见。历史事件不覆盖，AI 已执行动作不自动撤销；不同浏览器的修订分支不自动合并。

草稿和回执只在当前浏览器页面内，不承诺整页刷新、源码 reload 或关闭后恢复。新一轮问题仍创建新实例。该更正策略属于标准页，不强制自定义页面或 PR 示例采用相同协议。
