## Why

成功旧版本、关闭面板和未发布的构建产物持续占用磁盘；父进程异常退出还可能留下执行或 metadata worker。2026-10-25 用户明确授权完成建议清单的 1—5 项并充分测试，C2 的本次生成目录回收已获批准。

## What Changes

- worker 在 IPC disconnect 时中止环境 signal 并退出。
- 面板成功发布后仅保留数据库引用的当前 revision；失败后回收未发布产物。
- close 在实际资源退出后删除生成产物，保留 SQLite 面板、事件和消费进度。
- listen 成功后执行一次异步遗留目录清扫，与同面板编译/发布串行。
- 删除仅针对已识别的生成目录；清理 I/O 失败记录日志，不将成功的业务发布改为失败。
- closed 面板 inspect 不再附带已回收的 manifest。
- 不实施清单 6—8：不改 chunk、minify、共享资源或文件监听；不加周期 GC、回滚、数据库迁移或旧调用交接。

## Capabilities

### New Capabilities

- `generated-artifact-retention`: 当前版本保留、失败和关闭清理、启动后孤儿清扫及断线 worker 回收。

### Modified Capabilities

无。

## Impact

涉及 runtime lifecycle、Artifacts、worker 和 server 启动钩子，增加隔离的回归及浏览器验证。无需新依赖、命令参数或 SQLite schema 变更；源码、历史事件、用户内容与日志不在删除范围。
