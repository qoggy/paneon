# Git 页面交互与来源设计

本文保存 skill change 的 Git 页面范围和语义。旧 session/listing/snapshot Map、初版反馈类型与重复请求样例已移除；现行组件签名、请求、文件描述符及完整事件由 [无状态 Git 设计](../refactor-git-review-stateless/design.md#implemented-api-and-ownership) 与 [Git 使用参考](../../../skills/paneon/references/git-review.md) 维护，实际校验见 [schema.ts](../../../skills/paneon/assets/panels/git-review/schema.ts)。B1–B65 的阶段决定和布局变化见 [decision-history.md](decision-history.md)。

## 仓库与初始定位

repositories 必填且非空，包含唯一 id、仓库 path 和可选 label；相对路径以 --cwd 解析，不递归发现其他仓库。初始视图通过 initialView 指定 changes/history/compare、repositoryId、可选 file，以及明确 commit 或 base/head。省略时打开第一个仓库的未提交改动，不猜基线分支名。初始定位不锁死后续导航，各仓库保留自己的浏览状态。

changes 区分 staged/unstaged/untracked，同名文件在不同区域独立显示；未跟踪文件按 Git 忽略规则过滤，已经跟踪但后来命中 .gitignore 的改动仍显示。history 查看所选分支/固定 tip 的提交及单次提交文件；compare 的 branch 使用共同祖先到 head，commits 直接比较两个端点。

## 浏览与 diff

页面只提供读取和向 AI 批注，不增加 stage、discard、commit、merge、push 操作。分支、完整提交信息、拓扑图、文件树、可调整分栏和懒读 diff 的交互保持当前实现；选择 commit 不默认读取首个文件，明确点文件才读取，指定 initial file 和定位原批注除外。

Git 读取使用参数数组、显式 -C、路径 -- 分隔，并关闭外部 diff/textconv。版本先解析为完整 OID；历史分页保留固定 tip 和顺序，刷新才解析新 tip。merge commit 默认相对第一父提交，根提交相对空树；指定 parent 必须属于该 commit。没有共同祖先或无法唯一确定比较依据时明确失败，不擅自换比较语义。

每次打开文件捕获当次两侧原文，同一份字节生成 diff、hash、行号和 quote；读取工作区不能保证原子锁定整个仓库。重命名保留两侧路径；二进制/非法 UTF-8/gitlink/符号链接按对象展示，不跟随链接或递归子模块，不伪造行级文本。冲突显示真实未合并工作文本，不合成假的已暂存内容。CRLF 与无末尾换行保持原文语义。

共享 DiffView 以 oldText/newText 或 model 为核心，可独立使用；sourceId 才启用 AnnotationRoot 集成。左右/单列显示、上下文展开与连续差异导航共用来源和坐标；新增/删除文件缺少的一侧为空。整文件增删的当前布局以共享 DiffView 为准，不在本 change 复制另一套布局分支。

## 所见内容与刷新

本地文件变化不自动替换人正在看的 diff；明确刷新才重读。读取新版本不改旧快照，已有意见可定位回浏览器保留的原始来源。切换仓库、视图或文件不改批注含义，过时异步响应不能覆盖当前视图。

来源不只按路径区分：仓库、view、实际 OID、old/new 路径/类型/hash 共同描述当次比较。sourceId 对应单个来源，一条意见可以跨来源，sources 仅含实际引用项并去重。old/new 是各自比较的两侧，不是页面全局的前后两次刷新。

## 批注证据与提交

使用 [公共批注](annotation-design.md)，正常划选后就近编辑，默认不要求进入对象选择模式。文件/hunk/同侧连续行/行内文字具有各自语义 ref；file/hunk 不带 text，lines 带 side、一基闭区间行号和相对于这些原文行（含分隔符）的 UTF-16 范围。跨侧或不连续范围拆成同条目多个目标。

浏览器保留显示数据、草稿和被引用原文，并构造完整 sources/evidence。file 目标只需元数据/hash；文字目标附实际完整原文行及 quote；hunk 附当时 patch 和两侧必要片段。后端只用完整请求和明确仓库配置做结构、来源、范围及 quote 内部一致性校验，不查旧业务 Map，也不重读最新文件解释旧批注。内部一致性不等于独立认证客户端或 Git 来源真实性。

明确提交才保存 git-review-submitted，数据为 annotations、被引用 sources 及可选 replacesEventId，没有顶层 comment。正文 comment 属于每条批注，允许空字符串。标准页完整更正、空修订、历史保留和失败保留语义见 [标准页面设计](standard-page-design.md#草稿提交与更正)。

事件仍受 65536 UTF-16 序列化长度和 262144 UTF-8 字节完整请求限制；不重复发送无关整文件/DiffModel，不截断、拆分或自动落盘来绕过限制。过大或证据不一致明确失败并保留草稿。旧快照缺失时不能按最新文件猜回原文；整页刷新和服务重启不保证未提交内容恢复。

## 与资源生命周期的边界

本 change 原始页面设计不实施进程池或磁盘回收。Git 无状态改造允许执行环境丢弃，驻留管理由 [add-panel-resource-lifecycle](../add-panel-resource-lifecycle/design.md) 定义；保持在浏览器中的批注不依赖某个执行进程常驻。源码更新不增加旧 worker 保活或 mutation 重放保证。
