# 资源生命周期实施验收

日期：2026-10-25。实施依据为本会话用户确认：采用懒恢复与有界的每面板子进程驻留，废弃 B14。B15 可见性策略和 C2 磁盘回收未实施。

## 实现结果

- restore 不扫描编译或求值历史面板，不启动其 worker/watcher；running 表示逻辑打开。
- 默认十个驻留位置，覆盖初始化、忙、空闲和退出过程。每位置最多一个执行子进程和一个 watcher；只按 LRU 回收空闲位置，实际退出后才释放容量。
- 全忙时新增面板最多 32 项 FIFO 等待、十秒超时，明确 RUNTIME_BUSY，超时不会在之后执行。已有面板异步 action 继续可重叠，不新增 action 默认执行期限。
- 编译另限一个活跃位置；close/stop 撤销排队、初始化与编译，失败的新面板不残留空位置。
- 静态资源、manifest、历史事件/ack 和凭据声明读取不要求 live 执行。缓存最多32份/8MiB序列化数据；目标记录按主键读取，列表使用 SQL 投影。
- 冷唤醒复用有效产物，同 revision 凭据保留。watch 停驻后的依赖变化在激活时检测；no-watch 仍需显式源码 reload。失败编译保留旧内容及监听，能观察后续修正。
- 事件校验后再次核对身份，并在 SQLite 事务内核对 revision/关闭状态后写入。凭据绑定、原始 Zod refine、泄露拦截不变。
- 内置 PR 每个请求创建独立读者，由浏览器提供所需固定版本详情、比较和原文；不依赖上一进程的 session。保留来源/位置校验、原有传输与事件限制，界面、布局和操作不变。哈希一致性不等于独立 GitHub 来源真实性认证。

## 已完成验证

相关 Node 回归组61项通过，覆盖 core、compiler-exports、runtime-worker、resource-pool、resource-lifecycle、runtime-integration、runtime-hardening、request-limits、server-shutdown。升级用例已调整为“inspect 不执行作者代码，首次使用才重建，旧 revision 不执行新 handler”。

加入事务内事件保护后，core、request-limits、resource-pool、resource-lifecycle、events-integration、state-websocket 组29项通过，覆盖真实 CLI 等待/ack/停止、来源与订阅隔离。最终资源生命周期/队列13项通过，包含失败初始化位置清理。上述各组有重叠，不累计为独立用例总数。

Git/PR Node 回归20项通过（Git13、PR7），包括完全新建读者时的固定版本文件、旧描述/检查/文件批注、审阅请求及篡改证据拒绝。

真实 Chrome 三组通过：

- `tests/browser/resource-lifecycle.mjs`：随机端口独立服务；重启后零驻留、冷态静态文件、通知仅恢复 watch、打开的 socket 不固定旧 worker、默认十位置峰值、淘汰后草稿/显示结果保留、下一次点击唤醒。
- `tests/browser/credentials.mjs`：多行原文、取消/撤销/TTL、跨 action 拒绝、泄露拦截、在途过期保护、源码失败恢复、旧凭据失效、关闭和重启。
- `tests/browser/github-pr.mjs`：3项全部通过；完整复制的 skill、独立 gh fixture、描述定位、检查、固定 head 文件、跨 PR 原文、反馈和审阅请求、显式更正、请求/事件限额、coverage 与 CLI events/ack。PR action 每次使用独立上下文，因此这些流程不依赖前次读者的内存。

验证环境保留现有用户服务。需要 HTTP 的旧回归使用临时 Node loader，将未配置的默认端口49321改为0；显式配置不变，仅影响测试进程及其子进程，不改产品源码或用户配置。固定默认端口行为不作为该组的验收结论。新浏览器资源用例自身写临时配置 `server.port=0`。

`build:cli`、全项目 TypeScript 检查和本次实现文件 ESLint 通过；旧 `runtime-hardening.test.ts` 保留原有五处 non-null assertion warning。OpenSpec strict 校验通过。未运行全仓 `npm test` 或覆盖所有产品 UI 的回归，未把定向通过说成全量通过。

## RSS 与文件描述符样本

本机 Node24.16.0，独立临时 Runtime，固定十个身份，每轮按顺序使用，驻留上限设为3以持续触发淘汰；二十轮中还做一次显式 reload。不强制 GC，只记录测试自身主进程及其当前子进程。

<!-- prettier-ignore -->
| 轮次 | worker / watcher | 主进程 FD | 主进程 RSS MiB | Node RSS 合计 MiB |
| --- | --- | --- | --- | --- |
| 1 | 3 / 3 | 44 | 261.6 | 481.9 |
| 5 | 3 / 3 | 44 | 283.4 | 496.4 |
| 10 | 3 / 3 | 44 | 302.9 | 522.0 |
| 15 | 3 / 3 | 44 | 310.4 | 531.1 |
| 20 | 3 / 3 | 44 | 271.2 | 494.5 |

本机临时原始样本：[短轮数据](/tmp/paneon-residency-measure.json)、[二十轮数据](/tmp/paneon-residency-measure-long.json)。

另对1、5、10个活跃身份各测三轮，数量在上限处饱和；默认上限10另由真实 Chrome 观察到执行 worker 峰值10。

结论限于本样本：进程/监听数量受限，FD没有随轮次增长，RSS波动并回落。RSS合计会重复计算共享页，不能当成额外物理内存；二十轮不证明任意业务或长期运行没有泄漏。驻留上限不是总RSS、浏览器内容、在途请求、任意后台子孙进程或历史磁盘数据的字节预算。

## 发现并修复的边界

- 冷态源码有语法错误时，原“先编译再监听”留下零watcher。新增用例复现后，改为先按最后成功图恢复受限监听，错误修正后可自动恢复。
- PR旧描述的ID计算不受影响，但检查/diff的对象字段插入顺序与schema解析顺序不同。逐类证据复现后，统一生成与解析顺序，并传递概览ID所需的原身份元数据，保留内容和引用一致性校验。
- 事件在 worker 校验与提交之间遇到 reload/close 时不写入；新输入校验失败不保留无资源的驻留位置；子进程退出使在途调用失败，下次调用可创建新进程，均不自动重放 mutation。

## 改动文件

以下为本次资源治理实现文件，不包括工作区原有 README、UI、Git helper 等并行修改；此前本会话的原生 worker 加载优化继续保留。

```text
src/runtime/artifacts.ts
src/runtime/resource-pool.ts
src/runtime/lifecycle.ts
src/runtime/server.ts
src/runtime/store.ts
skills/paneon/assets/examples/github-pr/github.ts
skills/paneon/assets/examples/github-pr/panel.tsx
skills/paneon/references/authoring.md
skills/paneon/references/cli.md
skills/paneon/references/github-pr.md
tests/resource-pool.test.ts
tests/resource-lifecycle.test.ts
tests/runtime-worker.test.ts
tests/runtime-hardening.test.ts
tests/github-pr.test.ts
tests/browser/resource-lifecycle.mjs
docs/memory/MEMORY.md
docs/memory/tech-source-updates.md
docs/memory/tech-resource-residency.md
docs/20261025/panel资源治理与serverAction边界-handoff.md
openspec/changes/add-panel-resource-lifecycle/proposal.md
openspec/changes/add-panel-resource-lifecycle/design.md
openspec/changes/add-panel-resource-lifecycle/specs/panel-resource-lifecycle/spec.md
openspec/changes/add-panel-resource-lifecycle/server-action-capabilities.md
openspec/changes/add-panel-resource-lifecycle/tasks.md
openspec/changes/add-panel-resource-lifecycle/verification.md
```
