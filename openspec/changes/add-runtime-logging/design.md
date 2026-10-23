## 需要你处理的事项

### 需用户提供的信息

无。

### 需用户拍板的决策

无。用户已认可整体方案并授权开发，按已收敛范围实施。

### 需用户确认的风险

无需要用户执行的破坏性操作。本轮已授权开发及临时目录验收，不自动安装或重启用户正在使用的服务。日志包含研发上下文和错误信息，分享前仍需检查。

### 已确认结论

- **B1**：服务端日志默认开启 info。
- **B3**：不新增通用日志自动脱敏；日志点不主动输出凭据。
- **B5**：按当前整体方案开始开发，采用已说明的容量、保留与队列/退出参数；先只补少量核心日志和异常日志。
- **B6**：catch 捕获的异常必须打日志、抛出，或两者兼有，不能静默处理；不借此清扫无关模块。
- **B2**：优先建立服务端日志机制；具体 debug 问题需要时添加相关日志，不预先建设具体问题的埋点体系。
- **B4**：以正常 CLI 启停、同一时间一个 server 的场景设计；不顺便添加针对用户改写 CLI 产物、手工破坏运行文件或绕过正常流程的防御逻辑。

## Context

仓库 `paneon`，分支 `0.0.x`，实现基线 `a32404d`（设计初稿基线 `de40e35`）。

当前 CLI detached 启动服务时忽略 stdout/stderr；runtime 入口捕获启动异常后只设置退出码；Fastify 日志关闭。SQLite 的最近诊断和人机交互事件不能替代运行日志。

本次要建立的是“研发能方便地写日志，服务能稳定地保存，出问题能查”的机制。上一版的固定事件清单、强制 operationId/buildId、构建阶段计时、特定白屏/MIME 埋点和故障模拟页退出本次设计。此前的演示页不能作为本版需求或验收依据。

## Goals / Non-Goals

目标：统一日志 API、保留必要的错误与上下文、可控级别、本地落盘与轮转、退出时尽力刷新，以及独立于服务运行状态的查询。

本次不包含：批量添加具体功能日志、全链路 tracing、浏览器遥测、性能分析或优化、远程上传、日志 UI、业务应用日志托管、任意 console/stdout 拦截、编译/执行 worker 的通用日志汇聚。机制先接入 server 主进程及其服务端模块；不额外建设子进程日志传输协议。

## 场景假设与范围

通过正常 CLI 启动、复用和停止 server，同一时间只有一个服务写日志。当前 runtimeId 的文件组是正在使用的当前组，其余是已停止服务留下的历史组。清理仅处理历史组，不需要检查旧 PID 或猜测用户是否另行启动了进程。

不支持用户自行修改 CLI 的 JS 产物、破坏 runtime.json/日志结构、替换日志为符号链接、绕过 CLI 强启并行服务等操作后的行为保证。不为这些越界场景新增进程探测、特殊文件竞争防护、修复或兼容分支；已有服务鉴权和凭据边界不因本次设计被削弱。

仍处理正常使用会遇到的文件写入失败、磁盘速度不足、记录过大和退出时未写完等情况。这些直接影响日志机制的功能与资源占用，不以用户越界操作为前提。

## Decisions

### 统一使用常规 logger

使用 Pino，显式声明直接依赖。保留其常规 logger 调用方式，不建立强制事件注册表，不要求每个日志点先分配全链路标识。

```ts
const log = logger.child({ component: 'runtime' });
log.info('Runtime ready');
log.debug({ instanceId, fileCount }, 'Prepared panel files');
log.warn({ retryAfterMs }, 'Resource temporarily unavailable');
log.error({ err, instanceId }, 'Panel operation failed');
```

这是 API 用法示例，不表示本次必须添加这些功能日志。每个模块通过服务上下文取得 logger，可使用 child 附加 component、instanceId 等上下文；字段由日志点按需提供。底层日志器由启动入口创建、注入 server/Runtime，避免全局单例污染临时 home 测试。

Fastify 使用同一 `loggerInstance`，通过 `app.log`、`request.log` 提供熟悉的写入入口。关闭自动逐请求日志，避免默认制造大量 access log；研发可在需要的位置记录。请求对象的序列化只保留明确选择的元数据，不默认输出 headers/body/query。[Fastify 官方文档](https://fastify.dev/docs/latest/Reference/Logging/)和 [Pino API](https://github.com/pinojs/pino/blob/main/docs/api.md)提供 logger、child、错误序列化等基础能力，项目只补齐本地文件管理和约束。

### 错误日志要能用于 debug

`logger.error({ err }, message)` 支持正常 Error，不要求调用者先转换为固定错误码。序列化保留 name/message/stack、存在的 code 和 cause；cause 最多三层，处理循环引用。异常包含非 Error 值时，也提供有界、安全的表示，不能因日志序列化再次抛错。

```json
{
  "err": {
    "type": "Error",
    "message": "listen EADDRINUSE: address already in use 127.0.0.1:60809",
    "code": "EADDRINUSE",
    "stack": "Error: listen EADDRINUSE: address already in use 127.0.0.1:60809\n    at Server.setupListenHandle (node:net:1940:16)"
  }
}
```

示例只展示结构，并非真实错误采样。日志保存错误细节与面向用户返回什么是两回事：现有业务错误暴露边界不变，不能为了记日志而扩大浏览器或 CLI 的业务异常返回。已有 `preserve-build-diagnostics` 仍负责构建诊断的原文传递和展示，本次不替代或提前实现它。

默认不自动输出 params、业务结果、环境变量、请求正文或凭据对象。研发添加日志时选择需要的字段，不主动记录 token、密码等内容。已有 Credentials.check/assertNoSecrets 针对 action 结果、事件等输出边界的保护保持不变，它们不是本次新增通用日志脱敏功能的需求依据。

按已确认 B3，本次不建设通用日志自动脱敏、不为 logger 注入凭据扫描器，也不承诺自动识别秘密。保留错误 message/stack/cause，日志点负责选择可记录内容。面板业务 console/stdout 不自动混入服务日志。

### 级别与配置

默认 info，已由 B1 确认。支持 `debug`、`info`、`warn`、`error`、`fatal`、`off`；off 映射到 Pino 的 silent。通过新服务启动时的 `PANEON_LOG_LEVEL` 设置，无效值明确报错。

```bash
PANEON_LOG_LEVEL=debug paneon panel run ./panel.tsx --cwd .
```

只在创建服务时读取，不因后续命令的环境变量改变已有服务。`server status` 显示实际生效值。不新增 home 覆盖入口，不修改 UI Preferences 配置。全局 CLI `--debug` 保留“当前命令 stderr”的既有语义，不默默更改后台级别；`server logs --level warn` 只是读取筛选。

### 启动、退出与最少接入

入口在加载服务大模块、恢复实例前创建 runtimeId 和 logger，再将上下文交给 startServer，descriptor 与日志使用同一个 runtimeId。直接调用 startServer(home) 也可创建独立日志上下文，测试仅写临时目录。

本次仅要求少量接入来打通机制：启动、就绪、停止，以及现有启动/服务内部错误捕获点中的真实异常。Runtime 能取得 logger，供研发以后在具体位置直接使用；本次不遍历所有阶段补日志。Fastify 错误记录不修改现有 reply 内容，也不把面板 worker 的业务错误还原为对外输出。

正常关停在现有工作取消和连接关闭逻辑内记录停止，再限时 flush/close；最多额外消耗现有关停预算中的 500 ms，不能重新引入长时间无法停止的问题。致命异常可通过 uncaughtExceptionMonitor 尽力记录，不能吞掉异常或改变应有的失败退出。

JS 入口之前的故障、SIGKILL 和掉电可能没有完整尾部日志；不能承诺零丢失。CLI 启动失败时给出预期日志目录，只有实际存在时才能声称已有记录。

## 存储与数据结构

固定 `~/.paneon/logs/`。每次 runtime 使用独立文件组，以便区分当前运行与历史日志；基于单服务假设，只有当前主进程写入自己的文件组。

```text
~/.paneon/logs/
  runtime-17be2b65-3cb7-42f6-9d55-35f77f804cc4.jsonl
  runtime-17be2b65-3cb7-42f6-9d55-35f77f804cc4.1.jsonl
  runtime-17be2b65-3cb7-42f6-9d55-35f77f804cc4.2.jsonl
```

无后缀为当前文件，.1/.2 为由新到旧的归档。每行一个 JSON，采用 Pino 标准数字 level（debug=20/info=30/warn=40/error=50/fatal=60），时间使用 UTC ISO；CLI 文本输出再转为级别名称。示例是机制输出形状，不是要求建立的事件类型：

<!-- prettier-ignore -->
```jsonl
{"schemaVersion":1,"time":"2026-10-23T04:00:01.123Z","level":30,"pid":39272,"paneonVersion":"0.0.0","runtimeId":"runtime-17be2b65-3cb7-42f6-9d55-35f77f804cc4","component":"server","msg":"Runtime ready"}
{"schemaVersion":1,"time":"2026-10-23T04:01:02.123Z","level":50,"pid":39272,"paneonVersion":"0.0.0","runtimeId":"runtime-17be2b65-3cb7-42f6-9d55-35f77f804cc4","component":"runtime","instanceId":"instance-example","msg":"Panel operation failed","err":{"type":"Error","message":"Resource unavailable","stack":"Error: Resource unavailable\n    at example.ts:12:3"}}
```

公共字段为 schemaVersion、time、level、pid、paneonVersion、runtimeId、msg；component、instanceId 和其他结构化上下文可选。无需 event、operationId、buildId 或阶段字段。附加上下文的键不能覆盖公共字段。

<!-- prettier-ignore -->
| 项目 | 提议机制 |
| --- | --- |
| 权限 | 创建目录 0700、文件 0600；采用普通文件 API，不另建应对手工替换文件的防护流程 |
| 单条记录 | 上限 64 KiB；超限时保留主 message/错误信息，截断字段并标记 truncated；不能无声丢掉普通 Error |
| 序列化 | 对象深度、cause 深度、字符串长度受限；处理循环引用和序列化错误 |
| 待写队列 | 最大 1 MiB；异步写入，拥塞时有界丢弃并累计计数 |
| 文件轮转 | 写入前检查 5 MiB；当前文件加两份归档，每组最多 15 MiB |
| 保留 | 当前组加最近历史组，共最多四组；历史组超过七天清理；按拟议容量最多 60 MiB |
| 正常退出 | 限时 flush/close，最多 500 ms，纳入现有关停预算 |

清理本项目日志文件组。当前组从运行上下文直接得到，不参与历史清理；其余组按数量、时间条件清理。无需为旧进程存活判断新增结构性文件头、PID 探测或锁协议。历史组七天按该组最近文件修改时间计算，不另外持久化组元数据；off 不创建文件。

日志写入失败不能让正常业务操作失败：记录器进入 unavailable，停止本轮写入以避免重试风暴，状态暴露安全 lastErrorCode，CLI 在可联系服务时向 stderr 提示一次。队列拥塞在恢复后输出丢弃计数。故障是可见的风险控制，不宣称已补回丢失记录。

### 四组与单个 server 的关系

通常只有一个正在运行的 server。“四组”是此提案自行引入的历史保留策略：每次服务启动分配一个 runtimeId，创建一组日志；停止后这组文件仍在，下一次启动写另一组。因此四组指当前启动的一组，加上最多三次历史启动留下的组，不是四个同时运行的 server，也不是四个面板。

```text
第一次启动 → runtime-A 的日志组 → server 已停止，文件仍在
第二次启动 → runtime-B 的日志组 → server 已停止，文件仍在
第三次启动 → runtime-C 的日志组 → server 已停止，文件仍在
第四次启动 → runtime-D 的日志组 → 唯一正在运行的 server
```

第五次启动时，新组 E 加入，按四组规则可删最早的 A；七天规则额外清理超龄的历史组。“按启动分组并保留四组”并不是单服务日志机制的必需条件，已随本轮整体方案获准采用，仅作为本次日志机制的保留策略。

用户在理解机制后已认可整体方案并授权开发；本轮按本文参数实施，不能据此扩大功能日志范围。

### 容量、保留、队列和 flush 的具体含义

以下数值已随整体方案获准用于本轮实现，但未经实际日志量测算，不宣称最佳参数，也不是 Pino 或 Node 强制要求。

“一组”指一次 server 进程启动产生的文件集合，不是一个面板。该进程下各模块、各实例写入这一组。每组最多三个文件：正在写的 .jsonl、最近归档 .1.jsonl、更早归档 .2.jsonl，分别不超过 5 MiB，总计不超过 15 MiB。新日志即将超过单文件上限时先轮转：删除最旧的 .2，.1 变为 .2，当前文件变为 .1，再创建当前文件；完整 JSON 行不会被拆到两个文件。

“最近四组 / 七天”是两个同时生效的清理条件：四组包含当前组，历史组仅保留最近四组所覆盖的范围，并删除最后修改超过七天的历史组。比如一天重启十次，也不能保留十组；一直运行不重启的一组，也会因为文件容量轮转而覆盖早期内容。“七天”是历史保留的上限，不是保证能找回完整七天的日志。四组 × 15 MiB = 60 MiB；在约定的单服务场景和拟议参数下，这就是正常轮转/清理完成后的容量上限。清理在启动/轮转时执行，不保证无人运行时到点立即删除。

“队列有上限”指待写入磁盘的内存缓冲，不是磁盘容量。拟议上限 1 MiB，是为了避免写盘速度跟不上时内存持续上涨。超限时不让正常服务无限等待，允许丢弃日志并累计、报告数量；这是有损策略，不是审计级日志保证。单条记录的 64 KiB 限制与总队列上限是两回事。

“正常退出限时 flush”指停止时把队列中尚未写完的日志尽力写出，再关闭文件。拟议最多等待 500 ms，并纳入现有关停预算；超过时间仍退出，可能丢尾部日志。这里没有承诺每条日志调用 fsync，也不保证断电时已经进入操作系统缓存的数据都已写到物理磁盘。

这些限制解决无限占磁盘、无限占内存、关停被日志拖住三个机制问题。本轮采用上述已解释参数，不额外增加用户配置或强校验。

## 读取与接口

### 状态

`GET /health` 和 `paneon server status` 增加可选 logging 字段，不改变鉴权，不暴露 controlToken。discover 验证服务身份后读取 health 当前状态，不直接返回磁盘 descriptor 的旧副本。

```json
{
  "logging": {
    "level": "info",
    "status": "active",
    "directory": "/Users/yuguo/.paneon/logs",
    "currentFile": "/Users/yuguo/.paneon/logs/runtime-17be2b65-3cb7-42f6-9d55-35f77f804cc4.jsonl"
  }
}
```

status 为 active/off/unavailable；不可用时附安全错误码。旧服务没有字段时如实显示未提供日志状态，不能假装已开启。

### 查询命令

```bash
paneon server logs
paneon server logs --tail 200 --follow
paneon server logs --level error --json
paneon server logs --instance instance-example
paneon server logs --runtime runtime-17be2b65-3cb7-42f6-9d55-35f77f804cc4
```

独立读取本地日志，不启动、停止或联系服务，不重新构建面板。默认最新 100 条；tail 为 1–10000；有限输出上限 4 MiB，显式说明截断。level 表示最小严重程度；instance/runtime 仅筛选真实存在的可选上下文，不要求每个日志点填写。过滤组合为 AND。按文件组时间及组内原始写入顺序返回，不建立 tracing 索引或新数据库表。

有限 --json 使用现有 envelope：`{ok:true,data:{records,files,truncated,warnings}}`。默认文本为英文时间、级别、message 与上下文，错误 stack/cause 可读展示；CLI debug 仍走 stderr。目录不存在返回空结果，权限错误明确失败。

follow 先读受限尾部，再用文件句柄和位置跟随追加/轮转/新 runtime，避免重名归档导致重复；Ctrl+C 只停止读取命令。逐条处理且 stdout 背压时暂停，不堆积无界数组；落后超过保留窗口时明确警告可能遗漏记录。follow --json 使用逐行 envelope，分别输出 record/warning，不再追加有限结果包装。

读取本机制产生的 JSONL。正常异常退出可能留下未完成尾行，有限查询提示并忽略，follow 等待其完成。中间记录损坏或 schema 不支持时明确报错，不增加跳过、猜测、修复机制；手工改写日志不是支持场景。行长和读取缓冲遵守已有记录与内存上限。

## 影响文件

以下为实现阶段计划影响的全部非测试文件，均相对本仓库根目录。本轮实现这些文件，并添加必要的行为测试和异常处理记忆。

<!-- prettier-ignore -->
| 路径 | 改动 |
| --- | --- |
| docs/memory/MEMORY.md | 索引新增异常处理约定 |
| docs/memory/coding-caught-errors.md | 捕获异常必须记录或抛出，不能静默处理 |
| package.json | 显式声明 Pino 直接依赖 |
| package-lock.json | 对应依赖锁 |
| src/runtime/logging.ts | 新增 logger 工厂、错误序列化、有界写入、轮转/保留/flush；不新增自动脱敏 |
| src/runtime/index.ts | 早期日志初始化与启动/致命错误边界 |
| src/runtime/server.ts | 同一 logger 注入 Fastify/Runtime，最少启动/就绪/停止与错误记录，health 状态 |
| src/runtime/lifecycle.ts | Runtime 接收并持有 child logger，已有框架错误捕获点按需使用；不加阶段埋点 |
| src/shared/types.ts | 共享可选日志状态类型 |
| src/cli/client.ts | 读取真实日志状态，启动失败提示日志目录，保持控制 token 私密 |
| src/cli/logs.ts | 新增安全读取、筛选、跟随、英文文本输出 |
| src/cli/index.ts | logs 命令及有限/流式输出分支 |
| README.md | 英文说明日志位置、启用方式及查询 |
| skills/paneon/references/cli.md | Agent 按需查日志的指引 |

不要求改 compiler/index.ts、编译/执行 worker 或新增跨进程日志协议；这些不是建立 server 主进程日志机制的前提。

## Risks / Trade-offs

- 保留错误细节才能 debug；日志点主动选择字段并避免输出凭据。不新增自动脱敏，不当作既定需求或日志安全保证。
- 有界队列和限时 flush 控制正常日志生成、写盘和退出过程的资源占用，但会存在明确报告的丢失，不作为审计系统。
- 轮转和查询均需限制内存，不能把所有日志读入内存再 tail，也不能同步逐条写盘。
- info 已确认为默认值，不把具体功能日志数量写死；研发对每个日志点的必要性和级别负责。

## Migration Plan

无需数据库迁移。实现并安装相应版本、用户显式重启服务后生效；旧服务不会因磁盘代码更新而自动拥有 logger。查询不触发重启。回退旧版忽略新目录，不自动清理历史文件。本轮实施代码并在临时目录验收，不自动安装或重启用户服务。

## 验收标准

在临时 home 启动真实服务，分别通过根 logger、child logger 和 Fastify logger 写入普通上下文及带 cause 的 Error，检查磁盘中保留 message/stack/cause、上下文和级别；添加一个 debug 日志点无需修改事件注册表或公共 schema。

验证级别过滤、off、循环异常、超大字段的明确截断、不主动输出凭据、轮转与保留、权限/写入失败、队列拥塞、限时退出、服务停止后的读取、follow 跨轮转和 stdout 背压。验证 CLI JSON/stdout 与诊断 stderr 分离，查询不启动服务，既有业务错误返回和关停行为不变。

只需证明机制可用和资源受限，不以“所有重载阶段都有日志”或“某个白屏故障能自动定位”为本变更验收条件。

## 实现决策审查

本次未添加新的业务参数限制；以下为机制自身的边界和异常分支，供统一审查。没有为改写 CLI 产物、手工替换日志或多 server 并写添加防护。

<!-- prettier-ignore -->
| 决策与依据 | 触发与处理 | 代码位置 |
| --- | --- | --- |
| 启动配置和读取参数遵守本方案契约 | 仅新服务校验 PANEON_LOG_LEVEL 六个值；tail 为 1–10000，level 为五个读取级别；不改变已有服务的级别 | src/runtime/logging.ts: logLevel；src/cli/index.ts: logs |
| 默认 info、off 不落盘 | off 不创建目录/文件；低于采集级别的日志不输出；读取筛选不改变采集 | src/runtime/logging.ts: createRuntimeLogging；src/cli/logs.ts: matches |
| 公共字段由机制提供 | 上下文不能改写 runtimeId、schemaVersion、pid、版本、时间和 level；可选业务上下文按需给，不强制 instanceId | src/runtime/logging.ts: Pino formatters |
| 有界序列化，避免记录本身阻断业务 | cause 最多三层，错误 message 4 KiB、stack 8 KiB；普通上下文深度六层、每层最多 100 项、字符串 32 KiB；循环、截断、序列化失败留下明确标记；不做通用脱敏 | src/runtime/logging.ts: errorValue、contextValue、context |
| 单条 64 KiB | 超限保留主消息及错误摘要，去掉大块上下文并标记；必要时进一步缩短消息和错误表示；不拒绝业务操作 | src/runtime/logging.ts: boundedRecord |
| 队列 1 MiB，故障可见而业务独立 | 队列满累计丢弃数；恢复时按 warn 级别报告，status 始终提供计数；写盘/清理失败标记 unavailable、stderr 报错并停止本次写入，不自动重试 | src/runtime/logging.ts: destination、drain、reportFailure |
| 每文件 5 MiB、每组三份、共四组/七天 | 写入前轮转；清理排除当前已知组，其余按最新 mtime 排序，过数量或过龄删除；只扫描机制命名的文件，不检查旧 PID | src/runtime/logging.ts: logFiles、rotate、cleanup |
| 退出最多等待刷新 500 ms | 重复 close 复用一次操作；超时 stderr 说明可能丢失并允许退出；启动/退出异常保持失败语义 | src/runtime/logging.ts: close；src/runtime/index.ts；src/runtime/server.ts: startServer、shutdown |
| 状态须是真实当前值 | 校验已有服务身份后，采用 health 的 logging，而非 descriptor 中旧值；旧服务没提供就省略；unavailable 每次 CLI 调用最多提示一次 | src/runtime/server.ts: health；src/cli/client.ts: discover |
| 只读文件，保持资源有界 | 目录不存在返回空；有限输出最多 4 MiB；tail/level/instance/runtime 取交集；完整行解析，尾部不完整提示/等待，中间损坏或 schema 不支持直接报错，不修复 | src/cli/logs.ts: Reader、snapshot、matches |
| follow 支持正常轮转/重启和慢输出 | 文件句柄/位置识别已读数据，轮转竞争的 ENOENT 明确提示；归档已删除提示可能遗漏；stdout 背压时暂停；Ctrl+C 取消读取、关闭文件句柄后退出 CLI，放弃尚未发出的输出，不调用服务 | src/cli/logs.ts: scan、records、followLogs、output、printLogs |
| 捕获异常可观察，少量接入 | 启动/就绪/停止及 Fastify 自带监听日志；请求错误、恢复/自动重载错误记录；构建队列只在失败时 debug 记录，原始 Promise 仍向调用者拒绝，不新建功能阶段日志 | src/runtime/server.ts；src/runtime/lifecycle.ts |

以上为当前改动引入的机制决策；未借此审查或重写项目其他模块的全部既有 catch。

## 实现验收记录

- 完整构建与类型检查通过；修改范围的 ESLint 无 error，仍有非空断言 warning。
- 全量测试以 `node --test --test-concurrency=3 tests/*.test.ts` 执行，176 项全部通过。默认并发的一次运行因大量构建子进程触发命令超时；未提高超时阈值。
- 最后复核另外复现 stdout 完全阻塞时 Ctrl+C 不能退出的问题，修复后日志/CLI/关停专项 14 项全部通过，包含该新增取消用例。
- 接入用例使用真实服务及 CLI、独立临时 HOME，验证根/child/Fastify、错误 cause、级别、动态状态、写盘故障、500 ms 刷新、读取/轮转/背压以及关停。没有重启、安装或更改用户正在运行的服务。
- 本次未提交代码。日志机制在使用新构建启动 server 时生效，旧进程不自动获得新代码。
