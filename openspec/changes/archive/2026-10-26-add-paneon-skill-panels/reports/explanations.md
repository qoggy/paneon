# 一次性交互讲解交付

2026-10-21，在独立 worktree `/Users/yuguo/.codex/worktrees/skill-explanations/paneon` 基于 `c7d667e` 完成本组实现。覆盖 2.3 中的并发讲解与 2.10 Sentinel；中央 design/tasks、SDK/UI、package/tsconfig 和其他工作组文件未修改。未推送、合入或删除 worktree，留待主 agent 验收。

## 实现

- 并发页固定 A/B/C/D 的 4/2/3/1 秒任务与初始并发 2；Input 探索 1–4 并发，串行和当前排程同刻度并排。显示任务状态、等待/开始/结束、整批耗时，提供播放、暂停、重播和逐秒前进。更改并发重算并暂停回到 0；进入批注模式停住播放。固定时长、无资源争用的前提在页面明示，未扩展真实调度服务。
- 并发页复用公共 FeedbackProvider/FeedbackTarget/FeedbackText/FeedbackControls 与 feedbackSchema，显式 `explanation-feedback` 保存提问时的并发和时间；旧情境可定位和重算，空说明保留为同一 annotations 条目。没有 selected 第二份状态，不自动唤醒 AI，不把浏览变化当事件，不强制标准页修订策略。
- Sentinel 页固定 4 槽、2000ms 总区间、500ms 桶，以环、映射公式、实际存储、有效桶合计与分支解释相互对照。8 步故事覆盖创建、复用、跨窗、跳窗、严格过期边界、懒重置、时间回拨；自由控制时间、访问窗口、记录 PASS、选择槽位。自由探索会退出预设故事，重新开始才从空环重放，避免故事标题与当前数据矛盾。
- 两页 `definePanel.input` 都是严格空对象；标题/主题/数据直接在例子源码，无业务配置文件、builtin 注册或外部依赖新增。运行方式与反馈契约记录在 references/examples.md；没有杜撰 GitHub PR 示例已完成。

## 权威源码核对

只读通过 `gh api` 从公开 [alibaba/Sentinel](https://github.com/alibaba/Sentinel) 获取源码，固定 commit 为 [a3f40ba8e900c8489bd520274739f17235a7721c](https://github.com/alibaba/Sentinel/tree/a3f40ba8e900c8489bd520274739f17235a7721c)。页面与指南均带固定版本链接：

- [LeapArray.java](https://github.com/alibaba/Sentinel/blob/a3f40ba8e900c8489bd520274739f17235a7721c/sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/base/LeapArray.java)：`floor(t / windowLength) % sampleCount`、windowStart、null/相同/更旧/未来桶分支；负时间返回 null；values 只过滤有效桶。
- [WindowWrap.java](https://github.com/alibaba/Sentinel/blob/a3f40ba8e900c8489bd520274739f17235a7721c/sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/base/WindowWrap.java)：时间区间为 `[start, start + length)`。
- [BucketLeapArray.java](https://github.com/alibaba/Sentinel/blob/a3f40ba8e900c8489bd520274739f17235a7721c/sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/metric/BucketLeapArray.java)：重用槽位时先 resetTo，再 reset 指标。
- [MetricBucket.java](https://github.com/alibaba/Sentinel/blob/a3f40ba8e900c8489bd520274739f17235a7721c/sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/data/MetricBucket.java)：PASS 累加和计数重置。
- [ArrayMetric.java](https://github.com/alibaba/Sentinel/blob/a3f40ba8e900c8489bd520274739f17235a7721c/sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/metric/ArrayMetric.java)：统计入口先 currentWindow 再聚合 values；页面明确没有模拟默认构造器的预占扩展。

核对后的关键边界：过期条件严格为 `time - start > intervalInMs`，相等仍有效；只读 values 不清理存储，也没有额外排除未来桶的条件；回拨到落后于槽内起点的时间会返回独立新桶、不覆盖数组；跳过的窗口不被主动补建。页面没有用“精确保存最近 2000ms 每条事件”代替源码的分桶统计语义。相关资料均不含开发者机器上的 Sentinel 路径。

## 实际验证

- `npm ci --no-audit --no-fund`；`npm run build:cli`、`npm run build:ui`、`npm run build:web` 均通过；`npm run typecheck` 通过。
- `node --test tests/explanations.test.ts`：5/5 通过，覆盖四种完整排程、并发上限、开始/结束边界、旧反馈情境，以及 Sentinel 的映射/左闭右开、同窗复用、严格过期、只读不清理、单槽重置、跳窗、回拨和负时间。
- 本组源码与测试的 ESLint 零 error、零 warning；本组所有文本 Prettier check 和 `git diff --check` 通过。
- `node tests/browser/explanations.mjs` 使用系统 Chrome：复制完整 skill 到仓库外临时目录，从实际 iframe 操作。验证播放/暂停/重播、并发探索与回零、非法输入不改变排程、浏览零事件、旧反馈定位、模拟提交失败后草稿保留、明确提交、空说明、CLI events/ack；验证 Sentinel 故事与自由探索、严格过期、存储不删除、访问重置、回拨、负时间、公开源码链接、390px 窄屏布局。无 pageerror。
- `node tests/browser/explanations-pack.mjs`：npm pack 后独立 npm 安装，lstat 确认 paneon 安装目录不是源码符号链接，使用安装包的 runtime/CLI/完整 skill 重跑相同 Chrome 验收，通过。包 `paneon-0.0.0.tgz`，npm shasum `bfca2486d384dc2ea734656ea233e065ebbfc856`。临时安装已清理，没有写入用户 agent skill 目录。
- 已实际读取独立安装产物截图：[并发](../../../../tests/browser/explanations-concurrency.png)、[Sentinel](../../../../tests/browser/explanations-sentinel.png)。截图显示相同刻度的双时间线、环形槽位、映射与统计结果。

检查期间遇到的问题均已定位：干净基线首次 typecheck 缺失 self-import 的 dist/sdk 声明，先执行既有 build:cli 后通过，未修改共享配置；沙箱 listen EPERM 改为申请宿主机权限；窄屏溢出源自 40 位 commit 字符串，已增加原文换行并复测；独立安装脚本首次错误地把 macOS `/var` 到 `/private/var` 的路径别名当成源码链接，已改为 lstat 判定并完整重跑。

## 局限与交接

这是 TypeScript 的顺序教学模型，没有执行 Sentinel Java 库，没有模拟 CAS 竞争、更新锁/yield 的时序，没有覆盖 OccupiableBucketLeapArray 预占扩展，不是 Java 正确性、线程安全或真实性能测试。未重复整库 65 项回归；本组行为与独立产物验收不代替主 agent 集成验收。用户尚未体验 Sentinel，不能据此标记中央 3.5 完成。

需要主 agent 核对本地提交与文件范围后验收、集成；用户 Sentinel 体验问题由主 agent 统一接收。本组工作到此交付，未推送。

## 文件清单

- /Users/yuguo/.codex/worktrees/skill-explanations/paneon/skills/paneon/assets/examples/concurrency/model.ts
- /Users/yuguo/.codex/worktrees/skill-explanations/paneon/skills/paneon/assets/examples/concurrency/panel.tsx
- /Users/yuguo/.codex/worktrees/skill-explanations/paneon/skills/paneon/assets/examples/sentinel-leap-array/model.ts
- /Users/yuguo/.codex/worktrees/skill-explanations/paneon/skills/paneon/assets/examples/sentinel-leap-array/panel.tsx
- /Users/yuguo/.codex/worktrees/skill-explanations/paneon/skills/paneon/references/examples.md
- /Users/yuguo/.codex/worktrees/skill-explanations/paneon/tests/explanations.test.ts
- /Users/yuguo/.codex/worktrees/skill-explanations/paneon/tests/browser/explanations-fixture.mjs
- /Users/yuguo/.codex/worktrees/skill-explanations/paneon/tests/browser/explanations.mjs
- /Users/yuguo/.codex/worktrees/skill-explanations/paneon/tests/browser/explanations-pack.mjs
- /Users/yuguo/.codex/worktrees/skill-explanations/paneon/tests/browser/explanations-concurrency.png
- /Users/yuguo/.codex/worktrees/skill-explanations/paneon/tests/browser/explanations-sentinel.png
- /Users/yuguo/.codex/worktrees/skill-explanations/paneon/openspec/changes/add-paneon-skill-panels/reports/explanations.md
