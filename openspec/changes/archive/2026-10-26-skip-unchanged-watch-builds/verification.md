# Watch 编译复用验收

## 实现范围

自动 watch 在现有每面板队列中检查当前构建；命中时保留 watcher、执行进程、模块状态和凭据。显式 run/reload 继续完整编译，reload 继续替换执行并作废凭据。构建错误恢复时清除旧 diagnostic，完成 state 通知。

没有加入新的业务输入校验、拒绝码、业务超时或并发限制。以下检查用于选择复用还是正常编译，不把缓存不匹配变成业务异常。原有关闭、停止、revision、凭据、请求限制和编译 admission 继续生效。

## 复用决策清单

<!-- prettier-ignore -->
| 决策 | 依据和触发条件 | 处理及影响 | 代码位置 |
| --- | --- | --- | --- |
| 版本及旧产物 | Paneon 版本不同，或 manifest 没有 reuse 记录 | 正常编译生成记录；不迁移数据库，不删除历史 | `src/runtime/artifacts.ts:48` |
| 构建输入 | TypeScript 读取的文件、Vite 模块/资源、相关 package.json、选定编译器/worker 文件或 dotenv 候选内容发生变化 | 不复用，走原编译器子进程；不递归扫描目录 | `src/compiler/build-inputs.ts:28`、`src/compiler/index.ts` |
| 解析路径 | TypeScript 或本地 import 解析探测过的文件/目录状态改变，包括原来不存在的高优先级候选 | 不复用；覆盖新增同名 `.ts` 抢占 `.tsx` 等情况 | `src/compiler/source-snapshot.ts:26`、`src/compiler/action-transform.ts:222` |
| 构建环境 | Node 版本、平台、架构及环境变量摘要不同 | 不复用；完整环境摘要可能使无关环境变量变化也产生一次重建。按编译器既有规则固定 production，排除 Vite 自行修改的 VITE_USER_NODE_ENV；不保存环境变量明文 | `src/compiler/build-inputs.ts:13` |
| 生成产物 | manifest 与当前构建记录不符，或 client/server 生成文件缺失、内容变化 | 不复用；保留显式 reload 重新生成能力 | `src/runtime/artifacts.ts:52` |
| 文件读取失败 | 文件或父路径消失 | 当作缓存未命中，正常编译给出实际结果；其他 I/O 错误继续传播，没有新增业务错误类别 | `src/runtime/artifacts.ts:66` |
| I/O 批量 | 校验文件时每批最多64项并行 | 控制内部文件描述符使用，不限制面板、用户请求或数据规模；不在 HTTP 进程执行 TypeScript/Vite | `src/runtime/artifacts.ts:81` |
| 调用来源 | watch / 冷 watch 激活 / 显式 force | watch 仅在匹配时跳过；force 始终编译。no-watch 冷唤醒保留原有源码冻结行为 | `src/runtime/lifecycle.ts:267` |
| 状态与凭据 | 命中、有旧 diagnostic，或真实重建/手动 reload | 命中保留凭据，旧错误存在时才保存恢复状态；watch 完成总发收尾状态。真实 watch 重建及 force 保留既有凭据失效行为，即使源码 revision 恰好相同 | `src/runtime/lifecycle.ts` 的 `recovered`、发布及凭据分支 |
| 重编译后的内存清单 | 编译器已生成同目录的新清单 | 丢弃该目录旧缓存，下次冷唤醒读新记录 | `src/runtime/artifacts.ts:98`、`src/runtime/lifecycle.ts` 编译完成分支 |
| 显式 reload 遇到坏清单 | 旧 manifest 读取或解析失败 | 记录 debug 原因并继续用户要求的完整重编译。可读旧清单仍用于先恢复监听，保留“失败后修正源码自动恢复”的既有行为；非 force 的读取错误继续传播 | `src/runtime/lifecycle.ts` 读取旧构建分支 |

原有 source revision 的计算方式及 `snapshot.assertUnchanged(dependencies)` 未扩展为包或环境变化的强制中断校验。作者业务函数读取的外部数据不属于编译缓存；依赖/环境变化本身没有新增自动监听范围，可通过显式 reload 或下一次源码 watch 事件刷新。

## 根因与回归

- 相同字节保存和 touch：旧实现仍完整编译、替换进程、重置模块状态并作废凭据。新增测试验证自动路径保留 PID、watcher、模块计数、凭据和 updatedAt。
- 改坏再撤销、冷态恢复：旧逻辑仅在 rebuild 时清除 diagnostic，导致成功复用后仍显示 BUILD_FAILED。现在成功复用也能清除该错误。
- 新增优先级更高模块、第三方 JS 更新、dotenv/环境变量变化：旧 source hash 无法覆盖，新增实际输入及解析探测记录验证这些情况产生正常缓存 miss。
- 缺失 frame、损坏 server/manifest：验证不命中；显式冷 reload 可以重新生成坏 manifest。
- 同 revision 重新构建后：旧 manifest 内存缓存必须失效，验证 LRU 冷唤醒不会因旧记录再编译。
- 强制冷 reload 的最小复现曾得到 watcher=0：原因是直接绕开旧清单读取。修复后可读旧清单仍先恢复监听，错误源码改正后自动恢复；坏清单则由显式重编译重新生成。
- 一项测试最初拿重编译前的清单比对新磁盘清单。隔离复现确认输入记录次序可能不同，语义相同；当前生效构建可以命中。测试改为校验当前构建对象。

## 验证记录

Node 定向回归共55个不同用例通过：

- 编译导出、资源池、资源生命周期、原生 worker、新增 watch 复用组33个通过。
- 请求限制、runtime hardening、runtime integration、新增 watch 复用组27个通过；其中5个复用用例与上一组重复。
- 最终修改后，资源生命周期及 worker 的11个用例通过；修正测试对象后，最终5个新增复用用例全部通过；原有 rapid saves 与 metadata 后源码变化的2个快照用例也再次通过。
- 日志：`/tmp/paneon-watch-runtime-tests.log`、`/tmp/paneon-watch-final-tests.log`、`/tmp/paneon-watch-final-cache-tests.log`、`/tmp/paneon-watch-final-snapshot-tests.log`。`final-tests.log` 保留了旧测试对象断言失败的记录，其最终修正结果见 `final-cache-tests.log`。

真实 Chrome 最终验收通过：无变化保存保留 worker、草稿和显示结果；重启零历史驻留、冷静态页面、watch-only 激活、十位置 LRU、淘汰后再次点击唤醒也通过。日志：`/tmp/paneon-watch-chrome-final.log`。

`npm run build:cli`、全项目 `npm run typecheck`、改动文件 ESLint / Prettier、`git diff --check`、OpenSpec strict validation 通过。ESLint 无错误，保留原有7个 non-null assertion 警告。没有运行全仓 `npm test` 或完整产品 `npm run build`。

涉及默认 HTTP 端口的隔离 Node 测试使用临时 loader 将未配置端口改成0；显式配置不变。浏览器夹具自己的配置就是 port=0。真实49321服务未被测试重启或修改。该 loader、测量脚本和复现脚本均在完成后删除；不作为产品代码。

## 性能测量

Node24.16.0，本机独立临时 Runtime，在其他验证结束后单独测量一个小面板。构建证据包含557个输入文件（约25.7MiB）、854个解析探测和92个输出，manifest 约155KiB。

<!-- prettier-ignore -->
| 指标 | 实测 |
| --- | --- |
| 首次 run | 2514ms |
| 完整复用检查，10次 | 33.15–46.72ms，中位约39.7ms |
| 同内容写回至 watch 完成 | 136.92ms，执行进程保留 |
| 显式强制 reload | 1889.31ms |

完整检查包括构建输入、环境和产物，比评估阶段仅检查两个源码依赖的0.2ms更重。当前样本仍明显减少无变化重建耗时。这不是生产性能承诺，也没有据此声称常驻内存收益。原始结果：`/tmp/paneon-watch-cache-measure.json`。

本次未提交、未推送、未重启真实服务；运行中的服务需下次重启后使用新主进程逻辑。

## 改动文件

- `src/shared/types.ts`
- `src/compiler/source-snapshot.ts`
- `src/compiler/build-inputs.ts`
- `src/compiler/action-transform.ts`
- `src/compiler/index.ts`
- `src/runtime/artifacts.ts`
- `src/runtime/lifecycle.ts`
- `tests/watch-build-reuse.test.ts`
- `tests/browser/resource-lifecycle.mjs`
- `docs/memory/tech-source-updates.md`
- `skills/paneon/references/cli.md`
- `openspec/changes/skip-unchanged-watch-builds/.openspec.yaml`
- `openspec/changes/skip-unchanged-watch-builds/proposal.md`
- `openspec/changes/skip-unchanged-watch-builds/design.md`
- `openspec/changes/skip-unchanged-watch-builds/specs/watch-build-reuse/spec.md`
- `openspec/changes/skip-unchanged-watch-builds/tasks.md`
- `openspec/changes/skip-unchanged-watch-builds/verification.md`
