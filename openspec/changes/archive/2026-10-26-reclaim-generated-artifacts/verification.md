# Verification

日期：2026-10-25。用户授权范围为建议清单 1—5：worker 断线退出和生成产物回收。6—8（chunk/共享资源/minify/监听治理）未实施。没有 commit 或 push。

## Implementation

- 执行和 metadata 共用 worker 在 disconnect 时 abort 环境 signal，30ms 退出；断线后不发送 IPC。
- Artifacts 只枚举 Paneon UUID 面板目录，只回收真实的 sha256 revision / -build 目录，不跟随链接，不删除未知内容；移除时失效对应 manifest 缓存。
- 编译尝试结束后，在原同面板队列的 finally 中重新读取当前 revision 并清理；普通缓存命中/业务调用不新增目录扫描。
- close 等资源退出后排队清理全部生成产物。启动成功后一次异步清扫，遇到仍在退休的 closed live 资源交由 close 最终处理；stop 等队列和清扫结束再关闭 SQLite。
- 清理 I/O 失败记录 instanceId/error，不替换原业务结果，不加重试、周期任务、业务校验或新错误码。

## Automated verification

| 检查                                 | 结果                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm run build                        | 通过：CLI、UI、全项目 typecheck、web                                                                                                                                                  |
| npm test                             | 235/235 通过，0 fail、0 skip，356.72 秒；原样运行，默认端口断言未改                                                                                                                   |
| 新增 retention 定向测试              | 9/9，通过失败清理、成功/同 hash 重建、关闭后历史/ack、冷态清扫、未知/链接内容、清扫与首次发布/close 竞态、listen 不等待清扫、stop 等 SQLite、第二 daemon bind 失败和删除 I/O 失败记录 |
| worker 定向测试                      | 4/4，含 execution/metadata 带定时器断线退出、controller 被 SIGKILL 后 metadata 退出；也纳入全量 npm test                                                                              |
| Chrome artifact-retention            | 通过：启动清孤儿不执行历史模块；冷页面及 action；reload 后新页面/action、旧 URL 404；close 删除产物并保留 HTTP events / ack                                                           |
| Chrome resource-lifecycle            | 通过：最多十 worker、LRU、冷态、未改写保存保持进程/草稿/结果                                                                                                                          |
| Chrome credentials                   | 通过：绑定、TTL、撤销、输出边界、源码错误恢复、换版失效、close 和 restart                                                                                                             |
| CLI/browser acceptance               | 通过：真实 iframe/CLI/HTTP/纯函数/SVG/源码更新/no-watch/重启和事件游标恢复                                                                                                            |
| npm run lint                         | 通过，无 error；47 条既存 non-null assertion 等 warning，本次新增文件无 warning                                                                                                       |
| 本次文件 Prettier / git diff --check | 通过                                                                                                                                                                                  |
| OpenSpec strict validation           | 通过                                                                                                                                                                                  |

首次在沙箱运行 retention 的 2 条 listen 测试报 EPERM（禁止监听）。在本机使用临时 home/port 原样重跑全部 9 条通过，没有跳过或放宽断言。全量测试包含 49321 默认端口测试，因此按用户此前重启授权停真实服务、跑全量测试，再启动新服务。

全仓 npm run format:check 存在 4 个本次未修改文件的既存格式问题，没有扩大范围修复：

- docs/20261025/panel资源治理与serverAction边界-handoff.md
- openspec/changes/add-panel-resource-lifecycle/server-action-capabilities.md
- openspec/changes/refactor-git-review-stateless/verification.md
- src/ui/README.md

## Live service verification

新 runtime：runtime-9c782520-941e-4799-877d-74aa9c7b2d81，PID 55975，127.0.0.1:49321，2026-10-25 19:01:11 Asia/Shanghai 启动。

- 生成目录 55 → 6，删除 49 个。
- 总产物 604,191,219 → 67,393,978 bytes，实际净减少 536,797,241 bytes（511.93 MiB）。
- 无非当前 revision 残留；health 200、当前静态 frame 200、直接子进程观察值 0，新日志 error/fatal 0。
- panels 6 行、events 0 行、consumers 1 行均保留。events / consumers 全字段摘要一致。
- 最初 panels 整行 hash 对比不同，未将其当作通过：只读读取与停服前 hash 一致的 SQLite 主文件快照，逐列对比当前 WAL 视图，确认 3 行仅 updated_at 改变，其余字段全部一致。时间位于新服务启动后数秒，与原页面 WebSocket 重连触发 observe/按需构建路径吻合；GC 路径本身没有 store.save。未通过静态请求或验证脚本执行业务 action。
- 当前产物包含上述重连后的同 revision 重建，因此实际净减少值与最初旧/孤儿目录估算略有不同。

## Limits

不承诺同步死循环立即处理 disconnect，不承诺作者派生的所有子孙进程退出；不做旧 revision 回滚或旧调用完成交接。文件系统删除失败仍可能留目录，会记 error 日志，后续启动可再次处理。既有同 hash rm+rename 的编译行为不在本次修改范围。

## Changed files

- src/runtime/artifacts.ts
- src/runtime/lifecycle.ts
- src/runtime/server.ts
- src/runtime/worker.ts
- tests/artifact-retention.test.ts
- tests/runtime-worker.test.ts
- tests/runtime-hardening.test.ts
- tests/browser/artifact-retention.mjs
- docs/memory/tech-resource-residency.md
- skills/paneon/references/cli.md
- openspec/changes/add-panel-resource-lifecycle/design.md
- openspec/changes/add-panel-resource-lifecycle/proposal.md
- openspec/changes/reclaim-generated-artifacts/.openspec.yaml
- openspec/changes/reclaim-generated-artifacts/proposal.md
- openspec/changes/reclaim-generated-artifacts/design.md
- openspec/changes/reclaim-generated-artifacts/specs/generated-artifact-retention/spec.md
- openspec/changes/reclaim-generated-artifacts/tasks.md
- openspec/changes/reclaim-generated-artifacts/verification.md
