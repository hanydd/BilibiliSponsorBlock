---
name: browser-extension-release
description: Release a new version of BilibiliSponsorBlock. Use when you are asked to release a new version or to upload the new release the extension stores.
---

# 浏览器扩展发版

用于当前 `BilibiliSponsorBlock` 仓库的版本发布。以仓库当前配置和 Git 历史为准，不把服务端仓库的版本或流程混进来。

## 按任务读取说明

- 涉及版本号、commit、tag、GitHub Release、Release 文案或附件时，读取 [references/release-process.md](references/release-process.md)。
- 涉及商店凭据、Chrome/Firefox/Edge 提交、审核状态或失败排查时，读取 [references/store-publishing.md](references/store-publishing.md)。
- 完整发版需要依次读取两份 reference。只做状态查询时，仅读取相关 reference。

仓库发版惯例：版本 tag 应直接指向对应的 `Bump Version X.Y.Z` commit。安排提交顺序时，把普通代码、CI 和文档变更放在前面，再做 bump commit 和 tag。

## 不可破坏的约束

1. 先确认工作仓库是 `BilibiliSponsorBlock`，读取 `AGENTS.md`，检查 `git status`、远端分支和最新 tag。
2. 版本号来源是 `manifest/manifest.json`。历史上不随扩展版本修改 `package.json` 的 `version`。
3. 保留用户已有改动。远端前进时先 fetch 并检查，再 rebase；禁止 force push 和覆盖远端提交。
4. 构建、查询和校验不代表允许发布。执行 `git push`、创建 tag/Release、上传商店或重新提交某个商店前，确认用户已授权对应外部变更。
5. 不读取、打印或要求用户在聊天中发送 Secret 值。只检查 GitHub Secret 名称和更新时间。Actions 日志中若意外出现未遮罩的敏感值，停止展示日志并提醒轮换。
6. 商店发布可能部分成功。重试时只开启失败的商店，绝不为了让总 workflow 变绿而重复提交已成功的 Chrome、Firefox 或 Edge。
7. 正式发布必须从固定版本 tag 运行，而不是从会继续变化的 `master` 运行。只构建验证可以从 `master` 运行，并关闭全部商店开关。

## 完成标准

一次完整发版需要留下可核验结果：

- `manifest/manifest.json` 是目标版本，版本 commit 已推送；按仓库惯例，版本 tag 指向该 bump commit。
- 普通 CI、单元测试和 Playwright 测试通过。
- 同名 GitHub Release 已发布，中文说明符合历史风格。
- Release 的 Chrome、Firefox、Edge、Safari 四个附件上传成功。
- 商店 workflow 的每个启用 job 都有明确结果；成功时记录审核状态，失败时记录 HTTP 状态和可执行修复。
- 工作树干净且本地分支与远端同步。

最终向用户分别报告 GitHub Release、Chrome、Firefox 和 Edge 的状态。区分“上传成功”“已提交审核”“审核通过”“公开上线”，不要把它们混为一谈。
