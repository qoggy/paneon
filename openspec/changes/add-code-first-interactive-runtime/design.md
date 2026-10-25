## 需要你处理的事项

无待拍板项。

### 已确认结论

- **A1**：优先接受嵌入效果，也接受 AI 提供链接、由用户在浏览器打开。
- **A2**：核心适用于能够执行本地命令的常见 agent；不依赖特定 agent 的界面或会话控制接口。
- **B1**：同时支持用户操作后直接执行功能，以及将操作交给 AI 判断和执行。
- **B2**：AI 阅读 CLI 帮助后自行编写接入代码，接入成果保存后可供其他会话复用。
- **B3**：复用面板定义是独立本地文件，与所在目录、项目和 Git 管理方式解耦。
- **B4**：AI 停止后无需自动唤醒；用户手动恢复 AI 后，它仍能读取期间发生的操作。
- **B5**：产品通用入口采用 CLI，核心不采用 MCP。
- **B6**：采用 TypeScript 和 React；默认组件复用 shadcn/ui，第一期沿用其默认主题和组件样式。
- **B7**：AI 通过代码调用 SDK；控件与动作可以在同一份源码中声明，JSON 不作为主要创作格式。
- **B8**：新面板未显式指定时默认自动 reload，保存源码后自动更新。
- **B9**：自动 reload 按面板配置，由 agent 通过选项选择开启或关闭。
- **B10**：Paneon 完全不耦合面板的业务调用；CLI、OpenAPI 等只是使用场景，调用调度、监控、日志、重试和业务存储由面板代码负责。
- **B11**：面板通过 `requires.paneon` 声明依赖的 Paneon 包版本范围；CLI、SDK、组件与服务同包同版本发布，范围不满足时明确拒绝，不自动下载旧 SDK 或改写源码。
- **B12**：CLI 的帮助、提示、错误说明和框架诊断统一使用英文，用户数据原样保留。
- **B13**：CLI 提供显式 `--debug`；默认关闭，调试信息写入 stderr，命令结果与 JSON 输出不混入调试文本。
- **B14**：不提供内置凭据管理。页面可以用普通输入框收集密钥并作为 server action 参数传递；使用、存储及避免敏感值进入结果、事件和日志由作者代码负责。
- **B15**：自动 reload 可以重置未提交的页面状态；已保存事件和消费位置保留，页面状态及正在执行函数的更新行为沿用所用工具，不额外承诺调用完成或结果恢复。
- **B16**：关闭浏览器页面不等于关闭面板；面板和本地服务具有独立于浏览器标签页的生命周期。
- **B17**：CLI 按对象统一分组，面板操作采用 `paneon panel ...`，服务操作采用 `paneon server ...`；面板创建、列表、检查、重载、关闭、事件读取和确认均归入 panel。
- **B18**：本次迭代在已有组件范围上增加 Tabs、Checkbox、Switch、Textarea。
- **B19**：本次迭代支持 Dialog/AlertDialog、Tooltip、Badge/StatusBadge 和 CodeBlock；Dialog 与 StatusBadge 保留，增加其余组件及必要配套导出。
- **B20**：本次迭代补齐 Card、RadioGroup、Alert、Spinner、Accordion、Collapsible 及其配套导出。
- **B21**：本次迭代增加 DropdownMenu 和 Popover 及其必要配套导出。
- **B22**：本次迭代增加 Pagination 及分页导航配套导出；页码状态和业务数据获取由面板作者负责。
- **B23**：本次迭代不提供默认 Slider 组件；Switch 保留。
- **B24**：本次迭代增加 Field 及配套组件，统一表单项、分组、说明和错误展示；不强制引入表单状态或校验框架。
- **B25**：第一期直接沿用 shadcn 的默认主题和组件样式，不自行定义另一套字体、字号、颜色、圆角、控件尺寸等视觉规范。
- **B26**：提供可复制修改的 TSX 组合示例，并增加至少一个配合真实 CLI/OpenAPI 的示例，选用 gh CLI，以仓库/PR 操作面板展示列表、详情和交互动作，接入代码属于示例，不进入核心框架。
- **B27**：本次迭代提供 Markdown 只读渲染组件，渲染采用 react-markdown + remark-gfm，GitHub 风格排版采用社区维护的 github-markdown-css 浅色样式；不自行设计皮肤。
- **B28**：源码更新复用 Vite/React 既有的监听、模块更新及重载能力，不自行开发热更新机制，不额外保留旧 worker 或等待旧函数完成。
- **B29**：panel inspect 返回已有面板在当前服务中的访问链接，不重新创建面板；链接可重复打开，服务重启后可再次获取当前地址。
- **B30**：PANEON_HOME 是程序内部常量，固定为当前用户主目录下的 .paneon；本期不提供环境变量、CLI 参数或配置文件覆盖运行目录的入口。
- **B31**：可复用源码称为面板定义（PanelDefinition），每次运行创建面板实例（PanelInstance）；对外 ID 字段统一使用 definitionId / instanceId，不再使用资产这一产品术语。
- **B32**：浏览器使用普通面板链接，不增加一次性凭证、登录会话或链接过期时间；通过 loopback 监听、严格 Host/Origin 检查拒绝浏览器跨站操作，CLI 继续校验控制凭据。
- **B33**：事件读取等待参数命名为 --wait-ms，单位为毫秒；默认 0，范围为 0–60000 毫秒，最长仍等待 60 秒。
- **B34**：CLI 返回值适度精简，主要删除对入参的重复回显，保留执行结果、实际状态、版本和事件消费信息；完整数据模型保留，inspect 提供完整实例详情，不为省 token 缩写字段名。

## Context

以下描述初版实施前的基线，不能作为当前仓库缺少 SDK/runtime 的判断。后续 UI 偏好、资源驻留、源码监听和产物回收分别由对应 change 扩展，见 [changes 状态与边界](../README.md)。

仓库 `paneon` 当前位于 `0.0.x`，基线为 `9f2685d829d37b655f85a80ecb2533107e8f6782`。工作区在提案开始前干净。

现有 `src/cli/index.ts` 只提供帮助和版本；`src/App.tsx` 是初始化验证页。项目已经采用 Node.js 24、TypeScript 6、React 19、Vite 8、Tailwind CSS 4、Commander 14，并配置了 `node:test`、ESLint、Prettier 和 npm 构建。没有面板 SDK、运行服务、事件库或现有业务规格。

README 面向使用者且使用英文；本设计及 OpenSpec 规格使用中文解释，协议标识使用英文。开发继续使用 `0.0.x`，不创建其他开发分支，不发布或调整 `main`。

## Goals / Non-Goals

**Goals:**

- AI 编写本地 TSX，调用 Paneon CLI 即可运行有统一外观的交互面板。
- 常见控件组合不要求编写 CSS；React、SVG、Canvas 和自定义组件仍可表达复杂交互。
- 同一份源码支持界面、查询与服务端动作，编译结果严格区分浏览器与 Node 执行入口。
- 本地服务独立于 agent 进程；本地函数调用和页面交互不依赖模型继续工作。
- 语义操作事件持久化，读取不等于消费，停止再恢复的 agent 能增量处理。
- 使用普通函数以及作者自行编写的 CLI/HTTP 示例验收，验证 Paneon 的行为不依赖业务后端类型。

**Non-Goals:**

- 本变更不实现特定 agent 的嵌入、自动唤醒或 MCP server。
- 不实现通用网页设计稿批注、设计版本对比、云托管或共享密钥库。
- 不接入企业发布平台，不实际部署任何环境，不发布 npm 包。
- 不承诺抵御拥有同一操作系统用户任意 shell、调试或浏览器控制权限的主动攻击者。不同 Node 进程本身不是安全沙箱。
- 不自动调用模型学习 CLI；既有 agent 负责生成和修正接入源码，Paneon 负责运行、校验及复用。
- 不提供业务任务、调度、监控、日志采集/存储、重试、业务结果持久化或外部进程管理；不内置命令执行器、HTTP 客户端封装或业务后端适配协议。

## Decisions

### 单 npm 包提供 CLI、SDK 与组件

沿用现有单包，新增 `paneon/sdk` 和 `paneon/ui` 导出。AI 使用普通 TypeScript/React 导入；CLI 加载的任意目录面板定义由编译器固定解析到当前 Paneon 安装的 SDK、React 与组件版本，不要求每个面板源码目录都执行 npm 初始化。

新依赖采用 Fastify、Zod、better-sqlite3、semver、CodeBlock 的 Shiki 高亮依赖、Markdown 的 react-markdown/remark-gfm/github-markdown-css 及选用的 shadcn/ui 组件依赖。TypeScript、Vite 和面板转换插件属于运行面板所需依赖，随安装分发；产品构建产生 `dist/cli`、`dist/compiler`、`dist/runtime`、`dist/sdk`、`dist/ui` 和 `dist/web`，更新 `exports`、`files` 及相应构建入口。

使用现有 `node:test` 验证 SDK、协议和服务；浏览器闭环用 Playwright。无需为了本变更迁移测试框架或改成多包仓库。

选择理由：现有骨架足够承载产品；相比多包发布，单包更容易保证 CLI、编译器、组件与运行时的版本一致。

### 面板声明 Paneon 包版本范围

CLI、SDK、组件、编译器和本地服务共用 `paneon` 包版本，面板不再声明独立 SDK 契约编号。使用必填的 `requires.paneon` 字符串表达所需包版本范围，按 npm semver 范围语法校验，用 `semver` 库解析与匹配，不自行实现版本比较。以下 `1.4.x` 等版本号均用于说明机制，不代表当前产品版本或发布计划。

```tsx
export default definePanel({
  id: 'example-panel',
  requires: { paneon: '>=1.4.0 <2.0.0' },
  // input、events、render 等定义
});
```

编译器从入口 `definePanel` 对象静态提取 `requires.paneon` 字符串字面量，在执行任何面板模块（包括其导入的副作用）之前校验。不允许通过运行表达式计算范围；缺失、空值、非字符串字面量或非法范围返回 `INVALID_PANEON_REQUIREMENT`。当前安装版本不满足时返回 `PANEON_VERSION_UNSUPPORTED`，非敏感错误详情包含 requiredRange、currentVersion 和 entryPath，并提示迁移源码或由使用者选择匹配版本；不启动新面板 handler，不隐式下载/切换版本，不自动扩大范围或改写源码。

<!-- prettier-ignore -->
| 面板要求 | 当前 Paneon 版本 | 行为 |
| --- | --- | --- |
| `>=1.4.0 <2.0.0` | `1.3.0` | 拒绝：低于最低要求 |
| `>=1.4.0 <2.0.0` | `1.4.2`、`1.5.0` | 范围满足，继续类型检查和编译 |
| `>=1.4.0 <2.0.0` | `2.0.0` | 拒绝：达到排除的上界 |

预发布版本沿用 semver 库的默认匹配规则，不默认放宽为稳定范围可接受。当前 `0.x` 阶段不假设所有 `0.x` API 都兼容；作者按已经验证的版本声明较窄范围。稳定版本按 SemVer 维护兼容承诺：兼容新增提升次版本，不兼容变更提升主版本；发布时必须通过兼容性验证，范围声明本身不构成行为正确的证明。范围满足后仍执行类型检查、依赖边界检查与构建，缺失 API 等错误照常拒绝，不能仅凭版本匹配宣称面板可用。

面板 manifest 保存 requires 和实际构建包版本 paneonVersion。revision 摘要同时包含源码、本地依赖与构建所用 Paneon 包版本；升级后不能直接复用其他包版本编译的缓存，必须重新校验并构建。恢复不兼容面板定义时保留配置、事件和消费位置，将实例标记 unavailable 并给出版本错误，不执行其模块；同一服务内 reload 失败仍保留当前安装版本构建的旧可用 revision。

面板依赖范围与内部 CLI/服务协议是两回事。`runtime.json` 和 `/health` 同时提供 paneonVersion 与 protocolVersion；CLI 核验身份、内部协议及与自己完全相同的包版本。升级后旧服务进程不会自动更新；不匹配时返回 `RUNTIME_VERSION_MISMATCH` 并提示重启，不自动终止服务或混用新旧 SDK。`paneon server stop` 只在身份、认证和内部协议校验通过时允许跨包版本执行，便于使用者显式停止旧服务；其他控制操作拒绝版本不匹配。重启后按新版本重新验证面板，版本检查不等同于源码迁移。

### 面板定义是源码，运行时只管理实例和交互记录

<!-- prettier-ignore -->
| 概念 | 类型名称 | ID 来源与用途 |
| --- | --- | --- |
| 面板定义 | `PanelDefinition` | `definePanel` 返回的定义对象；其中 `id` 由作者填写，对外通过 `definitionId` 表示，用于标记实例来自哪一个定义 |
| 面板实例 | `PanelInstance` | 每次 `panel run` 生成一个新的 `instanceId`，用于 inspect/reload/close/events/ack 及消息桥和事件绑定 |

同一面板定义可以创建多个实例。例如 `definitionId: 'pr-viewer'` 可以对应 `instanceId: 'instance-a'` 和 `instanceId: 'instance-b'`。命令参数写作 `<instance-id>`；命令分组仍为 `paneon panel`，不新增 definition/instance 命令组。定义内的 `id` 保持原有 SDK 写法，返回结构的 `definitionId` 明确指向该值；它不用于运行实例的去重或操作。

服务进程的身份字段使用 `runtimeId`，避免与面板的 `instanceId` 混淆。存储表 `panels` 保存面板实例，`panels.id` 对应 `instanceId`，`definition_id` 对应 `definitionId`；events/consumers 使用 `instance_id` 关联该实例，不新增面板定义注册表。

可复用面板定义最少只有 `release.tsx`，允许相对导入任意本地业务模块。入口通过 `definePanel({ id, requires, input, events, render })` 声明稳定的面板定义标识、Paneon 包版本范围、参数 schema 和允许提交的事件 schema；默认导出面板定义。入口代码、本地依赖与构建所用 Paneon 包版本共同构成 revision 摘要。

每次 `panel run` 创建独立 `instanceId`；相同源码可同时以不同应用、目录和参数运行。`panel reload` 保留实例标识和事件记录，更新源码版本。绝对入口路径、显式工作目录、参数和版本摘要绑定到实例，不把实例状态写回面板源码目录。移动面板定义后可以重新 `panel run`，已经关闭实例的历史仍可读取。

自动 reload 设置属于面板实例，不写入可复用面板源码；同一面板定义的不同实例可以选择不同模式。`panel run`、`list` 和 `inspect` 的结果展示实际生效的 `watch` 布尔值。

动作和界面可以在一个文件中声明；复杂接入可按普通模块规则拆分。外部第三方依赖须从面板定义自身依赖中解析；无法解析时给出具体错误，不静默联网安装包。SDK 与 React 维持单实例。

### SDK 将界面调用映射到两条明确路径

以下 API 对应本次实现。`./business` 是作者自带的模块，内部可以使用普通 Node.js 库、HTTP 客户端或 CLI；Paneon 不规定其实现。

```tsx
import { definePanel, serverAction, usePanelInput, agent, z } from 'paneon/sdk';
import { Page, Button, Stack } from 'paneon/ui';
import { publish } from './business';

export const deploy = serverAction({
  kind: 'mutation',
  input: z.object({ branch: z.string().min(1) }),
  handler: async (_ctx, input) => publish(input),
});

function ReleasePanel() {
  const { branch } = usePanelInput<{ branch: string }>();
  return (
    <Page title="预发发布">
      <Stack>
        <Button onClick={() => deploy({ branch })}>直接发布</Button>
        <Button onClick={() => agent.emit('deploy-requested', { branch })}>请 AI 发布</Button>
      </Stack>
    </Page>
  );
}

export default definePanel({
  id: 'release-panel',
  requires: { paneon: '>=1.4.0 <2.0.0' },
  input: z.object({ branch: z.string().min(1) }),
  events: { 'deploy-requested': z.object({ branch: z.string().min(1) }) },
  render: ReleasePanel,
});
```

- `serverAction` 在浏览器中成为类型化本地函数代理，调用返回 `Promise<Result>`；函数返回值或可序列化错误反馈给调用方。Paneon 不解释业务成功标准，不创建持久 taskId，也不采集函数内部输出。
- `agent.emit(type, payload)` 写入有界、通过 schema 校验的语义事件，不执行对应业务，不自动唤醒会话。页面明确显示“已提交给 AI”。
- 动作显式声明 `kind: 'query' | 'mutation'`，默认 mutation。`useQuery(action, input, { refreshMs })` 只接受 query，提供通用加载/错误状态和可选页面刷新；同一查询订阅不重叠运行，订阅结束时停止定时刷新。刷新调用的是作者定义的函数，结果只保存在页面内存；不监测其业务后端，也不替函数重试。mutation 不能作为自动刷新目标。
- 原生 React 交互只影响页面状态；SDK 只持久化主动提交的事件，不采集每次鼠标移动、输入字符或业务调用结果。

相比 JSON UI DSL，普通代码更适合循环、状态、条件和复用；组件外观及稳定运行能力由产品统一提供。

### 业务调用完全属于面板作者

Paneon 的服务端职责是校验和调用已声明的本地函数，提供返回值、错误和必要的生命周期信号。作者可自行使用 `node:child_process`、`fetch` 或任意可解析依赖；Paneon 不提供 `ctx.exec`，不要求被调用的 CLI、HTTP API 或其他程序适配 Paneon。

业务的排队、调度、超时、取消、重试、状态查询、日志展示/落盘、结果存储及恢复均由作者代码负责。需要进度或日志时，作者自己定义查询、返回数据和界面，也可以依赖已有业务系统。普通组件只展示传入的数据，不绑定 Paneon 任务模型。

Paneon 自身的编译、服务连接和函数调用协议错误属于框架诊断。框架不主动采集 action worker 的 stdout/stderr，不将其转发为 CLI 输出、WebSocket 业务日志或持久日志；默认丢弃业务代码的控制台输出，避免未经声明的输出进入 agent 上下文。需要这些输出时由作者显式处理。这项默认行为不是业务日志服务，也不约束作者自行写文件或访问外部系统。

### 同源文件的前后端分离需要真正的编译边界

Vite 负责编译与打包；自定义插件使用 TypeScript AST 找到模块顶层、具名导出的 `serverAction` 声明。动作标识为 `相对模块路径#导出名`，完整动作引用还包含 `instanceId` 和源码版本摘要。

编译器生成两个可达依赖图：浏览器图将动作替换为代理；Node 图保留 handler、schema 及明确的模块级依赖，移除 React 渲染入口。仅用于动作的 Node 导入不能进入浏览器 bundle。前端代码引用 Node 内置模块、服务端模块或动作 handler 时，构建失败并指出源位置。

支持模块级 action、纯辅助函数和可静态追踪的导入；不支持在 React render 内动态声明 action，也不支持捕获页面闭包、可变模块状态或无法判断执行侧的动态导入。无法安全拆分时返回 `UNSUPPORTED_ACTION_CAPTURE` 等明确诊断，不回退为整文件在两端执行。参数必须通过显式调用传递。

构建由独立编译子进程在实例临时目录完成；同步 TypeScript 分析不占用 HTTP 服务的事件循环，编译期间健康检查及其他面板请求仍可响应。校验 requires.paneon、类型和依赖边界后才原子切换 revision。 浏览器构建固定为一致的生产 JSX/React 环境，不继承 watcher 使服务进程进入的开发模式；生产常量替换仅用于浏览器产物，服务端 action 保留执行进程的环境读取。同次构建的版本声明、类型检查、AST 双图及代码转换读取同一份源码快照；revision 按快照字节计算，提交前核对作者依赖仍一致。构建期间输入改变则返回 `BUILD_SOURCE_CHANGED` 并丢弃该产物，后续保存仍由已有 Vite 监听处理，不增加自动重试或另一套调度。失败保留上一个可用版本并标记 reload 失败。旧页面提交到旧动作版本时返回 `PANEL_REVISION_MISMATCH`，由用户刷新后重新决定，禁止自动重新调用 mutation。

### 自动 reload 由 agent 按面板选择

`paneon panel run` 默认 `watch: true`，`--watch` 显式开启，`--no-watch` 显式关闭；同时指定互斥选项时返回参数错误。模式持久化在实例记录，服务重启时按原设置重建监听，不因重启改变选择。手动 `paneon panel reload <instance-id>` 在两种模式下均执行一次重载，不改变 watch 设置。

源码更新复用 Vite 的监听与编译能力，覆盖入口和可达的本地 TS/TSX、样式及资源依赖；配置排除构建产物、运行目录和无关文件，避免自触发循环。连续修改的调度沿用工具链现有能力，不另写一套热更新或旧版本执行管理机制。Node 侧 serverAction 使用已打包的 server.js，由隔离 worker 通过 Node 原生 import 加载；使用 `pathToFileURL` 编码文件路径，避免特殊字符改变导入含义。执行与元数据 worker 内不启动 Vite dev server。主进程的 Vite watcher 触发现有更新检查，需要重建时重新编译并替换已有执行 worker，旧进程退出时释放其模块缓存；不假设 TypeScript 提供 HMR，也不假设浏览器 HMR 会自动处理自定义 RPC/worker，实施时验证实际更新行为。

校验通过后按工具链能力更新模块或重载页面，并同步当前 revision；失败显示具体诊断并保留旧可用面板，修正源码后继续监听。未提交的 React 局部状态能否保留遵循工具链实际行为，宿主显示更新结果；已保存事件和消费进度不受影响，不另行实现页面状态迁移或恢复。revision 仅继续承担请求身份及构建校验职责，不用于额外维持多个执行版本。

运行时不因 reload 自动重新调用 mutation。正在执行的函数能否继续、页面是否还能收到结果，遵循所集成模块更新/运行环境的行为；Paneon 不额外保留旧 worker/产物等待函数完成，不做旧调用接管、结果迁移或跨重启恢复。若业务需要跨页面跟踪，作者自行提供查询和存储。

后续实现的细节分别由相关 change 维护：[未变化自动构建的复用](../skip-unchanged-watch-builds/design.md)、[共享源码监听与 UI 打包边界](../reduce-bundles-and-fix-source-watching/design.md)、[有界面板驻留与监听恢复](../add-panel-resource-lifecycle/design.md)。自动更新命中复用时不替换执行环境；只有监听的面板更新后也不因此创建执行 worker。重启后的监听按需恢复，不在服务启动时批量创建。

仅从生成文件看不到服务端代码不是充分证明；验收须检查前端依赖图、产物和真实浏览器请求中均没有 handler、Node 导入及服务端专属数据。

### 默认组件预集成，页面处于隔离视图

本次迭代以 shadcn 官方默认主题和组件样式作为视觉基线，采用其默认 Neutral 主题，保留所集成组件的默认字体/字号、尺寸、间距、圆角、边框、颜色、焦点及状态样式。不额外设计 Paneon 的主题参数表，不全局覆盖官方控件高度、字号或圆角来统一为自定义值。实施时在仓库记录并固定官方来源版本与生成配置，所有组件使用同一套基线，发布的产物不在运行时追随 upstream latest。

Page、Section、Stack 只补齐官方基础控件之外的页面内容宽度、标题区、分区和排列等必要布局，复用同套 Tailwind 间距与官方主题变量；不借这些布局组件重新包装一套视觉风格。StatusBadge 复用 Badge 的现有样式和 variant，代码高亮复用社区提供的主题，不自行设计额外配色方案。面板作者仍可主动提供自己的类名或自定义组件，这不会变成 Paneon 默认主题的修改。

`paneon/ui` 预集成下列组件和配套导出，基础组件优先沿用选定 shadcn/ui 实现的属性、事件及组合方式；CodeBlock 提供下述代码展示组合接口，不再为它们设计另一套 Paneon 专属业务协议。以下是本次迭代的完整组件范围，包含 29 个主组件（组件族配套导出另列）；组件族中的配套导出属于同一组件的使用能力，不作为独立主组件计数。

<!-- prettier-ignore -->
| 组件范围 | 公共导出 | 用途 |
| --- | --- | --- |
| 页面布局 | Page、Section、Stack | 页面、内容分区、排列及间距 |
| 按钮 | Button | 操作入口 |
| 文本输入与字段标签 | Input、Label | 单行输入及字段说明 |
| 表单项与分组 | Field、FieldContent、FieldLabel、FieldTitle、FieldDescription、FieldError、FieldGroup、FieldSet、FieldLegend、FieldSeparator | 组合控件、标签、说明、错误及语义分组 |
| 卡片 | Card、CardHeader、CardTitle、CardDescription、CardAction、CardContent、CardFooter | 方案、选项和详情摘要 |
| 单选组与复选框 | RadioGroup、RadioGroupItem、Checkbox | 方案单选、多选、勾选操作对象 |
| 多行输入 | Textarea | 反馈、补充要求和多行文本 |
| 下拉选择 | Select、SelectTrigger、SelectValue、SelectContent、SelectItem、SelectGroup、SelectLabel、SelectSeparator | 选项选择与分组 |
| 标签与状态展示 | Badge、StatusBadge | 作者传入的分类、标记及状态 |
| 提示与等待反馈 | Alert、AlertTitle、AlertDescription、Spinner | 作者控制的提示内容及等待标记 |
| 基础表格 | Table、TableHeader、TableBody、TableFooter、TableRow、TableHead、TableCell、TableCaption | 作者传入数据的表格展示 |
| 分页导航 | Pagination、PaginationContent、PaginationItem、PaginationLink、PaginationPrevious、PaginationNext、PaginationEllipsis | 作者控制的页码、上一页/下一页和省略提示 |
| 页签 | Tabs、TabsList、TabsTrigger、TabsContent | 在多个内容区之间切换 |
| 对话框 | Dialog、DialogTrigger、DialogContent、DialogHeader、DialogTitle、DialogDescription、DialogFooter、DialogClose | 详情或输入对话框 |
| 确认对话框 | AlertDialog、AlertDialogTrigger、AlertDialogContent、AlertDialogHeader、AlertDialogTitle、AlertDialogDescription、AlertDialogFooter、AlertDialogAction、AlertDialogCancel | 作者主动配置的确认/取消交互 |
| 手风琴 | Accordion、AccordionItem、AccordionTrigger、AccordionContent | 分组详情的单项或多项展开 |
| 折叠区 | Collapsible、CollapsibleTrigger、CollapsibleContent | 单个内容区展开/收起 |
| 提示浮层 | Tooltip、TooltipProvider、TooltipTrigger、TooltipContent | 悬停或键盘聚焦时展示说明 |
| 下拉菜单 | DropdownMenu、DropdownMenuTrigger、DropdownMenuContent、DropdownMenuGroup、DropdownMenuLabel、DropdownMenuItem、DropdownMenuSeparator、DropdownMenuShortcut、DropdownMenuCheckboxItem、DropdownMenuRadioGroup、DropdownMenuRadioItem、DropdownMenuSub、DropdownMenuSubTrigger、DropdownMenuSubContent | 收纳操作、选择项与子菜单 |
| 弹出内容区 | Popover、PopoverTrigger、PopoverContent、PopoverAnchor | 就地展示详情或紧凑表单 |
| 开关 | Switch | 布尔选项切换 |
| 代码块 | CodeBlock | 代码、命令、配置的只读展示 |
| Markdown 文档 | Markdown | Markdown 字符串的只读渲染 |

Tabs、RadioGroup、Checkbox、Switch、Textarea、Accordion、Collapsible 等交互组件支持社区组件原有的受控/非受控方式，以及其适用的禁用状态、焦点与键盘交互；Tabs 支持按值控制内容切换，Checkbox/Switch 的变化由作者接收回调，Textarea 使用普通 React 文本输入语义。组件本身不主动调用业务动作、提交 agent 事件或持久化值；作者自行绑定 serverAction、agent.emit 或本地 React 状态。

Field 组件族负责表单项排版、控件与文案组合、分组及错误呈现，可组合已有 Input、Textarea、Select、Checkbox、Switch、RadioGroup。FieldLabel 不替换通用 Label，FieldError 只显示作者传入的错误，不自动执行业务校验。作者通过 id/htmlFor、aria-describedby、aria-invalid 等属性明确建立控件、标签、说明和错误之间的关系；值、校验时机、校验规则、错误状态及提交行为仍由作者代码管理。不强制引入 React Hook Form 等表单状态库，不自动持久化输入或生成 agent 事件。基本用法示意：

```tsx
<Field>
  <FieldLabel htmlFor="branch">分支</FieldLabel>
  <Input id="branch" aria-describedby="branch-description" />
  <FieldDescription id="branch-description">选择要加入集成区的分支</FieldDescription>
</Field>
```

Card 及配套组件负责标题、说明、操作区、正文和页脚的布局，不承担方案选择或业务执行；作者可组合 RadioGroup/Checkbox 和 Button。RadioGroup 保持单选语义，支持键盘选择、受控值和禁用选项。

Alert/AlertTitle/AlertDescription 展示作者传入的提示内容；Spinner 展示作者控制的等待状态，并支持可访问的说明。它们不监控 handler、推断成功/失败或触发业务重试。Accordion 按作者配置支持单项/多项展开，Collapsible 控制单一区域的展开；两者均有受控/非受控状态和键盘操作。

Dialog 与 AlertDialog 提供完整标题、描述、内容及操作区，验证打开/关闭、键盘交互、焦点约束与关闭后焦点返回。AlertDialog 的取消不调用作者确认回调，确认后的业务行为完全由作者绑定，不为所有动作自动增加确认步骤。

TooltipProvider 默认安装在面板 iframe 内的 React 根，避免只在外层宿主设置而无法传递 React context；同时导出给作者按需配置。Tooltip 支持悬停和键盘聚焦，弹层位置及层级在 iframe 内验证。

DropdownMenu 支持分组、分隔、禁用项、普通操作项、勾选/单选项与嵌套子菜单；快捷键说明只负责展示，业务回调和快捷键注册由作者决定。Popover 支持受控/非受控打开状态、触发器、锚点及内容区，作者可在内容区组合已有输入控件。两者均验证 iframe 内定位/边界、层级、键盘导航或焦点管理、Escape/外部点击关闭与焦点返回；打开或关闭不会隐式提交 agent 事件，菜单项和表单的业务行为由作者显式绑定。

Pagination 复用社区分页组合方式，提供页码链接、当前页标记、上一页/下一页和省略提示，可与 Table 或任意列表组合。组件不维护业务页码状态、不计算数据总量、不执行分页查询；作者通过 isActive、链接属性或 onClick 等方式控制导航和本地状态，并自行处理不可用的首尾边界。采用 React 本地翻页时由作者阻止默认链接导航，并在需要时调用自己声明的查询；不要求接入特定路由库、数据表库或业务 API。验收覆盖点击/键盘、当前页可访问标记、首尾边界、单页/空数据组合和 iframe 内样式。

Badge 提供通用视觉标记，StatusBadge 是状态语义的轻量组合；两者只展示作者传入的内容和状态，不查询或推断业务运行状态。

CodeBlock 复用社区的代码展示和高亮能力，提供 `code: string`、可选 `language: string` 及常规样式属性，保留空格/换行、使用等宽字体并支持长行横向滚动。使用 Shiki JavaScript 引擎进行高亮，语言语法和主题按需打包为本地资源，不依赖 CDN 或运行时访问外网；本次覆盖 javascript/js、typescript/ts、jsx、tsx、json、bash/sh、yaml/yml 和 diff。未指定或不支持的语言按明确支持的纯文本模式显示，不把它当成高亮成功。代码始终作为展示数据处理，不作为 HTML、脚本或命令执行；本次不引入编辑器、终端、命令执行按钮或业务日志采集。使用方式示意：

```tsx
<CodeBlock code={'git status\ngit diff'} language="bash" />
```

Markdown 接受 Markdown 字符串，提供标题、段落、列表、链接、引用、行内代码与围栏代码块的只读渲染。渲染采用 [react-markdown](https://github.com/remarkjs/react-markdown) 并集成 remark-gfm，支持 GitHub 风格表格、删除线、只读任务列表及自动链接等 GFM 语法；排版采用社区维护的 [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) 的 github-markdown-light.css，在 Markdown 容器内使用 markdown-body 类，不改变外层 shadcn 控件样式。不自定 Paneon Markdown 皮肤，实施时固定依赖版本并记录配置；github-markdown-css 是复现 GitHub 样式的社区项目，不冒称 GitHub 官方组件。渲染依赖和样式随包提供，在面板 iframe 内加载；内容不作为 JSX、脚本或命令执行，默认不启用原始 HTML 解析。不引入编辑器、批注或文档存储功能。

官方主题变量和组件静态样式随产品构建分发，在宿主与面板 iframe 中分别正确加载同一套基线，避免误以为外层 CSS 会跨 iframe 继承。清理初始化验证页的演示配色，防止其覆盖默认主题；组件默认无需面板 CSS，面板作者自己的类名由面板构建处理。agent 指南及示例覆盖上述导出，Tabs 必须能组合出可操作页签，不能只提供名义上的根组件。

宿主页面负责实例导航、连接/版本状态和框架运行状态通知；面板组件在 `sandbox="allow-scripts"` 的 iframe 中运行，SDK 通过 `postMessage` 与宿主建立带随机 channelId 的通信。宿主检查消息的 `source`、instanceId、revision、channelId、requestId 和参数 schema，隔离不同面板。

默认 CSP 限制外联、框架嵌套与导航。外部服务访问通过本地动作完成；组件和依赖打包为本地资源。

静态路由仅开放 manifest 中的浏览器资源白名单，禁止直接挂载整个构建目录；服务端入口、源码映射和运行数据不能被浏览器下载。opaque-origin iframe 的模块加载所需 CORS 只应用于无秘密的浏览器静态资源，不放宽 API 的认证与来源检查。

本次页面包括：宿主实例列表和运行中的面板。演示面板包括环境选择、分支表格、流水线步骤、直接部署/请求 AI/刷新按钮；展示哪些业务信息由示例作者代码决定。另有纯函数和 HTTP 示例，避免把发布场景当成核心契约。

组合示例以可复制修改的本地 TSX 提供，覆盖方案对比、参数表单和表格操作页，并演示加载、空内容、错误、禁用及成功反馈的组合写法。另增加至少一个真实工具接入示例，选用 gh CLI，以仓库/PR 操作面板展示列表、详情和交互动作，实施时核对所用命令能力；示例说明安装、登录等前提、启动方式和可操作功能，同时展示直接调用服务端函数与提交 agent 事件两种绑定方式。CLI/OpenAPI 的调用、数据转换和业务状态由示例模块实现，不新增框架级执行器或监控/日志功能。本次仅记录要求，不执行这些外部工具的业务操作。

### CLI 只负责控制和读取，服务独立运行

命令名称和职责如下；`--json` 输出稳定 envelope，stdout 只放结果，诊断写入脱敏 stderr。CLI 生成的帮助、状态提示、警告、错误说明及框架诊断统一使用英文，不随系统语言变化；用户参数、事件 payload、业务返回数据及其中文内容原样保留。该约定不限制面板界面或研发文档的语言。已有 `--help`、`--version` 保持工作。

```text
paneon panel run <entry.tsx> --cwd <directory> --params '<json>' [--watch | --no-watch] [--open] [--json] [--debug]
paneon panel list [--page <number>] [--page-size <count>] [--json] [--debug]
paneon panel inspect <instance-id> [--json] [--debug]
paneon panel reload <instance-id> [--json] [--debug]
paneon panel close <instance-id> [--json] [--debug]
paneon panel events <instance-id> --consumer <name> [--wait-ms <ms>] [--limit <count>] [--json] [--debug]
paneon panel ack <instance-id> --consumer <name> --through <event-id> [--json] [--debug]
paneon server status [--json] [--debug]
paneon server stop [--json] [--debug]
```

`panel run` 确保包版本一致的服务已启动、检查面板版本范围、注册并编译面板，返回实例和 URL 后退出。显式 `--open` 才请求系统浏览器打开；通用能力不依赖浏览器自动化或 CDP。启动锁、服务身份和健康检查防止同时启动多个同一运行目录的服务；发现陈旧描述文件时先确认进程和服务身份。

`panel inspect <instance-id>` 返回已有实例信息及当前服务的普通访问 URL。链接可重复打开，不因使用次数或时间到期；服务重启、端口改变后，agent 可再次 inspect 获取当前地址，无需重新 run。instanceId、参数、事件和消费位置不变，不因 inspect 编译/reload、调用业务函数或重新打开已关闭面板；closed/unavailable 实例的链接仅打开相应状态页。

`panel close` 拒绝该实例的新调用并停止其监听/订阅，向在途函数的 `ctx.signal` 发出关闭信号；服务释放该实例的 worker。`server stop` 关闭所有实例的运行资源并退出，不删除交互历史。信号是通用协作机制，不表示外部业务已经取消；作者决定是否使用 signal 及怎样清理自己的进程、连接或远端任务。停止 worker 不能保证撤销已经发生的外部副作用。

重启只恢复面板配置、源码版本所需信息、监听选择、事件及消费位置；面板通过新安装版本的兼容性校验后才重建，失败保留记录并标记 unavailable；不恢复在途函数、业务状态或调用结果，不重新执行 mutation。agent/短命令退出不影响本地服务运行。

`panel events --wait-ms` 有界等待，默认立即返回，等待范围 0–60000 毫秒（最多 60 秒），默认最多返回 100 条、上限 1000 条。空结果是正常 JSON 结果，读取不确认消费。

### CLI 按对象统一分组

面板操作全部归入 `paneon panel`，服务管理归入 `paneon server`。现有 7 个面板/事件命令和 2 个服务命令按对象组织，命令多一个单词，换取明确的作用对象和一致的帮助结构。不为旧平铺设计另设顶层快捷命令。

`paneon panel close <instance-id>` 只关闭指定面板；`paneon server stop` 停止整个服务及全部面板的运行资源。分组不改变交互历史保留、生命周期或本地函数契约。`paneon panel run` 仍按需启动服务，不增加必须手动启动服务的步骤。

`paneon --help` 展示 panel/server 两组入口；`paneon panel --help` 和 `paneon server --help` 展示各组操作，每个具体命令支持 --help。`--version` 保留顶层入口，watch、params、open、wait-ms、limit、json、debug 等选项按下文契约定义。

### CLI 命令输入与输出契约

本节定义本次迭代的 CLI 接口。下方路径、ID、时间、事件及访问地址均为示意数据，不是实际执行结果。示例中的 `0.0.0` 仅演示版本字段；运行时返回实际安装/构建版本。

完整初版命令表、数据类型、各命令结果和失败示例见 [cli-contract.md](cli-contract.md)。当前命令扩展以 [CLI 使用参考](../../../skills/paneon/references/cli.md) 和各后续 change 为准。

### CLI 调试输出显式开启

`--debug` 是全局布尔选项，默认 false，各命令均支持；允许放在子命令前或后，如 `paneon --debug panel inspect <instance-id>` 与 `paneon panel inspect <instance-id> --debug` 等价。不开启时不输出 debug 级细节；必要警告和错误始终可见，不能要求用户先开 debug 才知道命令失败。

stdout 保持命令结果，`--json` 时只输出既定 JSON 结果；stderr 输出英文诊断，debug 行使用 `[debug]` 前缀。debug 不改变命令返回数据、事件消费语义、退出码或业务行为。可输出范围仅限当前 CLI 命令的框架步骤及允许的元数据，例如服务发现/连接与版本校验、请求标识、编译或 reload 请求的等待耗时、错误码和框架自身的排错位置；不以 debug 名义采集面板代码的日志或原始异常。

以下为输出结构示例，stdout 与 stderr 分开显示，字段值仅为示意：

```sh
paneon panel close instance-example --json --debug
```

```text
# stderr
[debug] command.start
[debug] command.complete elapsedMs=12
```

```json
{
  "ok": true,
  "data": { "status": "closed", "alreadyClosed": false }
}
```

调试诊断按元数据白名单构造，不转储参数或响应对象。即使开 debug，也不输出业务密钥、控制 token、外部系统 cookie、带凭据的 URL、完整请求正文、环境变量值、源码正文或业务输入/输出；框架内部异常需过滤后才能展示，handler 原始异常仍按 ACTION_FAILED 契约处理。

本次 `--debug` 仅作用于当前命令进程，进程退出即结束，不持久化为面板配置，不改变已运行服务的全局日志级别，也不为新服务永久开启 debug。自动 reload 和浏览器触发的函数调用不会因此获得持续调试日志。本次不新增后台服务调试环境变量、后台日志文件或日志读取命令；编译/连接等必要错误仍走既有框架错误反馈。这样明确当前开关的作用范围，不把一次 CLI 调用误当作后台服务日志配置。

### 协议和状态

服务仅监听 `127.0.0.1`。浏览器直接打开 run/inspect 返回的普通面板 URL，不交换一次性凭证、不设置用于访问认证的 cookie、不建立登录会话，也不让链接随时间或使用次数过期。CLI 从权限受限的 runtime.json 读取 controlToken；该控制凭据不出现在浏览器 URL、页面脚本、事件或框架诊断中。

浏览器访问规则如下，预期地址由服务实际监听的 host/port 确定，不能根据未经校验的请求 Host 动态放宽：

- Host 必须完整匹配当前服务的 `127.0.0.1:<port>`，拒绝其他 Host。所有 API 均不向任意外部 Origin 开放 CORS。
- 浏览器 POST/DELETE 等操作请求必须携带完整匹配的 Origin。例如监听端口为 42173 时，仅接受 `Origin: http://127.0.0.1:42173`；协议、主机及端口都必须一致，不使用后缀或子串匹配。其他 Origin、字面值 null、空值和缺失 Origin 的浏览器操作请求一律拒绝，不能将“没有 Origin”当作 CLI 放行。
- CLI 请求通过有效 controlToken 单独认证，不依赖 Origin 作为身份依据；无有效控制凭据的无来源请求不能走这条例外。即使提供控制凭据，显式不匹配的浏览器 Origin 也不放行。
- 普通页面导航及 manifest 白名单中的公开静态资源允许浏览器正常 GET 加载，但这些 GET 不调用作者函数或执行状态变更。读取配置、事件及 WebSocket 等非公开 API 仍校验来源：浏览器请求有 Origin 时检查 Origin，没有时检查 Referer 的完整 origin；无法确定可信来源则拒绝，CLI 仍走控制凭据认证。宿主设置 `Referrer-Policy: same-origin`，支持正常同源 GET；POST/DELETE 不以 Referer 代替必需的 Origin。
- 面板 iframe 继续通过 postMessage 请求可信宿主，再由宿主向本地 API 发请求；不因为 sandbox iframe 的 Origin 可能为 null 就放宽 API 检查。宿主继续验证来源窗口、channelId、instanceId、revision 和声明能力。

上述规则用于拒绝浏览器跨站调用；不将 Origin 当成同机任意程序不可伪造的身份。静态模块为 opaque-origin iframe 所需的无秘密资源 CORS 例外仍按前述白名单执行，不延伸到 API。业务密钥由页面和业务代码通过普通动作参数处理。

HTTP 接口清单：

```text
GET    /health                                  服务身份、paneonVersion、protocolVersion、状态
GET    /panels/:instanceId                       普通面板访问页，无链接凭证及有效期
GET    /panels/:instanceId/:revision/*                   仅返回 manifest 允许的浏览器资源
POST   /api/panels                              编译并创建实例
GET    /api/panels                              列出实例
GET    /api/panels/:instanceId                          读取实例配置、版本要求、构建包版本及框架状态
POST   /api/panels/:instanceId/reload                    构建并切换源码版本
POST   /api/panels/:instanceId/close                     关闭实例运行资源
POST   /api/panels/:instanceId/actions/:actionId         校验并调用函数，返回结果或错误
POST   /api/panels/:instanceId/events                    追加语义事件
GET    /api/panels/:instanceId/events                    按 consumer 增量读取及有界等待
POST   /api/panels/:instanceId/acks                      显式推进消费位置
GET    /api/panels/:instanceId/stream                    WebSocket 状态通知，不推进消费位置
POST   /api/stop                                停止服务
```

协议返回统一为 `{ "ok": true, "data": ... }` 或 `{ "ok": false, "error": { "code": "...", "message": "..." } }`。请求关联包含 instanceId、revision 和 requestId；requestId 仅用于关联响应，不是业务任务 ID。函数返回值校验可序列化；框架不推断业务状态。SDK 对 handler 异常返回通用 `ACTION_FAILED`，不自动向浏览器或 CLI 输出原始异常、堆栈或任意业务对象；作者可主动返回适合展示的结构化业务错误。

动作调用无自动重试。连接中断只表示结果未收到，不能据此判断业务成功或失败，也不触发重新调用。Paneon 不承诺业务幂等或跨进程去重，作者如有需要自行实现。

状态通知使用 WebSocket，避免每个标签页的 SSE 长连接占满同源 HTTP/1.1 连接池。宿主使用浏览器原生 WebSocket，服务端使用 `@fastify/websocket`。握手必须同时通过精确 Host 和 Origin 校验，不以 Referer 或 CLI 控制凭据代替 WebSocket 的 Origin。宿主 CSP 仅额外允许实际服务地址的 `ws://127.0.0.1:<port>`。每次断线后以 500ms 起步、上限 10s 的退避重连；成功后读取当前状态，不依赖遗漏通知。页面卸载取消重连并关闭连接，服务停止清理订阅与心跳。多个连接共用运行时状态监听器，按 instanceId 分发通知。

WebSocket 只推送构建、revision、连接等框架状态及已提交事件的通知，不推送业务日志或任务状态。断线重连后读取面板当前配置与框架状态，事件仍经独立的持久消费协议读取；页面可重新执行已声明 query 获取业务数据，不重放 mutation。

### 存储结构与消费语义

`runtime.json` 中的 paneonVersion 表示当前服务进程的包版本；manifest 中同名字段表示该产物的构建包版本。protocolVersion 仅用于内部通信检查，数据库 schema_meta.version 仅用于存储结构迁移，都不作为面板 SDK 的独立兼容编号。下方版本值为示意。

`PANEON_HOME` 是程序内部常量，固定为当前用户主目录下的 `~/.paneon`，由 CLI 和服务共用同一份路径定义。它不是环境变量，不读取 `process.env.PANEON_HOME`；本期不提供 CLI 参数或配置文件修改该目录。目录权限限制为当前用户，面板定义不要求位于该目录；面板的 `--cwd` 仍只指定作者代码的工作目录，不改变 Paneon 的运行存储位置。

路径定义放在 `src/shared/paths.ts`：

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';

export const PANEON_HOME = join(homedir(), '.paneon');
```

实际路径及内容如下：

```text
~/.paneon/runtime.json              当前服务描述，0600
~/.paneon/runtime.sqlite            面板配置、人机事件和消费位置
~/.paneon/panels/<instance-id>/         按 revision 存放构建产物及 manifest
```

`runtime.json` 示例；这些值为示意运行控制数据，不是用户密钥：

```json
{
  "paneonVersion": "1.4.2",
  "protocolVersion": 1,
  "runtimeId": "runtime-example",
  "pid": 12345,
  "port": 42173,
  "controlToken": "generated-per-runtime",
  "startedAt": "2026-10-20T08:00:00.000Z"
}
```

manifest 示例，保存版本要求及实际构建包版本，不嵌入机器秘密：

```json
{
  "requires": { "paneon": ">=1.4.0 <2.0.0" },
  "paneonVersion": "1.4.2",
  "definitionId": "release-panel",
  "revision": "sha256:example",
  "inputSchema": {
    "type": "object",
    "properties": { "branch": { "type": "string", "minLength": 1 } },
    "required": ["branch"]
  },
  "clientEntry": "client.js",
  "serverEntry": "server.js",
  "actions": [
    {
      "id": "release.tsx#deploy",
      "kind": "mutation",
      "inputSchema": {
        "type": "object",
        "properties": { "branch": { "type": "string", "minLength": 1 } },
        "required": ["branch"]
      }
    }
  ],
  "events": {
    "deploy-requested": {
      "type": "object",
      "properties": { "branch": { "type": "string", "minLength": 1 } },
      "required": ["branch"]
    }
  }
}
```

SQLite 使用事务和 WAL，结构版本明确保存，初始化 schema 如下：

```sql
CREATE TABLE schema_meta (version INTEGER NOT NULL);
CREATE TABLE panels (
  id TEXT PRIMARY KEY, definition_id TEXT NOT NULL, entry_path TEXT NOT NULL,
  cwd TEXT NOT NULL, params_json TEXT NOT NULL, revision TEXT NOT NULL,
  watch INTEGER NOT NULL,
  status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  requires_json TEXT NOT NULL, paneon_version TEXT NOT NULL, diagnostic_json TEXT
);
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id TEXT NOT NULL REFERENCES panels(id), revision TEXT NOT NULL,
  type TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX events_instance_id_id ON events(instance_id, id);
CREATE TABLE consumers (
  instance_id TEXT NOT NULL REFERENCES panels(id), consumer_id TEXT NOT NULL,
  last_delivered_id INTEGER NOT NULL DEFAULT 0,
  last_ack_id INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
  PRIMARY KEY(instance_id, consumer_id)
);
```

事件示例：

```json
{
  "id": 42,
  "instanceId": "instance-example",
  "revision": "sha256:example",
  "type": "deploy-requested",
  "payload": { "environment": "pre", "branch": "feature/example" },
  "createdAt": "2026-10-20T08:01:00.000Z"
}
```

首次读取创建 consumer，返回 `last_ack_id` 之后的事件并记录最大已交付 ID；没有 ack 时再次读取会重投递。`panel ack --through` 验证事件属于实例、已经交付且游标不回退，再在事务中推进位置；其他 consumer 不受影响。相同 consumer 并发读取/确认采用串行化或比较更新，禁止丢事件。已确认记录保留作历史，本变更不自动清理。

这提供至少一次事件交付，不宣称模型处理或外部副作用恰好一次。agent 或面板作者自行核验业务效果；系统不能假装业务副作用与 ack 原子。

Paneon 不创建 `tasks/` 日志目录或 tasks 数据表，不保存动作输入/返回值/错误的业务历史，不提供业务日志接口。作者自行创建的业务文件不属于 Paneon 运行目录规范。已有面板参数及显式事件也必须使用非密钥数据；业务密钥可通过普通输入框传给 server action，不由框架另行管理。

### 实际实现文件清单

交付路径只在 [implementation-files.md](implementation-files.md) 维护；分批验收和安装包证据见 [verification.md](verification.md)。其中已删除或迁移的路径属于对应交付时点，不是当前源码清单。

## Risks / Trade-offs

- [面板源码跨版本复用] → 包版本范围预检、实际类型/编译验证与兼容性测试；不把范围匹配当作完整证明，不自动安装旧 SDK、扩大范围或迁移源码。
- [同文件编译边界复杂] → 限制为可静态分析的顶层动作，明确诊断并验证 bundle；不依赖类型标注充当运行隔离。
- [作者业务代码可能错误] → 验收覆盖普通函数、CLI 和 HTTP 示例；业务含义、错误判定及排查由作者负责，Paneon 只验证函数调用契约。
- [CLI 不能唤醒任意 agent] → 持久事件和有界等待是正式交互机制，用户手动恢复后读取。
- [业务副作用重复执行或结果未知] → 框架不自动重试 mutation；断线只标注未收到结果。业务幂等、核验和恢复由作者负责。
- [WebSocket 断开或页面旧版本] → 读取框架状态、校验 revision；业务数据由作者查询，不假装恢复了业务执行结果。
- [自动更新打断界面阅读或重置未提交输入] → agent 可对实例使用 `--no-watch`；自动模式显示更新状态，并保留持久事件；函数与页面状态的更新沿用工具链行为，不额外保留旧执行环境或保证调用结果恢复。
- [Vite/TypeScript 运行依赖和 SQLite 原生驱动增加分发体积] → 验证 npm pack 后从仓库外独立安装运行，不能只验证源码开发环境。

## Migration Plan

无既有业务数据需要迁移。初始化版本化 SQLite schema；数据库版本高于运行时支持时明确拒绝写入，不降级覆盖。

实现时在 `0.0.x` 按任务推进；构建、代码检查及真实浏览器闭环通过后才能声称功能可用。停止服务不会删除面板定义或历史；撤销实现时保留用户运行目录供人工选择处理，不执行破坏性清理。本次用户已明确调用 distributed-development：主 Agent 负责 worktree 分工、验收和集成，验收通过后本地 commit 并清理 worktree；发布、打 tag 和推送不属于本次授权。

## Open Questions

无待拍板的命令命名问题。编译提取规则和事件跨进程恢复是必须用验收用例证实的实现约束；不能以静态检查通过替代这些验证。

## 本次协作开发分工

- 主 Agent：维护共享契约和任务进度，审查、运行集成及浏览器验收，处理小规模修复，验收后集成至 `0.0.x` 并本地提交，不推送。
- 核心实现 Agent：在独立 worktree 实现 `src/sdk`、`src/compiler`、`src/runtime`、`src/cli`、包导出及构建，对应任务 1–5、7 的服务端、8。
- 界面实现 Agent：在独立 worktree 实现 `src/ui`、浏览器宿主与可信输入界面，对应任务 6 和 7 的界面部分；与核心 Agent 先对齐消息桥及静态资源入口。
- 示例与验收 Agent：在独立 worktree 实现任务 9 的示例与使用指南，并提供独立集成及真实浏览器验证，按实际证据更新任务 10。
- 共享 `package.json`/锁文件由核心 Agent 汇总依赖并统一维护；其余 Agent 先提供依赖清单，避免独立覆盖。子 Agent 不修改主工作区源码，文档允许同步更新；任务仅在实现和对应验证都有证据后勾选。
