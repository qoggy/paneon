## 1. 包导出与协议基础

- [x] 1.1 沿用单 npm 包与 Node.js 24，增加 SDK、组件、runtime 构建入口和 package exports；将面板编译所需依赖纳入实际分发，保持现有帮助、版本和源码/产物运行方式。
- [x] 1.2 定义 PanelDefinition/PanelInstance 及 definitionId/instanceId 关系、含 requires.paneon 的 definePanel、serverAction、query/mutation、调用返回/错误、事件、revision 及凭据用途的 TypeScript/Zod 契约；覆盖非法参数、协议版本和不可序列化值，不引入业务任务类型。
- [x] 1.3 建立 SDK 的浏览器入口、服务端入口及自动解析规则，使仓库外无 package.json 的面板定义能引用 Paneon SDK 和同一 React 实例。

## 2. TSX 编译与服务端动作提取

- [x] 2.1 实现入口及相对模块解析、输入/事件 schema 收集、源码依赖摘要与版本化 manifest（requires 与实际构建包版本 paneonVersion），revision 包含源码/本地依赖/构建包版本；明确第三方依赖的解析错误，不隐式安装包。
- [x] 2.2 实现 TypeScript AST action 提取，为顶层具名 action 生成 Node 执行入口和浏览器代理，包含稳定 actionId、kind 和输入定义。
- [x] 2.3 实现浏览器/Node 两份可达依赖图和引用诊断；拒绝 render 内 action、页面闭包、可变捕获、无法判定的动态导入及前端 Node 模块引用。
- [x] 2.4 集成 TypeScript 类型检查和 Vite 面板构建，采用临时产物校验后原子切换 revision；失败保留旧实例并呈现诊断。
- [x] 2.5 验证同一 TSX 控件与动作、跨模块辅助函数、复杂 React/SVG 组件、错误捕获及包版本范围不满足；检查真实客户端产物与请求中没有 handler 或服务端依赖，静态路由不能下载服务端入口或源码映射。
- [x] 2.6 接入 Vite/React 既有监听、模块失效及更新/重载能力；排除构建/运行产物，验证依赖修改、连续保存、错误后修正可恢复且最后一次保存生效，不自建热更新或模块替换机制。
- [x] 2.7 引入 semver 解析 requires.paneon，在执行面板模块前静态提取字符串字面量并校验；覆盖缺失/非法/动态声明、低于下界、兼容版本、排除上界、预发布匹配、0.x 窄范围、范围满足但接口不存在；错误包含范围/当前版本/入口，不自动下载 SDK 或修改源码。
- [x] 2.8 验证包升级后不复用旧包版本编译的缓存，manifest 与 revision 反映实际构建版本；同进程 reload 校验失败保留旧可用 revision，跨版本重启时不兼容实例标记 unavailable 且保留事件。

## 3. 本地服务与持久化

- [x] 3.1 实现 CLI/服务共用的内部 PANEON_HOME 常量（当前用户主目录下的 ~/.paneon），不读取同名环境变量或提供 CLI/配置文件覆盖；实现受限目录权限、服务描述文件、启动协调、身份/内部协议/包版本一致性健康检查，描述文件与健康接口返回 runtimeId、paneonVersion 和 protocolVersion；提供框架诊断；覆盖并发启动及陈旧描述文件，不采集业务输出。
- [x] 3.2 用 Fastify 实现固定 loopback 服务、普通面板访问链接、CLI 控制凭据及严格 Host/Origin 校验；浏览器操作拒绝外部/null/空/缺失 Origin，非公开 GET 在缺失 Origin 时校验完整同源 Referer，宿主设置 Referrer-Policy: same-origin；覆盖正常导航、同源操作、WebSocket、伪造 Host、跨站与无凭据 CLI 请求；不实现链接 token、兑换端点或访问登录会话。
- [x] 3.3 创建版本化 SQLite schema、WAL 和事务存储，仅包含 schema_meta、panels、events、consumers；覆盖数据库重开和不支持的高版本拒绝写入，验证没有业务任务表/日志文件或调用参数/结果历史。
- [x] 3.4 实现面板创建、列表、检查、reload、关闭和服务停止，保存源码入口/cwd/参数/revision；关闭时拒绝新调用、发送 ctx.signal 并释放框架资源，保留人机事件历史，不承诺外部业务取消。
- [x] 3.5 实现面板配置及交互历史的重启恢复，重新校验 requires.paneon、类型和构建，不兼容时保留记录并标记 unavailable；不恢复在途调用或业务状态，不自动执行 mutation；验证 CLI/agent 退出不停止服务。
- [x] 3.6 持久化每个实例的 watch 选择，默认 true；panel run/list/inspect 返回有效模式，服务重启按原模式恢复监听，验证同一面板定义不同实例的选择互不影响。
- [x] 3.7 验证升级 CLI 后连接旧服务返回 RUNTIME_VERSION_MISMATCH 与实际版本/重启提示，不自动终止服务或向旧服务加载面板；仅在身份/认证/内部协议相容时允许使用者显式 server stop 旧服务，再启动当前版本。

## 4. 通用本地函数调用

- [x] 4.1 实现按实例、revision、actionId 和 schema 校验的动作路由及请求/响应关联；覆盖未知动作、旧页面版本和无效输入，不暴露任务查询/取消接口。
- [x] 4.2 实现 Node action worker、通用 ctx.signal 和 Promise 结果/错误序列化；handler 异常返回 ACTION_FAILED，不回传原始堆栈；业务 stdout/stderr 默认丢弃，不转发为框架诊断，不提供 ctx.exec 或业务执行器。
- [x] 4.3 用普通计算函数、作者模块通过 Node.js 调用的 CLI、作者模块通过 fetch 调用的 HTTP API 验证同一契约；返回值只反馈给调用方，不持久化业务历史。
- [x] 4.4 实现 useQuery 的 query-only 约束、同查询不重叠、订阅结束停止刷新及页面内存状态；保证 mutation 不被自动刷新触发，不形成业务监控历史。
- [x] 4.5 验证断线、重启和响应丢失不会自动重试 mutation；区分调用失败与结果未知，业务幂等及恢复留给作者代码。
- [x] 4.6 Node serverAction 在隔离 worker 中通过原生 import 加载已打包产物；主进程复用 Vite 监听与编译，触发现有 worker 替换流程，验证源码变化后的实际调用行为；不假设浏览器 HMR 自动更新自定义 worker，不实现旧 worker 保留、调用接管或结果恢复，不因更新自动重新调用 mutation。

## 5. 持久化人机事件

- [x] 5.1 实现按面板声明校验的事件追加，分配单调 ID，事务提交成功后才向页面确认；限制类型、大小和 payload。
- [x] 5.2 实现按 instanceId/consumer 的有界分页读取和最大已交付位置，明确读取不确认、未 ack 则重投递。
- [x] 5.3 实现显式 ack 的事务校验，拒绝跨实例、未交付和回退游标；验证独立 consumer 和相同 consumer 并发下不丢事件。
- [x] 5.4 实现 0–60000 毫秒有界等待、正常超时空结果及停止处理，不依赖 agent 专属会话接口。
- [x] 5.5 用独立 CLI/服务进程验证“agent 停止→网页提交→agent 恢复读取→处理后 ack→服务重启后继续”的完整持久化闭环。

## 6. 默认组件与浏览器宿主

- [x] 6.1 按设计导出清单预集成 Button、Input、Label、Field、Card、RadioGroup、Checkbox、Textarea、Select、Badge、Alert、Spinner、Table、Pagination、Tabs、Dialog、AlertDialog、Accordion、Collapsible、Tooltip、DropdownMenu、Popover、Switch、CodeBlock、Markdown 及组件族配套导出，固定 shadcn 官方来源版本/生成配置，沿用官方默认 Neutral 主题与组件样式，提供 Page、Section、Stack、StatusBadge 轻量组合；只补必要布局，不另定 Paneon 字体/字号/配色/圆角/控件尺寸规范；验证无自定义 CSS 的可用外观、焦点和加载状态，不绑定业务任务模型。
- [x] 6.2 实现实例列表、运行面板和连接/版本状态宿主，替换初始化验证页，支持 CLI 返回链接直接打开及刷新后恢复面板访问。
- [x] 6.3 实现隔离 iframe、CSP 和 SDK postMessage 桥，校验来源窗口/channelId/instanceId/revision/requestId；验证跨面板伪造及可信宿主接口越权被拒绝。
- [x] 6.4 实现 serverAction Promise 代理、useQuery 和 agent.emit 的客户端接入，区分函数调用反馈与“已提交给 AI”。
- [x] 6.5 实现框架状态 WebSocket 与当前状态读取，验证浏览器断线重连、reload 失败、旧 revision、页面关闭和多实例并存；不恢复业务调用结果，不自动重放 mutation。
- [x] 6.6 展示自动更新模式和构建进展，按工具链行为更新模块或重载页面、失败保留旧视图；明确局部输入及调用结果不额外保证保留，验证持久事件和消费进度保留。
- [x] 6.7 用真实浏览器验证 Tabs 点击/键盘切换、Checkbox/Switch 值变化和禁用状态、Textarea 多行输入；覆盖社区 API 的受控/非受控方式、配套导出可解析及 iframe 内样式，确认组件变化不隐式调用业务、提交事件或持久化值。
- [x] 6.8 接入 Dialog/AlertDialog 的完整配套导出、iframe 内默认 TooltipProvider 及 Tooltip 组件族、Badge/StatusBadge；用真实浏览器验证弹层、焦点/键盘、确认/取消、悬停/聚焦提示及展示状态，不引入自动业务确认或监控。
- [x] 6.9 实现 CodeBlock 的 code/language 展示接口及 Shiki JavaScript 引擎高亮，按设计打包支持语言和主题；验证从安装包离线渲染、未知语言纯文本、缩进/换行/长行滚动与标签文本不被执行，不增加终端/编辑器或业务日志采集。
- [x] 6.10 接入 Card 全套配套导出、RadioGroup/RadioGroupItem、Alert/AlertTitle/AlertDescription、Spinner、Accordion/Collapsible 组件族，沿用同一官方默认主题并覆盖 agent 用法示例。
- [x] 6.11 用真实浏览器验证方案卡片/单选值、可访问提示与等待反馈、Accordion 单项/多项和 Collapsible 展开、键盘及禁用行为，覆盖适用的受控/非受控方式；逐项核验设计中的全部 29 个主组件及配套导出，不以部分示例通过代替全量组件验收。
- [x] 6.12 接入 DropdownMenu/Popover 及设计列出的配套导出；用真实浏览器验证分组/禁用/勾选/单选项、嵌套子菜单、Popover 内表单、受控/非受控打开状态、iframe 定位/层级、键盘/焦点、Escape/外部点击及关闭后焦点返回，不隐式产生业务行为。
- [x] 6.13 接入 Pagination 及页码链接/前后页/省略提示配套导出；提供作者控制状态的普通列表和 Table 示例，用真实浏览器验证点击/键盘、当前页标记、首尾/单页/空数据边界、本地翻页阻止默认链接导航及 iframe 样式，不增加业务分页查询、页码持久化或路由库依赖。
- [x] 6.14 接入 Field、FieldContent、FieldLabel、FieldTitle、FieldDescription、FieldError、FieldGroup、FieldSet、FieldLegend、FieldSeparator；编写组合已有输入/选择控件的表单示例，用真实浏览器验证排版/分组、标签/说明/错误关联及作者控制的校验呈现，不引入强制表单库或自动提交/持久化/agent 事件。
- [x] 6.15 在宿主和 iframe 内分别加载同一套官方默认主题/组件样式，清理初始化页演示配色的覆盖；检查 Page/Section/Stack 仅补必要布局、StatusBadge 复用 Badge 样式，验证窄屏/桌面的组合页面及长表格/代码区域滚动，不通过另定主题参数表改变视觉基线。
- [x] 6.16 提供 Markdown 只读渲染组件，采用 react-markdown + remark-gfm 和 github-markdown-css 的浅色样式，固定依赖版本并记录配置，不自定皮肤；将依赖与样式随包提供，验证 iframe 内标题、段落、列表、链接、引用、行内代码和围栏代码块展示，以及 GFM 表格/删除线/只读任务列表/自动链接；验证 Markdown 样式限定于容器且不覆盖外层 shadcn 控件，内容不作为 JSX/脚本/命令执行，默认不启用原始 HTML 解析；补充用法示例。

## 7. 密钥输入责任边界

- [x] 7.1 删除内置凭据 SDK、宿主输入、内存容器、绑定、TTL、撤销和密钥输出检查；密钥作为普通 server action 参数由页面和业务代码处理。
- [x] 7.2 验证普通密码输入框可调用 server action，且动作返回与显式 agent 事件提交相互独立。

## 8. CLI 命令与 agent 使用契约

- [x] 8.1 实现 panel run/list/inspect/reload/close 和 server status/stop，panel run 默认自动 reload，--watch/--no-watch 显式覆盖且互斥，手动 reload 不改变模式；run 返回 URL 后退出，--open 显式打开浏览器；保持 stdout 机器可读及退出状态准确。
- [x] 8.2 实现 panel events/ack 的 consumer、limit、wait-ms、through 参数和 JSON 结果，区分无事件、参数错误及服务不可用。
- [x] 8.3 验证源码入口与构建产物从不同工作目录调用，覆盖根 --help/--version、panel/server 组帮助、各具体命令帮助及不支持参数；验证没有旧平铺顶层业务命令，panel run 仍按需启动服务，避免破坏已有根帮助/版本契约。
- [x] 8.4 统一 CLI 自有帮助、提示、警告、错误与框架诊断为英文；验证中文 locale 下仍一致，用户参数/事件/业务返回中的中文原样保留。
- [x] 8.5 实现全局 --debug，默认 false；覆盖 `paneon --debug panel inspect <id>` 与 `paneon panel inspect <id> --debug`，以及 server 组的选项解析；英文 debug 行带 [debug] 前缀写 stderr，stdout JSON、退出码、事件/业务语义不变，未开 debug 仍呈现必要错误。
- [x] 8.6 诊断仅允许当前 CLI 的框架元数据，验证密钥/token/cookie、请求正文、环境值、源码、业务输入/输出及 handler 原始异常不被输出；开关不持久化、不修改后台服务日志级别、不新增后台日志文件或调试环境变量。

- [x] 8.7 panel inspect 返回已有实例在当前服务的普通访问 URL；验证链接可以重复打开、不含访问凭证或过期时间，服务重启后仍可为同一 instanceId 获取当前地址；inspect 不新建实例、不 reload、不执行业务函数或恢复已关闭面板，closed/unavailable 链接显示原状态，事件和消费位置不变。

- [x] 8.8 按设计实现各命令返回结构：run 返回创建结果而非完整配置；reload/close/events/ack 不回显 instanceId/consumer，事件项不重复 instanceId；保留版本、状态、事件时间与消费信息，list/inspect/server status 保持各自定义的信息，inspect 返回完整实例详情。同步核对 JSON 示例、字段名和 --debug 开关前后结果一致。

## 9. 可复用示例与文档

- [x] 9.1 编写隔离的本地演示 CLI 和 HTTP 服务，仅作为作者接入示例的后端；作者业务模块自行处理调用、返回数据和失败，不接入真实发布平台，不把业务机制加入核心。
- [x] 9.2 编写 release-panel.tsx、http-panel.tsx 及可复用业务模块，覆盖普通函数、CLI、HTTP、直接操作和请求 AI；另提供决策或原理演示面板，业务状态和进度展示由示例自行实现。
- [x] 9.3 更新英文用户 README 和 agent 使用指南，列明设计全部 29 个主组件及配套导出，提供 Field 表单项/分组/错误呈现、输入/选择、卡片、页签/折叠、提示/等待、对话框、下拉菜单/Popover、分页、标签和代码展示组合示例；覆盖安装、沿用官方默认主题的说明与页面组合方式、panel/server 命令分组与帮助、SDK、requires.paneon 声明与版本错误、迁移/手动选择匹配版本、升级服务重启、运行/修改/复用面板定义、事件/ack、密钥、英文 CLI 文案与 --debug 的 stderr/作用范围、框架错误诊断；明确业务调度/监控/日志/重试/存储属于作者代码，Paneon 不要求 CLI 或 HTTP 适配。
- [x] 9.4 提供可复制修改的方案对比、参数表单和表格操作页 TSX 组合示例，覆盖加载、空内容、错误、禁用和成功反馈；增加 gh CLI 仓库/PR 操作面板真实接入示例，展示列表、详情和交互动作，实现时核对所用命令能力，记录安装/登录前提、启动与操作方法，演示直接调用与 agent 事件两种行为。外部调用及业务处理全部位于示例代码，不扩展框架职责；隔离演示后端仍供无外部账号的自动化验证使用。

## 10. 完整交付验证

- [x] 10.1 运行现有 npm run typecheck、npm run build、npm test、npm run lint、npm run format:check；新增检查纳入可重复命令，不能以跳过失败检查作为完成条件。
- [x] 10.2 用 Playwright 实际操作面板，验证普通函数、作者自行接入的 CLI/HTTP 示例、返回值/错误、两种按钮行为、跨会话事件、官方默认主题/组件样式、必要响应式布局和自定义 SVG/Canvas；保留可复现命令和必要截图，检查无业务任务/日志持久化。
- [x] 10.3 用 npm pack 产物在仓库外独立目录安装，运行任意目录中的面板定义，验证运行依赖、包导出、静态资源、CLI、编译器与真实浏览器操作均可用；示例范围与实际待验包版本匹配，不通过跳过版本检查使其运行。
- [x] 10.4 按五份 capability specs 逐项核验并记录代码检查、运行证据和已知限制；对比实际改动更新设计文件清单，按本次 distributed-development 授权在验收通过后本地集成并 commit，删除开发 worktree；不发布或推送。
