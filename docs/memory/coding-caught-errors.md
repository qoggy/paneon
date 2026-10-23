---
name: coding-caught-errors
description: Caught errors must be logged or propagated rather than silently discarded
type: coding
---

# Caught errors must remain observable

try-catch 或 Promise.catch 捕获的异常必须记录日志、继续抛出，或既记录又抛出，不能静默处理。只留空 catch、注释、返回默认值或忽略失败，不算处理了异常。

继续抛出可以是原异常，也可以是保留原因的上层异常。记录时提供必要的错误内容与上下文；不要通过吞错让失败看起来成功，也不要为了满足规则堆叠正常流程日志。

**Why:** 静默捕获会隐藏真实失败原因，妨碍研发 debug、定位和问题复现。
**How to apply:** 编写或修改异常处理时，确认捕获的异常能通过日志或抛出路径被观察到；正常控制流尽量直接表达，不用 catch 吞掉错误后继续。将规则应用到当前改动范围，不借机清扫无关模块。
