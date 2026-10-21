## ADDED Requirements

### Requirement: Collect credentials only through trusted host UI

运行时 SHALL 在面板 iframe 外的可信宿主提供密钥输入，并显示作者声明的用途、绑定动作和 revision。普通面板脚本、CLI 参数及 agent 事件 MUST NOT 作为密钥原文输入通道；系统 MUST NOT 提供浏览器或 CLI 解引用原文的 API。

#### Scenario: Provide a credential from the browser

- **WHEN** 用户在可信凭据对话框输入测试密钥
- **THEN** 值直接提交到内存凭据容器，普通面板和 agent 只得到 ref 及可用状态，不能读取输入 DOM 或值

### Requirement: Keep framework credential storage ephemeral

框架 SHALL 仅在内存持有密钥值，不将原文写入面板源码、构建产物、SQLite、事件、URL 或框架诊断。提交 body MUST NOT 被记录；服务重启 MUST NOT 从持久数据恢复密钥。

#### Scenario: Inspect framework state after use

- **WHEN** 用户提供已知测试密钥并完成一个遵循契约的服务端动作后，检查所有框架持久数据和构建输出
- **THEN** 找不到原文，也不存在可恢复原文的框架凭据文件

### Requirement: Bind credential usage to a generic server action

凭据 ref SHALL 绑定 instanceId、revision 和 actionId。服务端 handler SHALL 通过 `ctx.secrets.use(ref, callback)` 在内存回调中使用原文；框架 SHALL 校验绑定和有效期。该能力 MUST NOT 依赖程序路径、argv、环境变量、stdin 或某种网络协议，浏览器 SDK MUST NOT 暴露 use 或远程原文读取能力。

#### Scenario: Use a credential in an HTTP client

- **WHEN** 匹配绑定的 handler 在 use 回调内调用作者提供的 HTTP 客户端
- **THEN** 回调取得原文用于该调用，普通页面和 agent 不接收原文，不需要经过 Paneon 的 HTTP 执行器

#### Scenario: Use a credential in any local library

- **WHEN** 匹配绑定的 handler 在 use 回调内调用普通本地库或自行启动外部程序
- **THEN** 作者自行决定调用和凭据传递方式，Paneon 不提供 CLI 注入器或业务输出处理

#### Scenario: Reuse a reference for another action

- **WHEN** 另一实例、旧 revision 或其他 action 尝试使用该 ref
- **THEN** 框架拒绝 use，回调不获得原文

### Requirement: Protect SDK output boundaries without monitoring business output

SDK SHALL 在动作响应、事件提交和框架诊断边界拒绝包含当前已知密钥原文的值，返回不含被拒内容的 `SECRET_OUTPUT_BLOCKED`。本次 use 所需的原文检查集合 SHALL 保留至所属动作完成出站检查。系统 MUST NOT 因此接管业务网络、子进程输出、日志或业务存储，也 MUST NOT 宣称覆盖任意编码或作者私自保留的副本。

#### Scenario: Reject accidental plaintext in a result

- **WHEN** handler 在 use 后误把该密钥原文包含在返回对象中
- **THEN** SDK 阻止该响应，不将原文交给页面或 agent，也不保存被拒对象

#### Scenario: Reject accidental plaintext in an event

- **WHEN** 密钥仍在内存检查集合中，SDK 收到包含其原文的事件
- **THEN** SDK 拒绝事件且不落盘，不回显被拒内容

#### Scenario: Fail without echoing credential input

- **WHEN** 凭据提交或 use 校验发生异常
- **THEN** 返回稳定错误代码和非敏感说明，不输出请求 body 或密钥值

### Requirement: Expire and revoke credential references

系统 SHALL 实施默认 15 分钟、声明不超过 60 分钟的有效期，并在用户撤销、面板关闭、revision 变化、服务停止或重启后使引用失效。失效 SHALL 禁止后续 use 并移除供新调用使用的内存值；到期或撤销本身 SHALL 不主动中断已经进入的 use 回调。若调用仍运行，相关原文检查集合 SHALL 保留至其返回并完成 SDK 出站检查后释放；源码更新或运行环境关闭不额外保证回调完成，环境结束时 SHALL 释放框架引用，不为此保留旧 worker。

系统 MUST NOT 声称能收回作者已复制、已发给外部程序或 API 的值，也不保证物理内存擦除。

#### Scenario: Restart after providing a credential

- **WHEN** 用户已提供凭据而服务随后重启
- **THEN** 原 ref 不可使用，界面显示需要重新提供，不从持久数据恢复值

#### Scenario: Reload during credential use

- **WHEN** use 回调已取得值，源码随后自动 reload
- **THEN** revision 变化使旧 ref 不可用于新的 use；调用按工具链更新机制处理，不额外保留旧执行环境；仍运行的调用在出站检查后释放原文检查集合，环境结束时释放框架引用

### Requirement: State the trust boundary for author code accurately

文档 SHALL 说明原文会进入受信任的服务端作者代码，其业务输出和存储由作者负责；MUST NOT 将“模型上下文不接收原文”说成“作者代码无法取得原文”。系统 MUST NOT 宣称可防止恶意作者代码、同用户任意 shell/调试权限、任意编码外传或操作系统交换区泄漏。

#### Scenario: Describe credential behavior

- **WHEN** 用户或 agent 阅读凭据功能说明
- **THEN** 说明明确区分浏览器/agent 引用、服务端函数内存用值、SDK 原文出站保护，以及业务输出不受框架监控的边界
