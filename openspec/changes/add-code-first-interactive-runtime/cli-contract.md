# 初版 CLI 命令契约

本文从 [运行时设计](design.md) 拆出，保留本 change 的命令、返回类型及失败示例。后续增加的 init、config、server start/logs 和 --params-file 不在本次初版契约内；当前完整命令见 [CLI 使用参考](../../../skills/paneon/references/cli.md)，参数文件能力见 [panel-file-input](../add-paneon-skill-panels/specs/panel-file-input/spec.md)。这些示例不表示本轮重新做过运行验证。

## 命令总览

<!-- prettier-ignore -->
| 命令 | 描述 | 成功时 data 的结构 |
| --- | --- | --- |
| `panel run` | 加载 TSX 并创建一个独立面板，按需启动本地服务，返回访问链接 | `RunResult` |
| `panel list` | 列出运行目录中已有面板，包含运行中、已关闭和不可用实例 | `{ panels: PanelInstance[] }` |
| `panel inspect` | 查看指定面板的信息，并取得新的有效访问链接 | `PanelInstanceAccess` |
| `panel reload` | 让指定面板加载当前源码，不改变其自动更新开关 | `ReloadResult` |
| `panel close` | 关闭指定面板的运行资源，保留实例及交互历史 | `CloseResult` |
| `panel events` | 读取指定 consumer 尚未确认的事件，可有界等待 | `EventsResult` |
| `panel ack` | 确认该 consumer 已处理到指定事件 | `AckResult` |
| `server status` | 查询本地服务是否运行及其身份、版本和监听地址 | `ServerStatusResult` |
| `server stop` | 停止本地服务，保留面板配置及交互历史 | `StopResult` |

表中结构在下文定义。`panel` 和 `server` 本身是命令分组，不单独创建或停止资源。

## 通用参数、输出与退出码

<!-- prettier-ignore -->
| 参数 | 适用范围 | 必填/默认 | 含义 |
| --- | --- | --- | --- |
| `--json` | 上表全部 9 个操作命令 | 可选，默认 false | stdout 输出一个完整 JSON 结果，适合 agent 解析；不输出进度文本 |
| `--debug` | 上表全部 9 个操作命令 | 可选，默认 false | 当前 CLI 的英文框架诊断写入 stderr；子命令前后均可使用，不改变命令结果 |
| `-h, --help` | 根命令、panel/server 分组及每个具体命令 | 可选 | 输出英文帮助后退出，不启动服务或校验业务入参；帮助始终为文本 |
| `-V, --version` | 根命令 | 可选 | 输出实际 Paneon 包版本字符串及换行后退出；保持现有文本格式 |

不使用 `--json` 时，成功结果以英文摘要、表格或字段形式写入 stdout；用户数据保持原文。人类可读文本不作为机器解析协议。失败时 stdout 为空，英文错误说明写入 stderr。使用 `--json` 时，成功和失败均使用下述 envelope；参数解析失败也返回错误 envelope，不能让 Commander 的默认文本污染 stdout。根帮助/版本不转换为 JSON。

```ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type CommandResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: { [key: string]: JsonValue };
      };
    };
```

正常命令成功、帮助/版本输出、无事件或等待到期均以退出码 `0` 结束。参数、校验、编译、连接或操作失败以退出码 `1` 结束，保留当前 CLI 对未知选项返回 `1` 的行为。文本诊断进入 stderr；`--json` 的结构化错误按上面的 envelope 写入 stdout。`error.details` 只允许非敏感框架信息，不回显原始业务参数、密钥或 handler 异常。

仅 `panel run` 按需启动服务。`server status` 在确认无服务时返回正常的 `running: false`；`server stop` 在确认无服务时返回正常的 `alreadyStopped: true`。其他操作要求服务可用，未启动时返回 `SERVER_NOT_RUNNING`，不借查询或关闭命令隐式创建面板。描述文件存在但服务身份或连通性无法确认时返回错误，不能假装已经停止或误杀其他进程。

## 完整数据模型与命令返回

```ts
type PanelInstance = {
  instanceId: string; // 运行实例 ID，传给 inspect/reload/close/events/ack
  definitionId: string; // TSX 中 definePanel.id，标记来源；同一定义可创建多个实例
  status: 'running' | 'closed' | 'unavailable';
  entryPath: string; // 解析后的绝对源码入口
  cwd: string; // 该实例的绝对工作目录
  revision: string; // 最后一次成功构建的源码/依赖/包版本摘要
  watch: boolean; // 实际生效的自动更新模式
  createdAt: string; // ISO 8601 UTC 时间
  updatedAt: string; // ISO 8601 UTC 时间
};

type PanelInstanceAccess = PanelInstance & {
  params: JsonValue; // 实例保存的面板输入
  requires: { paneon: string }; // 当前记录的构建版本要求
  paneonVersion: string; // 此 revision 的构建包版本，不是服务进程版本
  url: string; // 当前服务中该实例的普通访问链接，可重复打开，无过期时间
  diagnostic?: { code: string; message: string }; // 不可用/构建失败等框架诊断
};

type PanelEvent = {
  id: number; // 单调递增的事件 ID；ack --through 使用此值
  instanceId: string;
  revision: string; // 提交事件时的源码版本
  type: string; // 作者声明的事件类型
  payload: JsonValue; // 通过事件 schema 校验的数据
  createdAt: string;
};
```

上述模型保持完整，供实例详情和内部处理使用；不要求每个命令原样返回整个对象。命令返回值主要去掉对入参的重复回显，保留新生成的标识、实际状态、版本、诊断和事件消费信息；不缩写字段名，也不增加额外的精简模式开关。`list`、`inspect`、`server status` 是信息查询，保留各自定义的信息；inspect 有意返回保存的输入与解析后的路径，便于检查实例配置。

`status` 只表示面板运行资源的状态，不表示 CLI/OpenAPI 等外部业务是否成功。源码或版本不兼容时，unavailable 实例保留最后成功的 revision 和构建信息，并由 diagnostic 解释当前问题；不能把旧构建信息说成新源码已经通过校验。closed/unavailable 的 url 只打开相应状态页。URL 不承载控制凭据或业务密钥；它不是登录凭证，不提供过期时间字段。

## paneon panel run

**用途：** 创建并运行一个面板。即使相同源码已经有运行实例，每次 run 仍创建新的 instanceId；重新打开已有实例应使用 inspect。

```sh
paneon panel run /work/panels/review-panel.tsx \
  --cwd /work/project-a \
  --params '{"topic":"方案评审"}' \
  --json
```

<!-- prettier-ignore -->
| 入参 | 类型 | 必填/默认 | 含义与校验 |
| --- | --- | --- | --- |
| `<entry.tsx>` | 文件路径 | 必填 | 本地 TSX 入口，必须存在且可读；相对路径相对于调用 CLI 时的目录解析 |
| `--cwd <directory>` | 目录路径 | 必填 | 面板服务端代码的默认工作目录，必须存在；相对路径也相对于调用 CLI 时的目录解析 |
| `--params <json>` | JSON 值 | 必填 | 面板输入，必须是合法 JSON 且满足 definePanel.input；无参数的对象 schema 显式传 `'{}'` |
| `--watch` | 布尔开关 | 可选，未指定时默认开启 | 自动监听并更新源码；不能与 --no-watch 同传 |
| `--no-watch` | 布尔开关 | 可选 | 关闭该实例的自动更新，后续只能手动 reload |
| `--open` | 布尔开关 | 可选，默认 false | 成功创建后请求系统浏览器打开返回链接；未传时只返回链接 |

以上路径由当前 CLI 解析成绝对路径后交给服务，不能使用后台服务启动时的目录解释。cwd 和源码目录相互独立；作者代码可以显式为自己的业务调用指定其他目录。JSON/调试通用选项见前表。

```ts
type RunResult = Pick<
  PanelInstanceAccess,
  'instanceId' | 'definitionId' | 'status' | 'revision' | 'watch' | 'paneonVersion' | 'url'
>;
```

**出参：** `CommandResult<RunResult>`。不重复输出 entryPath、cwd、params 和源码中的 requires，也不返回创建/更新时间；这些完整信息可通过 inspect 查询。保留新生成的 instanceId、来源 definitionId、实际状态、revision、watch 模式、构建包版本和 URL。成功意味着源码通过校验并生成可访问面板；命令返回后服务继续运行。`--open` 请求失败时不撤销已经创建的面板，仍返回成功结果和 URL，并在 stderr 给出英文警告；这不保证浏览器界面已实际展示。

```json
{
  "ok": true,
  "data": {
    "instanceId": "instance-example",
    "definitionId": "review-panel",
    "status": "running",
    "revision": "sha256:example",
    "watch": true,
    "paneonVersion": "0.0.0",
    "url": "http://127.0.0.1:42173/panels/instance-example"
  }
}
```

## paneon panel list

**用途：** 发现已有 instanceId，查看各实例的源码、工作目录、状态和自动更新模式。

```sh
paneon panel list --json
```

**入参：** 无位置参数。`--page <number>` 默认为 1，范围 1–2147483647；`--page-size <count>` 默认为 20，范围 1–1000，均须为整数。按 createdAt、instanceId 升序稳定分页，包含 closed/unavailable 实例。数据库使用 LIMIT/OFFSET，HTTP 查询参数为 page、pageSize。

**出参：** `CommandResult<{ panels: PanelInstance[]; page: number; pageSize: number; total: number; totalPages: number }>`。每项字段见完整数据模型，不返回 URL、params 或事件正文。超出末页返回空数组及原请求页码；无实例时 totalPages 为 0：

```json
{ "ok": true, "data": { "panels": [], "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 } }
```

浏览器首页复用同一分页接口，初始为第一页、每页 20 条；提供上一页、下一页、页码和总数。首页/末页及加载期间禁用对应翻页控件，Refresh 保持当前页，整页重新打开回到第一页；请求到超过现有总页数的页时回到最后有效页，空列表显示第一页空状态。忽略已过期的分页响应，防止旧请求覆盖当前页。关闭面板期间暂时禁止翻页和 Refresh，避免关闭回执与列表请求交错显示旧状态。

## paneon panel inspect

**用途：** 获取指定实例完整信息及新的有效访问链接，不创建新实例、不 reload、不调用作者业务函数，也不恢复已经关闭的面板。

```sh
paneon panel inspect instance-example --json
```

<!-- prettier-ignore -->
| 入参 | 类型 | 必填/默认 | 含义与校验 |
| --- | --- | --- | --- |
| `<instance-id>` | 字符串 | 必填 | list/run 返回的运行实例 ID；不是 TSX 文件名，也不是 definitionId；不存在时返回 PANEL_NOT_FOUND |

**出参：** `CommandResult<PanelInstanceAccess>`，返回完整实例详情，包括保存的输入、解析后的路径和时间。instanceId、参数、事件和消费位置不变；url 是该实例在当前服务中的普通访问链接，同一服务地址下重复 inspect 可以返回相同 URL，不签发 token 或返回有效期。服务恢复后链接使用当前端口；unavailable 时 paneonVersion 仍指最后成功构建的版本，通过 diagnostic 解释当前错误。

```json
{
  "ok": true,
  "data": {
    "instanceId": "instance-example",
    "definitionId": "review-panel",
    "status": "running",
    "entryPath": "/work/panels/review-panel.tsx",
    "cwd": "/work/project-a",
    "revision": "sha256:example",
    "watch": true,
    "createdAt": "2026-10-20T08:00:00.000Z",
    "updatedAt": "2026-10-20T08:00:00.000Z",
    "params": { "topic": "方案评审" },
    "requires": { "paneon": "0.0.0" },
    "paneonVersion": "0.0.0",
    "url": "http://127.0.0.1:42173/panels/instance-example"
  }
}
```

## paneon panel reload

**用途：** 让指定实例重新加载当前源码，在 watch 开启或关闭时都可用，不改变 watch 选择。

```sh
paneon panel reload instance-example --json
```

**入参：** 必填 `<instance-id>`，含义与 inspect 一致；其余为通用选项。不接受 entry、cwd、params 或 watch 参数，不通过 reload 修改实例配置。

```ts
type ReloadResult = {
  previousRevision: string;
  revision: string; // 本次成功校验后的版本
  changed: boolean; // revision 是否实际改变；源码未变也允许成功
  watch: boolean; // 原模式保持不变
};
```

**出参：** `CommandResult<ReloadResult>`。仅在本次校验及更新完成后成功返回；编译/版本校验失败返回错误，保留旧可用 revision。closed 实例返回 `PANEL_CLOSED`；unavailable 实例允许显式 reload 尝试修正后的源码，成功后恢复运行。不会自动重新调用用户之前触发的业务函数。

```json
{
  "ok": true,
  "data": {
    "previousRevision": "sha256:example",
    "revision": "sha256:updated-example",
    "changed": true,
    "watch": true
  }
}
```

## paneon panel close

**用途：** 关闭一个面板的运行资源，不删除源码、实例配置、事件或消费位置，不影响其他面板。

```sh
paneon panel close instance-example --json
```

**入参：** 必填 `<instance-id>`，含义与 inspect 一致；其余为通用选项。不增加业务任务取消、外部进程清理等选项。

```ts
type CloseResult = {
  status: 'closed';
  alreadyClosed: boolean; // 重复 close 返回 true，不将其当作失败
};
```

**出参：** `CommandResult<CloseResult>`。不存在的实例返回 `PANEL_NOT_FOUND`，重复关闭同一实例正常成功。结果只确认框架面板已关闭，不表示作者调用的外部程序或 API 已取消。

```json
{
  "ok": true,
  "data": { "status": "closed", "alreadyClosed": false }
}
```

## paneon panel events

**用途：** 按 consumer 读取尚未确认的语义交互事件。读取不等于已处理；需要另行 ack。

```sh
paneon panel events instance-example --consumer assistant --wait-ms 30000 --limit 100 --json
```

<!-- prettier-ignore -->
| 入参 | 类型 | 必填/默认 | 含义与校验 |
| --- | --- | --- | --- |
| `<instance-id>` | 字符串 | 必填 | 要读取的已有实例，closed/unavailable 的持久历史同样可读 |
| `--consumer <name>` | 非空字符串 | 必填 | 调用方自定的消费名称，例如 assistant；同一面板同名共享位置，不同名称独立，不自动绑定 agent 厂商会话 |
| `--wait-ms <ms>` | 整数，单位毫秒 | 可选，默认 0，范围 0–60000 | 先读取已有未确认事件；没有时最多等待指定毫秒数，出现事件就返回；0 表示立即读取 |
| `--limit <count>` | 整数 | 可选，默认 100，范围 1–1000 | 本次最多返回多少条事件，不影响确认位置 |

```ts
type EventListItem = Omit<PanelEvent, 'instanceId'>;

type EventsResult = {
  events: EventListItem[]; // 按 id 升序；从 lastAckId 之后开始
  lastAckId: number; // 当前已确认位置，初始 0
  lastDeliveredId: number; // 该 consumer 历次最大已交付位置，初始 0
  hasMore: boolean; // 本次批次之后是否还有未确认事件
  timedOut: boolean; // 请求了正数等待且等待到期仍无事件时为 true
};
```

**出参：** `CommandResult<EventsResult>`。instanceId 和 consumer 已由入参确定，不在结果或每条事件中重复；保留事件 ID、类型、payload、revision、时间，以及确认/交付位置、是否还有事件和超时标识。首次读取创建 consumer；未 ack 的事件下次仍可返回。无事件和等待到期均为正常成功，不生成虚假的交互事件。服务停止或连接失败返回错误，不能当作正常等待到期。

```json
{
  "ok": true,
  "data": {
    "events": [
      {
        "id": 42,
        "revision": "sha256:example",
        "type": "feedback-submitted",
        "payload": { "comment": "请补充方案对比" },
        "createdAt": "2026-10-20T08:01:00.000Z"
      }
    ],
    "lastAckId": 0,
    "lastDeliveredId": 42,
    "hasMore": false,
    "timedOut": false
  }
}
```

等待到期的示例：

```json
{
  "ok": true,
  "data": {
    "events": [],
    "lastAckId": 42,
    "lastDeliveredId": 42,
    "hasMore": false,
    "timedOut": true
  }
}
```

## paneon panel ack

**用途：** 声明该 consumer 已处理到某个事件，推进后续 events 的起点。不删除事件，也不执行事件中的业务动作。

```sh
paneon panel ack instance-example --consumer assistant --through 42 --json
```

<!-- prettier-ignore -->
| 入参 | 类型 | 必填/默认 | 含义与校验 |
| --- | --- | --- | --- |
| `<instance-id>` | 字符串 | 必填 | 要确认的实例 |
| `--consumer <name>` | 非空字符串 | 必填 | 必须与读取事件时使用的名称一致，消费记录须已存在 |
| `--through <event-id>` | 正整数 | 必填 | 确认该面板中截至此 ID 的所有事件，不只是单独一条；须属于该面板、已向该 consumer 交付且不使位置回退 |

```ts
type AckResult = {
  lastAckId: number; // 成功后的确认位置
};
```

**出参：** `CommandResult<AckResult>`。不回显 instanceId、consumer；lastAckId 表示成功后的实际确认位置，作为操作结果保留。重复确认当前 lastAckId 可以成功；回退、跨面板、未交付或不存在的 ID 返回 `INVALID_ACK`，原位置不变。agent 必须处理好整个确认范围后再 ack，不能把“看到事件”当作“已经完成业务”。

```json
{
  "ok": true,
  "data": { "lastAckId": 42 }
}
```

## paneon server status

**用途：** 查询本地服务，不因为查询而启动它。返回的版本是服务进程的包版本，不是某个面板的构建版本。

```sh
paneon server status --json
```

**入参：** 无位置参数和专用选项，仅接受通用选项；查询程序固定的 `~/.paneon` 运行目录。

```ts
type RuntimeInfo = {
  runtimeId: string;
  pid: number;
  host: '127.0.0.1';
  port: number;
  paneonVersion: string;
  protocolVersion: number;
  startedAt: string;
};

type ServerStatusResult =
  { running: true; runtime: RuntimeInfo } | { running: false; runtime: null };
```

**出参：** `CommandResult<ServerStatusResult>`。服务未启动是正常结果；发现服务但身份、认证、协议或包版本检查失败时返回错误。版本不一致时仍执行既定严格校验，不通过 status 绕过版本限制；安全错误详情可包含预期和实际版本。

```json
{
  "ok": true,
  "data": {
    "running": true,
    "runtime": {
      "runtimeId": "runtime-example",
      "pid": 12345,
      "host": "127.0.0.1",
      "port": 42173,
      "paneonVersion": "0.0.0",
      "protocolVersion": 1,
      "startedAt": "2026-10-20T08:00:00.000Z"
    }
  }
}
```

服务未启动时：

```json
{ "ok": true, "data": { "running": false, "runtime": null } }
```

## paneon server stop

**用途：** 停止整个本地服务及其面板运行资源，保留配置、事件和消费位置。

```sh
paneon server stop --json
```

**入参：** 无位置参数和专用选项，仅接受通用选项；不增加 force、业务任务取消或业务日志清理选项。

```ts
type StopResult = {
  stopped: true;
  alreadyStopped: boolean;
  runtimeId: string | null; // 本次停止的服务；原本未运行时为 null
};
```

**出参：** `CommandResult<StopResult>`。确认服务已退出后成功返回，不能只发出停止请求就宣称完成；未运行时正常成功，不启动服务。仅此命令允许在身份、认证和内部协议相容时停止包版本不同的旧服务；无法安全核验时返回错误，不绕过校验杀进程。

```json
{
  "ok": true,
  "data": { "stopped": true, "alreadyStopped": false, "runtimeId": "runtime-example" }
}
```

## 失败返回示例

下表给出本节命令需要区分的主要失败；凭据、桥接和构建的其他细分错误仍按对应章节处理。

<!-- prettier-ignore -->
| 错误码 | 典型触发条件 |
| --- | --- |
| `INVALID_ARGUMENT` | 缺少必填参数、未知选项、JSON 语法错误、watch 冲突、wait-ms/limit/through 格式或范围错误 |
| `INPUT_VALIDATION_FAILED` | params 不满足面板声明的输入 schema |
| `PANEL_NOT_FOUND` | instanceId 不存在 |
| `PANEL_CLOSED` | 对已关闭面板执行 reload 等需要运行实例的操作 |
| `INVALID_ACK` | 确认了跨面板、未交付、回退或不存在的事件 |
| `SERVER_NOT_RUNNING` | 需要已有服务的命令在无服务时执行 |
| `RUNTIME_UNAVAILABLE` | 描述文件存在但服务无法连接或核验为有效实例 |
| `RUNTIME_VERSION_MISMATCH` | CLI 和服务包版本不一致，且不是符合例外的显式 stop |
| `INVALID_PANEON_REQUIREMENT` | 源码版本范围声明缺失、非法或动态计算 |
| `PANEON_VERSION_UNSUPPORTED` | 安装版本不满足面板定义 requires.paneon |
| `BUILD_FAILED` | 类型检查、源码转换或构建失败；可提供非敏感文件位置和细分错误码 |

```json
{
  "ok": false,
  "error": {
    "code": "PANEL_NOT_FOUND",
    "message": "Panel instance not found.",
    "details": { "instanceId": "instance-missing" }
  }
}
```

```json
{
  "ok": false,
  "error": {
    "code": "PANEON_VERSION_UNSUPPORTED",
    "message": "The panel requires a different Paneon version.",
    "details": {
      "requiredRange": ">=1.4.0 <2.0.0",
      "currentVersion": "0.0.0",
      "entryPath": "/work/panels/review-panel.tsx"
    }
  }
}
```
