---
name: paneon-release
description: 一次性完成 Paneon（@qoggy/paneon）的正式版或 beta 版发布：前置检查（含 OpenSpec change 已归档）、把开发分支快进合并到版本线、确定版本、补齐 changelog、跑发布回归、推送版本线与标签由 GitHub Actions 发布到 npm、更新 main 并创建 GitHub Release。用户要求发布新版本、从开发分支发布、准备发布或恢复中断的发布时使用。
compatibility: Requires Node.js 24, gh CLI authenticated with write and Actions access to the GitHub repository, npm trusted publishing configured for .github/workflows/publish.yml, a browser for browser tests, network access, and the project paneon-memory and changelog skills.
---

# Paneon Release

## 执行方式

调用本 skill 即授权完成整个发布：本地合并、commit、git push、等待 Actions 发布 npm、GitHub Release。
开始阶段确认版本号和 changelog，之后一路推进到结束。

发布流程不修改任何源码。
需要改代码才能继续时（测试失败、前置条件不满足等），终止发布：报告原因和已完成的步骤，由用户处理后重新发起，下次从头执行。
中途任何一步结果与预期不符时同样立即停止，不让问题扩散到 npm 或 Git 远端。
不撤包、不强推、不移动已有标签，这些操作只在用户明确决定后执行。

## 版本类型

- 正式版：`X.Y.Z`，dist-tag `latest`。
- beta 版：`X.Y.Z-beta.N`（N 从 1 开始），dist-tag `beta`。

派生 `line=X.Y.x`、`tag=v<version>`。

`main` 只指向已发布的最高正式版，判断规则：

- 正式版且高于所有已发布正式版：更新 `main`，用 `latest`。
- 正式版但低于已发布的最高正式版（旧版本线维护版）：不动 `main`，dist-tag 用 `latest-X.Y`。
- beta 版：不动 `main`，用 `beta`。

## 1. 确定版本

- 读取 `docs/memory/MEMORY.md` 中版本发布与提交信息相关条目，并遵守。
- 用户指定了版本就用该版本。
  否则根据上个标签到 `HEAD` 的提交按 semver 提议版本，等用户确认。

## 2. 前置检查

`git fetch origin` 后逐项检查，任何一项不满足就终止，说明哪一项不满足：

- 没有未归档的 OpenSpec change：`openspec/changes/` 下除 `archive/` 外不能有其他目录（任务全部完成但未归档的也算）。
  不满足时列出这些 change，提醒用户先归档。
- 工作区干净。
- `origin/line` 存在时：本地 `line`（若有）与 `origin/line` 指向同一提交，且 `origin/line` 是 `HEAD` 的祖先（能快进）。
- `origin/line` 不存在时：只允许版本为 `X.Y.0` 或 `X.Y.0-beta.N`（开新版本线），且本地也没有 `line`。
- 需要更新 `main` 时，`origin/main` 是 `HEAD` 的祖先（能快进）。
- `line` 和 `main` 没有被其他 worktree 检出。
- `npm view @qoggy/paneon versions dist-tags --json` 中没有目标版本，远端也没有 `tag`；已存在则转「中断恢复」。

## 3. 切到版本线

当前分支就是 `line` 时跳过本步。

否则当前分支是开发分支，记为 `dev`，把版本线快进到它：

```bash
git switch "$line" && git merge --ff-only "$dev"   # 本地已有 line
git switch -c "$line" --track "origin/$line" && git merge --ff-only "$dev"   # 仅远端有 line
git switch -c "$line"   # 开新版本线
```

这一步只改本地，推送在步骤 8 与 tag 一起完成。
之后的步骤都在 `line` 上进行；`dev` 保持原样，不推送。

## 4. 确认 changelog

- 检查 `CHANGELOG.md` 的 `[Unreleased]` 是否覆盖上个标签以来面向用户的变更。
  缺失或不完整时，派一个 subagent 按 `changelog` skill 补写。
- 把 `[Unreleased]` 内容给用户确认；用户要求修改时改完再确认。

## 5. 准备发布改动

正式版：

- 把 `[Unreleased]` 内容移入 `## [version] - yyyy-MM-dd`（用户时区），保留空的 `[Unreleased]`。
- 更新底部链接：`[unreleased]` 比较 `v<version>...<line>`，新增 `[version]` 比较上一个正式版标签与本标签。

beta 版不改 CHANGELOG。

两者都同步 `package.json` 与 `package-lock.json` 根包版本，不用 `npm version`（它会自动提交并打标签）。

## 6. 发布回归

```bash
npm run test:release
```

它会构建并依次运行 checks、unit、acceptance、browser、package 阶段；package 阶段会打包、装到独立目录并用安装后的包做验收。
单个阶段可用 `--phase=<phase>` 重跑，`--list` 查看用例清单。

失败时先判断类型：

- 环境问题（端口占用、浏览器启动失败、网络超时等）：排除环境原因后重跑该阶段一次，仍失败则终止。
- 其他失败（包括 lint、格式问题）：终止发布，报告失败用例与日志要点，并按「终止时还原」处理。

## 7. 提交发布 commit

只暂存步骤 4、5 的改动，按项目提交规范提交，记录 commit ID。

## 8. 推送版本线与标签

创建 annotated tag `$tag` 指向发布 commit，与版本线一起推送：

```bash
git push --atomic origin \
  "refs/heads/$line:refs/heads/$line" \
  "refs/tags/$tag:refs/tags/$tag"
```

推送被拒时停止并报告，不 merge、不 reset、不强推。

## 9. 等待 npm 发布

找到该标签触发的 `publish.yml` 运行，记录 `run_id` 与链接，等待结束：

```bash
gh run list --workflow publish.yml --event push --commit "$release_commit"
gh run watch "$run_id" --exit-status
```

工作流会校验版本、打包发布，并核对 integrity 与 dist-tag；运行成功即发布完成，失败时转「中断恢复」。

## 10. 更新 main

需要更新 `main` 时，用 `git branch -f main "$release_commit"` 移到发布 commit（步骤 2 已确认是快进），再执行 `git push origin refs/heads/main:refs/heads/main`。
推送被拒时按步骤 8 处理；npm 已发布，此时绝不为解决 Git 问题重新发布。

## 11. 创建 GitHub Release

```bash
gh release create "$tag" --title "$tag" --notes-file "$notes_file" --verify-tag
```

- 正式版：说明取 CHANGELOG 中本版本段落（不含标题行）。
  维护版加 `--latest=false`。
- beta 版：说明取发布时的 `[Unreleased]` 内容，加 `--prerelease`。

## 完成报告

报告版本与 dist-tag、安装命令（beta 用 `npm install @qoggy/paneon@beta`）、发布 commit、推送的 refs、GitHub Release 链接、遗留警告，并列出改动文件。
从开发分支发起时，提醒用户当前已在 `line` 上，`dev` 比 `line` 少一个发布 commit。

## 终止时还原

推送标签之前终止时，把本地恢复到发起前的状态，下次可以从头执行：

- 丢弃步骤 4、5 的未提交改动；已有发布 commit 和本地 `tag` 时一并丢弃。
- 从开发分支发起的：切回 `dev`，本地 `line` 恢复为 `origin/line`（开新版本线时删除本地 `line`）。
- 从版本线发起的：本地 `line` 恢复为 `origin/line`。

这些操作只撤销本次发布产生的本地改动和提交；`dev` 上的提交不受影响。
推送标签之后终止时不还原，按「中断恢复」继续。

## 中断恢复

以 npm、Git 远端与 Actions 运行的真实状态判断进度：

- 远端没有 `tag`：本地 `line` 领先 `origin/line` 属于正常中间状态；确认领先的部分只有开发分支的提交和发布 commit 后，从步骤 6 继续，否则按「终止时还原」处理后从头执行。
- 远端已有 `tag`、npm 无此版本：发布运行未结束时回到步骤 9；已失败时报告失败原因与运行链接后停止，由用户决定。
- npm 已有此版本：跳过发布；该 tag 的 `publish.yml` 运行成功时从步骤 10 继续，失败时报告原因与运行链接后停止。
- 部分 refs 或 Release 已存在：逐项核对指向发布 commit，只补齐缺失部分；指向不一致时停止报告。
