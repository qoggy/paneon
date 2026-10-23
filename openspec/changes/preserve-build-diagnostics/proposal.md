## Why

面板自动编译失败时，非 PaneonError 异常被替换成 `Panel compilation failed.`，编译子进程异常退出时 stderr 也被忽略。用户只能知道失败，无法定位实际错误、文件和行号；旧诊断持续显示还容易被误解为每次打开都失败。用户已通过 Paneon 方案页确认开发。

## What Changes

- 编译错误保留原始消息、失败阶段，以及工具实际提供的文件、行列和代码片段。
- 编译进程异常退出时保留退出码/信号与有长度限制的 stderr；沿现有 IPC 和 diagnostic 存储传递。
- 页面简要显示原因和位置，展开查看代码片段；普通 CLI 错误显示原因与位置，`--debug` 将额外开发信息写入 stderr。
- `panel inspect --json` 只读返回已保存的结构化诊断；成功读取仍为 ok:true、退出码0，诊断可以是 BUILD_FAILED。
- 覆盖真实编译失败、异常退出、存储/IPC、CLI 流分离和浏览器恢复的验收。

## Capabilities

### New Capabilities

- `panel-build-diagnostics`: 从编译异常到持久化、CLI 和页面的完整构建诊断。

### Modified Capabilities

无。当前主 specs 目录没有已发布条目；不修改其他未归档 change 的范围。

## Impact

涉及 compiler、构建元数据检查、CLI 错误格式及 panel-host 的框架诊断区域。复用 Diagnostic.details、现有 runtime.sqlite 面板 diagnostic_json、既有 HTTP 与 CLI 命令；无新依赖、数据库、命令、业务日志系统或重试机制。
