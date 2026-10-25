## Why

Paneon server 目前没有持久化运行日志：后台输出被丢弃，启动异常被吞掉，HTTP 日志关闭。研发无法事后查看服务做了什么、发生了什么错误。用户已明确优先建立服务端日志机制，具体 debug 日志在需要时由研发添加。

## What Changes

- 提供统一的服务端 logger，支持 debug/info/warn/error/fatal、结构化上下文和 child logger；研发加日志不需要先修改事件注册表或规格。
- 支持 Error 的 message、stack、code 和 cause，进行有界序列化，日志点避免主动输出凭据；不新增通用自动脱敏，不再一概丢弃错误细节。
- 在固定的 `~/.paneon/logs/` 持久化 JSONL，提供级别、轮转、保留、写入失败状态与限时 flush。
- 在启动入口、就绪、停止及既有框架错误边界做最少接入，证明机制可用；不批量建设构建阶段、MIME 或性能日志。
- 新增只读 `paneon server logs`，提供 tail、follow 和级别筛选；server status 显示实际日志状态及路径。
- 默认 info 已由用户确认（B1）。容量和时间参数随整体方案获准本轮采用，不宣称实测最佳值。CLI `--debug` 继续只影响当前命令 stderr。

## Capabilities

### New Capabilities

- `runtime-logging`：服务端可复用日志接口、错误记录、本地持久化与生命周期管理。
- `runtime-log-inspection`：日志位置/状态查询及服务退出后可用的只读查询、跟随命令。

### Modified Capabilities

无。保持面板输入、业务结果、交互事件、凭据契约和现有构建诊断接口不变。

## Impact

- 明确正常 CLI 启停和单服务假设，去掉旧进程保护、PID 探测及针对用户手工改写产物/文件的额外防御；不把越界操作纳入日志机制保证。

- 仓库 `paneon`，分支 `0.0.x`，修订基线 `de40e35e59720f6b90f4bcb24e873a56f47deea2`。
- 影响运行入口、服务及 Runtime 的 logger 接入、日志存储、CLI 日志查询、共享状态类型与依赖声明；具体非测试文件见 design.md。
- 采用 Pino 并显式声明直接依赖，复用 Fastify 的 logger 接口；不建设自有日志事件框架。
- 不增加数据库表、日志平台或 UI，不收集面板业务 console/stdout，不建设跨进程 tracing，不自动修改全局安装或重启服务。
- 本次已获实现授权，优先日志机制，只补少量核心/异常日志；不自动安装或重启用户服务。
