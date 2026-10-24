---
name: coding-structured-errors
description: Classify external errors by stable structured identifiers, never by matching message text
type: coding
---

# 用稳定标识判断外部错误

处理外部服务或类库的异常时，必须依据异常类型、错误码或文档明确约定的结构化标识判断。禁止通过正则、字符串相等、包含、前缀或后缀匹配异常消息来决定处理分支。异常消息可以记录或展示，但不能作为错误分类协议。

**Why:** 消息是面向人的非结构化文本，类库升级或语言变化可能让匹配静默失效；针对当前个例编写的匹配也容易遗漏变体，产生难以排查的 Bug。
**How to apply:** 先查外部接口的错误契约，使用稳定标识处理已知错误。没有可用标识时保留并记录或传播原错误，不能猜测消息格式后添加匹配兜底。
