# Local Panel Runtime Specification

## Purpose

Expose a local agent CLI and runtime for explicit panel lifecycles, authenticated control and durable framework state.

## Requirements

### Requirement: Expose a general agent CLI

Paneon SHALL 提供 panel run/list/inspect/reload/close/events/ack 和 server status/stop 命令及稳定的 JSON 成功/错误结果；所有面板操作归入 panel，所有服务操作归入 server，不提供平铺的顶层业务命令。根帮助 SHALL 展示两组入口，组帮助 SHALL 展示所属命令，每个命令 SHALL 提供帮助；--version 保留顶层入口。stdout SHALL 仅包含命令结果，诊断 SHALL 写到脱敏 stderr；已有帮助和版本行为 SHALL 保留。

#### Scenario: Discover grouped commands

- **WHEN** 用户分别执行 `paneon --help`、`paneon panel --help` 和 `paneon server --help`
- **THEN** 根帮助显示 panel/server，panel 帮助列出 7 个面板及事件操作，server 帮助列出 status/stop，不要求手动启动服务才能运行面板

#### Scenario: Discover and use Paneon from an ordinary shell tool

- **WHEN** agent 调用帮助、运行本地面板并使用 JSON 结果
- **THEN** agent 获得可用命令、instanceId、revision 和浏览器 URL，不要求配置 MCP、特定 agent 插件或 CDP

### Requirement: Avoid redundant input echoes in command results

CLI 的命令返回 SHALL 适度精简，主要避免重复回显入参，MUST NOT 为减少字段而丢失必要的执行结果、实际状态、版本、诊断或事件消费信息，也 MUST NOT 缩写既定字段名。完整数据模型 SHALL 保留；list、inspect、server status SHALL 继续返回其定义的信息查询结果，inspect SHALL 提供完整实例详情。

#### Scenario: Return useful creation results without the full configuration

- **WHEN** agent 使用 entry、cwd、params 创建面板并请求 JSON 结果
- **THEN** run 返回 instanceId、definitionId、status、revision、watch、paneonVersion 和 url，不重复输出 entryPath、cwd、params、requires 或创建/更新时间；inspect 仍可查询这些完整信息

#### Scenario: Omit operation targets already supplied by the caller

- **WHEN** agent 对指定实例执行 reload、close、events 或 ack
- **THEN** 结果不重复回显 instanceId 或 consumer，events 的每条事件也不重复 instanceId；各命令保留设计中定义的版本变化、关闭状态、事件正文/时间/版本、消费位置和等待结果，ack 返回成功后的 lastAckId

### Requirement: Reopen an existing panel with a regular access link

`panel inspect <instance-id>` SHALL 返回已有实例信息和该实例在当前服务中的普通浏览器访问 URL。URL SHALL 可重复打开，不包含一次性访问 token，也不提供链接有效期。系统 MUST NOT 为打开面板引入浏览器登录会话、访问 cookie 或 token 兑换端点。服务重启或端口变化后，inspect SHALL 返回当前服务地址。

inspect MUST NOT 创建新实例、编译/reload 面板定义、调用业务函数或改变面板的关闭状态；instanceId、参数、事件及消费位置 SHALL 保持不变。closed/unavailable 面板的链接 SHALL 展示其状态，不自动重新打开或修复面板。

#### Scenario: Reopen the same link

- **WHEN** 用户关闭浏览器标签页后再次打开已有面板链接，且服务地址和实例仍可用
- **THEN** 可再次访问原面板，无需登录或兑换凭证，不因链接用过或时间经过而失效，也不创建新的实例

#### Scenario: Request a link after service recovery

- **WHEN** 服务已重启并恢复实例记录，agent 对原 instanceId 执行 inspect
- **THEN** URL 指向当前服务，使用原 instanceId，不要求再次 run 或处理旧链接凭证

#### Scenario: Inspect a closed or unavailable panel

- **WHEN** agent 对 closed/unavailable 面板执行 inspect 并打开链接
- **THEN** 浏览器展示原状态，不重新执行面板定义或业务动作，也不将面板重新标记为运行中

### Requirement: Use English for CLI-generated text

CLI SHALL 使用英文输出帮助、选项说明、框架状态提示、警告、错误说明和诊断，不随系统 locale 改变；JSON 字段与错误码 SHALL 保持稳定。系统 MUST NOT 翻译或改写用户提供的参数、事件 payload 或业务返回数据。本要求不限定面板界面语言。

#### Scenario: Run under a Chinese locale

- **WHEN** 用户在中文系统环境查看帮助或触发参数错误
- **THEN** CLI 自身生成的文案仍为英文，错误码及 JSON 结构与其他 locale 一致

#### Scenario: Preserve Chinese user content

- **WHEN** agent 读取含中文内容的有效事件
- **THEN** CLI 原样返回用户内容，不将其翻译成英文

### Requirement: Enable CLI debugging explicitly without changing results

CLI SHALL 提供全局 `--debug` 布尔选项，默认关闭，支持在子命令前或后使用。正常命令结果 SHALL 写 stdout，诊断 SHALL 写 stderr；debug 行 SHALL 使用英文及 `[debug]` 前缀。必要警告/错误 SHALL 在未开启 debug 时也可见；debug MUST NOT 改变 JSON envelope、数据、退出码、事件确认或业务执行行为。

#### Scenario: Keep normal output concise

- **WHEN** 用户执行命令且未传 --debug
- **THEN** 命令结果正常返回，debug 细节不输出，失败时仍有明确错误说明及非零退出码

#### Scenario: Combine machine-readable results and debugging

- **WHEN** 用户执行 `paneon panel inspect instance-example --json --debug`
- **THEN** stdout 可作为一个命令结果 JSON 解析，debug 信息只在 stderr，不影响成功或失败的既定退出码

#### Scenario: Accept either option position

- **WHEN** 分别执行 `paneon --debug panel inspect instance-example` 和 `paneon panel inspect instance-example --debug`
- **THEN** 两次命令对调试开关的处理一致

### Requirement: Bound debugging to framework metadata and the current invocation

debug SHALL 仅输出当前 CLI 调用的框架步骤、请求标识、耗时、版本检查结果、错误码等允许元数据，不转储参数或响应对象。调试输出 MUST NOT 包含业务密钥、控制 token、cookie、带凭据 URL、完整请求正文、环境变量值、源码正文、业务输入/输出或 handler 原始异常。框架内部异常 SHALL 过滤后再展示。

开关 SHALL 随当前命令结束而结束，MUST NOT 持久化为实例配置或修改后台服务全局日志级别；本变更 MUST NOT 因该开关增加后台日志文件、业务日志采集或服务调试环境变量。

#### Scenario: Enable debugging on a command that starts a service

- **WHEN** `paneon panel run <entry.tsx> --debug` 启动新服务后返回
- **THEN** 当前 CLI 可输出其服务连接等诊断，但调试设置不被写入面板配置，不承诺之后浏览器操作或自动 reload 的持续调试输出

#### Scenario: Keep credentials out of debug output

- **WHEN** 框架在持有控制 token的情况下遇到错误，且 CLI 已开启 --debug
- **THEN** stderr 只包含允许的框架元数据，不输出原文、原始请求/响应或 handler 异常，stdout 的既定结果不被调试行污染

### Requirement: Keep the runtime independent of the invoking agent

`panel run` SHALL 确保一个经身份、内部协议及包版本一致性校验的本地服务可用，注册面板后返回。服务 SHALL 在调用 CLI 或 agent 退出后继续管理未关闭的面板、本地函数调用和页面连接。

#### Scenario: Continue after the agent stops

- **WHEN** 调用 `panel run` 的进程已退出，而用户点击一个已绑定的直接动作
- **THEN** 服务执行该动作并更新页面，不等待 agent 恢复

#### Scenario: Start concurrently

- **WHEN** 两个 CLI 进程同时启动同一运行目录的服务
- **THEN** 启动协调保证只有一个有效服务，两个请求都连接到经核验的实例，或得到明确可解释的错误

### Requirement: Keep the CLI and running service on the same package version

服务描述文件与健康接口 SHALL 返回 runtimeId、paneonVersion 和 protocolVersion；runtimeId 标识服务进程，与面板 instanceId 分开。CLI SHALL 校验服务身份、控制认证、内部协议及与自身一致的包版本；包版本不匹配 SHALL 返回 `RUNTIME_VERSION_MISMATCH`，提示重启服务，不混用新旧 SDK，也不自动终止服务。仅显式 server stop SHALL 在身份、认证和内部协议相容时允许跨包版本停止服务；协议不相容时不得绕过校验。面板的 requires.paneon SHALL 独立校验，不以服务包版本一致性检查替代。

#### Scenario: Upgrade while an old service is running

- **WHEN** CLI 已升级，服务仍运行旧包版本，而 agent 尝试运行面板
- **THEN** CLI 报告两个实际版本及重启提示，不向旧服务提交面板或自动结束在途调用

#### Scenario: Explicitly stop a version-mismatched service

- **WHEN** 使用者显式调用 server stop，旧服务身份、认证和内部协议均通过校验
- **THEN** CLI 允许停止旧服务，下次启动使用当前包版本；该例外不允许 panel run 等其他操作混用版本

### Requirement: Manage explicit panel lifecycles

系统 SHALL 支持创建、列出、检查、reload 和关闭实例。实例 SHALL 绑定绝对源码入口、显式 cwd、参数和 revision；关闭 SHALL 停止该实例的框架监听/订阅、拒绝新调用、向在途函数发出关闭信号并释放 worker，同时保留交互历史。系统 MUST NOT 将关闭函数运行环境宣称为外部业务取消，业务资源清理由作者负责。

#### Scenario: Close one of multiple panels

- **WHEN** 用户关闭其中一个面板
- **THEN** 该面板不再接受新动作，框架运行资源关闭，其他面板继续工作，关闭面板的既有事件仍可读取

### Requirement: Select automatic reload per panel

`panel run` SHALL 默认开启自动 reload，并允许 agent 用 `--watch` 或 `--no-watch` 显式选择。设置 SHALL 按面板实例持久化，随 panel run/list/inspect 返回，服务重启后保持原模式；互斥选项同时出现 SHALL 报错。手动 reload SHALL 在两种模式下都可用，且不改变模式。

#### Scenario: Enable automatic reload by default

- **WHEN** agent 运行面板时未提供 watch 选项
- **THEN** 实例采用 `watch: true`，相关源码保存并成功构建后浏览器自动更新

#### Scenario: Keep a panel fixed until manual reload

- **WHEN** agent 用 `--no-watch` 创建面板，随后修改相关源码
- **THEN** 面板继续使用当前 revision，直到 agent 手动 reload；手动 reload 后仍保持 `watch: false`

#### Scenario: Use different modes for the same asset

- **WHEN** 同一面板定义的两个实例分别使用 `--watch` 和 `--no-watch`
- **THEN** 源码变化只自动更新开启监听的实例，另一个实例保持原版本

#### Scenario: Preserve the choice after a restart

- **WHEN** 服务重启并恢复一个关闭自动 reload 的面板
- **THEN** 它仍为 `watch: false`，inspect 显示原选择，系统不擅自开启监听

#### Scenario: Reject conflicting options

- **WHEN** agent 在同一次 panel run 同时传入 `--watch` 和 `--no-watch`
- **THEN** CLI 返回参数错误，不按参数顺序静默决定模式

### Requirement: Validate browser origins and authenticate CLI control traffic

服务 SHALL 只监听 127.0.0.1，严格匹配当前监听地址对应的 Host。浏览器操作 API SHALL 仅接受与服务地址完整同源的 Origin，比较协议、主机及端口；其他来源、null、空值或缺失 Origin MUST 被拒绝。CLI SHALL 使用独立控制凭据认证，无 Origin 不能自动视为可信 CLI 请求；显式不匹配的 Origin MUST NOT 因控制凭据而绕过检查。API MUST NOT 向任意外部 Origin 开放 CORS。

页面导航及公开静态资源 GET SHALL 可以正常加载，但 MUST NOT 调用作者函数或执行状态变更。浏览器配置读取、事件读取、WebSocket 等非公开 GET API SHALL 在有 Origin 时校验 Origin、无 Origin 时校验 Referer 的完整 origin，无法确认来源则拒绝；CLI 的有效控制认证仍适用。宿主 SHALL 设置 Referrer-Policy: same-origin；浏览器操作请求 MUST NOT 以 Referer 绕过必需的 Origin。

面板 iframe 的桥接请求 SHALL 绑定来源窗口、channelId、instanceId 和 revision；API MUST NOT 因 iframe 的 opaque origin 而允许 null。业务密钥可作为普通动作参数传递，收集、使用和存储由页面代码负责。

#### Scenario: Accept a same-origin browser action

- **WHEN** 用户在本地面板点击按钮，宿主向当前服务发送 Host 和 Origin 都完整匹配的有效动作请求
- **THEN** 按动作声明校验并调用函数，无需登录会话或链接凭证

#### Scenario: Reject a cross-site or unknown-origin action

- **WHEN** 其他网站、Origin 为 null、缺失 Origin 且无有效 CLI 控制凭据的请求尝试调用动作
- **THEN** 服务拒绝请求，不运行 handler 或改变业务状态

#### Scenario: Reject an unexpected Host

- **WHEN** 请求实际到达 loopback，但 Host 为外部域名或不匹配的端口
- **THEN** 服务拒绝请求，不因请求最终连接到本机而放行

#### Scenario: Accept a same-origin GET without an Origin header

- **WHEN** 宿主读取非公开 API 时浏览器未发送 Origin，但 Referer 的完整 origin 与当前服务匹配
- **THEN** 正常读取；没有可信 Origin/Referer 且无有效 CLI 控制凭据的请求被拒绝

#### Scenario: Keep CLI authentication separate

- **WHEN** CLI 不携带 Origin，通过控制凭据请求管理或读取 API
- **THEN** 验证控制凭据后处理；凭据缺失或无效时拒绝，浏览器 URL 中不包含该凭据

#### Scenario: Reject another panel's bridge message

- **WHEN** 一个 iframe 试图调用另一实例的动作
- **THEN** 宿主和服务拒绝调用，其他实例状态不变

### Requirement: Recover panel configuration and interaction history only

服务 SHALL 持久化非密钥面板配置、事件和消费位置；重启后 SHALL 保留原 watch 模式，面板通过当前包版本的范围校验、类型检查和构建后才恢复访问。校验失败 SHALL 保留配置、事件和消费位置并标记 unavailable，不执行该面板模块。系统 MUST NOT 持久化或恢复在途业务调用、业务结果或任务历史，也 MUST NOT 因重启自动重放 mutation。

#### Scenario: Restart during a function call

- **WHEN** 服务在本地函数执行期间中断并重新启动
- **THEN** 面板配置和人机事件仍存在，未完成调用不被重放，业务执行结果由作者代码自行查询，框架不伪造恢复结果

#### Scenario: Restore an asset that no longer matches the installed version

- **WHEN** 服务升级后重启，某面板的 requires.paneon 不接受当前包版本
- **THEN** 面板标记 unavailable 并显示版本错误，其既有事件及消费位置仍可读取，源码不被自动修改

### Requirement: Notify framework state without business monitoring

系统 SHALL 通过 WebSocket 推送构建、revision、连接状态及已提交事件的通知；重连后 SHALL 读取当前框架状态。系统 MUST NOT 通过该协议提供业务日志、业务任务快照或业务监控；事件消费 SHALL 使用独立持久协议。

#### Scenario: Reconnect after a source update

- **WHEN** 页面断线期间源码成功重建，随后页面重新连接
- **THEN** 页面读取当前 revision 及构建状态，不依赖遗漏的 WebSocket 消息，也不重放 mutation；业务数据按作者声明的 query 重新获取

#### Scenario: Open more than six panel tabs in one browser context

- **WHEN** 同一浏览器环境同时打开至少十个同源面板标签页
- **THEN** 所有页面仍可加载、调用 action 并收到源码更新通知，不因状态通知耗尽普通 HTTP 连接；关闭页面释放其连接，断线重连不重放 mutation

#### Scenario: Validate a state notification upgrade

- **WHEN** 请求升级到 WebSocket 状态通知连接
- **THEN** 系统在升级前校验精确 Host、必需的同源 Origin 和实例存在性；跨站、null、空或缺失 Origin 均被拒绝，Referer 与 CLI 控制凭据不能替代该 Origin

### Requirement: Store only framework-owned runtime files

运行目录 SHALL 由 CLI/服务共用的程序内部 PANEON_HOME 常量确定，固定为当前用户主目录下的 ~/.paneon。系统 MUST NOT 读取同名环境变量或提供 CLI 参数/配置文件覆盖目录的入口；面板 --cwd MUST NOT 改变框架运行存储位置。运行目录 SHALL 仅规范服务描述、面板编译产物及包含 panels/events/consumers 的版本化数据库。系统 MUST NOT 创建业务 tasks 表或 `tasks/<task-id>.jsonl` 日志文件。作者自行保存的业务数据 SHALL 不属于 Paneon 的运行存储契约。

#### Scenario: Invoke a function and inspect storage

- **WHEN** 一个返回普通数据的 action 完成，随后检查 Paneon 运行目录
- **THEN** 目录中不存在该调用的业务日志、调用参数/结果历史或业务任务记录，主动提交的人机事件仍按契约保存

#### Scenario: Keep the runtime directory fixed

- **WHEN** 用户从不同工作目录运行 CLI，传入不同面板 --cwd，或设置同名 PANEON_HOME 环境变量
- **THEN** CLI 和服务仍使用当前用户主目录下的 ~/.paneon，不将同名环境变量当作覆盖配置，面板源码及作者业务文件的位置不受该常量约束

### Requirement: Package a runnable installed product

安装包 SHALL 包含 CLI、SDK、组件、静态宿主及面板编译所需的运行依赖，使用 Node.js 24 支持的方式启动，不依赖 Paneon 仓库或开发服务器存在。

#### Scenario: Run from a clean packed installation

- **WHEN** 将 npm pack 产物安装到独立临时目录并从另一个目录加载示例面板定义
- **THEN** CLI、编译、服务、组件与动作均可运行，且 SDK 和 React 解析到一致版本

### Requirement: Paginate panel discovery

`panel list`、GET /api/panels 及浏览器面板列表 SHALL 默认读取第 1 页，每页 20 条，保持 createdAt、instanceId 升序；数据库查询 SHALL 按页限定返回。CLI SHALL 接受 --page 和 --page-size（1–1000），响应 SHALL 包含 panels、page、pageSize、total、totalPages，空集合的 totalPages 为 0。页码及条数 MUST 校验为有效范围内的整数。内部恢复等全量读取 MUST NOT 受发现接口分页限制。

#### Scenario: Discover more than twenty panels

- **WHEN** 存在 45 个实例，CLI 或浏览器依次读取默认大小的三页
- **THEN** 依次返回 20、20、5 条，稳定排序且无遗漏或重复；浏览器首页禁用上一页，末页禁用下一页，刷新保持当前页

#### Scenario: Empty and invalid pagination

- **WHEN** 实例集合为空、页码超出末页，或分页参数非法
- **THEN** 空集合及超出末页返回空 panels 和准确的分页元数据；非法参数返回 INVALID_ARGUMENT；浏览器空集合显示第一页空状态，不展示过期请求返回的其他页
