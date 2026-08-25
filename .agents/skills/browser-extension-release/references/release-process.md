# 版本与 GitHub Release

## 发版前盘点

在仓库根目录执行只读检查：

```bash
git status --short --branch
git fetch origin master --tags
git log --oneline --decorate -20
git tag --sort=-version:refname | head -15
gh api 'repos/hanydd/BilibiliSponsorBlock/releases?per_page=10' \
  --jq '.[] | {tag_name,name,published_at,html_url,assets:[.assets[].name]}'
```

确认目标版本高于 GitHub Release 和三个商店已有版本。若用户没有指定版本，根据变更兼容性建议 patch/minor/major，但在修改前让用户确认。

查看上一版本以来的真实变更：

```bash
git log PREVIOUS_TAG..HEAD --reverse --format='%h%x09%an%x09%s'
git diff --stat PREVIOUS_TAG..HEAD
```

不要只依据 commit 标题；对模糊的重构或修复查看实际 diff。

## bump version 与 commit

历史约定只修改：

```text
manifest/manifest.json
```

将 `version` 改成目标版本，不修改 `package.json`。版本提交信息固定为：

```text
Bump Version X.Y.Z
```

版本提交尽量独立于功能和 CI 变更：

```bash
git add manifest/manifest.json
git commit -m 'Bump Version X.Y.Z'
```

仓库惯例是让 Release tag 直接指向这个 bump commit。为保持这个关系，通常先完成代码、CI 和文档修改，最后再创建 bump commit。需要创建 Release 时可记录其 SHA：

```bash
version='X.Y.Z'
bump_commit="$(git rev-parse HEAD)"
```

提交前运行 `git diff --check`。如果远端 `master` 已前进，fetch 后审查新增提交并 rebase；解决冲突时同时保留远端的新行为和目标版本号。

## 本地与 GitHub CI 验证

至少运行：

```bash
cp config.json.example config.json  # 仅当 config.json 不存在
npm ci
npm run lint
npm run test
```

推送后等待仓库原有的 `CI` 和 `Tests`。`Tests` 包含 Playwright 集成测试。不要在它们失败时创建 Release，除非用户明确接受并说明原因。

需要验证发布流水线但不触碰商店时：

```bash
gh workflow run publish-stores.yml --ref master \
  -f chrome=false -f firefox=false -f edge=false
```

等待 `Test and package` 完成，确认三种 ZIP 版本一致且 artifact 上传成功。

## Release 文案风格

先查看最近几个 Release 的正文：

```bash
for tag in 0.13.1 0.13.0 0.12.1; do
  gh api "repos/hanydd/BilibiliSponsorBlock/releases/tags/$tag" \
    --jq '{tag_name,body}'
done
```

本仓库使用简短中文无序列表：

```markdown
- 修复……的问题
- 添加……功能 #123 @contributor
- 优化……
```

写作规则：

- 不加“更新内容”“What's Changed”等标题。
- 不保留只有 `Full Changelog` 的自动生成正文。
- 每条描述一个用户能理解的修复、功能、兼容性变化、重要测试能力或发布能力。
- 合并相近的内部提交，不逐条复制 commit log。
- 破坏性变化、移除的功能和默认行为变化必须明确写出。
- 有外部贡献者时沿用历史格式标记 `@username`，相关 issue/PR 编号确有帮助时再添加。
- 不夸大“上传成功”为“已上线”。

创建 Release 前用临时 notes 文件复查文字和版本范围。

## 创建 Release

先推送版本 commit 并等待 CI 通过，再创建同名 Release：

```bash
version='X.Y.Z'
bump_commit="$(git rev-parse HEAD)"
git push origin master
gh release create "$version" \
  --target "$bump_commit" \
  --title "$version" \
  --notes-file /path/to/release-notes.md
```

`gh release create` 会在 tag 不存在时创建同名 tag。创建前确认 tag 和 Release 均不存在；不要移动已公开 tag。

创建后可以核对 tag 与 bump commit 的 SHA：

```bash
git fetch origin "tag" "$version"
tag_commit="$(git rev-parse "$version^{commit}")"
echo "bump=$bump_commit tag=$tag_commit"
```

发布 Release 会触发 `.github/workflows/release.yml` 的 `Upload Release Build`，该 workflow 应上传：

```text
ChromeExtension.zip
FirefoxExtension.zip
EdgeExtension.zip
SafariExtension.zip
```

等待 workflow：

```bash
gh run list --workflow release.yml --limit 3
gh run watch RUN_ID --exit-status
```

最后通过 Releases API 核对正文、tag、目标 commit、附件名称和大小。按仓库惯例同时看一眼 tag SHA 是否等于 bump commit SHA。若 Release 已创建但文案需要修正，使用 `gh release edit X.Y.Z --notes-file ...`；修改正文不会重新触发附件构建。
