## Context

2026-10-25 用户授权完成建议清单 1—5 并充分测试。此前隔离实验已复现两条根因：首次 run 在编译完成、数据库保存前发生参数校验错误会留下完整目录；带定时器的 worker 在 IPC 断开后仍存活。成功旧版本和 closed 产物也没有清理调用。

## Goals / Non-Goals

**Goals:** 当前产物保留，未发布/失败/关闭产物及时清理，listen 后清扫遗留，断线 worker 退出，SQLite 历史保持可用。

**Non-Goals:** 不实施清单 6—8，不改监听/打包，不迁移 SQLite，不保留上一版/回滚，不做旧进程交接，不添加周期 GC 或业务超时。

## Decisions

- **用户批准范围**：本次批准 C2 生成目录回收。此前 residency 文档中的 C2 未批准是历史边界，更新为本 change 已批准；B15 仍未批准。
- **当前版本是唯一保留依据**：Artifacts 只删面板根目录下匹配 `sha256-<64hex>` 和 `sha256-<64hex>-build` 的真实目录，不跟随符号链接，不删除未知文件。空面板目录用 rmdir 移除；有其他内容则保留。启动扫描只枚举 Paneon 生成的 instance UUID 目录。它们是删除资格规则，不会拒绝已有业务调用。
- **同面板串行清理**：给现有 enqueue 增加任务后的收尾回调，prepare 的编译/发布/失败与收尾都在队列里。收尾重新读取数据库，始终保留其当前 revision，包括 unavailable 实例和 close 进行中；因此不会因编译取消、相同 hash 重建或新版本初始化失败删掉最后已发布版本。不存在记录的首次 run 清理全部已识别产物。
- **close 顺序**：先持久化 closed 并中止 admission，等待 compiler、initializing worker、队列和执行资源关闭，再排队清理全部生成目录。历史事件/consumer 保留，manifest 缓存一并失效。
- **启动清扫**：server 成功 listen、写入 descriptor 后启动一次异步扫描。每个 id 进入同一队列并重新查记录；无行或 closed 清全部，其余保留当前。正在 close 且仍有 live 资源的面板交由 close 完成后的清理处理。stop 等清扫结束再关闭数据库。不把清扫塞入 restore 或 listen 前，也不加定时器。
- **失败可见，不新增业务失败**：删除 I/O 异常带 instanceId 记 error 日志，保留原始业务结果/异常；没有重试。下次启动清扫可再次处理残留。未知内容和不存在目录是正常删除资格结果。
- **断线退出**：执行和 metadata 共用 runtime/worker，在 disconnect 与 stop 都 abort 环境 signal，短延时退出。断线后不再发送 IPC；不承诺同步死循环立即响应或清理作者派生的所有子孙进程。

面板驻留、冷激活、凭据及事件提交身份检查继续遵循 [add-panel-resource-lifecycle](../add-panel-resource-lifecycle/design.md)。本变更只处理生成产物与断线 worker，不改变源码、SQLite 历史事件、consumer 位置或用户内容。

## Risks / Trade-offs

- 删除不可逆 → 只处理生成目录，保护当前 revision 和所有 SQL 历史，隔离测试覆盖未知内容/符号链接/失败与并发。
- closed manifest 不再存在 → HTTP inspect 返回数据库信息，事件/ack 仍工作；现有 closed 静态页和 action 本就不可用。
- 同 hash 编译先 rm 后 rename 是已有行为 → 本次不改，收尾始终保留数据库当前 hash，不扩大这个窗口。
- 清理 I/O 失败可能残留 → 记录日志，成功发布/关闭不伪装为业务失败；不宣称失败删除已经完成。

## Migration Plan

无 schema 迁移。新服务启动后异步回收旧生成目录；自动化测试只使用临时 home；全量测试需释放固定端口，按用户此前重启授权停止并在测试后启动真实服务，新版本的已批准清扫将回收其生成目录。已有源码和 SQL 数据不修改。

## Open Questions

清单 1—5 无待决产品问题。清单 6—8 单独后续评估。
