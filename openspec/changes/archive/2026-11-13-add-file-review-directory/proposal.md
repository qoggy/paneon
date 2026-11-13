## Why

用户希望把一个或多个目录直接交给 File Review，省去调用前手工枚举文件，且能与补充文件一起审阅。

## What Changes

- 增加 `directories: string[]`，支持单目录、多目录以及与现有 `files` 组合。
- 递归收集目录项路径，与显式文件合并；正文继续按需读取。
- 复用现有文件树、预览和批注；目录失败可见，其他来源仍可用。
- 读取单个文件只传目标路径，不传整个扫描清单。
- 保留符号链接类型和目标，初始化扫描目录链接；以当前目录链识别循环，复用原文件批注身份。
- 同步使用说明与目录输入的验证。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- file-review：目录列表、合并清单、目录加载和错误状态。
- paneon-agent-skill：目录列表及组合输入的入口说明。

## Impact

仅涉及 File Review、skill 说明及相关测试。无新增依赖、SDK/runtime 接口、忽略配置或匹配库。本次不处理隐藏目录及特定名称的排除/纳入策略，不读取磁盘上的 .gitignore；不改批注提交格式或上传正文的既有行为。
