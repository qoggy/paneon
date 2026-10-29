## MODIFIED Requirements

### Requirement: Load reusable local TypeScript React definitions

Paneon SHALL 接受默认导出 `definePanel` 返回的 PanelDefinition（面板定义）的本地 TSX 入口，定义包含作者填写的 id、必填的 requires.paneon 包版本范围、输入 schema 与 React render。作者填写的 id SHALL 在实例元数据中表示为 definitionId；每次 panel run SHALL 创建新的 PanelInstance（面板实例）并由 SQLite INTEGER PRIMARY KEY AUTOINCREMENT 分配独立 instanceId，对外以十进制字符串返回，运行操作 SHALL 使用 instanceId，不以 definitionId 去重或选择实例。系统 SHALL 支持相对模块复用，并将面板源码与实例运行数据分开保存。

#### Scenario: Run a definition outside the Paneon repository

- **WHEN** agent 从仓库外目录运行一个使用 `@qoggy/paneon/sdk`、`@qoggy/paneon/ui` 和相对接入模块的面板
- **THEN** 系统解析已安装的 SDK 和 React、校验输入并生成可访问实例，不要求面板源码目录初始化 npm 项目

#### Scenario: Reuse source in another session

- **WHEN** 新 agent 会话使用同一面板定义传入另一组有效参数
- **THEN** 系统创建独立实例，使用同一份接入源码，且不覆盖其他实例的配置或事件

#### Scenario: Allocate an ID after deletion and restart

- **WHEN** 一个已提交的实例被删除，服务重启后再次创建实例
- **THEN** 新实例使用更大的自增编号，对外 instanceId 仍为字符串，不复用被删除的编号

#### Scenario: Fail initial creation

- **WHEN** 新实例分配 ID 后创建失败
- **THEN** 系统继续返回原失败，移除初始实例记录，并允许自增编号跳号
