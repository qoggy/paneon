# Theme and language preferences

## 需要你处理的事项

无。用户已授权按本设计开发，并明确派 subagent；采用现有 light/en 默认值及配置、主页设置和实时切换方案。

### 已确认结论

- 用户希望可配置 light/dark 和英文/中文，影响 Paneon 提供的组件及 builtin 页面文案。
- 用户现已确认按本设计开始开发，由 subagent 实现，主 agent 验收。
- **B1**：builtin 页面由 Paneon 写死的界面文案支持英文/中文切换。
- **B2**：Markdown、代码高亮、Mermaid、Diff 完整适配 light/dark。
- **B3**：采用 `paneon config set ui.theme dark` 和 `paneon config set ui.language zh-CN` 配置命令。
- **B4**：配置持久化在 `~/.paneon/config.json`。

## 目标与范围

统一的用户级界面偏好：选择一次，主页、公共组件、标准面板均使用相同主题和语言。偏好不作为 panel 的业务 params，不要求 agent 为每个页面传 theme/language，不给每个组件加必填配置。

推荐设置项只有两组：主题「浅色 / 深色」和语言「English / 简体中文」。未配置时建议 light + en，保持现有默认亮色及英文产品入口；不额外增加跟随系统、项目级配置或每个实例的覆盖层级。

语言设置只控制 Paneon 自己提供的默认文案：标准面板的 Next、Review all answers、提交批注、占位符、帮助、可访问标签、空状态、验证提示、提交状态和日期展示。

大多数基础组件没有固定业务文字。Button 的 children、Input 的 placeholder、Field 的 label 等由调用方写什么就展示什么。仅分页默认 Previous/Next、Dialog 的关闭标签、Spinner 的 Loading、公共批注 UI 等确实由 Paneon 自带的默认文案需要中英字典。

“调用方传入的文字”就是 panel params 里的题目/选项/标题/文章，以及用户在表单和批注中实际输入的文字。调用方和用户想用什么语言就用什么，组件正常展示/收集原文；没有额外翻译步骤、语言校验或改写功能。Git/PR 原始内容同样保持原文。事件名、字段名、sourceId、原文坐标和 schema 不随语言改变。

CLI 的机器输出字段和英文诊断保持现状；本需求不扩展成整个终端产品的中文化。

## 当前代码事实

- `src/ui/styles.css` 已有 light 默认变量、`.dark` 变量和 shadcn dark variant；基础组件已有主题能力。
- 同文件固定引入 github-markdown-light.css；`CodeBlock` 固定 github-light；Mermaid 没有主题联动；共享 Diff 使用 bg-red-50/bg-green-50。现状不能称完整 dark 支持。
- 公共分页、Dialog、Spinner、批注操作等自带文案，目前中文/英文散落。
- 标准 choose/form/table/review/Git 和 PR 页自带文案也未集中管理；`useSubmission` 把提交状态保存成已解析的英文句子，切语言后不会自然更新。
- panel 运行于隔离 iframe。compiler 在初始化消息后挂载 React，`BridgeInit` 只有业务 params；host 主题不能通过 CSS 自动穿透 iframe。
- runtime 已有同源访问约束和 WebSocket 机制，但现有订阅只针对单个 panel 的状态。当前没有通用用户偏好存储或主题/语言配置入口。
- Paneon 固定 home 为 `~/.paneon`；不向项目目录写本次配置。

仓库：paneon；分支：0.0.x；设计基线：`cb51f8a02f080feb70dfe3f4d08469af23dc0351`。当前选择页布局和 host 另有未提交工作，实施时必须基于其实际最新状态合并，不用旧文件覆盖。

## 配置入口和存储

CLI 命令和配置文件位置已获用户认可。主页设置入口仍为推荐设计；两者读写同一份配置，不在 panel 外层恢复固定工具栏。

主页右上角「设置 / Settings」打开 Dialog：

```text
Settings / 设置

Theme / 主题        [ Light / 浅色 | Dark / 深色 ]
Language / 语言     [ English      | 简体中文    ]
```

选择后保存并即时应用，关闭设置无需再提交；保存失败保留原配置并显示错误。无须关闭、刷新或重建已有 panel。设置入口属于 Paneon 主页，不向每个 panel 注入按钮。

CLI 示例（拟定）：

```sh
paneon config get
paneon config set ui.theme dark
paneon config set ui.language zh-CN
```

CLI 使用既有 runtime client 和按需启动机制，复用同一配置读写逻辑，不另起配置服务或文件监听器。

持久化路径：`~/.paneon/config.json`。

```json
{
  "ui": {
    "theme": "dark",
    "language": "zh-CN"
  }
}
```

`theme` 值为 light/dark；`language` 值为 en/zh-CN。配置不是数据库里的 panel 快照，关闭实例不删除偏好。配置更新只改相关字段，不覆盖其他配置键；写入采用临时文件加原子替换。没有配置时使用建议默认值，不新增配置必填项或 panel 启动门槛。

本方案的实时更新来自 UI/CLI 正式入口；不增加手工编辑文件的热监听机制。直接编辑配置文件可在 runtime 下次启动时读取。

## 从配置到页面

```text
主页设置 / CLI
      ↓
runtime 统一保存 ~/.paneon/config.json
      ↓
通知所有已打开的主页 / panel host
      ↓
host 更新自身 UI，并发消息到现有 iframe
      ↓
公共 UI Provider 更新主题和语言
      ↓
组件 / builtin 页面重新呈现，业务状态保持
```

接口建议：

| Method / path              | 用途                                                   |
| -------------------------- | ------------------------------------------------------ |
| GET /api/preferences       | 读取生效的 UI 偏好                                     |
| POST /api/preferences      | 合并并保存 UI 偏好，返回生效值                         |
| WS /api/preferences/stream | 所有打开页面共享的偏好更新通知；连接建立后发送当前快照 |

请求与响应中的业务值都是 `{ "ui": { "theme": "dark", "language": "zh-CN" } }`，继续使用现有 `{ok,data}` 外层。POST 允许只更新其中一个设置。WS 消息为 `{ "type": "preferences", "ui": { "theme": "dark", "language": "zh-CN" } }`。连接恢复后读当前完整偏好，不回放修改历史。

该连接是 UI 环境通知，独立于原 panel state 连接；不会借主题变动触发 Git query、panel reload 或业务事件。复用既有同源访问、连接清理与恢复机制，不放宽权限或引入新认证方式。

iframe 初始化携带独立的 `ui` 字段；后续消息为相同 bridge identity 下的 `direction: 'preferences'`，仅更新 UI 环境。接收端沿用 parent/source、channelId、instanceId、revision 的来源绑定。偏好不混入 `params`，不经过业务 input schema，不计入业务 source identity。

compiler 自动包装公共 UI Provider。组件读取 `useUI()` 的 `theme`、`language` 和公共组件翻译函数；builtin 页从相同语言值读取自己的字典。agent 运行现有页面无需改变命令或传任何新 props。自定义页面使用主题变量和公共组件即可继承；作者自行写的文字和固定色值仍由作者控制，框架不做 DOM 扫描替换。

## 已有页面的兼容边界

实时切换的承诺针对接入本方案版本的 UI 和 builtin 页面。已在运行且仍使用旧编译产物的实例，以及用户以前复制并修改过的 TSX，不能仅凭 runtime 更新就获得其中硬编码文案的双语实现。官方资源更新后，新运行或重新编译的页面支持本方案。推荐不批量强制 reload 旧实例，以免丢失草稿。

## 首屏和状态保持

host 返回 HTML 时直接写入当前 theme/class、lang 和初始偏好属性，主应用从这些属性初始化。无需先渲染亮色再异步改深色，也不需要放开 CSP 以执行内联脚本。

iframe 在 init 到来前保持内容未挂载、背景透明；收到 ui 后先设置根节点 `.dark`、`lang` 和 `color-scheme`，再挂载 React。之后切换只更新 Provider 和文档属性，不改 iframe src/key，不 remount panel。

必须保留当前题目和汇总位置、所有答案/说明草稿、批注编辑缓冲和已保存批注、Git 当前分支/提交/文件、折叠和滚动状态、事件 receipt。已有状态中由 Paneon 产生的提示存 message key + 参数，在 render 时翻译；不能只在创建时保存最终字符串，也不能靠重新执行操作刷新语言。

## 主题适配

| 部分                            | 做法                                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 基础组件、页布局、弹层和批注 UI | 复用现有 shadcn CSS 变量，统一根 class，不逐组件传 theme                                                                                |
| Markdown                        | 使用当前固定版本 github-markdown-css 的 light/dark 配色，局部作用于对应主题的 markdown-body；保持排版，不以 OS 媒体查询覆盖用户显式选择 |
| CodeBlock / Git 语法高亮        | Shiki 同时提供 github-light/github-dark 颜色，切换使用 CSS token 颜色；不因换主题重新解析整份长代码或替换原文 Text 节点                 |
| Mermaid                         | 从 UI 偏好选对应主题；主题变化时重渲染图形，保留原 Mermaid 输入；错误和加载提示本地化                                                   |
| Git Diff / 文件状态 / 图谱      | 将固定浅色背景和状态/轨道配色集中到明暗 CSS 变量，保证两种背景下可读；保留增删改和分支的语义                                            |
| 原生控件和浏览器选择色          | 根 color-scheme 与主题一致；保留焦点、选中和可访问对比度                                                                                |

Markdown 的明暗样式限定在其正文区域，不能覆盖外部问卷字号或颜色。主题变动不得修改 Markdown、代码、Diff 或批注 quote，也不得把主题加入快照内容 hash。

## 语言与组件 API

仅公共组件中确实由 Paneon 提供的默认文字由 `src/ui/locales/en.ts` 与 `zh-CN.ts` 管理，字典键共用 TypeScript 类型。没有固定文案的基础组件只继承主题，不需要增加翻译逻辑。标准面板的业务界面文案在 skill 内共享字典管理，避免 SDK/UI 反向依赖 skill 资源。不引入服务端翻译或在线请求。

举例：

| key                | English                         | 简体中文                   |
| ------------------ | ------------------------------- | -------------------------- |
| choose.next        | Next                            | 下一题                     |
| choose.reviewTitle | Review all answers              | 检查全部答案               |
| feedback.submit    | Submit annotations              | 提交批注                   |
| diff.sideBySide    | Side by side                    | 左右对比                   |
| diff.position      | {current} / {total} differences | {current} / {total} 处差异 |

Git 查询中已有的 description/notes 等 Paneon 自带展示文字，改为展示键和参数或由已有结构化范围信息在前端格式化；不能在服务端查询完成时固定语言。展示描述不加入业务快照 hash，技术错误原文不作翻译数据。

组件中由 Paneon 提供的默认文字及其默认 aria-label、title、placeholder 一起切换。调用者传入的 children、title、description、aria-label 仍优先，不能被全局语言覆盖。例如 `<Button>删除用户</Button>` 的内容属于调用者，Button 不自动翻译它。

数字/日期使用 `Intl` 与当前语言，原时间戳保留；本次不新增时区设置。表格和 Git 业务排序不因换语言改变。翻译缺漏在开发时通过字典类型一致性发现，不在用户浏览或 panel 创建时新增“缺少翻译”拦截。

Paneon 拥有的验证提示及成功/失败摘要本地化；原有校验时机不变。Git/gh/用户 action 的外部原始错误和诊断保留原文与 code，不试图机器翻译；它们外面的 Paneon 提示可本地化。公共 UI 的程序错误不在这里扩成新的错误协议。

## 页面范围

| 页面                            | 受影响文字                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------- |
| 主页及 host 必要通知            | 设置、实例列表/状态、分页、连接/关闭/凭据交互                                |
| Choose                          | 翻题、汇总、自填、选项说明、详情、未答/错误与提交提示                        |
| Form                            | 清除、选择占位、必填提示、提交/更正/结果                                     |
| Table                           | 搜索/筛选/分页、选择及公共批注操作                                           |
| Review                          | 阅读辅助、公共批注及提交状态                                                 |
| Git review                      | 分支组名、文件组名、日期、差异导航、批注、加载与错误摘要                     |
| GitHub PR                       | 列表/详情/检查状态、Diff 和批注操作；PR 内容原样                             |
| Concurrency / Sentinel examples | 继承主题，公共控件和操作说明跟随语言；固定教学文章、示例数据不是自动翻译对象 |

教学文章是一次性示例源码中的内容，与 agent 传入的文章具有相同内容边界。作者可以使用当前 language 主动选择另一套文章，但本方案不要求每个一次性页面准备双语正文。

## 预计代码和指导改动

以下为拟实施文件清单，不是本轮已修改文件；不列测试文件。若实施发现实际必要路径有变化，应同步设计。

配置和通知：

```text
index.html
src/shared/preferences.ts
src/runtime/preferences.ts
src/runtime/server.ts
src/cli/index.ts
src/cli/config.ts
src/main.tsx
src/App.tsx
src/web/preferences.tsx
src/web/preferences-settings.tsx
src/web/api.ts
src/web/panel-host.tsx
src/sdk/protocol.ts
src/sdk/client.ts
src/sdk/index.ts
src/compiler/index.ts
```

公共 UI：

```text
src/ui/ui-provider.tsx
src/ui/locales/en.ts
src/ui/locales/zh-CN.ts
src/ui/index.ts
src/ui/styles.css
src/ui/markdown-theme.css
src/ui/markdown.tsx
src/ui/code-block.tsx
src/ui/mermaid.tsx
src/ui/dialog.tsx
src/ui/pagination.tsx
src/ui/spinner.tsx
src/ui/feedback-store.ts
src/ui/feedback-types.ts
src/ui/feedback-surface.tsx
```

标准页和共享呈现：

```text
skills/paneon/assets/shared/i18n.ts
skills/paneon/assets/shared/locales/en.ts
skills/paneon/assets/shared/locales/zh-CN.ts
skills/paneon/assets/shared/submission.ts
skills/paneon/assets/shared/diff.tsx
skills/paneon/assets/shared/diff-toolbar.tsx
skills/paneon/assets/panels/choose/panel.tsx
skills/paneon/assets/panels/form/panel.tsx
skills/paneon/assets/panels/table/panel.tsx
skills/paneon/assets/panels/review/panel.tsx
skills/paneon/assets/panels/git-review/panel.tsx
skills/paneon/assets/panels/git-review/git.ts
skills/paneon/assets/panels/git-review/branches.tsx
skills/paneon/assets/panels/git-review/history.tsx
skills/paneon/assets/panels/git-review/file-tree.tsx
skills/paneon/assets/examples/github-pr/panel.tsx
skills/paneon/assets/examples/concurrency/panel.tsx
skills/paneon/assets/examples/sentinel-leap-array/panel.tsx
```

用户与 agent 指导：

```text
README.md
skills/paneon/SKILL.md
skills/paneon/references/cli.md
skills/paneon/references/authoring.md
skills/paneon/references/preferences.md
```

## 验收标准

- light/en、light/zh-CN、dark/en、dark/zh-CN 四个组合，主页、公共组件、全部标准页实际检查；长中文、英文换行和窄屏均可用。
- 一处修改配置，多窗口即时一致；新实例、刷新和 runtime 重启读到同一偏好。保存失败不假装成功。
- 深色首屏无亮色正文闪现；Markdown、代码、Mermaid、Diff、弹层/Portal、原生选择框没有残留亮色区域或不可读文字。
- 填到一半、正在编辑批注、选中 Git 文件时切换设置，状态和原文定位保留，不多发事件、不重新查询 Git。
- 切语言后既有错误提示和提交结果同步变化，读屏标签同语种；题目、代码、批注和事件数据不变。
- 自定义页面不传任何新参数也可运行，公共组件继承偏好；原有 schema、提交与错误链路不新增拒绝条件。
- 独立安装包中的 builtin/skill 资源也能获取偏好与字典，不能只在源码工作区有效。

开发已授权。采用单一端到端工作单元，统一实现偏好存储/CLI/bridge/Provider 与页面接入，避免跨工作单元同时改同一条实时状态链路。主工作区不为派工提交；必要未提交宿主和指南移植到 worktree，并记录文件快照为隔离基线。

## Implementation notes

- `src/sdk/ui-environment.ts` contains browser document application; shared preference types stay usable by the Node runtime.
- `src/ui/use-ui.ts` owns the public context/hook and typed dictionaries; `UIProvider` stays a component module. The compiler subscribes to SDK preference state and passes it into the provider, avoiding a second SDK singleton in the UI bundle.
- `src/web/preferences-state.ts` shares the Settings save action with the bootstrap provider. Ordered preference WebSocket snapshots update the interface; HTTP confirms persistence, so a delayed HTTP response cannot overwrite a newer complete snapshot.
- Git listing `descriptionUI` and snapshot `notesUI` carry display keys/parameters alongside existing diagnostics. Business source IDs, snapshot hashes, original strings and Git read semantics are unchanged. `file-tree-model.ts`, `history-columns.ts` and `history-split.ts` also parameterize display labels.
- Existing Chinese browser fixtures explicitly select `zh-CN`; original assertions and source text remain intact. New preference tests use isolated temporary homes.

### Final verification and palette application

`src/sdk/ui-environment.ts` now applies a palette atomically. Real Chrome frame
sampling found inherited color transitions briefly made table cells/headers
unreadable. A temporary root attribute suppresses transitions only for the actual
palette update, flushes styles, and is removed after two animation frames. The
90-frame regression verifies both directions remain above 4.5:1 and normal
control transitions return. Language-only updates do not use this treatment.

`useSubmission` stores owned message keys/parameters or explicit `SubmissionError`
keys; external Error messages bypass dictionary lookup even when they equal a
common key. The original table/review empty-submit checks remain at the same
onSubmit boundary and store an owned key instead of a frozen sentence.

Additional necessary implementation paths are `src/ui/use-ui.ts`,
`src/web/preferences-state.ts`, Git display helpers, and PR `github.ts` optional
`notesUI` display metadata. Source values and hashes are unchanged. Test-only
paths and real evidence are enumerated in verification.md; no other change or
project-memory content was edited.
