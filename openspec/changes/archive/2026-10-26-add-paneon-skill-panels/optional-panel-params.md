# B62 — Omitted panel input defaults to an empty object

## User request and root cause

用户认为无输入页面仍要求 `--params '{}'` 增加 agent 负担，明确要求省略参数即使用空参数。采用 focus：只实现这个默认行为，不新增校验、限制、schema 变更或其他功能。

当前 `src/cli/index.ts` panel run 在 params 与 paramsFile 均未提供时，被“必须恰好一个输入源”的等式判断拒绝；即使越过该处，输入默认空字符串也不能 JSON.parse。

## Contract

`paneon panel run <entry> --cwd <directory>` 不带 `--params` 或 `--params-file` 时，发送 `params: {}`，与显式 `--params '{}'` 等效。保持显式 JSON、文件输入、固定快照及原页面 schema 行为，不把空对象特殊处理成跳过 schema。现有同时传两个输入源、非法显式 JSON 和文件读取错误的处理保持原行为；本次不新增任何拒绝条件。帮助、唯一 skill 指导、README 及无输入 example 命令不再要求空 JSON 占位参数。

## Work ownership

一个独立 worktree/subagent，仅修改 CLI 默认输入、相关帮助/使用示例及针对性回归。主 checkout 的 skill 指导有其他正在进行的修改，移植必要的当前 SKILL.md、references/examples.md、references/feedback.md 到独立基线后，只交付 B62 增量。不要触碰 choose panel/导航组、host、Git 或其他 change。不要合并移植基线。

## Tasks and acceptance

- [x] 实现无输入源默认空对象，保留原显式输入行为。
- [x] 更新 CLI help、SKILL.md、references/cli.md、无输入 examples/feedback 和 README 示例。
- [x] 真实 CLI 验证省略参数与显式空对象等价，实例创建/input快照可读取；保留 params-file 和已有冲突/非法输入回归。
- [x] 相关测试/build/typecheck/lint/format，提供纯任务SHA、基线和文件清单；不新增额外校验。

## Implementation and verification

- CLI 只把输入源冲突判断收窄为“同时提供两种源”，并将输入默认字符串从空字符串改为 `'{}'`。省略输入沿用同一 JSON.parse、请求体及页面 schema 链路；没有新增校验、过滤、重试、异常处理或 schema 特判。
- 保留显式空字符串/非法 JSON、不可读 params-file、两源同时提供的原有失败行为；冲突提示由“必须恰好一种”改为“两种不能同时使用”。
- 真实 CLI 创建无输入 panel：省略选项、显式 `--params '{}'` 都成功，runtime 和 `panel inspect` 均读取到 `{}` 快照。需要 topic 的原测试 panel 收到默认 `{}` 后仍返回原有 `INPUT_VALIDATION_FAILED`，不会跳过 schema。
- `npm run build` 成功，包含完整 typecheck；日志 `/tmp/paneon-optional-params-build.log`。
- `node --test tests/file-input.test.ts tests/cli.test.ts tests/runtime-integration.test.ts tests/runtime-hardening.test.ts`：29 项通过、0 失败；日志 `/tmp/paneon-optional-params-tests.log`。包括文件快照在 reload/restart 后保持、显式内联 JSON、输入源冲突、非法 JSON、不可读文件，以及 CLI/runtime 生命周期回归。
- Scoped ESLint、Prettier 和 `git diff --check` 通过；日志 `/tmp/paneon-optional-params-lint.log`、`/tmp/paneon-optional-params-format.log`。
- 不涉及 UI 改动，未重复整套浏览器验收；未修改有输入 choose/form 的调用说明或历史安装原型。

## Focus decision review

本次唯一新增默认行为：仅当 `--params` 与 `--params-file` 均省略时，使用 `{}` 作为页面输入。已有两源互斥判断的拒绝范围减少，其他既有校验和处理保持原状；未新增额外限制或校验。

## B62 parent acceptance

主 agent 检查 CLI 默认值及原两源互斥条件，并独立执行真实 CLI/相关单测：省略参数与显式空对象创建和持久化等价，原必填 schema 及非法显式输入行为保留。帮助和使用示例已同步，未新增校验。

统一验收证据见 verification.md 的 B61–B65 主验收章节。
