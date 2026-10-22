# 一次性交互讲解示例

这两个页面把标题、主题、固定数据和初始值写在源码里。可直接运行，也可复制整个示例目录并修改源码，为当前对话写新的解释。它们没有专用业务 JSON 入参，不注册 builtin。

`<skill-directory>` 是完整 Paneon skill 的实际路径；CLI 和 skill 应来自相同版本。运行后把 CLI 返回的 URL 交给用户。

```bash
paneon panel run <skill-directory>/assets/examples/concurrency/panel.tsx --cwd /work/project --params '{}'
paneon panel run <skill-directory>/assets/examples/sentinel-leap-array/panel.tsx --cwd /work/project --params '{}'
```

## 并发与排队

任务 A/B/C/D 分别耗时 4/2/3/1 秒，同在虚拟 t=0 按顺序入队。FIFO、非抢占；同一时刻先释放全部完成任务，再依序启动新任务。串行和当前并发使用相同的 0–10 秒刻度，并展示等待、开始、结束和整批时间。并发 1/2/3/4 的整批耗时分别为 10/5/4/4 秒。

在输入框切换并发会重新排程、暂停并回到 0 秒；播放、暂停、前进 1 秒和重播只改变页面本地状态。固定时长和无资源争用是模型前提，不代表真实提速预测。

用户可以通过公共选择/评论控件提交 `explanation-feedback`：

```ts
type SimulationRef =
  | { kind: 'task'; taskId: string; concurrency: number; atMs: number }
  | { kind: 'summary'; concurrency: number };
// payload: Feedback<SimulationRef>，只有 annotations 和可选整体 comment。
```

目标保存选择时的并发与时间。定位旧目标会回看其情境；文字目标对应示例生成的原始字符串。空评论表示纯选择，不另建 selected 列表。显式点击「提交评论」才发事件；浏览与草稿编辑不发事件。不强制标准页的 replacesEventId 策略，不自动唤醒已结束的 agent。

```bash
paneon panel events <instance-id> --consumer explanation-agent --wait-ms 0
paneon panel ack <instance-id> --consumer explanation-agent --through <event-id>
```

## Sentinel LeapArray

权威来源固定为 [alibaba/Sentinel commit a3f40ba8e900c8489bd520274739f17235a7721c](https://github.com/alibaba/Sentinel/tree/a3f40ba8e900c8489bd520274739f17235a7721c)。页面包含这些实现的固定版本链接：

- [LeapArray](https://github.com/alibaba/Sentinel/blob/a3f40ba8e900c8489bd520274739f17235a7721c/sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/base/LeapArray.java)：映射、currentWindow 分支、values、过期判断。
- [WindowWrap](https://github.com/alibaba/Sentinel/blob/a3f40ba8e900c8489bd520274739f17235a7721c/sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/base/WindowWrap.java)：左闭右开的桶区间。
- [BucketLeapArray](https://github.com/alibaba/Sentinel/blob/a3f40ba8e900c8489bd520274739f17235a7721c/sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/metric/BucketLeapArray.java)：更新时间并清零指标。
- [MetricBucket](https://github.com/alibaba/Sentinel/blob/a3f40ba8e900c8489bd520274739f17235a7721c/sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/data/MetricBucket.java)：PASS 计数和 reset。
- [ArrayMetric](https://github.com/alibaba/Sentinel/blob/a3f40ba8e900c8489bd520274739f17235a7721c/sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/metric/ArrayMetric.java)：统计入口先访问 currentWindow，再聚合 values；默认构造器使用可预占实现，本例明确只模拟 BucketLeapArray。

固定为 4 个槽位、2000ms 总区间、500ms 桶。逐步演示与自由探索可以观察：同窗复用、跨窗新建、跳窗不补建、整轮后单槽重置。时间变化与访问操作分开：只读 values 过滤有效桶但不修改数组，过期桶仍在存储中。判定是 `time - start > interval`，相等时仍有效；它不是保存每条样本时间戳的精确滑窗。回拨分支返回独立新桶而不写回；values 没有排除未来桶的附加条件。负时间的 currentWindow 返回 null、values 返回空列表。

这是普通 TypeScript 教学模型，不执行 Java，不验证锁/CAS 竞争或真实性能，也不涵盖可预占桶扩展。页面不执行外部业务，不发送浏览事件。用户体验和后续问题由主 agent 验收；不要把自动化检查写成用户已体验。

并发示例使用同一公共评论交互：正常划选文字后点附近「评论」，或在紧凑工具栏点「选择对象」选择任务/整批耗时；「保存」只保留页面草稿，编号可重新打开、取消修改、保存或删除。「提交评论」发送整份结果；未保存编辑须先保存或取消，不再提供独立的选择和评论区块。
