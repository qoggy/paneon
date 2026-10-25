# Implementation verification

本记录区分代码检查、真实服务/子进程、真实浏览器和独立安装包。功能只有对应运行证据通过后才算完成。

## Scope and reproducible checks

- 分支：`0.0.x`；原始骨架 `9f2685d`，批准的设计基线 `aec1089`。
- 三个隔离 worktree 分工实现，主工作区集成验收；仅本地提交，不发布、打 tag 或推送。
- 验收日期：2026-10-21（Asia/Shanghai）。环境：macOS、Node.js 24.16.0、npm 11.13.0，浏览器为本机 Google Chrome。
- `npm ci` 成功，安装 437 个包，audit 0 个漏洞（当次安装结果）。

```sh
npm run build
npm test
npm run lint
npm run format:check
openspec validate add-code-first-interactive-runtime --strict --no-interactive
npm run test:versions
npm run test:browser:ui
npm run test:browser:credentials
npm run test:browser:queries
npm run test:browser:production
npm run test:browser:host
PANEON_TEST_BROWSER='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:acceptance
PANEON_TEST_BROWSER='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:pack
```

`build` 包含类型检查，额外将 `examples/*.tsx` 和模块纳入严格 TS 检查。`npm test` 构建 CLI/UI 后运行全部 `tests/*.test.ts`，不依赖先前生成的 UI。浏览器测试分别使用隔离的临时 home；不改用户 `~/.paneon`。

## Evidence index

<!-- prettier-ignore -->
| ID | 可复现证据 | 层级 |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| C | `tests/core.test.ts`、`tests/ui-bridge.test.ts`、`tests/ui-api.test.ts` | AST/协议/SQLite 重开、真实 loopback API、消息桥与传输 |
| R | `tests/runtime-integration.test.ts` | 外部 TSX、真实 worker/daemon/CLI、CSS/SVG 依赖、SSE 停止 |
| H | `tests/runtime-hardening.test.ts` | 输入 schema、简写/解构捕获、semver、并发启动、编译时响应与取消、升级/恢复、帮助、debug、连续保存 |
| E | `tests/events-integration.test.ts` | 独立 CLI 与服务、有界等待、另一个 SQLite 连接验证持久提交、分页/ack/停止 |
| U | `tests/browser/ui.mjs` | 实际 Chrome、全部 29 主组件族、键盘/焦点/受控与非受控、Markdown、CodeBlock、390px |
| S | `tests/browser/credentials.mjs` | 实际 iframe 与可信输入、绑定/TTL/撤销、原文边界、close/reload/stop、持久文件扫描 |
| Q | `tests/browser/query-lifecycle.mjs` | 实际 query 并发/计时/卸载、Canvas 像素、Mutation 丢响应/SSE 重连/刷新不重放 |
| B | `tests/browser/production-runtime.mjs` | Chrome：watch 后第二面板/错误恢复/reload 的生产 JSX 与作者 Node 环境 |
| W | `tests/browser/host-lifecycle.mjs` | Chrome：确定延迟旧 GET，验证新 revision 已显示后不回退 |
| A | `tests/acceptance.mjs`、`tests/acceptance-support.mjs` | 主树真实 CLI + 浏览器，纯函数/CLI/HTTP、事件、源码更新与重启恢复 |
| P | `tests/acceptance-pack.mjs` | `npm pack` 产物在仓库外 `npm install --omit=dev` 后使用包内示例复跑 A；无源码软链接 |
| V | `tests/acceptance-versions.mjs`、`tests/acceptance-old-runtime-worker.mjs` | 真实旧服务子进程，包版本不符、协议不符、显式 stop |
| G | `examples/github.ts` / `examples/gh-panel.tsx` 对公开 `cli/cli` 的实际只读调用 | 原 helper 验证及后续真实 Chrome：仓库元数据、30 条 PR 列表、首条 PR 详情；无 GitHub 写操作 |
| D | `README.md`、`docs/agent-guide.md`、`examples/README.md`、`src/ui/upstream.json` | 用法、产品边界、上游版本和配置 |

## Capability evidence

<!-- prettier-ignore -->
| Capability / requirement | 运行或代码证据 | 结果 |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------- |
| `code-first-panels` / Load reusable local TypeScript React definitions | C, R, A, P：仓库外无 package.json 的 TSX 与相对模块、SDK/UI 自动解析 | 通过 |
| `code-first-panels` / Preserve the upstream default visual baseline | U：固定 shadcn Neutral 上游配置与浏览器外观 | 通过（见 UI 未复现现象） |
| `code-first-panels` / Provide styled components without mandatory custom CSS | U, A：无自定义 CSS 的组件组合、宽窄屏 | 通过（见 UI 未复现现象） |
| `code-first-panels` / Display code as read-only local content | U：Shiki 本地语法、长行、未知语言纯文本与代码标签不执行 | 通过（见 UI 未复现现象） |
| `code-first-panels` / Render Markdown with an existing community presentation | U：GFM、原始 HTML 关闭、样式作用域 | 通过（见 UI 未复现现象） |
| `code-first-panels` / Preserve normal React expressiveness | A, Q：普通 React 状态、SVG 点击、Canvas 实际像素 | 通过 |
| `code-first-panels` / Separate browser and server action dependencies | C, R：两份可达图、真实浏览器 bundle 不含 Node handler，静态路由不可下载服务端产物 | 通过 |
| `code-first-panels` / Diagnose unsupported action captures | C：闭包、可变捕获、动态导入、浏览器 Node 引用被拒 | 通过 |
| `code-first-panels` / Declare and validate a Paneon package version range | H：字面量预检、0.x/预发布/上下界/非法范围及缺失 API，预检失败不执行模块 | 通过 |
| `code-first-panels` / Version compiled panels and switch atomically | R, H：失败保留 revision，成功构建切换，manifest 包含输入/事件/action schema | 通过 |
| `code-first-panels` / Reuse toolchain updates for watched dependencies | R, H, A：TS/本地依赖/CSS/SVG 更新、连续保存、坏源码修复 | 通过 |
| `durable-agent-events` / Persist semantic interaction events | E, A：页面显式提交后 SQLite 已提交再确认 | 通过 |
| `durable-agent-events` / Read incrementally with explicit consumer identity | E, A：独立 CLI、consumer、limit、hasMore | 通过 |
| `durable-agent-events` / Acknowledge separately from reading | E, A：重复读取不确认，显式 ack 后推进 | 通过 |
| `durable-agent-events` / Isolate consumers and avoid cursor regression | C, E：consumer 隔离、同 consumer 的独立 CLI 并发读取/ack、未交付/跨实例/回退拒绝 | 通过 |
| `durable-agent-events` / Support bounded waiting without automatic wakeup | E：正常超时、事件提前返回、stop 中断返回错误 | 通过 |
| `durable-agent-events` / Recover durable history without claiming exactly-once effects | A, P：agent CLI 结束后页面提交、恢复读取、ack 与重启保留 | 通过 |
| `ephemeral-secrets` / Collect credentials only through trusted host UI | S：可信宿主输入、iframe 无法读取宿主 DOM 或直接提交原文 | 通过 |
| `ephemeral-secrets` / Keep framework credential storage ephemeral | S：内存保存，重启无 ref；递归扫描持久文件无原文/JSON 转义值 | 通过 |
| `ephemeral-secrets` / Bind credential usage to a generic server action | S：仅绑定 action/revision/instance 可 use，实际 callback 使用成功 | 通过 |
| `ephemeral-secrets` / Protect SDK output boundaries without monitoring business output | C, S：响应/事件包含原文被拒，结构化字符串/键名、多行引号及在途检查集合 | 通过 |
| `ephemeral-secrets` / Expire and revoke credential references | S：TTL、撤销、源码更新、close、stop 禁止后续 use | 通过 |
| `ephemeral-secrets` / State the trust boundary for author code accurately | D：指南明确作者代码受信任、可访问原文及自行负责外传/日志 | 通过 |
| `local-panel-runtime` / Expose a general agent CLI | H, R：所有命令/帮助、源码与产物入口、独立 cwd | 通过 |
| `local-panel-runtime` / Avoid redundant input echoes in command results | R：run/reload/close/events/ack 输出核对；inspect 不回传 manifest | 通过 |
| `local-panel-runtime` / Reopen an existing panel with a regular access link | A, P：inspect 重用 instanceId 与普通 URL，刷新/重启可重开 | 通过 |
| `local-panel-runtime` / Use English for CLI-generated text | H, R：中文 locale 下英文自有文案，中文用户数据保留 | 通过 |
| `local-panel-runtime` / Enable CLI debugging explicitly without changing results | H, R：前后位置 --debug 仅 stderr；stdout/退出状态一致 | 通过 |
| `local-panel-runtime` / Bound debugging to framework metadata and the current invocation | H：固定步骤和 elapsedMs 白名单，无正文/环境/业务/凭据/源码输出 | 通过 |
| `local-panel-runtime` / Keep the runtime independent of the invoking agent | A, P：run 命令退出，服务仍可交互、读取与恢复 | 通过 |
| `local-panel-runtime` / Keep the CLI and running service on the same package version | H, V：真实旧服务身份及协议校验，版本不符拒绝，显式 stop 例外 | 通过 |
| `local-panel-runtime` / Manage explicit panel lifecycles | R, A, S：run/list/inspect/reload/close/stop 与资源释放 | 通过 |
| `local-panel-runtime` / Select automatic reload per panel | R, A：默认 watch、显式开关、互斥、no-watch 手动 reload、重启保留 | 通过 |
| `local-panel-runtime` / Validate browser origins and authenticate CLI control traffic | C, S：Host/Origin/Referer、独立控制凭据与消息桥来源验证 | 通过 |
| `local-panel-runtime` / Recover panel configuration and interaction history only | H, A, P：版本兼容重建、不兼容 unavailable；只恢复配置/事件，不重放 handler | 通过 |
| `local-panel-runtime` / Notify framework state without business monitoring | A, Q, S：实际 SSE、构建诊断、断线重连和当前 revision | 通过 |
| `local-panel-runtime` / Store only framework-owned runtime files | A, P：只有 panels/events/consumers/schema_meta 和 SQLite 内部表；无业务任务日志 | 通过 |
| `local-panel-runtime` / Package a runnable installed product | P：npm pack 后仓库外仅生产依赖安装、导出、编译及真实 Chrome 点击 | 通过 |
| `panel-actions` / Choose execution behavior per control | A, P：按钮直接调用函数与 agent.emit 两条真实路径 | 通过 |
| `panel-actions` / Validate action identity and arguments | C, R, S：schema、actionId、旧 revision 和凭据绑定 | 通过 |
| `panel-actions` / Remain independent of business backends | A, P, G：纯函数、本地 CLI、HTTP；实际 gh 只读 API | 通过 |
| `panel-actions` / Return function results without retaining business history | A, P：调用结果仅反馈页面，无框架业务历史表 | 通过 |
| `panel-actions` / Distinguish refreshable queries from mutations | Q：query 类型约束、同一订阅最大并发 1、计时刷新/卸载，mutation 类型拒绝 | 通过 |
| `panel-actions` / Avoid automatic replay and claims of business recovery | Q, A, H：后端执行后丢响应、SSE 重连、刷新/重启，mutation 次数仍为 1 | 通过 |
| `panel-actions` / Reuse toolchain source updates without custom call preservation | R, H, A：实际 Node action 随源码更新；Vite 监听/失效，不保留旧 worker 或接管结果 | 通过 |

## Actual results

- 最终主工作区 `npm run build`（包含源码和全部示例的类型检查）及 `npm test` **38/38 通过、0 skip**，完整测试用时约 111 秒。原 1.5 秒健康检查、5 秒 CLI 帮助期限和用例内真实并发均保留。
- `npm run lint` **0 errors / 16 warnings**，警告均为非空断言；`npm run format:check`、严格 OpenSpec 与 `git diff --check` 均通过。
- 最终源码的 P、B、S、W、Q 已串行复验通过：实际 npm pack、仓库外生产依赖安装和真实 Chrome 流程均成功。
- V 最终复验通过：真实旧服务子进程的包版本拒绝、相容协议下显式停止和不兼容协议拒绝均符合预期。U 最终由主 Agent 独立运行通过全部 29 主组件族、受控/非受控、键盘/焦点、Markdown、离线 CodeBlock 和 390px 布局；曾有未稳定复现的状态变化，详见下节。
- G 实际读取公开 `cli/cli` 仓库、30 条 PR 列表及首条详情，无 GitHub 写操作。隔离演示 CLI 和 HTTP 后端的正常、非法与缺失路径均实际验证。

## Fixed issues with regression evidence

- **编译阻塞 HTTP**：编译移入独立子进程。H 在 CPU-heavy 构建中验证健康检查与真实 CLI status 仍按原期限成功；close/stop 清除编译、metadata 子进程及临时目录，待发布的 Execution 初始化也可取消。
- **依赖提取遗漏**：TypeChecker 值符号与模块 const 解构纳入可达图；真实 Node 调用证明对象简写、嵌套解构与函数/React 局部绑定均正确。
- **排队更新覆盖较新状态**：失败时只在当前实例上更新诊断，不再写回请求开始时捕获的旧实例快照。
- **revision 与产物不一致**：在旧 compiler 第二次读取 helper 计算 hash 前插入“合法→非法”保存，确定得到 `bundleStillOriginal: true` 和 `publishedRevisionMatchesInvalidDisk: true`。现静态版本、类型检查、AST 及转换共用源码快照，摘要按快照字节计算，提交前核对依赖。H 的 metadata barrier 证明变化构建返回 `BUILD_SOURCE_CHANGED`、旧版本保持、已有 Vite 事件可恢复；原 rapid/CSS/SVG 断言均保留且通过。
- **第二面板/更新后的 JSX 白屏**：watcher 使父进程进入 development，新 fork 编译曾输出 jsxDEV 却加载 production React。编译环境与 JSX 模式已统一，生产常量只替换浏览器代码。B 实际验证第二面板、错误恢复及 reload 无页面异常，同时 action 返回其原有 `development` 环境。
- **旧 GET 覆盖新面板**：W 延迟一个旧 inspect 响应，先显示新标题再释放旧响应。原实现 revision 为 old→new→old，修复后为 old→new、无页面错误；初始/SSE/手动 refresh 共用请求世代，过期成功或失败不覆盖当前状态。

Q 实测 query 5 次、最大并发 1、4 次定时刷新间隔检查；Canvas 像素为矩形内 `[18,52,86,255]`、外部 `[0,0,0,0]`。Mutation 在后端实际执行后丢失响应，再等待、SSE 断线重连及刷新，执行次数仍为 1。

S 包含取消/提交清空输入、多行和引号保真、原文出站阻断、桥接伪造拒绝、TTL/撤销、在途 use 检查集合、构建失败旧视图、成功更新/close/restart 失效及递归文件扫描；保持 SSE 打开时 stop 不超过 5 秒。

开发中曾因两套完整测试及遗留测试进程叠加造成原始帮助用例超时；按进程归属清理并停止重复全验后完成上述独占全量，没有增加超时、删断言或修改测试并行度。

## UI observation requiring follow-up

U 的一次失败轨迹证明：菜单点击前 `Include details` 已从早先确认的 true 变成 false，随后一次菜单点击将其 false→true。该轨迹不能证明菜单未响应，也不能证明仅为 React 提交延迟。早期 true→false 的触发原因尚未定位。

[失败原始轨迹](evidence/ui-selection-observation.txt)已保留。排查覆盖冷缓存、共享缓存、iframe 导航和 Vite 消息；后续记录未捕获到再次重置，也未观察到 reload/update，不能据此归因 Vite。未修改组件或 Vite 配置。普通成功轮观察到 click 后约 24–35ms 才提交 aria-checked，因此测试等待读取最终状态，仅读取而不重点击或增加超时。测试在打开模态菜单前断言先前 true 状态；菜单打开后背景被 aria-hidden 排除，不能此时用 getByRole 查询背景控件。一次菜单点击后仍要求状态变为 false，失败输出交互/状态/导航轨迹。最终通过记录不代表该未稳定复现的现象已被修复。

## Verified limits

- 源码支持按约定静态提取的顶层具名 `serverAction`；不支持 render 闭包、可变捕获或无法静态判定的动态导入，编译器会给出诊断。
- 浏览器页面访问独立本地服务，尚未适配 agent 内嵌界面；持久事件不自动唤醒任意 agent 会话。
- 源码更新遵循 Vite/React 与实际 Node 执行环境；未提交页面状态、在途调用或结果不保证保留，Mutation 不自动重试。
- 凭据会交给受信任的作者服务端代码；内存引用与已知原文出站检查不构成任意代码/业务输出隔离，也不承诺识别所有编码或物理内存擦除。
- 示例里的发布流程是本地演示 CLI；真实 gh 接入仅执行只读验收。未接入用户企业发布系统，未执行真实部署。
- 当前支持 Node.js 24；本次实际运行平台为 macOS，未声称其他系统已经验收。
- 浏览器验收需 Playwright 对应浏览器或现有 Chrome。接受测试专用浏览器配置，不新增 Paneon 运行目录覆盖选项。

## Saved package evidence

以下截图与报告来自最终 P 验收，均为仓库外安装包运行结果：

- [CLI 面板及函数调用](evidence/installed-package-cli-panel.png)
- [HTTP 失败反馈](evidence/installed-package-http-error.png)
- [源码更新与 SVG 交互](evidence/installed-package-updated-svg-panel.png)
- [窄屏布局](evidence/installed-package-narrow-panel.png)
- [验收报告及实际 SQLite 表](evidence/installed-package-report.json)

## Integration and worktree cleanup

- 实现已在 `0.0.x` 本地提交为 `6aa26ae`；未推送、发布或打 tag。OpenSpec change 保留未归档。
- 应用 `archive_worktree` 对三个目录均仅返回 `queued`，实际目录仍在，因此不将其视为已完成归档。三个开发 checkout 已在保存本地恢复引用后通过不带 `--force` 的 `git worktree remove` 删除；`git worktree list` 已确认只剩主工作区。没有改写应用的归档数据库或声称修复应用队列。
- core 与 examples 的干净 HEAD 已保存；UI 剩余的已知接入测试文件先提交为 `013ef71` 再保存，避免丢失未提交工作。恢复引用为：

```text
refs/paneon/development-snapshots/2026-10-21-core      6a884d2
refs/paneon/development-snapshots/2026-10-21-examples  1f8898e
refs/paneon/development-snapshots/2026-10-21-ui        013ef71
```

五份 capability 的 45 条 requirement 均已映射到证据。66/66 任务完成；组件未稳定复现现象及产品限制按上文保留。

## Post-acceptance regression: type-only imports

用户运行完整 `gh-panel.tsx` 时复现 `BUILD_FAILED`。直接 Vite 构建诊断为 `MISSING_EXPORT`：源码的 `import type { PullRequestDetail }` 被 AST 转换重建为普通导入，但 `github.ts` 中该类型不会生成运行时导出。原 G 只验证了 gh helper 调用，没有覆盖整个面板编译。

修复在运行时绑定收集和依赖/action 发现时跳过纯类型导入，保留混合导入中的普通值。覆盖具名、默认、命名空间、内联纯类型导入及两种混合导入；纯类型引用不会把该模块的其他 action 注册到面板。

可重复回归命令：

```sh
npm run build:cli
node --test --test-name-pattern 'type-only imports|mixed type and value|shipped GitHub panel' tests/core.test.ts tests/runtime-integration.test.ts
```

同一组测试在修复前为 1 通过 / 2 失败，修复后为 3/3 通过。新增真实 runtime 测试直接构建仓库中的 `gh-panel.tsx`，校验两个 action 和浏览器/Node 依赖分离，不要求外部 GitHub 账号或联网。

在用户原服务上重新运行同一入口与参数已成功。真实 Chrome 显示 `cli/cli` 的 30 条 PR，并可打开首条详情，pageErrors 为空；仅执行只读 gh 查询，没有提交 agent review 事件或执行 GitHub 写操作。原服务及其他面板保持运行。临时截图：`/tmp/paneon-gh-fixed.png`。

完整构建（含类型检查）与 `npm test` 已通过，41/41、0 skip，约 100 秒。lint 为 0 errors / 16 个既有非空断言 warnings。最终格式检查发现发布示例的运行数据 `.paneon-demo-release.json` 未被忽略，现将这一明确的生成文件加入 `.gitignore`，不修改数据内容，避免把示例状态纳入源码提交或格式检查。

## Post-acceptance regression: multiple panel tabs

用户在普通 Chrome 中同时打开六个面板后，后续页面卡住且 Console 无报错；关闭其他面板即恢复。代码为每个页面持有一个 HTTP/1.1 SSE 连接，现场 Chrome 到服务恰有六条连接。状态通知现改为 WebSocket，保留 HTTP action 和持久事件消费协议。握手校验精确 Host、必需的同源 Origin 和实例存在性；连接只接收框架状态，拒绝以消息调用 action。连接共用 runtime 监听器，带 ping/pong、页面关闭清理、服务停止清理和有上限的重连退避。

自动化网络测试验证了跨站/null/空/缺失 Origin、伪造 Host、未知实例拒绝升级；13 条真实连接不增加 runtime 监听器数量，状态按实例分发，重连后可继续接收，关闭及停止后释放连接。真实 daemon/CLI stop 测试从 SSE 改为 WebSocket。

本轮用 Browser Use/cua_repl 验证实际浏览器。普通 Chrome 同一 profile 的 10 个标签页均成功首次加载，第十页 action 成功。源码更新时该自动化会话报告 `Raw CDP is unavailable while Browser Use is resolving a paused document response`，iframe 停在 about:blank；刷新后能显示更新源码。因此不将普通 Chrome 自动更新认定为通过，也不据此添加 Paneon 绕行代码。内置浏览器的 10 个标签页均自动显示新标题；强制断开实际连接后 10 页均重连，刷新最后一页后仍可用。服务端计数显示 mutation 始终只执行 1 次；关闭页面后连接数依次为 10、9、0。临时浏览器页及测试服务已清理，没有执行用户业务动作。

新增可重复的共享 BrowserContext 回归脚本 `npm run test:browser:tabs`；本轮通过 cua_repl 执行浏览器验收，未执行该 Playwright runner。原查询生命周期与临时凭据浏览器脚本已同步 WebSocket 的连接/停止断言。

完整构建/类型检查通过。首次并行完整测试为 42 通过/2 失败，两项均为现有 5s 墙钟时间断言超限（CLI --version 和 200ms 事件等待的总耗时），未放宽阈值；单独复跑两文件 7/7 通过，随后 `node --test --test-concurrency=1 tests/*.test.ts` 44/44、0 skip。lint 无 errors，保留 15 个既有非空断言 warnings。

证据：[浏览器与测试报告](evidence/websocket-multiple-tabs-report.json)、[验证页面截图](evidence/websocket-multiple-tabs.png)。

原本机服务已停止并使用最终构建重新启动，现有面板按保存状态恢复，当前端口为 54738。原 HTTP/GitHub 两个 instanceId 均为 running；浏览器已确认 HTTP 页面完整渲染、GitHub 页面显示真实 PR 列表。HTTP 示例的独立演示数据服务 43180 返回 ECONNREFUSED，因此其数据区显示 Request failed；未把业务后端未启动视为 WebSocket 故障，也未擅自启动该业务服务。

## Panel list Close button

面板列表卡片在 Open panel 旁新增 Close，复用既有 POST /api/panels/:instanceId/close。请求中显示 Closing… 并禁用重复点击；成功后将该卡片更新为 closed 并禁用 Close，仍保留 Open panel 和历史记录；失败时在对应卡片显示错误并允许手动重试。

通过隔离的真实运行时和 Browser Use 验证：第一次人为注入关闭失败，卡片显示错误且仍可重试；第二次暂缓响应，按钮处于 disabled/aria-busy；放行后对应实例 closed、运行资源移除，另一实例保持 running。刷新后关闭状态仍存在，两个实例记录和一条既有事件均保留。未关闭用户已有面板。类型检查、web 构建、App.tsx ESLint 与格式检查通过；临时浏览器截图位于 /tmp/paneon-panel-close-button.png。

## Paginated panel discovery

CLI panel list 增加 --page（默认 1）和 --page-size（默认 20，1–1000）；GET /api/panels 使用 page/pageSize，响应增加 page、pageSize、total、totalPages。SQLite 通过稳定 createdAt/id 排序和 LIMIT/OFFSET 查询当前页，不取出全部配置或输入；内部恢复等 Store.list/all 全量调用保持原语义。

网页默认第一页、20 条，复用 Pagination 前后页组件，显示当前页、总页数和总数；加载/首尾边界禁用对应控件，Refresh 保持当前页，空列表显示 Page 1 of 1。关闭期间禁止翻页和 Refresh，并忽略过期列表请求的响应。

新增 tests/panel-pagination.test.ts 以 45 条反序插入且同创建时间的实例验证稳定分页、不漏不重、20/20/5 分布、空集合、超出末页、自定义每页数量、参数范围、私有输入不进入列表及内部全量读取；使用真实服务和独立 CLI 进程验证默认/显式页码与错误 JSON。聚焦分页和 CLI 测试 7/7 通过。Browser Use/cua_repl 对隔离服务实际点击三页，分别得到 20、20、5 张卡片；验证首页/末页禁用，刷新保持第三页，并将测试集合清空后刷新，页面回到第一页空状态、双向禁用。临时测试服务及页面已清理；截图 /tmp/paneon-pagination.png。

分页变更后的完整回归 `node --test --test-concurrency=1 tests/*.test.ts` 为 45/45 通过、0 skip，约 145 秒。完整构建、最终类型检查、相关文件 ESLint（无新增 warning/error）、格式检查和 OpenSpec strict 校验通过。

已重启本机服务应用分页接口，当前端口 61389。现有 9 个实例均保留：实际 CLI 默认返回 page=1、pageSize=20、total=9、totalPages=1 和 9 条记录；请求第二页返回空 panels，元数据仍准确。真实浏览器首页显示 9 张卡片及 Page 1 of 1 · 9 panels，首尾导航禁用，原 Close 按钮仍在。
