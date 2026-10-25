# Paneon skill 与标准页面设计

## 当前状态

标准页、公共批注、--params-file、只读 PR 示例、两个原理展示示例与 paneon init 已有实现及分批验收记录，见 [verification.md](verification.md)。当前任务状态以 [tasks.md](tasks.md) 为准；3.5 仍保留用户亲自体验 Sentinel 的要求，不能凭工程验证宣称整个 change 完成。B42 的 paneon update 仅确认设计，当前 CLI 没有该命令，也不在本次实施范围。

本文件集中说明范围、资源归属、安装与传输边界。已确认决定保存在 [decision-history.md](decision-history.md)，其中的阶段性状态和旧 API 不作为当前开发指令。development.md、review.md、reports/ 及各次体验报告保留当时证据，不逐份改写历史结论。

## 现行设计分工

- [公共批注](annotation-design.md)：当前 Annotation API、浏览器草稿、原文定位与显式提交。
- [标准页面](standard-page-design.md)：选择、表单、表格、Markdown 审阅；开头说明表格默认对象入口已移除及表头文字批注的后续调整。
- [Git 页面](git-review-design.md)：初版交互和来源语义；当前无状态组件、请求和完整事件归 [refactor-git-review-stateless](../refactor-git-review-stateless/design.md) 维护。
- [示例](example-design.md)：PR、并发和 Sentinel；PR 执行与浏览器数据归属按 [资源生命周期](../add-panel-resource-lifecycle/design.md) 扩展。
- [init 安装](init-implementation.md)：安装流程、目标和集中元数据；未来 update 行为仍在本文件单独记录。

## Context

仓库：paneon（/Users/yuguo/IdeaProjects/paneon）。分支：0.0.x。设计基线：ba6e731a78700ecfdc5dfbb58f20483ba6927c7f。

变更前的基线产品有 CLI、SDK、UI 和独立 agent 指南；当前已提供 Paneon skill，并按 B36 将全部 agent 使用指导收拢到 skill，删除独立指南。现有 .agents/skills/ 是开发工具，不作为产品 skill 的资源目录。原基线 examples 主要证明组件或调用能力；当前标准页与场景示例均位于产品 skill。此 change 与 add-mermaid-rendering 分开；使用 Markdown Mermaid 能力时依赖其完成集成和验收，不在此处声称已交付。

已有运行基础：panel run 从 entryPath、cwd、params 创建实例；definePanel.input 校验 JSON；agent.emit 保存显式用户事件；events/ack 允许原会话恢复后读取结果。--params-file 已由本 change 实现，与 --params 二选一。无需为标准页面创建新的 HTTP 端点或数据库模型。

## Goals / Non-Goals

**Goals:**

- 通过一个产品 skill 分发现成标准 TSX、可复用场景示例和按需加载的调用说明。
- 标准选择页覆盖 B3 的四种交互；保留稳定的问题/选项标识，供 agent 理解回答。
- 多仓库 Git 页面在输入和反馈中区分仓库，避免同名文件混淆。
- 提供可由标准页、示例与自定义 TSX 接入的公共选择/批注 SDK/UI，skill 提供使用说明，页面保留语义和布局控制。
- 在对应页面实现前完成其契约核对，由 agent 收敛工程细节。

**Non-Goals:**

- 不增加 builtin: 名称解析、内置页面注册表或首页专用目录。
- 不设计通用 JSON 页面搭建语言；JSON 仅描述每个标准页面自己的输入。
- 不自动唤醒已结束的 agent；不将阅读下一题等浏览行为自动当作已提交答案。
- 不把 Git/gh 概念加入通用 runtime，也不把计数器或模拟发布测试当成主要产品示例。

## Decisions

### 资源归属与运行方式

产品 skill 的仓库位置为 skills/paneon/：SKILL.md 只介绍场景选择、运行和读取结果；references 按具体页面拆分参数/事件契约；assets/panels 放直接运行的 TSX；assets/examples 放可复制修改的完整业务场景。该布局已实施。

通用调用仍是 `paneon panel run <skill-directory>/assets/panels/choose/panel.tsx --cwd <directory> --params '<json>'`。每次 run 仍创建普通实例，沿用 inspect/reload/close/events/ack。无需先复制标准页面源码；需要修改实现时再复制相关目录。

按 B10，仓库只维护一份产品 skill 源码，随 CLI 的 npm 包携带配套资源，与 CLI 使用同一发布版本，不维护独立的 skill 发布序列。package.json 的 files 已包含产品 skill 目录；独立安装产物验收记录确认 SKILL.md、references 和 assets 均完整可用。

按 B37，安装体验只提供一个入口，由该入口指导或完成另一部分的安装；不把独立寻找 CLI 与 skill 两份资源作为用户流程。当前已提供 paneon init 安装包内 skill；实现及验收见 [init-implementation.md](init-implementation.md) 和 [verification.md](verification.md)。B38 已选定 CLI 入口，由 CLI 安装其包内同版本完整 skill，不以用户手动查找包目录和复制作为产品安装流程。资源引用仍相对 SKILL.md，保持完整可移植；requires.paneon 继续作兼容校验。安装命令的目录选择与已有副本处理规则由安装能力的技术契约落实；未执行安装命令时不写入个人目录。用户提出未来通过 update 改善更新体验，该命令不纳入本次实现，也不提前承诺旧 skill 副本已能自动更新。

### CLI skill 安装链路调研

已完成 OpenSpec、Vercel Skills、Firecrawl CLI、Playwright CLI、OpenSkills 的实现对比，并以 agent-browser 的薄入口模式作对照。固定源码版本、实际终端选择与临时项目安装/重装证据见 [调研文档](research/skill-installation.md)。

B40 已确认当前演示交互。按 B39，流程和英文文案先沿用 Vercel Skills 固定源码 a80e4c9 的 add.ts / installer.ts：先选 agent，默认 Project、可选 Global；多个不同目录时显示 Installation method，推荐 Symlink，也支持 Copy to all agents；同目录跳过方式选择并直接复制。链接模式把完整资源复制到稳定的 .agents/skills/paneon 中央副本，各非通用目标链接到它，不链接 npm/npx 缓存。已有安装在 Installation Summary 标记 overwrites，再通过 Proceed with installation? 统一确认覆盖或取消，不新增备份、自动合并或内容冲突分类。等价非交互参数沿用 --agent / --global / --copy / --yes 的语义。

Paneon 保留已确认的唯一来源：当前 CLI 包内完整 skill，不另下载技能仓库，也不显示多技能挑选。早期一次性安装演示已删除；CLI 安装器已实现并通过主 agent 验收，最终交互、注册表及命令以 [init 实施契约](init-implementation.md) 和 skill/CLI 帮助为准；未来 update 仍不在本次范围。

### init 实施契约

用户已明确要求实现 paneon init 并使用 distributed-development。命令、首批 11 个 agent、终端原文、目录/覆盖及集中记录、两组内部 API 和验收边界见 [init-implementation.md](init-implementation.md)。只做 2.13，B42 update 仍为未来方案。

### 后续 update 已确认行为（B42，本迭代不实现）

<!-- prettier-ignore -->
| 命令 | 行为 |
| --- | --- |
| paneon update | 升级 CLI，并更新全部已登记的 Paneon skill，包含项目级和用户级 |
| paneon update --project | 升级 CLI，只同步当前 cwd 对应项目的 skill |
| paneon update --global | 升级 CLI，只同步用户级 skill |

CLI 检查/升级一次后，从 ~/.paneon 的集中安装记录取得所选条目；默认命令不以 cwd 筛选，也不扫描磁盘找项目。显式 --project 才用 cwd 匹配安装记录。即使 CLI 已是最新，也继续同步所选 skill。沿用每项原来的 agent、目标及 Copy/Symlink 方式，普通安装目录清理重建后复制包内新版，覆盖用户修改并清除过时文件；正确指向中央副本的链接保留。项目目录已不存在时跳过并报告，不根据旧记录重建项目。

早期默认按 cwd 的更新演示已删除。B42 的三种更新范围及上述同步规则继续保留，作为未来 update 实施依据；删除原型不撤回设计，也不表示启动 update 开发。现有集中安装记录契约见 [init 实施契约](init-implementation.md#installation-and-records)，update 的具体实现留待后续任务。

## Storage and Interfaces

实例输入仍使用 ~/.paneon/runtime.sqlite 的 panels.params_json，明确提交的完整结果使用现有事件 type/payload_json；不新增标准页面业务表。各页字段与样例由对应 skill references/schema 维护，专题设计只记录职责与语义，避免复制第二份类型。

选择/表单分别提交完整答案/values，表格和 Markdown 审阅提交 annotations，Git/PR 另附实际引用的来源证据。公共条目正文叫 comment，没有顶层 comment；标准页的完整更正由 replacesEventId 关联，PR 示例沿自己的事件契约。草稿、浏览状态和原文快照由浏览器持有，不承诺整页刷新或服务重启后恢复。

--params-file 与 --params 互斥，省略两者时沿用空对象默认值，再交给 definePanel.input 校验。文件相对调用 CLI 的目录解析，--cwd 仍是动作工作目录。创建时读取 UTF-8 JSON 快照并保存，之后修改/删除原文件、刷新、reload 或服务重启都不重读；改变数据需再次 run 新实例。文件读取/解析失败或同时提供两项时不创建实例。

--watch/--no-watch 只控制源码更新，不监听输入文件。创建、事件提交及 events/ack 沿用现有通用接口，不增加标准页专用 HTTP 协议。事件与请求体积边界见下文。

## Risks / Trade-offs

- 未完成问答与最终答复混淆 → 按 B5 仅在最后明确提交时发送整组答案；上下题不产生答案事件或隐式触发业务动作。
- 多题 ID 或多仓库文件名混淆 → 校验问题/选项唯一性，Git 反馈使用仓库 id 和相对文件路径。
- 文件入参与源码更新混淆 → B6/B7 已确认创建时读取 JSON 快照；--watch 保持源码监测语义，reload 不重新读取原参数文件。
- skill 与 CLI 版本不匹配 → 按 B10 同版本提供资源，仍用 requires.paneon 校验范围；安装到 agent 目录的资源不承诺自动同步更新。

## 传输体积限制核对

实施前基线事实（现已由首批修复，见 verification.md）：src/runtime/lifecycle.ts 限制 JSON.stringify(payload).length <= 65536（UTF-16 长度），src/runtime/server.ts 却将整个 HTTP body 限制为 131072 字节。65536 个 JSON 字符可能接近 196608 个 UTF-8 字节，另有 type/revision 外层，因此中文长反馈存在提前被拒绝的路径；现有错误处理还会将 Fastify 的体积错误按普通异常返回 500。

本 change 实施时将 HTTP body 固定上限调整为 262144 字节，并把体积错误映射为 HTTP 413、英文 BODY_TOO_LARGE 结构化诊断；事件的 65536 字符上限仍独立保留。CLI 文件入参和浏览器事件在发送前计算完整请求体 UTF-8 字节数，提前报告同样限制；服务端仍作权威限制。--params-file 不代表无限数据量，不拆分事件、不截断文本、不新增体积配置。页面语义校验若经 serverAction 发送同份反馈，也使用这个 HTTP 限制。验收覆盖中文 payload 在语义上限内可提交、超过语义上限和超过请求字节上限分别被准确拒绝，失败保留草稿。

## 实施与验收记录

源码和文档交付路径随批次保存在 [verification.md](verification.md) 与 reports/，不在设计里再复制一份已过期文件清单。后续工作应从当前源码和各页 references 取签名，不复活已移除的 Feedback API、对象选择控件或旧会话缓存。
