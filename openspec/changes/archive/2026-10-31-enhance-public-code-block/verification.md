## Scope

本次仅实现独立公开 CodeBlock。Markdown、文件抽屉、DiffView、CodeText、shadcn 零件的内容与本次开始时的校验和一致；工作区此前已有的 Markdown 改动没有被本次覆盖或继续迁移。独立审查后，仅补正了 source-watching 测试中受新布局影响的高亮就绪选择器。

## Focus 决策审查

本次没有增加 CodeBlock 专用的参数强校验、异常拒绝链路、大小限制、自动重试或文件访问检查。以下包含核心条件分支以及本次接入的既有检查，便于审查。

| 决策                                 | 依据、触发与处理                                                                                                  | 实际影响 / 位置                                                                                                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 行号默认 false、初始换行 true        | 用户最终确认；省略属性时采用默认值                                                                                | `code-block.tsx:64`；defaultWrap 只初始化状态，不在 prop 更新时重置用户选择                                                                                                                              |
| 标题使用显式 title 或语言名          | 已确认 props 契约；省略语言显示 Plain Text                                                                        | `code-block.tsx:78`、`:100`；未知名称原样显示，高亮能力仍按既有语言规则决定                                                                                                                              |
| 仅提供 annotationTarget 才接入批注   | 与 Markdown 相同的 opt-in 契约；以 undefined 区分省略                                                             | `code-block.tsx:140`；没有 target 的普通展示无需调用批注上下文，null/false 等 JSON 身份仍可使用                                                                                                          |
| 显示换行规范化，保留原文权威         | 逻辑行与现有高亮接口需要一致；CRLF/CR 展示为 LF                                                                   | `code-block.tsx:163`、`:213`；复制传原始 code，DOM 偏移通过已有 fileTextSegments 映射回原文；没有读取文件                                                                                                |
| 闭区间行高亮                         | 已确认的单区间契约；逻辑行同时满足 start/end 时高亮                                                               | `code-block.tsx:178`；关闭行号仍生效；不新增范围校验、clamp、throw 或自动滚动                                                                                                                            |
| 异步高亮与精确换行                   | 复用现有 useCodeHighlighting；tokens 就绪前显示原文行，之后显示 token；仅行间输出 LF                              | `code-block.tsx:164`、`:189`；保留尾部空行，不 trim、不合成尾部换行；高亮主题和未知语言纯文本沿用原有实现                                                                                                |
| token 行的可选访问                   | `tokens[index]?.map` 在已生成 tokens 时访问对应逻辑行；若该行缺失则没有 token 内容                                | `code-block.tsx:190`；独立审查对 8 个样例核对了行数与内容，未复现缺行；没有因此增加断言、throw 或额外回退，不能把有限样例当作所有输入的证明                                                              |
| DOM 挂载后注册、更新时替换并卸载清理 | 布局 effect 需要已挂载 code；code、tokens 或编号布局改变后重新注册                                                | `code-block.tsx:166`、`:210`；既有注册被注销后换为当前 DOM；没有 DOM 时不注册，无重试或新增异常                                                                                                          |
| JSON 身份与坐标正确性沿用现有检查    | annotationKey 要求有限无环 JSON；registerText 要求唯一 Text 节点、完整单调边界；提交与定位沿用会话原文/quote 检查 | `code-block.tsx:206`、`:213`；既有 `sdk/annotation.ts`、`annotation-store.ts:289` 与 `annotation-selection.ts` 未改；不合法 JSON 身份或失效批注依照原有机制报错并保留草稿，没有新增 CodeBlock 自定义校验 |
| 工具栏和行号排除出代码批注           | 标题/按钮不属于原文；编号由现有 CSS counter 显示                                                                  | `code-block.tsx:97`；仅注册 code 内的实际 Text 节点，既有选择机制忽略 controls                                                                                                                           |
| 复制 pending、成功与失败             | 宿主复制是异步能力；处理期间禁用重复激活但保留焦点                                                                | `code-block.tsx:82`、`:123`；成功 toast，失败记录错误并显示失败 toast，finally 恢复按钮；不重试，不改变 code，不阻断其他内容                                                                             |

新增校验审查覆盖本次修改的生产实现 `src/ui/code-block.tsx`，以及它新接入的上述高亮、映射、宿主复制和批注接口；没有把对所有既有模块的全面审计作为本次结论。浏览器测试中的 assert 是验证用断言，不进入产品执行链路。

## Validation

- `npm run build`：通过，含 CLI/UI 构建、TypeScript 类型检查和 Web 构建。
- `node --test tests/annotation-api.test.ts tests/file-annotations.test.ts tests/ui-tree-shaking.test.ts tests/compiler-exports.test.ts`：29/29 通过。
- `node tests/browser/code-block.mjs`：通过；覆盖 8 个 props、默认无行号/换行、实际剪贴板、pending/失败焦点、键盘 ring、逻辑行/空行高度、主题切换、Unicode、CRLF/CR、无 EOF 换行与尾部空行的原文批注、高亮前后定位、不同身份、动态内容/语言、显式提交和完整替换反馈。
- 既有 `markdown-highlighting`、`file-references`、`diff-highlighting`、桌面 `ui` 浏览器回归：均通过。
- 验收页：`http://127.0.0.1:49321/panels/25`，使用真实公开 CodeBlock；临时源码 `/tmp/paneon-public-codeblock-acceptance-20261031/panel.tsx`。
- ESLint：0 errors / 55 条既有 warnings，均不在本次修改文件；Prettier、git diff --check、OpenSpec strict 校验通过。
- 未运行全量发布回归，未提交、发布或归档。

## 独立审查与修正

- `conduct run-kiro`：run `run-kiro-20261031-025815`，2026-10-31 02:58:15–03:04:18（Asia/Shanghai），总体 A，0 Critical / 1 Warning / 3 Info。
- Warning：新行布局自带 span，既有 source-watching 的 `pre code span` 断言失去检测高亮的意义。已改为 `pre [data-shiki-token]`，仅修测试选择器，没有修改产品实现。
- 复现依据：无高亮的 CodeBlock 静态渲染包含 3 个结构 span、0 个高亮 token。修正后的完整 `node tests/browser/source-watching.mjs` 通过；该文件 ESLint、Prettier 与 diff --check 通过。
- Kiro 额外执行 CodeBlock、source-watching、preferences 三套浏览器回归及 8 个 Shiki 行一致性样例，均通过。审查期间 14 个目标文件的 SHA-256 均未变化。
- 三项 Info：理论 token 缺行风险无复现、重渲染成本未有性能测量、跨 Markdown 的重复属于用户明确阶段边界。保留实现，不新增校验、memo 或跨组件重构；token 可选访问已补入上表。
- 原始完整报告：`/tmp/paneon-public-codeblock-audit-20261031/kiro-report.md`；逐条评估：`/tmp/paneon-public-codeblock-audit-20261031/assessment.md`。
