# 场景与原理展示示例

本文件聚合 PR 与两个原理展示的现行边界，替代原 design.md 中已过时的示例参数和反馈类型抄录。当前入口是 github-pr、dining-philosophers 和 sentinel-leap-array；旧 examples/gh-panel.tsx 与 assets/examples/concurrency 已不存在，不能继续作为实施或启动路径。

## GitHub PR 工作台

PR 是可复制修改的真实 gh 集成示例，放在 [assets/examples/github-pr](../../../skills/paneon/assets/examples/github-pr/panel.tsx)，不是 runtime 内置业务。输入显式 repository（owner/repo）和可选正整数 initialPullRequest；省略编号先显示 open 列表，不从本地分支猜 PR。依赖本机 gh 与已有可用认证，不在界面收 token。

列表、详情、描述、文件和检查由示例自己的 serverAction 直接读取，浏览/刷新不要求 AI 执行每次查询。列表每次提高 gh pr list --limit 上限，按 number 去重；这是可变列表的增长获取上限，不是游标或完整固定快照。

代码来源使用固定 base/head 与 merge-base，读取对应版本的树/blob 后生成 diff，不能给实时 gh pr diff 输出附上另一次查询的 OID 就称固定版本。API 返回覆盖范围和读取失败必须可见，不能把省略文件/patch 当成无改动；字段、覆盖限制和可执行样例由 [PR 使用参考](../../../skills/paneon/references/github-pr.md) 与 [schema.ts](../../../skills/paneon/assets/examples/github-pr/schema.ts) 维护。

PR 概览/描述/检查/代码有不同来源身份；描述或检查可能在 head 不变时改变。浏览器保留人当时看到的固定版本详情、比较与原文，切换 PR 或刷新不改旧批注。action 使用请求内读者及输入证据，不依赖上一执行进程的 session/snapshot Map；当前数据归属见 [资源生命周期设计](../add-panel-resource-lifecycle/design.md#内置-pr-示例)。校验内部 hash/quote 一致性不等于独立认证 GitHub 来源真实性。

“请 AI 审阅此 PR”明确保存 review-requested，仅含 repository、number、baseCommit、headCommit，不隐式发送批注草稿。具体意见使用公共 annotations 和仅被引用的 sources，经明确提交保存 pr-feedback-submitted；来源包含实际 PR、内容种类、版本和相关原文证据。默认使用普通文字划选与临时编辑器，没有对象选择模式切换。

PR 仅向当前 AI 交付意见，不向 GitHub 发布评论/review，不提供 approve、merge、close、push 或触发 CI。浏览与编辑不发事件，也不自动唤醒结束的 agent。提交失败保留草稿；本示例允许再次明确提交完整当前意见，保留历史及批注 ID，但不采用标准页 replacesEventId 协议。原文与草稿不承诺整页刷新或服务重启后恢复，事件/HTTP 上限仍适用。

## 哲学家就餐

当前并发讲解是 [assets/examples/dining-philosophers](../../../skills/paneon/assets/examples/dining-philosophers/panel.tsx)，已替代初版“4 个固定时长任务 + 并发数”的排队示例。B32 保留一次性、源码自带主题/数据、可改写的讲解定位；旧任务时长、专用并发参数及 SimulationFeedback 事件不再作为现行要求。

五位哲学家共享五把叉子，比较先取左叉、持有全局餐桌锁的串行方式，以及按叉子编号顺序获取。一步只尝试一个显示的源码行；成功才前移，失败停在该行并等待资源，不把获取、释放或离席合并成隐藏动作。资源归属、等待和死锁从同一个状态模型导出。

播放/暂停、前后步、时间线定位、重置及策略切换只在页面内进行；预览/阻塞/死锁箭头指向请求的叉子，持有关系与进入餐桌许可分别表示。切换策略重新开始，页面支持查看每位哲学家的程序位置和已持资源。

它是确定性本地教学模型，不运行 OS 线程或预测真实性能；资源排序避免环路不自动证明无饥饿。页面不接收业务 JSON、不提供批注控件、不发事件。agent 可直接运行或复制完整源码改为其他原理讲解，不能将其描述为调度服务。详细行为与来源在 [examples 使用参考](../../../skills/paneon/references/examples.md#dining-philosophers) 维护。

## Sentinel LeapArray

当前入口为 [assets/examples/sentinel-leap-array](../../../skills/paneon/assets/examples/sentinel-leap-array/panel.tsx)。固定公开源码版本、所依据的 LeapArray/WindowWrap/MetricBucket/ArrayMetric/DefaultController/StatisticNode 及交互参数由 [examples 使用参考](../../../skills/paneon/references/examples.md#sentinel-leaparray) 维护；本次只核对仓库现有模型和文档，不重新声称已执行 Java 或线上性能验证。

主题、场景和初始数据写在源码内，用户可在页内调整 QPS、统计窗口、槽数和请求到达场景。应用并重启后生成确定性请求 trace；同时间请求按顺序独立处理，时间轴、桶状态、PASS/BLOCK 和决策都读取同一份 trace。拖动时间线只是查看历史，不代表真实时钟回退或重新发送请求。

模型说明桶近似统计，不冒充精确事件时间滑窗。它不执行 Java，不验证锁/CAS 竞争，不模拟占用借用、warm-up 或真实限流性能。页面无外部业务操作、业务 JSON 或浏览事件；需要反馈时由人与 agent 对话，不能恢复旧 SimulationFeedback 假设。

工程验证与用户亲自体验分开：已有模型和浏览器验收记录不等于用户已体验 Sentinel。tasks.md 的 3.5 继续保留，直到有实际体验依据。
