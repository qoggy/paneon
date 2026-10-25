# Theme and language implementation

## 需要你处理的事项

主题/语言与后续管理导航均已有主 agent 验收记录。遵循 focus：不新增项目级/实例级配置、系统跟随、翻译业务原文或额外业务校验。

## Historical ownership and baseline

一个 ui-theme-language subagent，在当前 HEAD cb0e4694cec0e41086f4113a49e7f193ca7b270f 创建的独立 worktree 开发完整纵向链路。主工作区及派工准备均不 commit。必要未提交的全屏宿主/相关浏览器文件、现有指南和本设计复制到工作树；复制后的文件快照和 SHA-256 清单保存在 /tmp/paneon-ui-preferences-dispatch-baseline。交付以该快照加 HEAD 为基准，只提供本任务增量；不把移植草稿当新实现，不覆盖其他 change。实现完成前不 commit/push，不删除工作树，主 agent 验收后负责正式合入提交。

## Theme and language tasks

- [x] 统一 UI 偏好类型、light/en 默认值、runtime 原子合并持久化与 GET/POST/WS 实时通知；复用现有 home/同源访问规则，不读取或改写用户实际偏好做测试。
- [x] CLI config get/set 与主页 Settings，保存后多窗口即时一致；启动 HTML 初始化主题/lang，失败不假装保存。
- [x] bridge init/更新与编译器公共 UI Provider，保留 identity 来源约束，不 remount、不改业务 params、事件或快照。
- [x] 公共默认文案双语及 API；调用者 supplied 文案/源文本/错误原文不自动翻译；现有提示以键/参数随语言变化。
- [x] Markdown/CodeBlock/Mermaid/Diff/文件状态图谱完整明暗适配，不重复解析长代码或破坏原文选择映射。
- [x] choose/form/table/review/Git/PR 及两个教学例子的 UI 操作/状态本地化；保留教学正文和业务内容，Intl 日期数字不改变业务排序。
- [x] 同步 README、skill 及 references/preferences.md 与 CLI/authoring 指导，适配独立安装包。
- [x] 真实 Chrome 四组合/多窗口/窄屏/portal/首屏及切换中草稿、批注编辑、Git 选择/滚动/receipt 保留；原事件和查询数量不因偏好改变。
- [x] 相关单测、build/types/lint/format、既有核心浏览器回归及独立安装包；提供日志、截图和纯任务文件清单，主 agent 独立验收。

## Historical delivery boundary

实现文件以 design.md 列出的配置/CLI/宿主/bridge/公共 UI/标准页/指南范围为准，允许必要的新字典和专用测试。不要改其他 OpenSpec change、依赖版本、业务 schema、校验时机、Git 业务读取规则或正式用户 ~/.paneon 配置。测试必须使用已有临时 home 参数。非必要的新校验/兼容/降级不写；遇到核心契约真冲突及时向主 agent 报告，不自行加新限制。

## Management navigation tasks

以下合并原 settings-navigation-tasks.md 的八项任务，保留原有完成状态；实施/截图/主 agent 验收记录仍见 [settings-navigation-tasks.md](settings-navigation-tasks.md)。此处只统一 OpenSpec 任务统计，不宣称本轮重新测试。

- [x] 将 src/App.tsx 的管理界面组织为面板 `/`、服务 `/server`、设置 `/settings` 三项顶部导航；保留具体 `/panels/:id` 无永久导航的边界；支持直达、刷新及浏览器前进/后退，不增加路由依赖。
- [x] 保留现有面板卡片、分页、关闭与局部刷新；切换管理导航保留列表数据、页码和滚动，不能附带关闭、重新创建或无关刷新。
- [x] 将 src/web/preferences-settings.tsx 从弹窗变成独立设置内容：约 640px 上限、左标签右控件、细分隔线；主题为低强调浅/深分段，语言为选择器。复用现有保存链路，准确显示保存中/已保存/失败状态，不加重复说明或 Save/Cancel。
- [x] 新增只读服务页，复用 GET /health 真实数据和现有 API 包装，展示运行状态、版本、PID、地址、启动时间及必要的运行实例标识；不加控制、虚构监控、快照文案或后台轮询。加载失败准确提示，不展示虚假 running。
- [x] 同步 src/ui/locales/en.ts 与 zh-CN.ts；正式页面不带“只读快照”“仅预览”“预览已更新”等体验页说明。只处理当前 UI 文案，不改业务内容。
- [x] 调整受影响的既有浏览器测试，新增必要的管理导航回归（状态保留、历史导航、直达、健康状态失败、保存失败）；build/typecheck/lint/相关测试通过。
- [x] 真实浏览器验证 light/dark、英文/中文、宽屏/390px；验证已有 panel 页无导航、跨页分页/滚动保留、保存失败无假成功且真实跨窗口偏好同步；测试用临时 runtime/home，不能改用户实际设置或停止用户服务。提供截图、命令、结果和变动清单。
- [x] 主 agent 独立验收通过，仅合入本任务代码并本地 commit；交付时归档 worktree，不 push。
