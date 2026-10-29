# Code First Panels Specification

## Purpose

Compile reusable local TypeScript and React panel definitions with bundled UI components, isolated server actions and explicit version compatibility.

## Requirements

### Requirement: Load reusable local TypeScript React definitions

Paneon SHALL 接受默认导出 `definePanel` 返回的 PanelDefinition（面板定义）的本地 TSX 入口，定义包含作者填写的 id、必填的 requires.paneon 包版本范围、输入 schema 与 React render。作者填写的 id SHALL 在实例元数据中表示为 definitionId；每次 panel run SHALL 创建新的 PanelInstance（面板实例）并由 SQLite INTEGER PRIMARY KEY AUTOINCREMENT 分配独立 instanceId，对外以十进制字符串返回，运行操作 SHALL 使用 instanceId，不以 definitionId 去重或选择实例。系统 SHALL 支持相对模块复用，并将面板源码与实例运行数据分开保存。

#### Scenario: Run a definition outside the Paneon repository

- **WHEN** agent 从仓库外目录运行一个使用 `@qoggy/paneon/sdk`、`@qoggy/paneon/ui` 和相对接入模块的面板
- **THEN** 系统解析已安装的 SDK 和 React、校验输入并生成可访问实例，不要求面板源码目录初始化 npm 项目

#### Scenario: Reuse source in another session

- **WHEN** 新 agent 会话使用同一面板定义传入另一组有效参数
- **THEN** 系统创建独立实例，使用同一份接入源码，且不覆盖其他实例的配置或事件

#### Scenario: Allocate an ID after deletion and restart

- **WHEN** 一个已提交的实例被删除，服务重启后再次创建实例
- **THEN** 新实例使用更大的自增编号，对外 instanceId 仍为字符串，不复用被删除的编号

#### Scenario: Fail initial creation

- **WHEN** 新实例分配 ID 后创建失败
- **THEN** 系统继续返回原失败，移除初始实例记录，并允许自增编号跳号

### Requirement: Preserve the upstream default visual baseline

本次迭代 SHALL 沿用 shadcn 官方默认主题和组件样式，以默认 Neutral 主题作为集成基线，并在仓库固定官方来源版本与生成配置。系统 MUST NOT 额外引入 Paneon 自定义字体/字号、调色板、圆角或控件尺寸规范来覆盖该基线，也 MUST NOT 在运行时自动拉取 upstream latest。

Page、Section、Stack SHALL 仅提供必要的页面宽度、分区和排列等布局能力，复用官方主题变量和 Tailwind 间距；StatusBadge SHALL 复用 Badge 的现有样式。宿主和面板 iframe SHALL 分别加载同一套主题及静态资源，面板作者仍可显式自定义自身样式。

#### Scenario: Render without author styling overrides

- **WHEN** 面板在宿主和 iframe 中使用默认组件，未指定自定义 CSS
- **THEN** 组件使用已固定的官方默认主题和样式，初始化页面的演示配色不覆盖它们，不要求 agent 手动填写字体、字号、颜色、圆角或控件高度

#### Scenario: Verify a composed page across viewport sizes

- **WHEN** 使用默认组件组合表单、方案评审或表格页面，在窄屏及桌面视口检查
- **THEN** 官方控件视觉基线保留，必要页面布局可用，长表格/代码在所属区域滚动，作者自定义样式不会被强行替换成 Paneon 自定义主题

### Requirement: Provide styled components without mandatory custom CSS

系统 SHALL 通过 @qoggy/paneon/ui 提供基于 shadcn/ui 的 Button、Input、Label、Field、Card、RadioGroup、Checkbox、Textarea、Select、Badge、Alert、Spinner、Table、Pagination、Tabs、Dialog、AlertDialog、Accordion、Collapsible、Tooltip、DropdownMenu、Popover、Switch、CodeBlock、Markdown，以及 Page、Section、Stack、StatusBadge 轻量组合；组件族 SHALL 包含设计公共导出清单中完成组合所需的配套组件，特别是 TabsList、TabsTrigger 和 TabsContent。普通组合 SHALL 在不编写面板 CSS 的情况下具有统一主题、焦点、加载与错误呈现。Tabs、RadioGroup、Checkbox、Switch、Textarea、Accordion、Collapsible 等交互组件 SHALL 支持选定社区实现的受控/非受控方式，以及其适用的禁用状态及键盘交互；组件状态变化 MUST NOT 隐式执行业务动作、提交 agent 事件或持久化值。

#### Scenario: Compose a release interface with defaults

- **WHEN** AI 使用默认组件组合环境选择、分支表格、流水线步骤和操作按钮
- **THEN** 浏览器展示样式完整、可操作的界面，不需要 AI 复制组件源码或手写基础控件样式

#### Scenario: Switch between author-defined tabs

- **WHEN** AI 从 @qoggy/paneon/ui 导入 Tabs、TabsList、TabsTrigger 和 TabsContent，组合多个页签
- **THEN** 用户可通过点击或键盘切换对应内容，受控值和禁用状态按社区组件契约生效，样式在面板 iframe 内完整呈现

#### Scenario: Control checkbox and switch values

- **WHEN** 作者用 React 状态控制 Checkbox 和 Switch，用户点击或通过键盘切换
- **THEN** 作者回调收到新值，组件反映状态；禁用时不可切换，框架不自动产生事件或业务调用

#### Scenario: Enter multiline feedback

- **WHEN** 面板通过带 Label 的 Textarea 收集反馈，用户输入包含换行的文本
- **THEN** 作者代码可读取并更新完整文本，受控/非受控及禁用状态按社区组件契约工作，输入本身不被自动持久化或发给 agent

#### Scenario: Compose dialogs and explicit confirmation

- **WHEN** 作者使用 Dialog 展示详情，或使用 AlertDialog 的 Action/Cancel 组件绑定确认操作
- **THEN** 组件可正常打开/关闭、管理键盘焦点并在关闭后返回触发控件；取消不执行确认回调，框架不为其他动作自动增加确认

#### Scenario: Show explanatory tooltips within the panel

- **WHEN** 作者组合 TooltipTrigger 和 TooltipContent，用户悬停或键盘聚焦触发控件
- **THEN** iframe 内的默认 TooltipProvider 使提示正常显示和隐藏，样式及层级正确，不要求作者访问外层宿主的 React context

#### Scenario: Render labels without business monitoring

- **WHEN** 作者向 Badge 和 StatusBadge 传入分类或状态文案
- **THEN** 页面按统一主题展示，组件不发起业务查询、创建任务或解释外部系统状态

#### Scenario: Compose a choice card with an exclusive selection

- **WHEN** 作者组合 CardHeader/Title/Description/Action/Content/Footer 展示方案，并用 RadioGroup/RadioGroupItem 接收选择
- **THEN** 页面无需自定义 CSS 即有完整布局，单选值和禁用选项按社区契约生效，鼠标及键盘可选择，组件不自动执行所选方案

#### Scenario: Show author-controlled alerts and waiting feedback

- **WHEN** 作者向 AlertTitle/AlertDescription 传入提示，并按自己的 React 状态显示 Spinner
- **THEN** 提示和可访问的等待标记正常呈现，组件不监控业务请求或推断其结果，也不重试调用

#### Scenario: Expand explanatory sections

- **WHEN** 作者配置 Accordion 的单项/多项展开及 Collapsible 内容区，用户点击或使用键盘
- **THEN** 展开状态和禁用状态按社区契约工作，受控与非受控方式可用，组件不会隐式发送 agent 事件

#### Scenario: Operate an author-defined dropdown menu

- **WHEN** 作者通过 DropdownMenu 配套组件组合分组、禁用项、普通操作、勾选/单选项和子菜单，用户用鼠标或键盘操作
- **THEN** 菜单在 iframe 内正确定位，导航、选值及关闭行为按社区契约工作，禁用项不可触发；只有作者显式绑定的回调执行业务，显示快捷键文案不会自动注册快捷键

#### Scenario: Open a popover containing form controls

- **WHEN** 作者将已有 Input/Checkbox 等控件放入 PopoverContent，并用 PopoverTrigger 或受控状态打开
- **THEN** 内容区可交互，锚点/层级正确，Escape 或外部点击按社区契约关闭并恢复焦点，打开/关闭本身不自动提交事件或执行函数

#### Scenario: Navigate pages using author-owned state

- **WHEN** 作者组合 PaginationContent、PaginationItem、PaginationLink、PaginationPrevious、PaginationNext 和 PaginationEllipsis，并将当前页标记和导航绑定到自己的 React 状态或链接
- **THEN** 页码、上一页/下一页和省略提示样式完整，键盘可操作且当前页有可访问标记；本地翻页按作者回调更新，组件不自动获取业务数据或持久化页码

#### Scenario: Present first and last page boundaries

- **WHEN** 作者根据首尾页、单页或空数据设置不可用操作或隐藏对应导航
- **THEN** 示例正确阻止不可用操作，组件不强制虚构总页数或执行额外请求，既可配合 Table 也可用于普通列表

#### Scenario: Compose accessible fields and groups

- **WHEN** 作者用 Field/FieldContent/FieldLabel/FieldDescription 组合已有输入控件，并用 FieldGroup、FieldSet、FieldLegend、FieldTitle、FieldSeparator 组织表单
- **THEN** 页面在 iframe 内具有统一的排版及分组样式，作者可通过 id/htmlFor 和 aria 属性关联标签、说明及控件，不要求额外表单状态库，也不替换已有通用 Label

#### Scenario: Display author-provided validation errors

- **WHEN** 作者自行校验输入，将错误传入 FieldError，并相应设置控件的 aria-invalid/aria-describedby
- **THEN** 错误按统一样式呈现，内容和变化由作者控制；Field 不自动校验、提交、持久化输入或向 agent 发送事件

### Requirement: Display code as read-only local content

系统 SHALL 提供接受 code 字符串及可选 language 的 CodeBlock，保留空格和换行，支持等宽字体、长行横向滚动及 javascript/js、typescript/ts、jsx、tsx、json、bash/sh、yaml/yml、diff 高亮。高亮引擎、语言语法与主题 SHALL 打包为本地依赖及资源，不依赖运行时 CDN 或外网加载。未指定或不支持的语言 SHALL 使用明确的纯文本模式。

CodeBlock MUST NOT 将内容当作 HTML、脚本或命令执行，也 MUST NOT 承担终端、编辑器或业务日志采集职责。

#### Scenario: Render code without interpreting it

- **WHEN** 作者传入包含换行、缩进、HTML 标签文本和命令片段的字符串
- **THEN** CodeBlock 保留文本格式并可横向滚动，不创建该字符串表示的 HTML 元素，不执行脚本或命令

#### Scenario: Highlight bundled languages without a network service

- **WHEN** 从已安装的 Paneon 包打开面板并请求支持语言的高亮，禁止访问外网
- **THEN** 本地高亮能力和主题正常工作，不向 CDN 请求语言资源；未指定或不支持的语言按纯文本模式显示

### Requirement: Render Markdown with an existing community presentation

系统 SHALL 通过 @qoggy/paneon/ui 导出只读 Markdown 组件，接受 Markdown 字符串并渲染标题、段落、列表、链接、引用、行内代码和围栏代码块。组件 SHALL 使用 react-markdown + remark-gfm，支持 GFM 表格、删除线、只读任务列表和自动链接；排版 SHALL 采用社区维护的 github-markdown-css 浅色样式，通过 markdown-body 容器限定作用范围，不覆盖外层 shadcn 控件。系统 SHALL 固定依赖版本并记录配置，不另定 Paneon Markdown 皮肤，不将该社区样式项目冒称为 GitHub 官方组件。依赖和样式 SHALL 随包提供并在面板 iframe 内加载。

Markdown 内容 MUST NOT 作为 JSX、脚本或命令执行，默认 MUST NOT 启用原始 HTML 解析；本能力不包含编辑器、批注或文档存储。

#### Scenario: Display Markdown without author CSS

- **WHEN** 作者向 Markdown 组件传入包含标题、列表、引用、链接和代码块的字符串，未编写额外 CSS
- **THEN** 面板 iframe 内使用已集成的社区排版样式显示文档，格式清晰，渲染及样式依赖无需运行时外网加载

#### Scenario: Keep content separate from executable panel code

- **WHEN** Markdown 字符串包含脚本标签、JSX 片段或围栏中的命令
- **THEN** 这些内容不作为可执行代码运行，原始 HTML 不被解析成可执行元素

#### Scenario: Render GitHub-flavored content with scoped styling

- **WHEN** Markdown 内容包含 GFM 表格、删除线、任务列表和自动链接，容器外同时存在 shadcn 控件
- **THEN** 文档使用 GitHub 浅色排版正确显示，任务列表保持只读，外层控件仍沿用 shadcn 默认样式

### Requirement: Preserve normal React expressiveness

系统 SHALL 允许面板定义使用 TypeScript、React 状态、条件、循环、相对模块、自定义 React 组件、SVG 与 Canvas，不要求作者把界面或动作改写为 JSON DSL。

#### Scenario: Render an interactive explanation

- **WHEN** 面板定义用 React 状态控制一幅自定义 SVG 或 Canvas 演示
- **THEN** 用户能通过控件改变演示状态，同时继续使用默认组件的主题和 SDK

### Requirement: Separate browser and server action dependencies

编译器 SHALL 将模块顶层具名导出的服务端动作生成 Node 执行入口，并把浏览器引用替换为调用代理。浏览器产物 MUST NOT 包含动作 handler、仅供服务端的依赖或 Node 内置模块；静态路由 SHALL 仅公开浏览器资源白名单，不开放服务端入口、服务端源码映射或运行数据。

#### Scenario: Co-locate a button and its local function

- **WHEN** 同一个 TSX 文件声明一个普通服务端函数和调用它的按钮
- **THEN** 按钮在浏览器运行，动作在本地 Node worker 运行，浏览器通过实例和版本绑定的代理调用它

#### Scenario: Reject a browser-side Node import

- **WHEN** 页面 render 的可达依赖直接访问 Node 文件系统模块或服务端专属模块
- **THEN** 构建失败并报告源文件位置，不把该模块打包到浏览器，也不自动转成不受约束的远程执行

#### Scenario: Reject a direct request for a server bundle

- **WHEN** 浏览器猜测服务端构建文件或源码映射的静态地址
- **THEN** 静态服务拒绝返回文件，不因浏览器已打开面板而公开服务端源码

### Requirement: Diagnose unsupported action captures

编译器 SHALL 接受可静态分析的顶层 action、模块级纯辅助函数和明确导入，并 SHALL 拒绝动态 action 声明、页面闭包捕获及无法判断执行侧的依赖，给出可修正的诊断。

#### Scenario: Reject an action defined inside render

- **WHEN** AI 在 React render 函数内声明捕获局部状态的服务端 action
- **THEN** 系统报告不支持的捕获及所在位置，提示通过动作参数显式传递，不执行该 action

### Requirement: Declare and validate a Paneon package version range

面板 SHALL 用 `requires.paneon` 声明非空、合法的 npm semver 包版本范围，CLI、SDK、组件与服务 SHALL 共用 Paneon 包版本，不维护独立 SDK 契约编号。编译器 SHALL 从入口 definePanel 对象中的字符串字面量静态提取范围，在执行任何面板模块前完成校验；缺失、非法或动态计算的范围 SHALL 返回 `INVALID_PANEON_REQUIREMENT`。当前包版本不满足 SHALL 返回 `PANEON_VERSION_UNSUPPORTED`，详情包含所需范围、当前版本和入口路径，不运行 handler。

系统 MUST NOT 自动安装旧 SDK、切换包版本、扩大范围或修改面板源码。预发布版本 SHALL 遵循 semver 库默认匹配规则；0.x 面板定义 SHALL 按已验证版本声明范围，不假设所有 0.x 兼容。范围满足后 SHALL 继续执行类型检查与编译，不将范围匹配视为运行行为的完整证明。

#### Scenario: Reject a runtime below the minimum version

- **WHEN** 面板要求 `>=1.4.0 <2.0.0`，当前安装为 `1.3.0`
- **THEN** 返回所需范围与当前版本，不执行面板模块或导入副作用，不改写源码

#### Scenario: Accept a compatible installed version

- **WHEN** 相同面板在 `1.4.2` 或 `1.5.0` 下加载
- **THEN** 范围校验通过，继续类型检查、依赖检查和编译，而非直接宣称可用

#### Scenario: Reject a runtime at the excluded upper bound

- **WHEN** 相同面板在 `2.0.0` 下加载
- **THEN** 明确拒绝并提示迁移源码或选择匹配版本，不自动使用其他 SDK

#### Scenario: Reject a missing or invalid declaration

- **WHEN** 面板未声明 requires.paneon、声明非法范围或通过运行表达式计算范围
- **THEN** 在执行面板模块前返回 INVALID_PANEON_REQUIREMENT，不以当前包版本静默填补

#### Scenario: Detect incompatible code despite a matching range

- **WHEN** 版本在声明范围内，但面板引用了不存在的 SDK 导出
- **THEN** 类型检查或构建拒绝该面板，不把作者声明的范围当作接口存在的证明

#### Scenario: Apply standard prerelease matching rules

- **WHEN** 当前版本是未被面板范围显式纳入的预发布版本
- **THEN** 按 semver 默认规则拒绝，不自动放宽兼容声明

### Requirement: Version compiled panels and switch atomically

系统 SHALL 在 manifest 记录 requires.paneon、实际构建包版本 paneonVersion、输入与动作定义；revision 摘要 SHALL 包含源码、本地依赖和构建包版本。仅在新构建完整通过校验后才能切换 revision。系统 MUST NOT 静默安装无法解析的依赖，MUST NOT 复用其他包版本编译的面板产物。

#### Scenario: Preserve a running version on reload failure

- **WHEN** 手动或文件监听触发 reload，但新源码编译失败或 requires.paneon 不满足当前包版本
- **THEN** 系统保留旧可用 revision，返回明确错误并在宿主显示构建失败，不把部分构建标记为成功

#### Scenario: Rebuild after a package upgrade

- **WHEN** 升级后的 Paneon 仍满足面板要求，但磁盘只有旧包版本的构建产物
- **THEN** 系统重新校验源码并构建，将当前 paneonVersion 写入 manifest，生成新 revision，不直接加载旧缓存

#### Scenario: Detect an unresolved third-party dependency

- **WHEN** 面板定义导入无法从其依赖位置解析的第三方模块
- **THEN** 系统指出缺失依赖和文件位置，不执行隐式网络安装

### Requirement: Reuse toolchain updates for watched dependencies

自动 reload SHALL 复用 Vite/React 既有的监听、模块失效和更新/重载能力，覆盖入口和可达本地依赖，排除构建产物、运行目录和无关文件。连续保存的处理 SHALL 沿用工具链现有调度，不另写热更新/模块替换机制；新构建失败 SHALL 继续监听，修正后可正常更新。

#### Scenario: Change an imported component

- **WHEN** 开启自动 reload 的面板引用的本地 TSX 组件或样式发生变化
- **THEN** 工具链更新受影响模块或重载页面，同步已校验的当前 revision，入口本身无需修改

#### Scenario: Save again during a build

- **WHEN** 文件连续保存且较早一次构建尚未结束
- **THEN** 工具链处理连续变更，最终加载最新成功修改，不由 Paneon 另建一套更新调度机制

#### Scenario: Fix a compile error while watching

- **WHEN** 自动构建失败后 AI 修正了源码
- **THEN** 旧可用面板在失败期间保留，后续监听触发成功构建并更新，事件和消费位置不丢失
