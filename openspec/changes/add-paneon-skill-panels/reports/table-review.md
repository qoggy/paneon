# Table / review delivery

## Status

基线 c7d667e；仅修改本组独占文件，未改 core、中央任务、SKILL.md、package 或 tsconfig。表格页已通过完整 skill 复制与独立 npm 安装产物的真实 Chrome 验收。review 页和可复用 Markdown 映射已实现并通过 schema / 实际 GFM AST 测试，但整体验收仍被下述两个公共核心边界阻塞，不能把任务 2.3 / 2.9 全部勾完。

## Delivered

- table：严格输入、有限值/类型/自身字段校验（包括普通数据键 **proto**）、原始 rowIndex、稳定排序、全表搜索、逐列包含筛选、分页、当前页行选择、整列/行/格/格内原文混选、多个目标共用意见与多条独立意见、隐藏目标清除过滤/跳页/高亮定位。只读数据，沿用 Table 默认展示。
- review：完整 title/markdown；整篇与段落按钮、正文词句；统一 document ref；完整原始 Markdown 的 UTF-16 偏移及 quote/字素校验。公开 MarkdownFeedback 接受任意页面语义 ref，不依赖 ReviewRef。
- Markdown：继续使用 react-markdown + remark-gfm / GitHub 样式，保留 HAST 源位置，按 parser 指定范围顺序解码转义/实体、格式、inline/fenced code、列表/引用与 Unicode，显式 registerText({node,sourceOffsets})。实现不通过 indexOf 查找首次同名词。图形内文字不注册，Mermaid 沿用公共组件，不启用 raw HTML。
- 两页复用公共 Provider/Controls/hook 和 shared/submission。页面自有 serverAction 接收明确的 snapshot + feedback，复核该快照后回浏览器 agent.emit；没有假设 ctx.params/cwd 或扩展 runtime 存储。首次空反馈不发事件；成功后锁定并提供修改入口，完整修正版关联上一成功回执；允许清空修正版，失败保留草稿，提交冻结和防重复。

## Confirmed checks

- npm run build：通过完整 typecheck、CLI、UI 和 web 构建；后续仅页面锁定/定位和测试细化，再次 npm run typecheck 通过。
- node --test tests/table-review*.test.ts：7/7 通过。含原始目标/quote/字素、空修正版、稳定排序/筛选、特殊自身键及真实 remark/GFM AST 源映射。
- npm run lint：0 errors，15 个基线已有非空断言 warnings；本组文件无 warning。
- PANEON_TEST_TABLE_ONLY=1 node tests/browser/table-review-pack.mjs：通过。真实 npm pack / 独立 npm install，使用安装包 runtime/CLI/skill，完整 skill 再复制到临时 agent 目录，从 CLI --params-file 创建实例，经 Chrome 验证 table。检查完整 table/review/mapper/submission 资源确实在安装包里，不代表 review 已可在复制目录运行。
- Chrome 表格断言：首次空提交零事件；数值排序后仍指原始 1/2 行；两格同意见；独立行+列与中文/emoji 意见；被筛选隐藏目标恢复范围并定位；表头只选当前页原始 2/3 行；失败保留四条草稿；事件持久保存前不报成功、禁止重复、成功后选择控件锁定；明确修改并清空后追加完整修正版；CLI events/ack 可读并确认。
- 截图已实际打开检查：[table-review-evidence.png](../../../../tests/browser/table-review-evidence.png)。展示保存后保留的四条意见与修改入口，表格沿用公开 Table。
- 没有运行/宣称全部既有自动回归通过；没有并发运行大套全量回归。

## Blocking core defects

### 1. Copied skill cannot resolve Markdown runtime dependencies

默认 `node tests/browser/table-review.mjs` 完成表格部分后，review 的 CLI run 在 build 阶段返回 BUILD_FAILED / Panel compilation failed。

复现链：MarkdownFeedback 从 react-markdown / remark-gfm 导入现有 renderer。完整 skill 复制到临时目录后，该目录不在 CLI 的 node_modules 祖先下。compiler 的 typecheck 对第三方类型有 PACKAGE_ROOT fallback，故类型检查通过；panelPlugin → resolveThirdParty 仅 createRequire(importer).resolve(specifier)，没有同一 fallback，因此构建失败。同一源文件在仓库实际 skill 目录可编译、运行。

建议主 agent 二选一实施最小基础设施修复：现有公共 Markdown 公开可组合 components/rehypePlugins，适配器只 import paneon/ui，继续复用其内置 remark-gfm；或 compiler 的第三方解析在调用者目录找不到时支持 CLI 包依赖的明确 fallback。后者会影响通用模块解析边界，需要 core 验收。本组没有硬编码开发机路径、复制依赖或以临时 node_modules 链接假装通过。

### 2. Registered link text is excluded by public selection

诊断命令：

```bash
PANEON_TEST_INPLACE_SKILL=/absolute/path/to/this/worktree/skills/paneon node tests/browser/table-review.mjs
```

这是源码位置诊断，不是可移植复制验收。review 可正常运行，实际鼠标选择第二个 repeat，原文偏移正确；跨 `**repeat**` → `[linked 中文🙂](...)` → `&amp;` / 转义文字的同一连续选区却产生两个 targets，漏掉链接文字，测试明确报 `2 !== 1`，没有降低断言。

根因：src/ui/feedback-selection.ts 的 selectedTextTargets 以 parentElement.closest(interactiveSelector) 排除 Text，而 interactiveSelector 含 a。即使适配器提供准确显式 sourceOffsets，链接文字仍被丢弃并切断连续范围。

最小建议：对象点击继续保留原 interactiveSelector；显式注册的文字圈选使用独立的真实控件排除规则，允许 a 的已注册文本，仍排除按钮/表单等。需补公共核心回归：普通链接可用、浏览复制正常、选择模式链接文字与跨格式连续范围完整。

以上两项均在实现过程中向主 agent 提交了最小复现与建议；依独占边界未修改 core 或复制公共批注状态。

## Remaining acceptance

在主 agent 修复上述两个核心边界并通知本组后，复跑默认 table-review.mjs / table-review-pack.mjs，补全 review 的复制运行、完整链接/格式定位、段落与更正验收。当前默认完整浏览器测试保留真实失败，不应当作绿色交付。中央任务由主 agent 验收后勾选；未合入、未推送、未删除 worktree。

## Files

- skills/paneon/assets/panels/table/panel.tsx
- skills/paneon/assets/panels/table/schema.ts
- skills/paneon/assets/panels/review/panel.tsx
- skills/paneon/assets/panels/review/schema.ts
- skills/paneon/assets/shared/markdown-feedback.tsx
- skills/paneon/assets/shared/markdown-feedback-mapper.ts
- skills/paneon/assets/shared/markdown-feedback-schema.ts
- skills/paneon/references/table.md
- skills/paneon/references/review.md
- tests/table-review.test.ts
- tests/table-review-markdown.test.ts
- tests/browser/table-review-fixture.mjs
- tests/browser/table-review.mjs
- tests/browser/table-review-pack.mjs
- tests/browser/table-review-evidence.png
- openspec/changes/add-paneon-skill-panels/reports/table-review.md
