# Build diagnostics implementation verification

状态：实现与 subagent 验证已完成。完整有界回归 145/145；最后两处边界修正后完整构建、定向 15/15、真实 Chrome/CLI/SQLite、lint/format 全部通过。主 agent 尚未合入或 commit，任务 3.5 保持未勾选。

- Change: preserve-build-diagnostics
- Main workspace: /Users/yuguo/IdeaProjects/paneon
- Branch/base: 0.0.x / 412c2aa6e10a3724b602c4b6109a39c2b68fcf6c
- Implementation worktree: /Users/yuguo/.codex/worktrees/build-diagnostics/paneon
- Owner: diagnostics-implementation

主工作区此前问卷、Git 和 host 布局未提交改动不属于此次实现。源码只写入上述 worktree；中央文档只更新本 change 的 design、tasks 和 verification。未重启或 reload 用户旧服务 127.0.0.1:56414，也未操作 53844 演示服务。

## Implementation

- `src/compiler/diagnostics.ts`：保留原始 message，统一 stage；保留既有 PaneonError code/details，包括 BUILD_SOURCE_CHANGED 和 TypeScript diagnostic。只提取普通 JSON 字段，处理聚合错误与循环 cause；移除工具消息、片段和栈中的终端颜色控制码，避免浏览器显示转义残留。聚合错误消息、file/line/column、frame 和 stack 均取自同一个 primary 原始错误，不能跨 sibling 拼接。cause 仅沿实际 cause 链读取。
- 工具位置依据：`node_modules/rolldown/dist/shared/binding-CwA4xu8x.d.mts` 的 BindingLogLocation 明示 line 1-based、column 0-based UTF-16；`node_modules/esbuild/lib/main.d.ts` 的 Location 明示 line 1-based、column 0-based UTF-8 bytes。归一化为 1-based UTF-16 列。真实 Rolldown `export const = ;` 返回 column 14，额外中文前缀 `export const 中文 = ;` 返回 column 19，真实 esbuild `const 中文 = ;` 返回 column 12，均已断言。
- message 8 KiB、frame 16 KiB、stack/cause 32 KiB、stderr 64 KiB。UTF-8 边界截断，文字带 `[truncated]` 且 details.truncated=true；stderr 使用增量 StringDecoder 和有限尾部。TypeScript frame 来自诊断对应源行，只显示错误附近上下文并正确对齐 caret。
- compiler index 的全构建边界记录 typecheck/client-build/server-build/metadata；metadata 子进程完整传递 details，异常退出返回 exitCode/signal 和有限 stderr。CompilerProcess 等待 close 排空 stderr；结构化失败优先，cleanup 错误不覆盖原始构建失败。
- runtime worker 只扩大 init/metadata 异常诊断；正常 serverAction、事件和业务错误的处理边界未改。
- CLI 普通失败显示原始原因与真实位置到 stderr；JSON 返回完整 Diagnostic；debug 仅到 stderr，可打印 stage/stack/cause/exitCode/signal/stderr/truncated。inspect 继续只读返回已保存的诊断，成功读取是 ok:true/exit 0。
- BuildDiagnostic 小组件显示原因和位置，可展开代码片段，长内容局部滚动，兼容旧记录；panel-host 仅增加 import 和替换诊断 Alert，未改布局或刷新逻辑。
- agent 用法只更新 `skills/paneon/references/cli.md`，未新增命令、数据库、DDL 或业务日志系统。

## Changed files

独立 worktree：

- src/compiler/diagnostics.ts（新增）
- src/compiler/index.ts
- src/compiler/process.ts
- src/runtime/worker.ts
- src/cli/diagnostics.ts（新增）
- src/cli/index.ts
- src/web/build-diagnostic.tsx（新增）
- src/web/panel-host.tsx
- skills/paneon/references/cli.md
- tests/build-diagnostics.test.ts（新增）
- tests/cli.test.ts
- tests/browser/build-diagnostics.mjs（新增）

中央文档：

- openspec/changes/preserve-build-diagnostics/design.md
- openspec/changes/preserve-build-diagnostics/tasks.md
- openspec/changes/preserve-build-diagnostics/verification.md

## Build and automated tests

全部源码命令的 shell workdir 均为独立 worktree。

- `npm ci --no-audit --no-fund`：exit 0，安装 574 packages，未复用主工作区 node_modules。
- `npm run build`：最终 exit 0，CLI、UI、typecheck、web 全部通过。日志 `/private/tmp/paneon-diagnostics-build.log`。
- `node --test --test-concurrency=2 tests/build-diagnostics.test.ts tests/cli.test.ts`：最终源码 15/15 通过（包含无 dist source help 和真实工具 ANSI 清理），exit 0。日志 `/private/tmp/paneon-diagnostics-focused.log`。
- 定向覆盖真实 TypeScript、非 ASCII 文件、缺失 CSS 依赖、真实 Rolldown/esbuild 位置、模块顶层初始化错误、无位置、循环 cause、超大 UTF-8 文本和分块 stderr、进程 exit/signal、结构化 IPC 优先、CompilerProcess cleanup 和 compiler catch cleanup 注入失败。
- `node --test --test-concurrency=2 tests/*.test.ts`：完整回归 145/145 通过，exit 0，耗时 203159.932208 ms。日志 `/private/tmp/paneon-diagnostics-regression.log`。该轮包含新增聚合 sibling 回归；之后仅修正源码 helper 加载与终端颜色显示清理，并新增无 dist source help 回归，已重新完整 build/lint/format，相关最终定向 15/15 和最终真实 Chrome 流程再次通过，不把 145 项写成包含该新增 CLI 用例。
- 最终 `npm run lint` exit 0，仅 15 条原有 non-null assertion warning；`npm run format:check` exit 0。
- `openspec validate preserve-build-diagnostics --strict --json`：通过（valid=true、issues=[]）；权威文档在主工作区，由从 worktree 启动的 Node 子进程按中央项目 cwd 执行 OpenSpec。
- `git diff --check`：exit 0。

## Real Chrome, CLI and SQLite evidence

执行 `node tests/browser/build-diagnostics.mjs`，使用 headless Chrome channel=chrome、临时 HOME 和新端口，通过独立 startServer，不操作用户服务。最终 build 后完整流程已再次 exit 0。

最终通过证据目录：`/private/var/folders/01/7961y03s2xbdldhx3v2vfcmr0000gp/T/paneon-build-diagnostics-evidence-JMnJeF`。日志 `/private/tmp/paneon-diagnostics-browser.log`。

- `failure-expanded.png`：真实 TypeScript “Type 'number' is not assignable to type 'string'.”，中文文件位置 `中文 面板.tsx:2:59`，展开代码片段；旧 iframe 保持原 src，Count 0 按钮仍能点击至 Count 1，pre overflowX=auto。
- `old-diagnostic.png`：旧格式 BUILD_FAILED 仅有 message，无位置/片段，正常展示且旧 iframe 保持状态。
- `recovered.png`：修正源码后 CLI reload 成功，页面显示 Recovered panel，失败通知清除，SQLite 重开也无 diagnostic。
- `report.json`：原始诊断、临时服务 URL、所有 CLI args/stdout/stderr/status 与浏览器检查记录。保存完整失败 JSON 原因、stage、file、line、column、frame、stack 和旧 diagnostic 读取情况。
- 普通 failed reload stdout 空、stderr 原因+位置、exit 1；JSON failed reload stderr 空、stdout 为 ok:false 完整错误、exit 1。debug JSON 字符串与普通 JSON 完全相同，stderr 含 typecheck stage 和 stack。
- built 和 source CLI inspect --json 均 ok:true/exit 0，返回已保存 BUILD_FAILED；debug inspect stdout 与普通 inspect 字符串相同，额外 stage 仅到 stderr。重复读取不改变面板记录或 revision。
- Store 打开→读取→关闭→重开，完整诊断字段与 CLI 结果相同；成功构建后重开无诊断，未新增表或迁移。
- 另有真实 metadata 子进程 process.exit(31)，stderr “metadata process failure 中文”；CLI debug JSON 保留 stage=metadata、exitCode=31、stderr，并只在 debug stderr 输出 build.exitCode/build.stderr。旧 frame 仍可用，随后修正源码并成功恢复。

## Corrections during verification

首轮 isolated-package 测试因独立 PaneonError 类身份不一致而误读为 INTERNAL_ERROR，已修正测试读取，未以测试假阴性修改产品语义。首次浏览器断言遇到 macOS /var→/private/var realpath 差异，fixture 改为实际 canonical path 后通过。主 agent review 发现聚合 sibling 消息/位置混用，已修复并新增正反顺序回归；主 agent 已独立复测正反顺序并确认消息与位置不再混用，独立审阅 ChxyYu 的 Chrome/CLI/SQLite 报告及此前截图，相关部分验收通过。最后源码 helper 直接加载 diagnostics.ts，确保尚无 dist 时 --help 仍可用；真实 Rolldown message 的 ANSI 颜色码也已局部清理，不改变错误原因。

## Limits and handoff

这里修复的是诊断丢失，不是历史面板未知的编译失败根因；旧记录中已丢失的错误无法补回。没有对用户现有 daemon/面板应用新代码。主工作区 src/web/panel-host.tsx 有其他布局改动，主 agent 合入时只迁移本次 import 和 BuildDiagnostic 替换，不得回退主工作区布局。worktree 当前为 detached HEAD，仍停在基线 412c2aa6e10a3724b602c4b6109a39c2b68fcf6c；7 个 tracked 修改和 5 个新文件均未暂存。没有 commit、push、合并分支或归档 change。需要主 agent 完成 3.5 的最终验收、三方合入、commit 和 worktree 清理。
