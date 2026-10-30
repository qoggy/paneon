## Context

现有 `skills/paneon/assets/panels/review/` 只接收 `title`、`markdownFilePath`，读取一份 Markdown 并发送 `review-submitted`。Diff review 已有文件清单、目录树、共享 FileReviewSplit 和浏览器快照管理。公共 Markdown 和 CodeBlock 都已支持页面批注。

截至 2026-10-31，以下是已实现的基础能力，不属于本提案待开发内容：

- CodeBlock 已公开 `code`、`language`、`header`、`lineNumbers`、`defaultWrap`、`highlightedLines`、`annotationTarget` 和 `className`；仅 code 必填，header 默认 true，行号默认 false，初始换行默认 true。header 接受 boolean 或标题字符串，已替换独立 title；false 隐藏标题栏并保留悬浮复制/换行。它内置复制、换行及原始 UTF-16 坐标映射，通过现有页面会话支持批注与定位，未提供组件 ref handle。
- MarkdownCodeBlock 与公开 CodeBlock 已共用私有 CodeBlockFrame，统一语言标题、复制和换行状态；Markdown 保留解析节点、rehype 定制和整篇文档原文映射，不直接调用公开 CodeBlock。内部 shadcn 零件及 Frame 不作为公共 API。
- CodeText 现在仅供 DiffView 的语法高亮和行内差异标记使用，无人调用的行号、整行高亮、onReady 分支已删除；公开 CodeBlock 不依赖 CodeText。
- `usePageAnnotations` 的 adapter 已支持异步 resolve/locate；`useAnnotations().locate` 在 adapter 恢复预览后，通过当前文本注册完成原文校验、滚动和选区定位。页面会话还负责保留、重开和定位 Markdown 链接文件的快照。
- 当前 review 和 diff-review 的公开反馈已省略批注 id，并将文件反馈嵌入文件对象。项目 memory 要求 file-review 沿用这一格式，不把内部 fileIndex/ref 和分离的 sources 表发送给 Agent。

本设计约束 file-review 的实现范围；实施进度见 tasks.md。

## Goals / Non-Goals

**Goals:**

- 把 Markdown、代码和配置组成一份可阅读、精确批注、统一反馈的成果。
- 多文件有树和搜索，单文件保留直接阅读体验；复用现有组件、主题、中英文和显式提交机制。
- 批注始终对应被阅读的文件和内容版本；正文范围对应原文，路径范围对应传入的路径文字，内部均保留原始 UTF-16 坐标。
- 用 file-review 统一替换现有 review，清楚说明调用与事件迁移。

**Non-Goals:**

- 目录扫描、任意文件浏览器、Git 操作、差异比较、文件编辑及实时监听磁盘变动。
- 图片、PDF、二进制作为清单文件的主预览，MDX 执行、任意 HTML 执行，以及新增高亮语言包。
- Markdown 源码/渲染切换、跨刷新草稿恢复、服务端快照持久化、框架事件限额扩容及移动端专项适配。
- 为其他 review 面板重做数据模型、交互或抽象一个通用文件管理框架。
- 扩充 CodeBlock 公开 props/ref、公开组合零件、重新迁移 Markdown 内容渲染，或恢复 CodeText 的已删除分支。

## Decisions

### 用明确文件清单作为输入

新入口为 `<skill>/assets/panels/file-review/panel.tsx`，definition id 为 `file-review`：

```json
{
  "title": "审阅缓存方案与示例",
  "files": ["docs/cache-plan.md", "examples/cache.ts"]
}
```

`title` 可省略，提供时必须非空白。`files` 类型为 `string[]`，必须非空，每项必须是非空白路径字符串，不接受对象、其他类型或展示别名；顶层严格拒绝额外字段。路径允许绝对路径和相对 cwd 的路径，始终按字面文件路径处理，不当作带锚点的 Markdown URL；非空白路径保留原始字符，不自动 trim。清单顺序固定，原始零基 `fileIndex` 是实例内身份；实际路径相同的重复项仍按输入索引分别呈现，不新增去重策略。

文件树和路径栏直接使用传入的路径字符串，保留其目录关系，不单独配置展示名称。目录节点由传入路径生成，节点身份由面板生成。选择明确清单可直接表达 Agent 的交付范围；目录扫描会引入过滤、忽略规则和动态成员变化，首版不采用。

### 采用可搜索的树与共享分栏

多文件复用公共 Tree、Resizable 和已有 FileReviewSplit，默认按目录分组、目录优先及名称排序，提供大小写不敏感的路径搜索和目录展开/折叠。文件树工具栏保留按目录分组、空白间隔、全部展开和全部折叠，样式与 diff-review 保持一致。File Review 保留单击打开文件，选中项始终对应当前预览，不提供额外的打开/查看文件按钮，也不引入独立的“选中但未打开”状态。分组按钮切换目录树与平铺，保留当前文件和基础展开状态。目录右侧显示当前搜索下的匹配文件数量，平铺行在文件名后显示父目录路径。搜索匹配传入路径及解析后的实际绝对路径，保留匹配项的祖先；清空搜索恢复搜索前的展开状态。差异状态字母和比较动作仍仅属于 diff-review。

首次自动打开清单第一项；单击文件或键盘激活立即预览。文件树单选只控制当前预览，不表示选择待提交文件。单文件不显示树及分隔条。多文件桌面分栏支持鼠标、键盘调整及 Escape 取消拖动；调整宽度不读取文件、不重置草稿、不发送事件。长代码在预览区内横向滚动，长文档在预览区内纵向滚动。

### 按实际路径选择只读预览

实际路径扩展名为 `.md` 或 `.markdown`（忽略大小写）时使用 Markdown，传入实际解析路径作为 `sourcePath`，保持相对链接、图片和现有本地链接文件预览行为。主预览统一显示一条传入路径栏，Markdown 与代码文件沿用相同样式，不显示组件类型标签。其他文本交给公开 CodeBlock，传入原始 `code`、推断的 `language`、`annotationTarget={{fileIndex, snapshotId}}`，显式设置 `header={false}`、`lineNumbers={true}`、`defaultWrap={false}`，不再传独立 title 或渲染第二层代码标题栏。代码预览去除外层额外留白与内层边框，Markdown 正文保留阅读留白。这是文件预览的初始阅读策略，不改变 CodeBlock 的公共默认值；复制与换行保留为组件自带的悬浮操作。语言推断复用现有映射和已打包语法，未匹配的使用纯文本。`.mdx` 不作为可执行 Markdown，也不新增 MDX 支持。

清单里的图片/PDF/二进制不作为图片或其他媒体打开；Markdown 内嵌图片和链接仍遵循现有组件契约。这保留当前 Markdown 能力，避免把主预览的文件类型范围扩大成媒体浏览器。

### 通过页面会话接入现有批注和定位

Markdown 和 CodeBlock 均使用内部 ref `{fileIndex, snapshotId}` 注册当前快照。面板通过一个持续挂载的 `usePageAnnotations` 会话管理所有文件的反馈，不能把会话配置放进随文件切换卸载的预览组件。已有 CodeBlock 映射处理 CRLF/CR 显示归一化、异步 token 更新与行号排除，不在面板复制这些逻辑。

路径栏在当前文件快照读到后，通过公共 AnnotationText 注册传入路径原文，内部 ref 额外带 `part: "path"`，避免与正文原文冲突。路径选区沿用同一批注编辑器、目录和提交交互。adapter.resolve 按 part 返回传入路径或正文；路径定位复用现有文件切换与布局就绪协调，随后由公共会话恢复准确选区。内部保留路径坐标，不公开坐标或增加第二个路径字段。读取失败时仍显示原来的路径和错误，未增加无内容快照的另一套反馈模型。

主预览的 adapter.resolve 从浏览器缓存按 ref 获取精确原文，使未挂载文件的批注仍能校验与提交。adapter.locate 清除阻挡目标的搜索、展开祖先、选择对应文件并恢复同一快照，等待对应预览的 React 布局提交及文本注册就绪后返回。就绪信号由面板预览容器的布局生命周期协调，不依赖固定延时、近似文本搜索或等待语法高亮完成；CodeBlock 在高亮就绪前已注册纯文本，高亮后自行重新绑定。随后公共会话沿用注册映射完成精确滚动与选区定位，不再次调用 locate 形成递归，也不增加 CodeBlock ref API。

链接文件的 sourceRef 和快照继续由现有页面会话维护；其定位直接重开保留的文件抽屉，不要求入口 Markdown 仍然挂载，也不经过主预览 adapter 重新读取磁盘。保留现有批注编辑器的 modal 行为：编辑期间导航不得丢失输入，用户先显式保存或取消，再切换文件或定位另一条批注；不引入自动保存或隐式提交。

### 按需读取并在浏览器保留精确快照

只有打开文件时才通过面板 serverAction 读取，输入显式带清单和 `fileIndex` 并校验索引。复用现有有界文本读取规则：普通文件、有效 UTF-8、无 NUL、最大 1 MiB；上限之外明确报错，不截断。直接文件路径读取应复用或小范围提取底层读取函数，不经 URL 拼接，以免 `#`、`?`、`%` 等合法文件名被误解析；已有链接文件读取语义不得改变。

返回解析后的绝对实际路径、原始文本，以及由实际路径和精确原文生成的 `sha256:…` 快照标识。浏览器按 `fileIndex` 保留当前页面成功读到的快照；切走后再次打开使用同一快照，不读取磁盘新内容。快照身份包含在 Markdown/CodeBlock 批注 ref 中，避免同一个渲染 target 被更新内容复用。

首版无刷新文件按钮和监听。磁盘修改、删除或替换不改变已读取内容；用户需要新内容时重新打开页面，重新读取磁盘且不承诺保留刷新前草稿。加载中的晚到响应只能写入对应文件的缓存，不能覆盖当前另一文件的预览。读取错误按文件显示，不阻断其他文件审阅；空文件显示空态，不视为失败。

保留已读快照会消耗与已读文本量相关的浏览器内存，这是首版的明确取舍；不同时读取或高亮整份清单。仅当前文件挂载完整预览，批注保留和定位通过缓存恢复，不为所有文件保留隐藏 DOM。

### 区分内部引用与按文件嵌套的公开反馈

事件类型为 `file-review-submitted`，示例：

```json
{
  "files": [
    {
      "path": "/tmp/proposal/cache.ts",
      "snapshotId": "sha256:…",
      "annotations": [
        {
          "targets": [{ "text": { "start": 16, "end": 17, "quote": "3" } }],
          "comment": "请说明重试次数的依据。"
        }
      ]
    }
  ]
}
```

示例范围对应 `const retries = 3;\n`。内部草稿继续使用通用 `AnnotationValue`，保留批注 id 和 target.ref `{fileIndex, snapshotId}`；提交前的验证证据也可以按内部身份索引。验证通过后转换为上面的公开结构，内部字段不进入事件。

主预览反馈按清单项快照归组，每个被引用的项只输出一次文件元数据，其下包含该项的完整批注。`path` 为读取时解析出的绝对实际路径。重复清单项在内部仍有不同 fileIndex，不为了分组而合并意见。公开事件不包含展示别名、批注 id、fileIndex、ref、分离的 sources、无批注文件或完整原文；snapshotId 只在所属文件对象出现一次。正文 targets 保留原文 text 范围；路径 targets 只新增 `{ "path": { "quote": "cache-plan.md" } }`，不输出内部 part、路径坐标、pathText 或 displayPath，文件归组、comment、正文 target 与修正格式保持不变。Markdown 不连续原文范围仍作为同一条意见的多个 targets 保留。

Markdown 链接文件在内部继续使用 `sourceRef: {path, snapshotId}`，ref 标识入口 Markdown 的清单项，text 指向 sourceRef 对应的链接文件，不能按 Markdown 原文校验。公开时把这类批注归入实际链接文件的 `{path, snapshotId, annotations}` 对象，路径和快照来自已有 sourceRef，不要求消费者反查入口 Markdown。同一链接文件快照的意见归入同一对象，不重复 sourceRef 或完整原文；只有链接文件被批注时，不额外输出无批注的入口 Markdown。链接快照沿用现有内容摘要算法，不强行改成清单文件的路径加原文算法。该归组行为必须写入 reference 和测试。

浏览器通过 `usePageAnnotations` 和已有提交机制管理草稿与成功回执。文件切换保留已保存批注，未保存编辑沿用前述 modal 行为保护，不隐式提交。主预览和链接文件分别沿用前述定位路径。正文级意见仍通过选中标题文字表达，不增加无选区评论入口。

提交前校验清单身份、来源去重、快照标识以及所有精确原文范围；路径 target 沿用相同范围规则，以输入清单中的路径字符串而非正文校验，不新增路径格式或评论限制。需要的原始证据显式传给现有 serverAction 验证，使用浏览器保留内容；不依赖前一次 worker 的内存、不重读磁盘、不把完整原文写入公开反馈事件，也不把内容摘要校验宣称为独立的磁盘真实性证明。继续使用现有请求与事件大小限制，超限/保存失败明确报错并保留草稿，不截断或分批发送。

初次提交至少一条批注，comment 可以为空；提交只由用户明确触发。修正提交完整新结果，并用 `replacesEventId` 指向前次成功事件；使用 `{files: [], replacesEventId}` 撤回全部反馈。失败不更新成功回执。

## Risks / Trade-offs

- [批注错指其他文件或新版本] → 身份使用原始清单索引和快照标识，读取结果按文件归属；切换、定位和提交均使用同一原文。
- [异步高亮替换 DOM 导致选区偏移] → 组件层复用源文边界映射，覆盖 CRLF、孤立 CR、中文、emoji、重复文本、多行及高亮完成后的定位。
- [Markdown 链接文件批注被按主文档校验] → 保持 sourceRef 的既有解析规则，新增跨清单文件与链接文件混合反馈验收。
- [按内部状态直接发送反馈] → 验证后再映射为 files 下的批注，检查无 id/fileIndex/ref、无分离 sources，链接文件归入自己的原文来源。
- [定位时预览尚未注册] → adapter 等待目标预览布局就绪后返回，由公共会话进行精确定位，覆盖纯文本到异步高亮及跨文件重挂载，不扩充组件公开 API。
- [大量文件或长文本影响性能] → 按需读取、单文件上限、只挂载当前预览；1 MiB 是读取上限而非性能保证，验收应检查接近上限文本的切换和反馈响应，发现瓶颈先定位原因，不用静默截断掩盖。
- [抽取读取函数影响现有链接预览] → 只复用必要的有界读取逻辑，回归原路径解析、错误码和快照测试，不新增文件专用 HTTP 接口。
- [替换入口让旧调用失效] → 明确 BREAKING 迁移，随同更新 Skill、fixtures、测试和版本日志；不增加长期双入口维护。

## Migration Plan

后续实施从 file-review 清单、读取和快照开始，接入现有 Markdown/CodeBlock 和页面会话 adapter，完成按文件归组的公开反馈；不再补做已实现的 CodeBlock 能力。随后替换 Skill 入口表和 `references/review.md` 为 `references/file-review.md`，移除旧 `assets/panels/review/`。旧 `{title, markdownFilePath}` 调用改为 `{title, files:[markdownFilePath]}`；事件消费者改读 `file-review-submitted` 的 `files[].path`、snapshotId 及其嵌套 annotations，不再消费 document ref 或分离 sources。

已有持久化历史事件不改写为新类型，既有实例不做自动迁移或批量重编译；使用新入口创建新实例。旧编译实例能否继续打开沿用现有 revision/包版本机制，不作为本变更的兼容承诺。实施时在版本日志记录输入、入口和事件的破坏性变化，不在本次规划里发布或改版本。

发布前验证已安装 Skill 副本和打包资源一致，新入口可从仓库外通过已安装包运行。需要回滚时整体恢复同一版本的组件、面板、Skill 和测试，不对已记录事件做逆向转换。

## Open Questions

无阻塞实施的产品范围问题。现有组件复用、页面会话定位、按文件归组的事件、单文件隐藏树、1 MiB 文本边界和替换迁移已在本提案明确；性能验收若暴露必须扩大实现范围的问题，应先记录实际证据再调整方案。
