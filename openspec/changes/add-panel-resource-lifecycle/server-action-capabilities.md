# serverAction 能力全貌

## 当前实施状态

2026-10-25 后续决定：用户已批准“懒恢复 + 默认十个驻留位置的每面板子进程/空闲 LRU”，并明确废弃 B14 的两个执行位置方案。当前准则见 [design.md](design.md)。B15 未纳入本次实施；C2 随后单独批准并由 [reclaim-generated-artifacts](../reclaim-generated-artifacts/design.md) 实施，不再属于未批准建议。下文为批准前的能力调查记录，涉及 B14 的“拟议改动”和两线程对照均已过时，不再是待实施要求；当前不新增 ctx.cwd、每任务 signal 或默认 action 超时。模块状态和后台工作新增 LRU 淘汰边界，冷唤醒保留同 revision 凭据。

## 批准前调查事实与证据

检查日期：2026-10-25。仓库 HEAD：`2d73ab632bc17ecd294c854b6d0a8fa4a253e84e`；工作区还有其他任务改动，本清单以本次读取的实际源码为准。

serverAction 是把面板里显式传参的一次函数调用送到本机 Node 执行，再把 JSON 结果返回页面的桥梁。它能使用 Node 的文件、命令与网络能力；它不是自带业务状态、后台作业、事务或流式传输的完整服务框架。当前长期进程“碰巧能留住一些东西”，与框架正式保证的能力必须分开看。

以下状态均指调查时点，不是最终驻留方案的实施状态。状态含义：**支持**＝现有 API/实现提供；**受限**＝只有明确边界内可用，不能扩大理解；**可运行但不保证**＝当前代码能产生该行为，却没有持久或完整生命周期承诺；**拟议未实现**＝仍是设计，不能当成现有能力。

## 一次调用与一次提交

页面传 input → 编译生成的 RPC 代理 → 宿主验证实例/revision 并发 HTTP 请求 → 服务端用原 Zod schema 校验 input → handler 使用 Node 能力 → 检查 JSON 结果 → 页面 state/props 持有结果。需要长期保存的明确提交事件，另走 agent.emit → 校验 → SQLite，不由普通 action 返回自动触发。

## 完整用法示例

下面代码使用当前 API。框架只允许可信本机代码；`path` 的业务访问范围要由页面作者自行决定。这个示例不引入后端 Map。

```tsx
import { useState } from 'react';
import { readFile } from 'node:fs/promises';
import { definePanel, serverAction, usePanelInput, z } from 'paneon/sdk';

export const readText = serverAction({
  kind: 'query',
  input: z.object({ path: z.string().min(1) }),
  handler: async (ctx, input) => {
    const text = await readFile(input.path, {
      encoding: 'utf8',
      signal: ctx.signal,
    });
    return { path: input.path, text };
  },
});

function Page() {
  const { path } = usePanelInput<{ path: string }>();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError('');
    try {
      setText((await readText({ path })).text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <button disabled={busy} onClick={load}>
        读取文件
      </button>
      {error && <p role="alert">{error}</p>}
      <pre>{text}</pre>
    </section>
  );
}
export default definePanel({
  id: 'read-text',
  requires: { paneon: '0.0.0' },
  input: z.object({ path: z.string() }),
  render: Page,
});
```

启动示例：`paneon panel run <entry.tsx> --params '{"path":"/work/repo/README.md"}' --cwd /work/repo --json`。示例中输出数据留在浏览器；没有任何事件自动提交。

## 能力总表

<!-- prettier-ignore -->
| 类别 | 用法 | 当前状态 | 一句话范围 |
| --- | --- | --- | --- |
| 定义与调用 | 怎样定义一个 action | 支持 | 顶层具名导出，声明输入和 handler。 |
| 定义与调用 | 从页面调用，参数从哪里来 | 支持 | 在事件或组件查询里调用，参数显式传入。 |
| 定义与调用 | query 和 mutation 分别保证什么 | 受限 | 是调用分类；不是权限或事务。 |
| 定义与调用 | useQuery 自动查询与刷新 | 支持 | 挂载查询；可手动 refetch，可选定时刷新。 |
| 定义与调用 | action 能调用另一个 action 吗 | 受限 | 页面可以组合多个调用；服务端共享普通函数。 |
| 参数与结果 | 能传哪些参数 | 受限 | 传普通 JSON；文件路径可以，文件对象不行。 |
| 参数与结果 | Zod 校验支持到哪里 | 受限 | 需要能生成元数据，且可同步 safeParse。 |
| 参数与结果 | handler 能返回哪些结果 | 受限 | 一次返回一个普通 JSON 值。 |
| 参数与结果 | 流式结果、进度条与分页 | 受限 | 当前 RPC 是一次请求、一次最终结果。 |
| Node 与外部能力 | 本机文件、目录、Git 命令 | 支持 | 普通 Node fs / child_process，运行在本机。 |
| Node 与外部能力 | HTTP、第三方 API、数据库 | 支持 | 用 Node fetch 或能正常加载的库。 |
| Node 与外部能力 | 第三方依赖和原生模块 | 受限 | 依赖要在作者目录可解析，不自动安装。 |
| Node 与外部能力 | 哪些普通 JS 写法不能直接搬来 | 受限 | 编译器抽取 action，不是完整 Node 程序托管。 |
| Node 与外部能力 | 权限和隔离到底多强 | 受限 | 可信本机代码；cwd 不是目录权限沙箱。 |
| 上下文与状态 | ctx 当前究竟有什么 | 支持 | 只有 signal。 |
| 上下文与状态 | 模块 Map / 对象能存业务数据吗 | 可运行但不保证 | 当前能留在进程里；重载、关闭、重启会丢。 |
| 上下文与状态 | 页面数据、草稿、批注归谁持有 | 支持 | 浏览器可持有展示快照，不需 action 常驻。 |
| 上下文与状态 | 哪些东西自动存 SQLite | 受限 | 明确提交的事件存；普通调用结果不自动存。 |
| 执行与生命周期 | 异步、并行、CPU 任务 | 支持 | 可 await，也可组合；没有默认业务顺序保证。 |
| 执行与生命周期 | 返回后定时器还能继续吗 | 可运行但不保证 | 当前可能继续；没有可靠后台作业服务。 |
| 执行与生命周期 | 超时、取消能控制到哪 | 受限 | 当前没有单次 action 超时或取消 API。 |
| 执行与生命周期 | reload / close / 重启会怎样 | 受限 | 没有在途调用与内存状态存活保证。 |
| 失败与可靠性 | 校验失败、业务失败、异常怎么区分 | 支持 | 调用 reject，可由页面捕获并展示。 |
| 失败与可靠性 | 重试、事务、幂等与恰好一次 | 受限 | 这些业务保证没有自动提供。 |
| 交互事件 | 调用 action 和向 agent 提交事件 | 受限 | 是两种独立操作。 |
| 拟议改动 | 资源池参数是现状还是建议 | 拟议未实现 | 全局 2 条线程等数字全部仍是建议。 |
| 拟议改动 | 本轮究竟会改哪些使用方式 | 拟议未实现 | 需要接受有限调用契约，而非只有内部换进程。 |

## 每项的现状、代码与改造影响

### 怎样定义一个 action

**定义与调用 · 支持**。顶层具名导出，声明输入和 handler。

从 paneon/sdk 导入 serverAction。写成 export const name = serverAction({...})；options 是对象字面量。handler 可以同步返回或返回 Promise。input 必填；没有输入也用 z.object({})，调用传 {}。没有 output、timeoutMs、ctx.cwd 这些现行配置。

```typescript
export const read = serverAction({
  kind: 'query',
  input: z.object({ path: z.string() }),
  handler: async (ctx, input) => {
    /* ... */ return { ok: true };
  },
});
```

**对资源方案的影响**：保留定义方式；ctx.cwd、timeoutMs 是 B14 拟议新增，尚不能当现有 API 使用。

依据：src/sdk/server.ts; src/compiler/action-transform.ts。

### 从页面调用，参数从哪里来

**定义与调用 · 支持**。在事件或组件查询里调用，参数显式传入。

编译器把页面中的 action 替换为 RPC 代理；浏览器 → 宿主 → HTTP → 对应版本的 handler → JSON 结果。handler 不能捕获 React state；仓库、分支、文件等通过 input 传入。definePanel 的 params 不会自动变成 ctx.params。

```typescript
const result = await read({ path: selectedPath });
// selectedPath 是页面变量，作为参数传给服务端。
```

**对资源方案的影响**：调用形态保持；B14 增加排队与执行时限，忙时和超时要由页面处理。

依据：src/sdk/client.ts:createActionProxy; src/web/panel-host.tsx:dispatch; src/runtime/worker.ts。

### query 和 mutation 分别保证什么

**定义与调用 · 受限**。是调用分类；不是权限或事务。

kind 可选，默认 mutation。useQuery 只接收 query；query handler 仍然能写文件。mutation 不会自动确认、加锁、事务提交、去重或保证恰好一次执行。分类是否符合实际由作者负责。

```typescript
kind: 'query'; // 应用于读取，但框架不会禁止其中写文件。
kind: 'mutation'; // 也不会自动弹确认框。
```

**对资源方案的影响**：不扩大为权限沙箱；有限执行不等于自动回滚已发生的外部写入。

依据：src/sdk/server.ts; src/sdk/client.ts:useQuery; src/runtime/worker.ts。

### useQuery 自动查询与刷新

**定义与调用 · 支持**。挂载查询；可手动 refetch，可选定时刷新。

返回 data/error/loading/refetch。输入 JSON 值或 action 改变会重新查询；refreshMs 显式开启，等上一轮结束再安排下一轮。每个 hook 内避免重叠；不是全局查询缓存。卸载停止后续刷新并忽略结果，不取消已经开始的服务端调用。隐藏标签目前没有自动暂停逻辑。

```typescript
const { data, error, loading, refetch } = useQuery(read, { path }, { refreshMs: 5000 });
// 不填 refreshMs 就没有定时刷新。
```

**对资源方案的影响**：B15 拟在隐藏时暂停可选刷新；隐藏不取消已开始的业务调用。

依据：src/sdk/client.ts:useQuery。

### action 能调用另一个 action 吗

**定义与调用 · 受限**。页面可以组合多个调用；服务端共享普通函数。

浏览器 await a(...) 后再 await b(...)，或 Promise.all 可以。服务端直接调用 b(...) 不是内部 RPC：serverAction 的原始函数会拒绝执行。需要复用时抽普通函数，由多个 handler 调用；不要依靠 action.handler 绕过输入校验。

```typescript
async function readRepo(repo: string) {
  /* 普通 Node 函数 */
}
// handler: (_ctx, input) => readRepo(input.repo)
```

**对资源方案的影响**：执行池不应变成嵌套 RPC 或等待自己的死锁来源；继续使用普通函数组合。

依据：src/sdk/server.ts:serverAction; src/sdk/client.ts:createActionProxy。

### 能传哪些参数

**参数与结果 · 受限**。传普通 JSON；文件路径可以，文件对象不行。

参数经过 JSON HTTP 请求：字符串、有限数字、布尔值、null、数组、普通对象。函数、DOM、File/Blob、循环对象、BigInt 等不能作为此 RPC 数据契约。Date/undefined 等还可能在序列化时变形或丢失，不应依赖。上传文件不是传一个 File 就自动完成；可传路径或自行实现有界内容协议。整个 HTTP 请求体含封装最多 256 KiB UTF-8。

```typescript
await read({ path: '/work/repo/src/main.ts' });
// 错误用法：read({ file: browserFile, onDone: callback })
```

**对资源方案的影响**：保持 JSON 协议和请求上限；池不会自动解决大文件传输。

依据：src/web/panel-host.tsx; src/shared/limits.ts; src/sdk/protocol.ts。

### Zod 校验支持到哪里

**参数与结果 · 受限**。需要能生成元数据，且可同步 safeParse。

input schema 在加载时转换为 JSON Schema，调用时用原 Zod schema 同步 safeParse，handler 收到 parsed.data。普通 object/array/enum、同步 refine 等可用；不是任意 Zod 特性都可用。实测 transform 无法生成元数据，async refine 在同步校验时报错；不能承诺任意 transform/异步校验。没有自动输出 schema，输出可在 handler 内自行校验。

```typescript
input: z.object({ count: z.number().int().min(1) });
// 可以：同步 refine。
// 当前不支持契约：异步 refine、需 transform 的输入 schema。
```

**对资源方案的影响**：必须保留已支持的 schema 语义，不能只拿 JSON Schema 替代实际 Zod 校验；本次不扩大 schema 能力。

依据：src/runtime/worker.ts:init/invoke; src/sdk/server.ts。

### handler 能返回哪些结果

**参数与结果 · 受限**。一次返回一个普通 JSON 值。

运行时检查返回值：null、字符串、布尔值、有限数字、数组和普通对象。Date、Map/Set、Buffer、类实例、undefined、NaN/Infinity、BigInt 等不在结果契约内；不要以 TypeScript 能通过当作运行时支持。日期先转 ISO，二进制自行转有界字符串。未发现独立 action-result 大小配置；这不等于承诺超大结果安全。事件的 65536 UTF-16 上限不能误写为 action 结果上限。

```typescript
return { updatedAt: new Date().toISOString(), text };
// return new Date() 会失败：INVALID_RESULT。
```

**对资源方案的影响**：保持；仍需大结果的专门设计，不能混入资源池承诺。

依据：src/shared/types.ts:jsonValue; src/runtime/worker.ts。

### 流式结果、进度条与分页

**参数与结果 · 受限**。当前 RPC 是一次请求、一次最终结果。

可以在 handler 内消费流并 await 最终结果，也能自己做分页输入/输出；没有内置 AsyncGenerator/ReadableStream/进度回调传输。不能把函数作为 input 让服务端回调。长期订阅与持久作业不是现有 serverAction 生命周期服务。

```typescript
// 可行：await 读取后返回 { rows, nextCursor }。
// 不支持：return readableStream，或 input.onProgress(50)。
```

**对资源方案的影响**：池中的短任务可继续分页；流、订阅和持久任务不作为这次顺带新增的功能。

依据：src/runtime/worker.ts; src/sdk/client.ts:request; src/sdk/protocol.ts。

### 本机文件、目录、Git 命令

**Node 与外部能力 · 支持**。普通 Node fs / child_process，运行在本机。

handler 可读写本地文件、列目录，用 execFile 执行 git/gh/其他已安装 CLI。Node import 由编译器留在服务端；浏览器代码不能直接 import node:fs。没有 ctx.exec 或内置 Git 命令魔法；命令、参数、安全拼接及业务错误由作者负责。

```typescript
const { stdout } = await execFileAsync('git', ['status', '--short'], {
  cwd: input.repo,
  signal: ctx.signal,
});
return { stdout };
```

**对资源方案的影响**：这些有限操作保留；显式仓库路径 props 不变。子命令链/孙进程的取消仍需验证。

依据：src/compiler/action-transform.ts; skills/paneon/assets/panels/git-review/git.ts。

### HTTP、第三方 API、数据库

**Node 与外部能力 · 支持**。用 Node fetch 或能正常加载的库。

可调用 HTTP API；网络、登录、权限、可用性依赖本机环境。业务需要数据库或文件持久化，可由作者显式编写；框架不会自动替任意 action 建表、缓存结果或存储业务会话。查询分类不是禁止网络写入。

```typescript
const response = await fetch(url, { signal: ctx.signal });
if (!response.ok) throw new Error('request failed');
return await response.json();
```

**对资源方案的影响**：保留有限请求；不要把数据库连接池的永久驻留假定为新的契约。

依据：src/runtime/worker.ts; src/runtime/lifecycle.ts; skills/paneon/references/authoring.md。

### 第三方依赖和原生模块

**Node 与外部能力 · 受限**。依赖要在作者目录可解析，不自动安装。

显式静态导入本地 helper、命名导出/再导出支持；第三方依赖要预先可解析。原生扩展是否可打包/加载取决于该包，不能笼统承诺所有 Node 包。当前子进程可用的原生库也不能直接推断工作线程安全；转线程要逐项验证。

```typescript
import { readRepository } from './git-helper';
// 某个 npm 包必须先在对应项目可解析。
```

**对资源方案的影响**：B14 改线程的新增风险：原生库线程兼容性、隔离强度都要验收。

依据：src/compiler/action-transform.ts:resolveThirdParty; src/compiler/build.ts。

### 哪些普通 JS 写法不能直接搬来

**Node 与外部能力 · 受限**。编译器抽取 action，不是完整 Node 程序托管。

支持按依赖抽取的普通 helper/const；捕获模块 let/var、动态 import()、普通裸副作用 import 等被拒绝。任意模块顶层语句不能当作正式启动钩子。CSS 的客户端特殊处理不代表任意副作用导入都受支持。React 闭包不搬到服务端。

```typescript
// 拒绝：let cache = ...; handler: () => cache
// 拒绝：await import("node:fs")
// 使用静态 import 和普通 helper。
```

**对资源方案的影响**：保持清晰编译边界；不要把每次加载时副作用当成可靠服务启动流程。

依据：src/compiler/action-transform.ts; tests/compiler-exports.test.ts; tests/runtime-hardening.test.ts。

### 权限和隔离到底多强

**Node 与外部能力 · 受限**。可信本机代码；cwd 不是目录权限沙箱。

handler 使用当前 OS 用户权限，可访问该用户可访问的文件和网络。现行独立子进程隔离 JS 执行，但不限制恶意文件操作。query 不会降权。不要用不可信源码运行 panel。

```typescript
// --cwd /work/repo 并不禁止 fs.readFile("/other/path")。
```

**对资源方案的影响**：工作线程仍不是 OS 安全沙箱；原生崩溃、进程资源竞争不能宣称与子进程等价。

依据：src/runtime/lifecycle.ts:Execution; src/sdk/server.ts。

### ctx 当前究竟有什么

**上下文与状态 · 支持**。只有 signal。

不是 params、cwd、db、emit、exec 的集合。当前 process.cwd() 来自该 panel 子进程启动 cwd；参数通过 input。signal 是该执行环境共享 controller 的信号，不是每次请求的独立取消 token。

```typescript
handler: async (ctx, input) => {
  // ctx.signal
  return { cwd: process.cwd(), repo: input.repo };
};
```

**对资源方案的影响**：ctx.cwd 与每任务 signal 拟新增；工作线程不能 process.chdir，所以依赖相对 cwd 的代码要明确改造。这是 API 影响，不能藏起来。

依据：src/sdk/server.ts:ActionContext; src/runtime/worker.ts; src/runtime/lifecycle.ts。

### 模块 Map / 对象能存业务数据吗

**上下文与状态 · 可运行但不保证**。当前能留在进程里；重载、关闭、重启会丢。

编译器虽拒绝捕获模块 let/var，却允许 const Map/对象内容可变。实测 const state.count 连续调用为 1、2，reload 后回到 1。跨 action 也可能共享同模块对象；并发操作存在竞争。它不是持久化，也不是跨实例共享数据库。

```typescript
const cache = new Map<string, string>();
// 当前可能跨调用命中；不可当作唯一业务真相。
```

**对资源方案的影响**：B14 下两线程可能各有一份，再被轮换回收；依赖“下一次一定读到上次 Map”的代码会改变行为。必须改为显式 input/浏览器状态或明确持久存储。

依据：src/compiler/action-transform.ts; src/runtime/lifecycle.ts; 本轮隔离实验。

### 页面数据、草稿、批注归谁持有

**上下文与状态 · 支持**。浏览器可持有展示快照，不需 action 常驻。

handler 返回数据后，组件 state/props 持有仓库、commit、文件名、当时原文等。批注指向当时显示的内容；提交显式携带来源和必要原文，不重新读最新文件冒充旧原文。草稿在浏览器内存，页面真正 reload/关闭后可能丢；没有自动草稿持久化保证。

```typescript
const [snapshot, setSnapshot] = useState(result);
// Diff 入参仍为两份字符串；批注使用 snapshot。
```

**对资源方案的影响**：回收服务端线程不清空浏览器 state；不改 Git UI/布局/交互/props。源码更新引发页面重载另当别论。

依据：skills/paneon/assets/panels/git-review/panel.tsx; docs/memory/architecture-responsibilities.md。

### 哪些东西自动存 SQLite

**上下文与状态 · 受限**。明确提交的事件存；普通调用结果不自动存。

agent.emit 提交声明过的事件，由框架校验并保存，返回 receipt。普通 serverAction 返回值、模块变量、React state、未提交批注草稿不自动变成 SQLite 数据。业务要长期保存可自行显式实现，不必把所有东西塞进框架数据库。

```typescript
const receipt = await agent.emit('annotations', value);
// await read(...) 本身不等于保存事件。
```

**对资源方案的影响**：主服务继续保存明确事件；没有新增“每个 panel 后端状态表”的必要。

依据：src/sdk/client.ts:agent; src/runtime/lifecycle.ts:emit; src/runtime/store.ts。

### 异步、并行、CPU 任务

**执行与生命周期 · 支持**。可 await，也可组合；没有默认业务顺序保证。

当前同 panel 多个异步 handler 可交错执行；实测三个延时调用同时活跃达 3。不同 panel 用不同子进程。同步 CPU 重活会阻塞该子进程事件循环。mutation 不默认排队、串行或加锁。

```typescript
await Promise.all([readA({}), readB({}), readC({})]);
// 若存在依赖，请显式 await A 再调用 B。
```

**对资源方案的影响**：B14 拟全局最多 2 个任务并行，第三个排队，顺序与延迟会变。不是照搬当前无限重叠。

依据：src/runtime/worker.ts:message handler; src/runtime/lifecycle.ts; 本轮隔离实验。

### 返回后定时器还能继续吗

**执行与生命周期 · 可运行但不保证**。当前可能继续；没有可靠后台作业服务。

实测 handler 内 setTimeout 在返回后仍执行。也能写 setInterval/监听/未 await 的 Promise，但框架不保证任务完成、结果送达、取消或重启恢复。不能因“Node 能写出来”就认定为已管理的产品能力。

```typescript
handler: () => {
  setTimeout(work, 1000);
  return { scheduled: true };
};
// 返回只证明已安排，不证明 work 完成。
```

**对资源方案的影响**：B14 明确只支持有边界且 await 完成的调用；分离后台工作可能被回收。长期任务若要正式支持，需要单独设计，不偷偷放入本轮。

依据：src/runtime/worker.ts; 本轮隔离实验。

### 超时、取消能控制到哪

**执行与生命周期 · 受限**。当前没有单次 action 超时或取消 API。

执行环境初始化有 15 秒超时，不是 handler 15 秒上限。ctx.signal 在整个执行环境停止时 abort，多次调用共享。浏览器卸载/隐藏/useQuery 清理不等于服务端取消。底层操作要显式传 signal；普通 Promise 或遗留子孙进程不一定随之结束。

```typescript
await fetch(url, { signal: ctx.signal });
// 当前无 read(input, { timeoutMs: 5000 }) 这种 API。
```

**对资源方案的影响**：B14 拟分开排队 10 秒、执行 30 秒及 per-action timeoutMs；每任务信号和终止行为都要实现及验证。

依据：src/runtime/lifecycle.ts:Execution.stop/start; src/runtime/worker.ts; src/sdk/client.ts。

### reload / close / 重启会怎样

**执行与生命周期 · 受限**。没有在途调用与内存状态存活保证。

reload 发布新 revision，并停止旧执行环境；close/服务停止也结束它。未完成的外部写入不能自动回滚；断线后不能确定 mutation 是否已生效。不能宣称旧调用一定完成、旧结果迁移、草稿必定保留。watch/no-watch/manual reload 仍按现有规则。

```typescript
// 写文件后恰好断线：文件可能已写入，浏览器未收到结果。
// 不应无条件再执行同一个写操作。
```

**对资源方案的影响**：遵循既有技术约束：不专门保留旧 worker/产物等待在途调用结束，不增设交接或旧结果迁移机制。

依据：src/runtime/lifecycle.ts:reload/close/stop；[源码更新设计](../add-code-first-interactive-runtime/design.md#自动-reload-由-agent-按面板选择)。

### 校验失败、业务失败、异常怎么区分

**失败与可靠性 · 支持**。调用 reject，可由页面捕获并展示。

输入校验在 handler 前；不合法结果 INVALID_RESULT；普通抛错转 ACTION_FAILED，原始异常栈不作为成功结果公开。返回 {ok:false} 是作者约定的业务结果，RPC 本身仍成功。界面 pending/error 状态由作者组织，框架不会替所有业务设计交互。

```typescript
try {
  setData(await read(input));
} catch (e) {
  setError(e instanceof Error ? e.message : String(e));
}
```

**对资源方案的影响**：需要增加明确 busy/排队过期/执行超时/结果不确定的诊断；不能把所有错误叫重试即可。

依据：src/runtime/worker.ts; src/shared/errors.ts; src/sdk/client.ts。

### 重试、事务、幂等与恰好一次

**失败与可靠性 · 受限**。这些业务保证没有自动提供。

action RPC 没有自动重试。显式 refreshMs 会产生未来查询，仍不是网络故障重放。刷新页面/再次点击可产生新调用。requestId 用于请求关联，不能当成持久业务幂等键。外部命令写了一半，框架不自动回滚。

```typescript
// 扣费/发布/写入要由业务显式设计幂等和确认，
// 不能假定 kind: "mutation" 已经处理。
```

**对资源方案的影响**：队列超时未开始就不执行；已开始后结果不确定不得自动重放 mutation。

依据：src/sdk/client.ts:request/useQuery; src/runtime/lifecycle.ts:invoke; src/web/panel-host.tsx。

### 调用 action 和向 agent 提交事件

**交互事件 · 受限**。是两种独立操作。

agent.emit 是浏览器 bridge API，不是 ctx.emit。事件需在 definePanel.events 声明并通过 schema 和大小校验后保存。action 可以返回数据，页面在用户明确提交时 emit；不应把每次读取自动当成人的提交。事件 payload 上限 65536 UTF-16，另受整个 HTTP 请求 256 KiB 上限约束。

```typescript
events: {
  annotations: annotationValueSchema(refSchema);
}
// 页面用户明确提交：await agent.emit("annotations", value);
```

**对资源方案的影响**：主服务保存事件，线程跑所需 schema 校验；不新增后端业务快照 Map，也不把取消/读取变成自动提交。

依据：src/sdk/client.ts:agent; src/shared/types.ts; src/runtime/lifecycle.ts:emit。

### 资源池参数是现状还是建议

**拟议改动 · 拟议未实现**。全局 2 条线程等数字全部仍是建议。

当前每个 panel 有长期子进程；不存在全局 2 个 worker/32 队列/等待 10 秒/执行 30 秒/空闲 60 秒回收的产品能力。当前实测三次调用并行达 3，不能把设计页演示当成实现。

```typescript
// 建议值，不是现行配置 API：
// maxWorkers=2, queue=32, wait=10s, run=30s
// idle=60s, maxCalls=100, maxAge=5min
```

**对资源方案的影响**：B14 待决定；线程一条固定一个面板版本，切换可能冷启动。减少常驻资源不能同时保证所有旧行为与最低延迟。

依据：openspec/changes/add-panel-resource-lifecycle/design.md。

### 本轮究竟会改哪些使用方式

**拟议改动 · 拟议未实现**。需要接受有限调用契约，而非只有内部换进程。

会影响：模块内跨调用状态、返回后后台任务、相对 cwd、原生库兼容性、并发顺序/排队与超时；会保留：普通显式入参/JSON 结果/有限文件和命令或 HTTP 操作/浏览器快照与草稿/明确事件提交。当前并没有批准这些使用约束。

```typescript
// 推荐继续支持：一次读取 / 有界计算 / 等待完成的写入。
// 不作为本轮支持契约：常驻后台服务 / 唯一内存会话状态。
```

**对资源方案的影响**：这份能力清单先用于判断 B14 是否合适；本轮仅改说明页和设计文档，不开发执行池。

依据：本清单与 design.md；B14/B15/C2 均未获批准。

## 当前与拟议方案的关键差异

<!-- prettier-ignore -->
| 事项 | 当前 | B14 建议，尚未实现 |
| --- | --- | --- |
| 执行环境 | 每 panel 长期子进程 | 全局最多 2 条有限复用工作线程 |
| 模块状态 | 同一进程内可能保留，重载丢失 | 多份、会回收，不承诺下一次读到上次写入 |
| 返回后的任务 | 定时器可能继续，没有可靠作业保证 | 不作为支持契约，可被回收 |
| cwd | 子进程 process.cwd() | 拟新增 ctx.cwd；线程不能各自 chdir |
| 并发与时限 | 异步调用可重叠，无单次 action 默认超时 | 有界并发、排队与执行时限 |
| 取消信号 | 执行环境共享 | 拟改为每任务独立信号 |
| 显式 reload | 停止旧执行，不保证在途完成 | 沿用，不增设旧版本任务交接/保活 |
| 原生库 | 视当前打包/子进程兼容性 | 还需验证线程兼容性和隔离限制 |

资源优化的实际代价：模块 Map/对象不能再作为唯一跨调用业务状态；返回后遗留任务不保证继续；相对 cwd 需要明确上下文；原生包要验证线程兼容；并发会受全局队列和超时约束。普通有限调用、显式 JSON 入参和结果、浏览器持有原文、明确提交事件继续保留。以上仍是待评审方案，没有获批实施。

## 本轮验证了什么，没有验证什么

独立临时 Runtime 与临时目录验证，没有调用用户仓库写操作，没有重启用户正在看的服务。已验证：const Map 编译允许；let 捕获、动态 import 和裸副作用 import 被拒绝；ctx 只有 signal/secrets；连续调用计数 1、2，reload 后归 1；await 文件读写；三次异步调用重叠达 3；返回后的定时器仍运行；Date 结果被拒绝。同步 refine 可转换和校验；transform 的 JSON Schema 转换失败；async refine 的同步 safeParse 失败。

这些是狭义能力验证，**不是**新资源池、长期内存收敛、真实 Git 点击延迟、任意第三方/原生包兼容或 UI 全回归验收。没有用这些实验证明新设计性能最优。

实验脚本：`/tmp/paneon-server-action-catalog-20261025/probe.mjs`；结果：`/tmp/paneon-server-action-catalog-20261025/probe-result.json`。临时文件可能被系统清理；关键结论已记录在本文。

## 和现有设计文档的关系

本文补齐 [design.md](design.md) 中 serverAction 的能力边界。按既有[源码更新设计](../add-code-first-interactive-runtime/design.md#自动-reload-由-agent-按面板选择)，修正此前“reload 后旧任务跑完再回收”的过度承诺；不创建额外旧版本交接和完成保证。设计中的 ctx.cwd、timeoutMs、全局线程池、隐藏时暂停可选刷新都必须标注为拟议，不能复制到当前 API 用法。
