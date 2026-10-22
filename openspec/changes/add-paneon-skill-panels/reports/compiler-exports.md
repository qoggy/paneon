# Compiler export pruning

## Scope and result

基线 19b9486，独立 worktree `skill-compiler-exports/paneon`。只修改编译器 action-transform、专属回归及本报告；未修改中央任务、设计、业务页面或 SDK。未推送、未合入、未删除 worktree。

修复了选择性重导出的根因：请求 `first` 时，依赖文件只保留 `first`，barrel 却仍输出 `export { first, second }`，导致后续 bundle 找不到 `second`。现在依赖选择和输出共同使用真正被请求的导出名，并沿 `propertyName` 追踪原始绑定。

## Implementation

- 具名转出按实际请求裁剪 export clause，保留别名，支持多级别名、default 转出、import 后再 export，以及本地声明后 export。
- 显式转出优先于 `export *`；部分 star 转出重写为具名转出，避免暴露已经裁掉的声明。循环遍历有边界，不把无出口的回边当作唯一来源；default 不通过 star 转出。
- 命名空间导入和 `export * as ...` 保留公开运行时导出，不因命名空间请求而全量保留私有声明。外部 star 及其本地转出链仍保留必要边；被浏览器实际请求的 Node 转出继续拒绝。
- 显式 `export type`、`export type *` 和混合 clause 中的 `type` 项不生成运行时依赖，也不发现其中的 action。
- action 发现沿被请求的重导出和别名继续走，保留声明文件的 action ID；读取源码以检查 star 名称不再自动注册其中的 action。客户端被选中的 action 仍只输出 proxy，服务端保留 handler。
- 保留既有语句级依赖提取、静态 action 声明规则和直接 import 的 action 发现约定。没有引入全量保留依赖、Node shim 或浏览器服务端代码兼容层。

## Verification

### Before/after evidence

只在本 worktree 的忽略产物 `dist/compiler/action-transform.js` 临时替换为基线转译结果，运行相同测试后在 finally 恢复，没有切换或修改源码：

```bash
node --test --test-name-pattern='named barrel exports|real panel compilation' tests/compiler-exports.test.ts
```

基线 0/2：具名 barrel 输出仍含未请求项；真实 Runtime.run 编译返回 BUILD_FAILED。修复后这两项及其余专属用例通过。对照日志 `/tmp/paneon-compiler-baseline.log`。

### Final checks

| 检查                                                                                                                 | 结果                                                                                                |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `node --test tests/compiler-exports.test.ts`                                                                         | 13/13                                                                                               |
| `node --test --test-concurrency=1 tests/core.test.ts tests/runtime-hardening.test.ts tests/compiler-exports.test.ts` | 36/36；当时新增文件为 12 项，含相邻核心/运行时 24 项；随后只新增字符串别名用例，专属最终 13/13 复验 |
| `npm run build`                                                                                                      | 通过：全项目 typecheck、CLI、UI、Web                                                                |
| `npm run typecheck`                                                                                                  | 最终测试调整后再次通过                                                                              |
| 定向 ESLint                                                                                                          | 0 errors；原 action-transform 的 6 个既有 non-null assertion warnings，没有新增 warning             |
| 定向 Prettier / `git diff --check`                                                                                   | 通过                                                                                                |

专属回归实际用 esbuild 打包并通过普通模块执行验证输出，不仅比较字符串；覆盖具名转出、default/多级/字符串别名、本地和导入绑定转出、类型转出、namespace、star 循环和优先级、直接及嵌套 Node 转出拒绝、未使用 action 隔离。

真实运行用例执行 `Runtime.run`，经过 compilePanel、TypeScript 检查、Vite client/server bundle、隔离 worker 初始化，再调用原声明 ID `actions.ts#read`。handler 经服务端 barrel 别名调用 Node `basename`，结果为 `result!`。检查实际 `client/client.js` 存在页面文案，且不存在 Node 模块名、handler 标记、无关文件读取和未请求值；manifest 只有预期 action。

最终专属日志 `/tmp/paneon-compiler-final.log`，相邻回归 `/tmp/paneon-compiler-targeted.log`，构建 `/tmp/paneon-compiler-build.log`，类型和 lint 分别 `/tmp/paneon-compiler-typecheck.log`、`/tmp/paneon-compiler-lint.log`。这些临时日志不是发布资产。

## Limits

本次没有重新执行页面 Chrome 和独立 npm 安装包验收；没有改 UI、页面或打包配置。上述运行证明针对编译器导出与 action 隔离路径，不代表所有业务页面的用户验收已经完成。循环覆盖为合法 star 转出环及明确出口；无效/歧义导出仍由正常 TypeScript/打包诊断拒绝。没有宣称支持额外动态导入、任意执行时重导出或绕开现有静态提取约束。

## Changed files

- /Users/yuguo/.codex/worktrees/skill-compiler-exports/paneon/src/compiler/action-transform.ts
- /Users/yuguo/.codex/worktrees/skill-compiler-exports/paneon/tests/compiler-exports.test.ts
- /Users/yuguo/.codex/worktrees/skill-compiler-exports/paneon/openspec/changes/add-paneon-skill-panels/reports/compiler-exports.md
