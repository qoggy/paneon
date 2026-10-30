## 1. 独立组件

- [x] 1.1 实现并导出完整 CodeBlockProps，内置头部、宿主复制、非受控换行；行号默认 false。
- [x] 1.2 实现逻辑行号、闭区间高亮、主题高亮和精确原文批注注册；不迁移其他组件。

## 2. 文档与回归

- [x] 2.1 更新 authoring 用法与现有显式长行滚动示例，说明默认值和 className 根容器变化。
- [x] 2.2 增加独立 CodeBlock 浏览器覆盖：默认值、所有 props、复制/失败/pending 焦点、主题、换行、原文批注/定位/提交/修改。
- [x] 2.3 执行构建与相关单元/浏览器回归、格式/静态检查、OpenSpec strict 校验；确认其他组件源码未被本次修改。
- [x] 2.4 审查新增条件与错误处理，记录 focus 范围和验证结果并交付可体验页面。

验证记录见 [verification.md](verification.md)：构建通过、29 个相关单元测试通过、5 个浏览器套件通过；ESLint 0 errors / 55 条既有 warnings（均不在本次修改文件），Prettier、diff --check、OpenSpec strict 通过。已交付真实 CodeBlock 验收页，未提交、发布或归档。

独立 `conduct run-kiro` 审查总体 A（0 Critical / 1 Warning / 3 Info）；已修正 source-watching 的高亮就绪断言并通过该完整浏览器回归。产品代码未变，3 项 Info 均不需要扩展本次范围。详见 verification.md。
