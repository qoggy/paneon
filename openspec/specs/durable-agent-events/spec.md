# Durable Agent Events Specification

## Purpose

Persist semantic interaction events and support independent incremental reads and acknowledgements by named consumers.

## Requirements

### Requirement: Persist semantic interaction events

系统 SHALL 为 SDK 主动提交的语义操作分配单调递增 eventId，持久化 instanceId、revision、事件类型、通过校验的 payload 和时间，并在持久化完成后才向页面确认提交成功。

#### Scenario: Submit while the agent is stopped

- **WHEN** agent 已停止，用户在仍运行的面板提交选择或分析请求
- **THEN** 系统保存该事件，后续 agent 恢复时可读取，不依赖浏览器临时变量或原 agent 进程

#### Scenario: Reject an invalid event

- **WHEN** 页面提交未知类型、无效 schema 或超出限制的 payload
- **THEN** 系统明确拒绝且不确认保存成功，不把半条事件写入持久存储

### Requirement: Read incrementally with explicit consumer identity

CLI SHALL 按 instanceId 和显式 consumer 名称返回该 consumer 未确认的事件，按 eventId 排序并实施数量限制。consumer 身份 SHALL 不依赖某个 agent 厂商的会话 ID。

#### Scenario: Resume from a new process

- **WHEN** 用户手动唤醒 agent，agent 用原 instanceId 和 consumer 从新进程读取
- **THEN** 系统返回停止期间及此前尚未确认的事件，不要求重新创建面板或登录特定 agent

### Requirement: Acknowledge separately from reading

读取 SHALL 不推进确认游标。ack SHALL 在事务中验证 through ID 属于实例、已向该 consumer 交付、且不会回退，再更新游标；确认不能删除原事件。

#### Scenario: Crash between read and acknowledgement

- **WHEN** agent 读取后在 ack 前退出
- **THEN** 下一次读取再次交付这些事件，系统不把读取当作已处理

#### Scenario: Reject acknowledgement of another panel

- **WHEN** consumer 尝试确认属于另一面板或尚未交付的 eventId
- **THEN** ack 失败，原游标不变，未处理事件仍可读取

### Requirement: Isolate consumers and avoid cursor regression

系统 SHALL 分别保存不同 consumer 的位置，并通过事务保证相同 consumer 并发确认不导致游标回退或丢事件。

#### Scenario: Read from two independent agents

- **WHEN** 两个不同 consumer 读取同一面板，其中一个确认了事件
- **THEN** 另一个 consumer 的未确认事件仍然可读

### Requirement: Support bounded waiting without automatic wakeup

CLI SHALL 通过 --wait-ms <ms> 支持 0–60000 毫秒的有界等待（最长 60 秒），默认 0 表示立即返回；等待到期 SHALL 返回正常空结果及超时标识。未读取的事件 SHALL 持续保留，系统不宣称已自动唤醒停止的 agent。

#### Scenario: Receive an event during a wait

- **WHEN** CLI 正在等待且用户在期限内提交事件
- **THEN** 等待调用返回已持久化事件，仍需 agent 显式 ack

#### Scenario: Wait expires before user interaction

- **WHEN** 有界等待到期后用户才提交操作
- **THEN** 先前调用返回空结果，之后操作仍被保存并在下次读取时交付

### Requirement: Recover durable history without claiming exactly-once effects

服务重启或面板关闭 SHALL 保留已保存事件和消费位置。系统 SHALL 清楚区分事件确认与 agent 在系统外执行的副作用，不承诺跨系统的恰好一次执行。

#### Scenario: Restart after acknowledgement

- **WHEN** agent 已成功 ack，服务随后重启
- **THEN** 同一 consumer 从持久位置继续读取，已确认事件不会重新成为待处理项，原始历史仍保留
