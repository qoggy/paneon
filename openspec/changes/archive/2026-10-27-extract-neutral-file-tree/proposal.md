## Why

Git Review 的文件树直接依赖 `GitFile` 及其 Git 分区、状态和两侧路径。其他面板若复用它，也必须伪造 Git 数据；只把类型改成 `T extends TreeSnapshot` 仍然保留了这层耦合。需要抽出基于访问器的中立树，让业务适配层保留原对象，同时维持现有 Git Review 的外观和操作。

## What Changes

- 新增公开 `Tree<T>`，通过身份、文本标签和子节点访问器读取原始业务数据，不要求 `T` 继承指定结构。
- 明确单选、受控／非受控展开、搜索临时展开、选择与激活、定位完成和取消的行为契约。
- 将 Git 分区、路径建树与压缩、排序、状态显示、工具栏和按视图保存的状态留在 Git 适配层；`ChangedFileTree` 接入共享树并保持现有页面行为。
- 通过路径式 diff-review 内置面板验证非 Git 复用：展示路径生成目录，叶节点保留原文件／拟议文件路径，激活后由页面读取两侧文本并显示 DiffView；调用方不需要 Git 枚举或伪造仓库。
- 引入 shadcn Resizable 及固定版本底层依赖，让两个内置审阅页及 DiffView 内部共用 Resizable 拖拽基础，保留 Git 文件／历史分栏与 diff 行布局。
- 补齐带注释的公开接口说明、两类调用示例及有针对性的兼容性验收。
- 落实已确认的路径入参，不要求方案 ID 或版本号；不加入完整 APG 键盘导航、节点懒加载、多选、拖放或重命名。

## Capabilities

### New Capabilities

- `diff-review`: 原／拟议文件路径输入、文件树、真实 diff 和显式批注提交。
- `generic-tree`: 定义业务无关的树数据接口、状态和命令契约，以及 Git／非 Git 两类使用场景。

### Modified Capabilities

- `stateless-git-review`: 历史分栏统一到 Resizable，保留默认布局、单边约束、尺寸记忆和浏览状态；既有用户可见兼容性要求继续适用。

## Impact

- 公共 API：在 `@qoggy/paneon/ui` 增加 `Tree`、`TreeProps` 和 `TreeHandle`；不改变现有 `DiffView` 公开入参、批注或 Git 服务端协议。
- 主要实现范围：`src/ui/` 的树组件、Git Review 的文件树及模型适配、公开 UI 和 Git Review 文档，以及一个正式的 diff-review 内置面板。
- 依赖：复用现有 React、Button 和 Collapsible，并引入 react-resizable-panels@4.15.0 支撑 shadcn Resizable；没有安装新的树库。行业组件 API 用作接口参考，不等于引入其全部能力。
- 状态：只在当前浏览器中持有树状态与未完成定位，不增加数据库、磁盘文件或持久化缓存。
- 验收：共享树契约检查，加上 Git Review 在 changes、history、compare 三个视图中的真实浏览器前后对照。现有工作区包含其他未提交改动，实施必须以实际接入前状态为准并保留它们。
