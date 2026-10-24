---
name: coding-reuse-foundations
description: Prefer standard libraries and mature community SDKs for general-purpose capabilities
type: coding
---

# 优先复用成熟基础能力

实现通用基础能力时，优先复用语言或平台标准库，以及社区成熟、通用且适合当前项目的 SDK 或类库，避免手写已有的基础设施。例如，JSON 使用标准解析能力，TOML、YAML 使用成熟解析库，不为当前遇到的样例自制格式解析器。

**Why:** 通用格式和协议存在大量边界情况，成熟实现通常比针对少数样例编写的代码更完整、更易维护。
**How to apply:** 先检查标准库、项目现有依赖和成熟社区方案。只有确认现成方案无法满足明确需求时，才说明具体缺口并实现必要的最小补充。
