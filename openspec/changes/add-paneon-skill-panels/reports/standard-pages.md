# Standard pages implementation report

本报告覆盖首批 standard-pages 分工：2.1 的产品 skill 入口、choose/form 资源及打包/类型检查，2.2 choose，以及 2.3 的 form。基线为 `47f1d8d`。没有修改中央 tasks/design，也没有标记其他组或整体交付完成。

## Delivered behavior

- 产品资源维护于 `skills/paneon`；SKILL.md 按场景链接现有两页及其契约，没有其余页面的占位实现。完整目录随包发布，可复制到调用者指定的 agent skill 目录；不会自动安装或更新个人目录。两页使用当前真实包版本 `requires.paneon: '0.0.0'`。
- choose 使用固定 questions 输入，在同页顺序回答；支持单/多选、补充说明、独立自填答案、推荐标记和 Markdown 详情。上一步不校验，下一步校验当前题；切换、修改、返回只保留内存草稿。最终完整校验全部问题和选项，按输入顺序输出，不重复输入定义。
- form 在一页呈现全部八类字段及描述、默认值、必填标记；校验唯一字段名、选项及默认值、上下界、有限数值和完整 values。0 与 required false 均合法，可选空值省略，非空文本保留原文。错误显示在字段旁并聚焦第一个错误。
- 页面级 submission helper 在事件持久保存返回 id 后显示成功，提交期间禁止编辑和重复提交；失败保留草稿与上一成功回执。两页均允许原页编辑，再明确重提完整结果，replacesEventId 指向本页上一条成功事件；旧事件保留。
- 两页仍是普通 TSX，使用现有 SDK/UI；没有新增 runtime 协议、业务执行、固定产品头部、builtin 注册表或公共批注副本。choose/form 的正常答案不依赖反馈 Provider。

## Verification

以下均已通过：

- `npm run build`（含项目 typecheck、CLI/UI/web 构建）；随后在最终 skill 修改后重新运行 `npm run typecheck`。
- `node --test tests/skill-pages.test.ts`：5 组测试覆盖输入约束、完整答案覆盖及规范顺序、默认值及上下界、false/0/可选空值和特殊字段名。
- `npx eslint skills/paneon/assets tests/skill-pages.test.ts`。
- `npx prettier --check skills/paneon tests/skill-pages.test.ts tests/browser/skill-pages*.mjs package.json tsconfig.examples.json`。
- `python3 /Users/yuguo/.agents/skills/skill-dev/scripts/quick_validate.py skills/paneon`。
- `git diff --check`。
- `node tests/browser/skill-pages.mjs`：真实 Chrome，先将完整 skill 复制到临时 agent-skills 目录，再运行源码。验证单/多选、详情、自填及切换草稿、返回更改、切题零事件、末题完整提交、成功前不显示保存、提交期间禁用重复点击、更正失败保留与回执关联、新实例轮次隔离；表单八类控件、Enter 提交、字段错误聚焦、失败草稿和完整更正；最后通过真实 CLI events/ack 读取及确认结果。
- 最终 `PANEON_TEST_ARTIFACTS=/private/tmp/paneon-standard-pages-acceptance node tests/browser/skill-pages-pack.mjs`：npm pack 检查全部 8 个 skill 文件进入产物，临时目录独立 npm install；从安装包复制 skill，使用该包的 runtime 与 CLI 重跑同一套 Chrome 验收。源码与独立安装包均通过。

最终表单截图已读取检查：`/private/tmp/paneon-standard-pages-acceptance/form.png`。临时 fixture 服务及安装目录会在测试结束时清理，没有写入用户个人 skill 目录。

## Root causes found during acceptance

1. 宿主 iframe sandbox 未允许原生 form 导航，Chrome 在 React onSubmit 之前拦截 submit。标准表单改为明确按钮事件，并对文本/数字框 Enter 显式触发同一提交方法，阻止原生导航；浏览器断言没有 blocked form submission。
2. Zod record 会忽略 `__proto__` 字段。form 使用保留原始键的结构校验和对应 JSON Schema 元数据，未增加未约定的保留字段名；测试同时核对特殊键与运行时 JSON Schema 生成。尝试 custom schema 时曾因无法生成 JSON Schema 导致模块检查失败，已修正并通过最终独立安装包验收。
3. shadcn Field 的纵向样式会拉伸直接子元素。布尔控件放入页面自己的容器以保留默认尺寸；真实浏览器检查 checkbox 的正方形比例，截图确认不再拉伸。

## Boundaries

没有推送、合入或删除 worktree。没有修改 `src/sdk`、`src/ui`、`src/cli`、`src/runtime`、`src/shared`、其他页面或既有 examples。没有运行并发全量回归；这里的结果是本组资源和专属验收证据。

未提交草稿及页面回执只存在内存，不承诺浏览器刷新后的恢复。`--params-file` 由 input 组实施，本组运行示例和验收使用现有 `--params`；文档明确仅在安装的 CLI help 已提供该选项时使用文件入参。其他标准页、示例与公共批注能力仍由主 agent 后续集成、补充入口并整体验收。
