# Choice panel UX correction — B43

用户验收指出三处问题：说明、进度和题目的间距过大；自填答案需要先切换；补充说明与选项并列且只能整题一条。用户已确认单/多选均为每个选项各有一条说明。此文为本轮实施契约；已实现并通过主 agent 的源码及独立安装包 Chrome 验收，记录见 verification.md。

## Result contract

输入 ChooseParams 不变，包含可选的创建时 selectedIds。单选/多选共用一份答案结构，自填答案与已有选项同级：

```ts
type ChoiceSelection =
  { kind: 'option'; optionId: string; comment: string } | { kind: 'custom'; text: string };
type ChoiceAnswer = {
  questionId: string;
  selections: ChoiceSelection[];
};
```

每个已选已有选项必须有 comment，没有填写就是空字符串；包括空白在内的原文均保持。自填 text 是答案内容，不是 comment。不返回 selectedIds、整题 comment 或整题 kind。单选总共恰好一项（已有选项或自填）；多选总共至少一项，允许已有选项加自填、仅已有选项或仅自填。每题至多一条 custom，自填选中后文本不得全为空白；未选中的自填草稿不提交。拒绝未知/重复/跨题 optionId、缺失 comment、错误类型及多余字段。已有选项按输入顺序输出，custom 在末尾。首次/更正仍通过 answers-submitted 统一提交全部问题，replacesEventId 语义不变。新 schema 不为旧结果增加兼容分支，历史事件仍按原 payload 读取。

```json
{
  "answers": [
    {
      "questionId": "features",
      "selections": [
        { "kind": "option", "optionId": "backup", "comment": "每天备份" },
        { "kind": "option", "optionId": "audit", "comment": "" },
        { "kind": "custom", "text": "还需要数据导出" }
      ]
    }
  ]
}
```

## Interaction

- 移除 Choose options / Write my own answer 两个模式按钮。自填答案框始终展示在列表下方，与选项同级，以 Other / My own answer 标识；无需先选择才能输入。
- 单选：自填和已有选项互斥。输入非空自填内容直接选中自填；点已有选项则仅采用该选项。保留各类草稿，并清楚显示唯一生效项，不因清空自填而悄悄回退到旧选择。
- 多选：自填使用独立复选语义。输入非空内容自动选中自填，保留已有勾选；勾选/取消已有项不改变自填的选中状态。自填可取消且保留文字草稿，重新勾选恢复；选中但文字为空时提示填写或取消自填。不要用全题 options/custom 模式控制多选。
- 每题用 optionId 到 comment 的独立草稿。选中卡片内部显示该选项的说明框，说明控件有可访问且能区分选项的标签。切换单选、取消多选、跨题返回均保留各选项草稿；重新选中恢复；未选中不输出。
- 汇总页按选项展示各自说明，另展示已选择的自填答案。推荐标记不自动选中。Previous/Next 不发事件；提交中防重复、失败保留、成功后明确更正和历史关联沿用现有 helper。
- 没有回答等常见校验使用清晰英文提示，不向用户拼接原始 Zod 内部错误。保留完整 schema 校验。

## Layout boundary

只调整 choose 页内分组与间距，将总标题/说明、进度/题目/题目说明各自组织紧凑，保持 shadcn 默认主题和样式。不要修改 Page、Markdown、通用 CSS、SDK 或 panel-host。不要引入固定尺寸控制整页布局；需验证桌面和窄屏。

## Implementation ownership

独立工作单元 choose-ux，基于本轮文档提交创建 worktree。允许改动：

- skills/paneon/assets/panels/choose/panel.tsx
- skills/paneon/assets/panels/choose/schema.ts
- skills/paneon/references/choose.md
- tests/skill-pages.test.ts
- tests/browser/skill-pages.mjs
- tests/browser/skill-pages-fixture.mjs（如需要）
- openspec/changes/add-paneon-skill-panels/reports/choose-ux.md

保留共用测试中的 form 覆盖。init_cli 独占 SKILL.md、references/cli.md、CLI/安装文档和依赖；不要改这些文件。不要并发编辑中央 design/tasks/development，交付报告记录结果，由主 agent 验收后更新状态。

## Verification

schema 回归验证独立说明、空 comment、原文空格、排序、非法/重复 ID、单多选数量、单选互斥、多选混合已有/自填及全题覆盖。真实浏览器验证：初始自填框可见且不必点击模式按钮；单选切换/多选各项说明互不串用；取消再选恢复；跨题草稿；单选切换及多选同时提交已有选项和自填、自填取消后保留草稿但不提交；空回答友好校验；导航不发事件；完整提交、失败保留及更正历史。保留 form 回归。保存桌面及窄屏截图，检查分组间距和无横向溢出。运行相关 build/typecheck/lint/format，验证独立安装包的选择页；不为了通过而删减既有断言。

实现者本地 commit 并报告文件、命令、结果和限制；不推送、不自行合入或清理。主 agent 后续验收/集成。派工后立即交还用户，不等待实现完成。
