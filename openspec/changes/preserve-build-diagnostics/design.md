## 需要你处理的事项

无。

### 已确认结论

- **B1**：保留原始编译错误、文件/行列/片段及失败阶段，沿用已有 IPC、diagnostic 和 SQLite；异常进程保留有限 stderr 及退出信息。
- **B2**：页面简要展示并可展开片段；普通 CLI 显示原因/位置，JSON 完整结构化输出，debug 信息仅写 stderr。
- **B3**：inspect 读取已保存的诊断，不重新编译；读取成功仍为 ok:true/退出码0，即使其中记录 BUILD_FAILED。
- **B4**：按 distributed-development 在当前分支最新提交的独立 worktree 开发，主 agent 后续验收、合入并 commit。

## Context

仓库 paneon，分支 0.0.x，基线 412c2aa6e10a3724b602c4b6109a39c2b68fcf6c。主工作区有此前选择页、Git 页和 host 布局的未提交改动，禁止覆盖或顺带提交。独立 worktree：/Users/yuguo/.codex/worktrees/build-diagnostics/paneon。

已核对根因：src/compiler/index.ts 的 catch 丢弃非 PaneonError，只留下固定 message；src/compiler/process.ts 忽略 stderr 和部分进程异常原因；src/runtime/worker.ts 的模块初始化错误同样被替换；TypeScript 检查已经具有部分位置字段，应保留并补齐传递。runtime/lifecycle.ts、Store 与 IPC 已能保存/传递 Diagnostic.details；host 只显示 message，CLI 普通失败只打印 message。当前用户页 11:52 的原异常已丢失，不能补回。

Paneon 交互演示位于 /tmp/paneon-diagnostics-proposal/panel.tsx，仅为说明，不作为产品代码或开发测试。原服务是旧进程，.mjs 响应类型不正确；演示已使用隔离服务。不要重启旧服务、刷新用户原面板、借此扩展处理热更新或 MIME 问题。

## Goals / Non-Goals

Goals：真实编译失败可定位；跨 IPC/存储/CLI/UI 信息不丢；正常信息简要、开发信息按需；明确读取成功和构建失败的差异。

Non-goals：修复未知的历史编译失败；自动重试；新增构建日志管理命令、数据库或业务日志系统；替换现有热更新生命周期；修改 panel action 执行业务错误的安全边界。

## Decisions

### 1. 在构建边界归一化，而非全局暴露所有异常

增加局部构建诊断 helper，提取实际工具返回的 message、位置、片段和必要的 cause。覆盖 typecheck、client-build、server-build、metadata、process 等阶段。读取真实的工具错误对象（含聚合错误），不要仅用正则猜位置，不把生成文件的坐标冒充 TSX 原坐标；工具没提供就省略。

沿用 code: BUILD_FAILED；已有 PaneonError 的 code 和 details 保留，包括 BUILD_SOURCE_CHANGED 等有独立语义的错误。保留已存在的 TypeScript details.diagnostic，新增统一字段不破坏旧读取。行/列向外统一为 1-based。本机 Rolldown BindingLogLocation 已确认行从1开始、列为0-based UTF-16；esbuild Location 列为0-based UTF-8字节，使用工具自带 lineText 转成 UTF-16 列后加1，真实工具失败样例已验证。聚合错误主消息、位置、片段和栈必须属于同一条原始错误，禁止借用 sibling 的位置；只沿真实 cause 链提取 cause。任意 Error 对象、循环引用不可直接进入 IPC 或 JSON。

拟定的持久化/IPC 结构（运行时沿用 Diagnostic）：

```ts
type Diagnostic = {
  code: string;
  message: string; // 原始错误原因，可直接展示
  details?: {
    stage?: 'typecheck' | 'client-build' | 'server-build' | 'metadata' | 'process';
    entryPath?: string; // 保留既有字段，不以它冒充精确位置
    file?: string; // 工具实际定位的出错文件
    line?: number; // 从1开始，工具未提供则省略
    column?: number; // 从1开始，工具未提供则省略
    frame?: string;
    stack?: string;
    stderr?: string;
    exitCode?: number | null;
    signal?: string;
    truncated?: boolean;
    diagnostic?: string; // 兼容既有 TypeScript 详细信息
    // 其他已有可序列化字段保持不变
  };
};
```

### 2. 有限诊断贯穿 IPC 和已有存储

编译 worker 正常返回失败时以结构化诊断为准；无失败 IPC 的进程退出则给出退出码/信号及尾部 stderr。stderr 最多保留64KiB UTF-8，其他大文本也必须有明确界限（message 8KiB、frame 16KiB、stack 32KiB），截断需标记，不能切坏 UTF-8。只收集构建/元数据检查上下文，不捕获正常 serverAction 的业务输出。删除临时构建目录失败不得覆盖原始构建异常。

继续存入 ~/.paneon/runtime.sqlite 的 panels.diagnostic_json TEXT 字段，无DDL迁移。内容示例：

```json
{
  "code": "BUILD_FAILED",
  "message": "Could not resolve \"./helper\"",
  "details": {
    "stage": "client-build",
    "file": "/work/panels/review.tsx",
    "line": 12,
    "column": 24,
    "frame": "12 | import { helper } from './helper';"
  }
}
```

服务重启后仍能读取旧格式诊断；成功编译按现有逻辑清除当前失败状态，保留可用版本和旧事件的现有语义。不新增日志落盘文件。

### 3. 命令和 HTTP 语义保持稳定

既有 HTTP：GET /api/panels/:instanceId 读取包含 diagnostic 的面板；POST /api/panels/:instanceId/reload 重新编译，失败返回 ok:false/error。沿用 WebSocket 诊断通知。

命令示例：

- paneon panel reload instance-example：失败原因与文件:行:列到 stderr，stdout为空，退出码1。
- paneon panel reload instance-example --json：stdout 为 {"ok":false,"error":Diagnostic}，默认不额外写 stderr，退出码1。
- paneon --debug panel reload instance-example --json：stdout 与上一项完全一致，额外阶段/调用栈/进程信息仅到 stderr，退出码仍1。
- paneon panel inspect instance-example --json：读取成功 stdout 为 {"ok":true,"data":{完整面板字段及"diagnostic":Diagnostic}}，退出码0；不重新编译。debug inspect 可将诊断开发细节写 stderr，不修改 stdout 内容。

debug 只作用于当前调用，不悄悄改变后台服务配置；普通输出不倾倒调用栈。格式逻辑应只影响存在构建诊断的路径，不改业务输出约定。

### 4. 页面展示

面板 host 顶部框架诊断区域显示原始原因和真实文件:行:列；片段可展开，长内容局部滚动。保留“上一个可用面板仍可用”的信息；不新增永久页头、全屏错误遮罩或自动刷新。旧格式/无位置的诊断仍能渲染。优先提取一个小的 BuildDiagnostic 组件，减少与主工作区现有无页头布局改动的冲突；合入时只添加诊断展示，不回退布局。

## Risks / Trade-offs

- 不同构建工具/插件错误结构不同 → 使用真实类型/错误实例和失败样例归一化，缺失位置不编造。
- 原异常内容可能非常大或带循环 cause → 仅提取所需字段、有限文本、标记截断；不序列化整个异常/环境/参数对象。
- 初始化 worker 同时执行正常业务 RPC → 只扩大构建/metadata初始化诊断，其他错误安全处理不变。
- 当前服务还加载旧代码 → 隔离 runtime 验收，不宣称现有原面板已升级；不重启用户服务。

## Affected files

- src/compiler/diagnostics.ts（新增）
- src/compiler/index.ts
- src/compiler/process.ts
- src/runtime/worker.ts（仅构建元数据初始化错误边界）
- src/cli/diagnostics.ts（新增）
- src/cli/index.ts
- src/web/build-diagnostic.tsx（新增）
- src/web/panel-host.tsx
- skills/paneon/references/cli.md
- tests/build-diagnostics.test.ts（新增）
- tests/cli.test.ts
- tests/browser/build-diagnostics.mjs（新增）
- openspec/changes/preserve-build-diagnostics/.openspec.yaml
- openspec/changes/preserve-build-diagnostics/proposal.md
- openspec/changes/preserve-build-diagnostics/design.md
- openspec/changes/preserve-build-diagnostics/specs/panel-build-diagnostics/spec.md
- openspec/changes/preserve-build-diagnostics/tasks.md
- openspec/changes/preserve-build-diagnostics/verification.md

如实施需要微调文件组织，更新本清单；验收覆盖文件由任务和验证报告记录。

## Verification and handoff

subagent 在上述独立 worktree 实现、用隔离临时 runtime/面板验收，不触碰用户页面。必须覆盖真实类型错误、依赖/构建失败、模块加载失败、异常进程、非ASCII路径、无位置、超大stderr、IPC/存储重读、CLI流及退出码、浏览器片段展示和成功恢复。已有类型/构建诊断测试继续通过。报告精确命令、结果与截图路径，不能用静态检查代替浏览器验收。

中央设计/任务/verification 位于主工作区本 change，subagent 可直接更新这组文档，其他未提交文件不改。源码改动留在 worktree 交主 agent 验收；不 push、不合并主工作区。主 agent 验收后合入并 commit，再清理 worktree。验收项在实际完成前保持未勾选。
