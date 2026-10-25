# Mermaid acceptance

## Result

Mermaid 验收通过。此前两个 subagent 只完成实现和静态检查，本次由主 agent 合入、修复真实运行缺陷并完成源码与独立安装包浏览器验收。

- 分支：0.0.x；规划基线 ba6e731。
- 实现已合入：3bd00e9、f0ab636。Mermaid 精确版本 12.2.0。
- 未放宽 iframe CSP、Host/Origin 或网络策略，不新增主题覆盖。
- 既有未提交的页头及其测试调整保持原状，不纳入本次 Mermaid 提交。浏览器构建基于当前工作区，包含这些已有修改。

## Root cause and fix

真实页面初次验收空白。浏览器报模块脚本 MIME 类型错误；manifest 中动态拆分的 .mjs 资源确实存在，但服务端只登记了 .js，返回 application/octet-stream。src/runtime/server.ts 已为 .mjs 返回 application/javascript; charset=utf-8，修复后相同 iframe 和安装包用例通过。

浏览器检查增加了恶意 HTML 事件属性及 javascript 链接输入；采用官方 strict 净化结果，不把官方允许的安全图片标签误判为脚本。卸载清理由限时等待实际完成取代固定 500ms 假设。

## Verification

- npm ci、npm run build（含全部类型检查、CLI/UI/web 构建）通过；修复 MIME 后 build:cli 再次通过。
- npm run lint：0 errors，15 个既有非空断言 warnings；npm run format:check 通过。新增修复文件再次 lint、格式检查通过。
- Mermaid 3 项自动回归通过：无浏览器环境加载、围栏与合法 DOM、普通代码/GFM/raw HTML 行为。
- 完整回归在宿主机并发运行 48 项，45 项通过，3 项 CLI 帮助/版本子进程达到 5 秒超时；单独重跑 tests/cli.test.ts 后 6/6 通过。未宣称有一次 48/48 的全量通过；未增大超时或修改 CLI 代码掩盖结果。
- 源码真实 Chrome sandbox iframe：8 个初始图、流程/时序图、Markdown 四图（含列表和引用）、无 pre 图包装、普通代码、更新、错误恢复、12 次快速更新、卸载/重挂载、唯一 ID、临时容器清理均通过。
- strict 输入未执行脚本、不保留 onerror 或 javascript href；Markdown raw HTML 未执行。测试无外部 HTTP 渲染依赖、无失败响应及未处理页面异常。
- openspec validate add-mermaid-rendering --strict、git diff --check 通过。

最初沙箱运行被 listen EPERM 阻止，随后用宿主机权限执行上述真实服务/浏览器检查；未把沙箱失败当作功能验收。

## Independent package

npm pack 使用已经完成的真实构建产物，禁用重复 prepack；tarball 在独立临时目录 npm install --omit=dev，确认安装目录不是指向源码的符号链接。浏览器 fixture 明确使用已安装包的 dist/runtime/server.js，运行同一份完整浏览器验收后清理临时安装和服务。

安装第一次受过旧 npm 包元数据影响，错误地报告现有 lucide-react 版本不存在；通过官方 registry 的 --prefer-online 查询确认版本存在，刷新元数据后完整独立安装通过。未更改依赖版本绕过问题。

- 安装包：paneon-0.0.0.tgz
- SHA-256：357a8eae6bb565269e0269bcc4cb0346a01f114f65fc48b416babb24b9f7ab87
- 包内 dist/ui 资源数：129
- 安装包浏览器回归：通过；截图见 [mermaid-installed.png](evidence/mermaid-installed.png)。

## Changed files

- /Users/yuguo/IdeaProjects/paneon/package.json
- /Users/yuguo/IdeaProjects/paneon/package-lock.json
- /Users/yuguo/IdeaProjects/paneon/src/ui/index.ts
- /Users/yuguo/IdeaProjects/paneon/src/ui/markdown.tsx
- /Users/yuguo/IdeaProjects/paneon/src/ui/mermaid.tsx
- /Users/yuguo/IdeaProjects/paneon/src/runtime/server.ts
- /Users/yuguo/IdeaProjects/paneon/tests/mermaid.test.ts
- /Users/yuguo/IdeaProjects/paneon/tests/browser/mermaid-fixture.mjs
- /Users/yuguo/IdeaProjects/paneon/tests/browser/mermaid-fixture.txt
- /Users/yuguo/IdeaProjects/paneon/tests/browser/mermaid.mjs
- /Users/yuguo/IdeaProjects/paneon/examples/mermaid-panel.tsx
- /Users/yuguo/IdeaProjects/paneon/examples/components-panel.tsx
- /Users/yuguo/IdeaProjects/paneon/examples/README.md
- /Users/yuguo/IdeaProjects/paneon/docs/agent-guide.md
- /Users/yuguo/IdeaProjects/paneon/docs/memory/ui-markdown-rendering.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-mermaid-rendering/tasks.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-mermaid-rendering/verification.md
- /Users/yuguo/IdeaProjects/paneon/openspec/changes/add-mermaid-rendering/evidence/mermaid-installed.png

## Delivery

本地集成及验收修复单独提交，不推送、不发布。两个 Mermaid worktree 已确认干净，完成后移除；主分支保留实现提交。新功能开发按 add-paneon-skill-panels 的分工记录执行，验收通过才合入。
