# 文件入参与请求体积限制交付

## 范围与状态

实现任务 2.4、2.11，基线 47f1d8d，独立 worktree 为 /Users/yuguo/.codex/worktrees/skill-input/paneon。未修改中央 design/tasks，不将本报告当作主 agent 的集成验收。未推送、未自行合入、未删除 worktree。

## 实现

- panel run 要求 --params 与 --params-file 恰好提供一个。文件路径相对调用 CLI 的目录解析，与 --cwd 无关；读取一次 UTF-8 JSON，沿用已有 input schema 校验与 params 持久化。缺少/冲突/读取/解析失败均在创建前拒绝，诊断不含业务内容。
- 文件修改/删除不成为运行依赖。现有 reload、服务恢复继续读取持久化 params；未增加参数文件监控或 paramsFile 出参。
- HTTP 完整请求上限统一为 262144 UTF-8 字节。CLI 对序列化后的完整 envelope 检查，先于服务发现和启动；浏览器在 src/web/api.ts 统一检查现有 JSON 字符串请求。服务端独立限制 Content-Length 及流式请求。
- HTTP 超限返回 413 与英文 BODY_TOO_LARGE，并带 limitBytes；事件仍限制为 JSON.stringify(payload).length <= 65536 UTF-16 code units，type 最多 128，分别给出清晰诊断。不截断、不拆分事件，不新增配置项。
- 保留所有既有 Host/Origin、独立 CLI 凭证与 CSP 行为，未修改 panel-host.tsx 或公共 SDK/UI。
- tsconfig.app.json 增加 allowImportingTsExtensions。原因是既有 tests/ui-api.test.ts 直接用 Node 导入浏览器源码；api.ts 共享 limits.ts 时必须保留 Node 可解析的显式 .ts 导入。app 仅 noEmit 检查，此选项与既有 tsconfig.node.json 一致，不改变产物协议。

## 验证

本机 Node.js v24.16.0。npm ci 按锁文件安装 568 个包成功，无需改依赖版本。

以下全部通过：

- npm run typecheck。
- npm run build（包含类型检查、CLI、UI 与生产 Web 构建）。
- 针对所有改动 TypeScript 文件的 ESLint；无错误、无警告。
- 针对所有改动文件的 Prettier 检查及 git diff --check。
- openspec validate add-paneon-skill-panels --strict --no-interactive。
- node --test tests/file-input.test.ts tests/request-limits.test.ts tests/ui-api.test.ts tests/cli.test.ts：11/11。
- node --test tests/core.test.ts tests/events-integration.test.ts：12/12。

针对性测试覆盖：两种入参互斥/缺失、缺文件及不可读取目录、无效 JSON、schema 拒绝且无实例创建；调用目录与 --cwd 存在同名文件时仍正确读取；源文件修改/删除后的 reload、再次 run 的新快照，以及真实服务停止/恢复后的旧快照；CLI 输出精简和 debug 不记录输入；完整 envelope 超限先于损坏的运行时描述符诊断。

体积测试覆盖：65536 字符中文 payload 可持久保存，65537 字符准确返回 INVALID_EVENT；128/129 字符事件 type 边界；完整请求 262144 字节成功而 262145 字节返回 413 / BODY_TOO_LARGE；Content-Length 和 chunked 请求均受限；浏览器发送前检查包含 envelope；跨源和缺 Origin 的请求仍拒绝，失败不增加事件历史。

额外用宿主机 Chrome headless 启动真实 Paneon 面板，经 sandbox iframe -> host -> src/web/api.ts -> HTTP 完整链路验证：

- 65536 字符、196586 UTF-8 字节的中文 payload 保存成功，并从 runtime events 读取原文。
- 增加一个中文字符后显示事件字符限制错误，textarea 原文保留。
- serverAction 输入 90000 个中文字符时，完整 HTTP 体积预检在 host 中拒绝；没有新增 POST，textarea 原文保留。
- 全程仅两次 POST、最终仅一个已保存事件，无 pageerror。

此 Chrome 验证使用临时自定义 TSX、临时存储和本机 Chrome；未将临时文件纳入产品资源。公共反馈组件及标准页的草稿行为由对应工作组和主 agent 另行验收。

## 环境限制

初次沙箱测试中的两个真实服务用例均在 listen 127.0.0.1 时返回 EPERM，其余 9 个用例通过；随后申请宿主机执行并通过上述 11/11。该失败属于沙箱监听权限，不是以重试掩盖代码错误。

## 文件清单

- src/cli/index.ts
- src/cli/client.ts
- src/shared/limits.ts
- src/runtime/server.ts
- src/runtime/lifecycle.ts
- src/web/api.ts
- tsconfig.app.json
- tests/file-input.test.ts
- tests/request-limits.test.ts
- openspec/changes/add-paneon-skill-panels/reports/input.md

需要主 agent 验收这个提交，按原分工合入后再勾选 2.4、2.11；本工作单元到此为止。
