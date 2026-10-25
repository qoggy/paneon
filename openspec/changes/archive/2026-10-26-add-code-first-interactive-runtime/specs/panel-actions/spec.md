## ADDED Requirements

### Requirement: Choose execution behavior per control

SDK SHALL 允许面板作者为每个控件分别绑定直接 action 或 `agent.emit`。直接 action SHALL 是作者提供的普通本地函数；系统 MUST NOT 将 agent 事件自动转为业务调用，也不强制所有点击经过模型。

#### Scenario: Invoke a directly bound function

- **WHEN** 用户点击调用服务端 action 的按钮
- **THEN** 运行时调用该函数，将返回值或错误反馈给页面，无需 agent 在线，也不创建持久业务任务

#### Scenario: Submit a request to the agent

- **WHEN** 用户点击绑定 `agent.emit('deploy-requested', payload)` 的按钮
- **THEN** 系统持久化事件并呈现“已提交给 AI”，不自动执行对应业务或声称业务成功

### Requirement: Validate action identity and arguments

服务 SHALL 校验 instanceId、revision、已声明 actionId 和输入 schema，再运行 handler。系统 SHALL 拒绝过期版本、未知动作、不可序列化参数及无效输入，并返回明确错误。

#### Scenario: Reject a stale browser action

- **WHEN** 面板 reload 后旧浏览器发送旧 revision 的动作请求
- **THEN** 服务返回 `PANEL_REVISION_MISMATCH`，不执行旧动作或自动替换成新动作

#### Scenario: Reject an invalid input

- **WHEN** 动作声明要求非空字符串，而请求未提供有效输入
- **THEN** 系统报告参数校验失败，不运行 handler

### Requirement: Remain independent of business backends

Paneon SHALL 只承载声明的本地函数调用，不规定 handler 使用何种业务后端。系统 MUST NOT 要求外部 CLI、HTTP API 或其他程序实现 Paneon 专用协议。业务调度、监控、日志、重试、超时、取消、外部进程管理、业务结果存储及恢复 SHALL 由作者代码负责；核心 MUST NOT 提供 CLI 执行器、业务任务表或业务日志接口。

#### Scenario: Use a CLI from author code

- **WHEN** 作者在服务端函数中通过普通 Node.js 库调用一个本地 CLI
- **THEN** 命令、参数、输出解析及业务日志均由作者模块处理，Paneon 只接收函数返回值或错误

#### Scenario: Use an HTTP API from author code

- **WHEN** 作者把业务实现替换为普通 HTTP API 调用
- **THEN** Paneon 核心接口、运行数据结构及组件不需要改变，不增加 HTTP 业务监控或日志机制

#### Scenario: Run without an external backend

- **WHEN** 服务端函数只计算输入的统计结果
- **THEN** 页面正常收到结果，不要求声明 CLI、网络服务或业务任务类型

### Requirement: Return function results without retaining business history

浏览器 action 代理 SHALL 返回 Promise，服务 SHALL 反馈可序列化返回值或稳定错误。系统 MUST NOT 自动持久化调用参数、业务结果、异常历史或业务控制台输出，MUST NOT 根据返回对象推断外部业务成功。handler 未处理异常 SHALL 返回通用 `ACTION_FAILED`，不回传原始异常或堆栈；作者可返回非敏感的结构化业务结果。

#### Scenario: Handle a failed function

- **WHEN** handler 抛出未处理异常
- **THEN** 调用方收到调用失败，运行时不自动采集业务日志，也不把异常原文存入运行数据库或输出给 agent

#### Scenario: Return author-defined business data

- **WHEN** handler 返回可序列化的业务状态对象
- **THEN** 页面作者决定怎样展示该对象，框架不为其建立业务状态机或恢复记录

### Requirement: Distinguish refreshable queries from mutations

动作 SHALL 声明 query 或 mutation，默认 mutation。可选页面自动刷新 API SHALL 仅接受 query；同一查询 SHALL 不重叠执行，无订阅时停止定时刷新。查询结果 SHALL 只作为页面内存状态，不变成业务监控历史。

#### Scenario: Reject automatic refresh of a mutation

- **WHEN** 作者把 mutation 传给自动刷新的查询 API
- **THEN** 类型检查或运行校验拒绝绑定，系统不定时调用该函数

#### Scenario: Refresh author-defined data

- **WHEN** 页面订阅一个 query，且上一次查询尚未完成
- **THEN** 系统等待该次完成后安排刷新，把函数结果或调用错误及时间反馈给页面，不记录业务查询历史

### Requirement: Avoid automatic replay and claims of business recovery

SDK SHALL 关联调用请求与响应，MUST NOT 因断线、超时、重启或版本变化自动重试 mutation。系统 SHALL 明确说明连接中断可能导致调用结果未知，且不承诺业务幂等或跨进程去重；业务核验和恢复由作者负责。

#### Scenario: Lose the connection after invocation

- **WHEN** 函数已开始执行但响应传输中断
- **THEN** 页面显示未收到结果，不能据此断言业务失败，系统不自动重新调用函数

### Requirement: Reuse toolchain source updates without custom call preservation

手动和自动 reload SHALL 复用 Vite 的源码监听与编译能力及现有页面重载流程。Node serverAction SHALL 在隔离 worker 中通过 Node 原生 import 加载已打包的服务端产物，执行和元数据 worker MUST NOT 启动 Vite dev server。主进程 SHALL 在 reload 时沿用现有 worker 替换流程，通过旧进程退出释放模块缓存，不假设浏览器 HMR 自动管理自定义 RPC/worker。系统 MUST NOT 为热更新额外实现旧 worker/产物保留、在途调用接管或结果迁移，也 MUST NOT 因更新重新调用 mutation。正在执行函数及页面状态的行为 SHALL 按所用工具链实际能力验证和说明，不额外承诺调用完成或结果恢复。

#### Scenario: Update source during a function call

- **WHEN** 函数尚未返回，AI 保存源码触发自动更新
- **THEN** 模块/页面按已集成工具链的机制更新，框架不额外保留旧执行环境或接管调用结果，不因更新重复调用该函数，持久事件和消费位置保留
