# 发布浏览器扩展

仓库的 `Publish extension stores` GitHub Actions 工作流可以一次构建、测试并提交 Chrome、Firefox 和 Edge 商店。工作流只支持更新已有商店项目，不创建新的商店条目。

## 首次配置

在 GitHub 仓库的 `Settings > Environments` 中创建 `browser-stores` 环境。把下面的普通标识保存为 environment variables：

| Variable | 用途 |
| --- | --- |
| `CHROME_PUBLISHER_ID` | Chrome Web Store 的 Publisher ID |
| `CHROME_ITEM_ID` | Chrome 扩展 ID；未配置时使用当前扩展的 `eaoelafamejbnggahofapllmfhlhajdd` |
| `CWS_WIF_PROVIDER` | Google Cloud Workload Identity Provider 的完整资源名称 |
| `CWS_SERVICE_ACCOUNT` | 已获 Chrome Web Store 发布权限的 Google service account 邮箱 |
| `FIREFOX_ADDON_ID` | AMO Add-on ID；未配置时使用当前扩展的 `{f10c197e-c2a4-43b6-a982-7e186f7c63d9}` |
| `EDGE_PRODUCT_ID` | Partner Center 中的 Edge Product ID |

把凭据保存为 environment secrets：

| Secret | 获取位置 |
| --- | --- |
| `FIREFOX_API_KEY` | AMO API Credentials 页面中的 JWT issuer |
| `FIREFOX_API_SECRET` | AMO API Credentials 页面中的 JWT secret |
| `EDGE_CLIENT_ID` | Partner Center 的 Publish API 页面 |
| `EDGE_API_KEY` | Partner Center 的 Publish API 页面 |

Chrome 发布和定期访问检查使用 GitHub OIDC 与 Google Workload Identity Federation。按[配置说明](https://github.com/hamzahamidi/publish-to-chrome-web-store#setting-up-workload-identity-federation)创建 provider，并将 service account 加入 Chrome Web Store publisher。将 provider 和 service account 保存为 `browser-stores` environment variables。Provider condition 应限制到本仓库、`browser-stores` environment，以及这两个工作流允许的受信任分支或 tag。Chrome 工作流不再需要 OAuth client 或 refresh token secrets。

凭据创建说明：

- [Firefox Add-ons API credentials](https://addons.mozilla.org/developers/addon/api/key/)
- [Microsoft Edge Add-ons API](https://learn.microsoft.com/microsoft-edge/extensions/update/api/using-addons-api)

不要把凭据写进仓库文件、Issue、Actions 日志或聊天记录。

## Chrome 凭据定期检查

`Check Chrome credentials` 工作流每周一北京时间 09:23 运行，也可以在 Actions 页面手动选择 `Run workflow`。定时任务使用默认分支上的工作流，GitHub 调度繁忙时可能延迟。

检查使用 Workload Identity Federation 获取短期 access token，再调用只读的 `fetchStatus` 查询当前扩展。它不构建、上传或发布扩展，也不读取 Chrome OAuth secrets。日志和运行摘要只记录检查结果，不输出 token 或完整 API 响应。

失败会使工作流标红。请在个人 GitHub 通知设置中开启 Actions 失败通知。401 或 403 错误需要检查 provider condition、service account 的 publisher 权限、scope 和 publisher/item ID。网络错误、限流或服务端错误可以先手动重试。

公开仓库连续 60 天没有活动时，GitHub 会自动停用定时工作流，需要到 Actions 页面重新启用。

检查脚本的本地测试不需要真实凭据：

```bash
node --test scripts/check-chrome-credentials.test.mjs
```

## 发布

1. 修改 `manifest/manifest.json` 中的版本号并提交。商店不接受重复或降低的版本号。
2. 确认准备发布的 commit 已推送到 GitHub。
3. 打开仓库的 `Actions > Publish extension stores > Run workflow`。
4. 选择要发布的 branch 或 tag。三个商店默认全部选中，也可以暂时关闭其中一个。
5. 点击 `Run workflow`。

工作流先运行 lint、测试和三种构建，并确认三个 ZIP 中的版本号一致。通过后，三个商店提交任务并行运行：

- Chrome 上传后提交审核，审核通过后自动发布。
- Firefox 以 `listed` 渠道提交，并附带构建所对应的源码归档。
- Edge 上传后提交认证，并附带版本、commit 和最新提交说明。

工作流会保留构建包 14 天。商店审核结果和实际上线时间仍由各商店决定。
