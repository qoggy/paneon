## Why

旧panel即使没有close，也不应各保留一个常驻进程。用户同时活跃使用不超过10个的前提下，固定panel总量时后台资源应收敛，并优先优化reload、响应与保活体验。事件38纠正了此前“每次调用结束立即归零”的错误优先级。

## What Changes

- B14待评审：全局最多2条、每条固定一个panel版本的有限复用线程；空闲60秒、100次调用或5分钟寿命后在任务边界回收。serverAction模块不进HTTP主线程，不在同一线程无限import不同panel。
- B15待评审：复用现有可见页面WebSocket及15秒ping/pong，隐藏关闭通知、回来补一次状态。不新增30秒HTTP presence/90秒租约。隐藏useQuery仅暂停作者明确配置的refreshMs，不把所有页面自动变成轮询。
- 沿用SQLite和manifest文件清单，主键读取与有界缓存，不预加载所有历史模块。C2待确认后有限回收生成版本目录；不删源码或SQLite事件。
- 明确ctx.cwd、按任务signal/凭据、有限任务契约；复用线程不是跨请求业务状态存储。Git/PR原文由浏览器持有，PR去必需后台Map，UI不变；checkFeedback去留不纳入本次批准。
- **BREAKING**：作者不能依赖每panel独立process.cwd或常驻模块变量；库需支持worker_threads。无旧专属进程回退。

## Capabilities

### New Capabilities

- panel-resource-lifecycle：全局有限复用、排队/超时/空闲回收、按需历史访问、可见连接源码引用、可选生成目录回收。
- browser-owned-review-annotations：旧原文在浏览器，完整事件独立于先前线程，不重读最新文件解释旧批注。

### Modified Capabilities

无。该在途change的旧B12按次销毁设计已撤回，未实施。

## Impact

仓库paneon，分支0.0.x，复核基线5a04d9f0c2a45b2979e1d226387e3e9ef46023b7；有无关并行工作区修改。本轮只改设计与/tmp说明页，未开发产品或执行数据清理。B13目标已确认，B14/B15/C2待评审，接受设计不等于开发授权。
