# Management navigation implementation

## 需要你处理的事项

无。主 agent 已独立验收通过，代码已合入当前分支；本地提交和 worktree 清理属于本次交付，不 push。

## 范围和依据

以 settings-navigation-design.md 为设计依据；体验源为 `/private/tmp/paneon-navigation-review/panel.tsx`，仅参考顶部导航和已精简的文案，不移植评审工具和快照说明。基于 `de40e35e59720f6b90f4bcb24e873a56f47deea2` 创建独立 worktree。

## 任务

- [x] 将 src/App.tsx 的管理界面组织为面板 `/`、服务 `/server`、设置 `/settings` 三项顶部导航；保留具体 `/panels/:id` 无永久导航的边界；支持直达、刷新及浏览器前进/后退，不增加路由依赖。
- [x] 保留现有面板卡片、分页、关闭与局部刷新；切换管理导航保留列表数据、页码和滚动，不能附带关闭、重新创建或无关刷新。
- [x] 将 src/web/preferences-settings.tsx 从弹窗变成独立设置内容：约 640px 上限、左标签右控件、细分隔线；主题为低强调浅/深分段，语言为选择器。复用现有保存链路，准确显示保存中/已保存/失败状态，不加重复说明或 Save/Cancel。
- [x] 新增只读服务页，复用 GET /health 真实数据和现有 API 包装，展示运行状态、版本、PID、地址、启动时间及必要的运行实例标识；不加控制、虚构监控、快照文案或后台轮询。加载失败准确提示，不展示虚假 running。
- [x] 同步 src/ui/locales/en.ts 与 zh-CN.ts；正式页面不带“只读快照”“仅预览”“预览已更新”等体验页说明。只处理当前 UI 文案，不改业务内容。
- [x] 调整受影响的既有浏览器测试，新增必要的管理导航回归（状态保留、历史导航、直达、健康状态失败、保存失败）；build/typecheck/lint/相关测试通过。
- [x] 真实浏览器验证 light/dark、英文/中文、宽屏/390px；验证已有 panel 页无导航、跨页分页/滚动保留、保存失败无假成功且真实跨窗口偏好同步；测试用临时 runtime/home，不能改用户实际设置或停止用户服务。提供截图、命令、结果和变动清单。
- [x] 主 agent 独立验收通过，仅合入本任务代码并本地 commit；交付时归档 worktree，不 push。

## 实现与验证记录

实现位于 `/Users/yuguo/.codex/worktrees/management-navigation/paneon`，基线 `de40e35e59720f6b90f4bcb24e873a56f47deea2`。主 agent 已验收合入；仅本地提交，不 push。

- `src/App.tsx`：管理页顶部导航、原生 history 路由、面板列表页码/数据/滚动保留；设置保存状态跨导航保留；具体 PanelHost 继续使用独立路径，没有管理路由行为或外层导航。
- `src/web/preferences-settings.tsx`：普通内容页，640px 宽度上限、低强调外观分段、语言下拉和真实保存状态。
- `src/web/server-status.tsx`：真实 `/health` 数据；加载/错误准确，离开时取消请求，无轮询或服务控制。
- `src/runtime/server.ts`：仅在既有 host 旁增加 `/server`、`/settings` 两个 HTML GET 路由。基线只提供 `/` 和 `/panels/:id`，因此这是直达/刷新所必需的接线；不涉及其他任务的停服/资源回收代码。
- `src/ui/locales/en.ts`、`src/ui/locales/zh-CN.ts`：新管理文案。
- `tests/browser/preferences.mjs`：设置从按钮/弹窗改为导航链接/语言选择器；保留原多窗口和内容稳定性回归。
- `tests/browser/management-navigation.mjs`：新增真实 Chrome 导航、保存与服务错误回归，全部使用临时 runtime/home。

已通过 `npm run build`、`npm run typecheck`、本次文件 ESLint/Prettier、`node --test tests/preferences.test.ts`（3 项）、`node tests/browser/preferences.mjs`、`node tests/browser/management-navigation.mjs`。修改后的网页另由 `npm run build:web` 重建验证。

Chrome 证据包含：三个 URL 的生产直达/刷新与前进后退、列表第 2 页和真实 650px 滚动恢复且不重取列表、仅 Refresh 发起局部刷新、保存 pending 防重复、保存失败保留确认值、跨窗口同步、health 失败不显示 running 或旧结果、PanelHost 无管理导航、四组主题/语言与 1440px/390px 下三页无溢出。没有创建/关闭 panel 的页面副作用；测试探针只在独立 fixture 中创建。截图在 `/tmp/paneon-management-navigation-evidence/`（24 张），既有主题回归在 `/tmp/paneon-ui-preferences-evidence/`。

## 协作

subagent 负责本任务完整实现，禁止向主 checkout 写产品代码。设计/task 文档可在主 checkout 更新，其他已有 tasks.md 和其他 change 不改。实现完成时先报告差异与验证证据，不主动合入或删除 worktree。

## 主 agent 独立验收

已逐项审阅实现与测试，并检查中文浅色宽屏、英文深色窄屏截图，未发现阻塞问题。独立运行 worktree typecheck、preferences 单测 3 项及 management-navigation 浏览器回归通过；合入后主 checkout 完整 build、涉及文件 ESLint/Prettier、diff check、management-navigation 与既有 preferences 浏览器回归均通过。650px 滚动及第 2 页保留、三路由直达/刷新/历史、保存 pending/失败、多窗口同步、四组合/两宽度及 PanelHost 边界验证通过。主 checkout 原有 server.ts 的 forceCloseConnections 修改与 server-shutdown 测试未纳入本任务提交。

本次不重启用户当前运行服务，也不更新全局安装包；运行中旧服务与说明实例不会自动替换成仓库的新构建。
