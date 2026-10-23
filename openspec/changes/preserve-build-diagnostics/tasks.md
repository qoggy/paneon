## 1. Scope and dispatch

- [x] 1.1 记录用户确认、现有丢失点、结构/输出契约及独立 worktree 基线，保留其他未提交改动。
- [x] 1.2 subagent 在独立 worktree 完成实现和验证，提交精确交付报告。

## 2. Implementation

- [x] 2.1 增加构建边界归一化，保留真实 message、stage、位置、代码片段及已有 PaneonError 语义。
- [x] 2.2 编译和元数据子进程完整传递诊断，异常退出保留有限 stderr/退出信息，cleanup 不覆盖原始异常。
- [x] 2.3 普通 CLI 显示原因/位置，JSON 保持完整，debug 将额外信息仅写 stderr；inspect 不触发编译。
- [x] 2.4 增加 host 可展开诊断展示，兼容旧诊断并保留上一可用面板，不回退已有 host 布局。
- [x] 2.5 更新产品 skill CLI 参考和中央设计/验证报告，明确示例为实际实现后的行为。

## 3. Verification and integration

- [x] 3.1 覆盖真实类型/依赖/构建/模块加载失败、无位置、非ASCII、循环cause、进程退出、UTF-8截断和cleanup异常。
- [x] 3.2 验证编译IPC、SQLite重读、CLI inspect/reload的stdout/stderr/退出码及debug一致性。
- [x] 3.3 真实Chrome隔离实例验证原因/位置/片段、旧面板仍可用及成功恢复，保留截图。
- [x] 3.4 worktree build、适当有界并发回归、lint/格式与OpenSpec strict通过，报告未完成和限制。
- [ ] 3.5 主 agent 验收 worktree 结果，按实际差异合入、commit并清理 worktree；不推送。
