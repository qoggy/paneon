## Why

很多未关闭的历史面板当前会在服务启动时逐一编译、启动 worker 和 watcher，拖慢就绪并使常驻资源随历史增长。用户已确认 B13：固定总量、最多十个活跃面板时后台资源有界，兼顾响应与保温体验。

## What Changes

- 按 2026-10-25 用户确认，废弃 B14 的全局两个执行位置/线程方案，保留每面板 Node 子进程、cwd 和驻留期间的异步调用方式。
- restore 不恢复历史执行/监听；静态产物、manifest、历史事件不依赖执行进程。
- 默认十个驻留位置，LRU 只回收空闲位置；容量全忙时最多 32 项等待十秒，过期不执行。退出完成前仍计入容量。
- 编译独立限一项；目标数据库读取与序列化清单缓存有界。
- 冷唤醒检查有效产物与源码/版本，执行前重新检查身份；明确模块内存和后台工作可被淘汰。
- B15 页面可见性策略不纳入本次实现。C2 当时未批准，随后用户于 2026-10-25 单独批准并由 `reclaim-generated-artifacts` 实施。

## Capabilities

### New Capabilities

- panel-resource-lifecycle：懒恢复、独立产物访问、有界面板驻留与容量等待。
- browser-owned-review-annotations：沿用页面持有原文和独立完整事件；不扩展 Git/PR UI 或业务来源校验。

### Modified Capabilities

无。不会新增 ctx.cwd、worker_threads 依赖或默认单 action 执行期限。

## Impact

涉及 runtime 生命周期、容量管理、产物读取、Store 主键查询和相关回归。用户已授权实施本次方案；不提交并行修改，不删除历史数据，不改变 Git/PR 交互与布局。
